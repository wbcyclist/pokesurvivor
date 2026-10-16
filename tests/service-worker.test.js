const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function boot() {
  const origin = 'https://game.test', handlers = {}, stores = new Map();
  let offline = false, failCache = false;
  const url = input => new URL(typeof input === 'string' ? input : input.url, origin + '/').href;
  const open = async name => {
    if (failCache) throw new Error('QuotaExceededError');
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      keys: async () => [...store.keys()].map(u => new Request(u)),
      match: async input => store.get(url(input))?.clone(),
      put: async (input, response) => { store.set(url(input), response.clone()); },
      delete: async input => store.delete(url(input)),
      addAll: async inputs => { for (const input of inputs) store.set(url(input), new Response('cached:' + input)); }
    };
  };
  const context = vm.createContext({ URL, Request, Response, location: { origin, href: origin + '/sw.js' },
    self: { addEventListener: (name, fn) => { handlers[name] = fn; }, skipWaiting() {}, clients: { claim: async () => {} } },
    caches: { open, keys: async () => [...stores.keys()], delete: async name => stores.delete(name),
      match: async input => { for (const store of stores.values()) if (store.has(url(input))) return store.get(url(input)).clone(); } },
    fetch: async req => { if (offline) throw new Error('offline'); return new Response('network:' + url(req)); }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8'), context);
  return { stores, open,
    offline(value = true) { offline = value; }, failCache(value = true) { failCache = value; },
    async fetch(path, mode = 'cors') {
      const tasks = []; let response;
      handlers.fetch({ request: { url: origin + path, method: 'GET', mode }, respondWith: p => { response = p; }, waitUntil: p => tasks.push(p) });
      const res = await response; await Promise.all(tasks); return res;
    },
    async activate() { const tasks = []; handlers.activate({ waitUntil: p => tasks.push(p) }); await Promise.all(tasks); }
  };
}

test('version checks never accumulate cache entries', async () => {
  const app = boot();
  for (let i = 0; i < 20; i++) await app.fetch('/version.json?t=' + i);
  assert.equal([...app.stores.values()].reduce((n, s) => n + s.size, 0), 0);
});

test('keeps two code versions, normalizes other query strings, and bounds the cache', async () => {
  const app = boot();
  await app.fetch('/index.html?source=1'); await app.fetch('/index.html?source=2');
  for (let i = 0; i < 6; i++) await app.fetch('/js/app.min.js?v=' + i);
  let keys = [...app.stores.get('ps-code-v1').keys()];
  assert.equal(keys.filter(k => k.includes('app.min.js')).length, 2);
  assert.deepEqual(keys.filter(k => k.includes('index.html')), ['https://game.test/index.html']);
  for (let i = 0; i < 160; i++) await app.fetch('/page-' + i + '.html');
  keys = [...app.stores.get('ps-code-v1').keys()];
  assert.ok(keys.length <= 128); assert.ok(keys.includes('https://game.test/index.html'));
});

test('activation removes old timestamp entries and excess bundles', async () => {
  const app = boot(), cache = await app.open('ps-code-v1');
  for (let i = 0; i < 10; i++) { await cache.put('/version.json?t=' + i, new Response('version')); await cache.put('/js/app.min.js?v=' + i, new Response('bundle')); }
  await cache.put('/index.html', new Response('home')); await app.activate();
  const keys = [...app.stores.get('ps-code-v1').keys()];
  assert.equal(keys.length, 3); assert.ok(keys.every(k => !k.includes('version.json')));
});

test('offline code and navigation still work, and art retries share one cache entry', async () => {
  const app = boot();
  await app.fetch('/index.html'); await app.fetch('/js/app.min.js?v=abc');
  await app.fetch('/assets/pokemon/1/Idle.png?r=1'); await app.fetch('/assets/pokemon/1/Idle.png?r=2');
  assert.equal(app.stores.get('ps-art-v1').size, 1);
  app.offline();
  assert.equal(await (await app.fetch('/js/app.min.js?v=abc')).text(), 'network:https://game.test/js/app.min.js?v=abc');
  assert.equal(await (await app.fetch('/missing', 'navigate')).text(), 'network:https://game.test/index.html');
  assert.equal((await app.fetch('/missing.js')).type, 'error');
});

test('cache failures do not replace a successful network response', async () => {
  const app = boot(); app.failCache();
  assert.equal((await app.fetch('/index.html')).status, 200);
  assert.equal((await app.fetch('/assets/pokemon/1/Idle.png')).status, 200);
});
