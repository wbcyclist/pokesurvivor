const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function boot() {
  let time = Date.now(), fail = false, friendsLoaded = 0;
  const storage = new Map(), docs = new Map(), reads = [], writes = [];
  const snapshot = key => ({ exists: docs.has(key), data: () => docs.get(key) });
  const ref = key => ({
    key, collection: name => ref(key + '/' + name), doc: id => ref(key + '/' + id),
    async get() { reads.push(key); return snapshot(key); },
    async set(value) {
      writes.push(key);
      if (fail) throw new Error('offline');
      docs.set(key, value);
    }
  });
  const database = {
    collection: name => ref(name),
    runTransaction: fn => fn({
      get: r => r.get(),
      set(r, value) { writes.push(r.key); docs.set(r.key, value); }
    })
  };
  const G = {
    DB: { online: true, fb: { uid: 'me', fs: database } },
    Social: { me: { name: 'Trainer' }, friends: [], async ensureFriends() { friendsLoaded++; } },
    UI: { toast() {} },
    U: { str: (s, n) => String(s).slice(0, n), int: (v, max) => Math.min(max, Math.max(0, v | 0)),
      list: (v, n) => Array.isArray(v) ? v.slice(0, n) : [] }
  };
  const context = vm.createContext({
    G, console: { warn() {} }, Date: class extends Date { static now() { return time; } },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => time } } },
    localStorage: {
      getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k), key: i => [...storage.keys()][i], get length() { return storage.size; }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/net/ranking.js'), 'utf8'), context);
  const ranking = G.Ranking;
  return { ranking, storage, docs, reads, writes,
    advance(ms) { time += ms; }, fail(value) { fail = value; },
    get friendsLoaded() { return friendsLoaded; },
    belowTop() {
      storage.set('ps.rk.thr', JSON.stringify(Object.fromEntries(
        ['d', 'w', 'm', 'a'].map(period => [ranking.board('s', period), 2000]))));
      storage.set('ps.rk.best2.me', JSON.stringify({ [ranking.board('s', 'a') + ':me']: 0 }));
    }
  };
}

const run = t => ({ t, dex: 25, lv: 20, kills: 100, shiny: false });
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };

test('ranking skips run-start writes and requires five minutes for Pokemon boards', async () => {
  const app = boot();
  app.ranking.runStarted('solo'); await settle();
  assert.deepEqual(app.writes, []);
  await app.ranking.submitSolo(run(299));
  assert.equal(app.writes.some(key => key.includes('_p25')), false);
  app.writes.length = 0;
  await app.ranking.submitSolo(run(300));
  assert.ok(app.writes.some(key => key.includes('_p25')));
  assert.equal(app.writes.some(key => key.startsWith('runs/')), false);
});

test('ranking caches summaries for two hours and loads friends only for friend rankings', async () => {
  const app = boot(), board = app.ranking.board('s', 'w');
  app.docs.set('lbs/' + board, { top: {} });
  await app.ranking.top('s', 'w');
  app.advance(119 * 60000); await app.ranking.top('s', 'w');
  assert.equal(app.reads.length, 1); assert.equal(app.friendsLoaded, 0);
  await app.ranking.top('s', 'w', null, true);
  assert.equal(app.friendsLoaded, 1);
  app.advance(2 * 60000); await app.ranking.top('s', 'w');
  assert.equal(app.reads.length, 2);
});

test('outside-top history keeps the best result and writes at most once per six hours', async () => {
  const app = boot(); app.belowTop();
  const board = app.ranking.board('s', 'a'), entry = 'lb/' + board + '/e/me';
  await app.ranking.submitSolo(run(200));
  await app.ranking.submitSolo(run(250));
  await app.ranking.submitSolo(run(230));
  assert.equal(app.docs.get(entry).t, 200); assert.equal(app.writes.length, 1);
  app.advance(6 * 3600000); app.ranking.runStarted(); await settle();
  assert.equal(app.docs.get(entry).t, 250); assert.equal(app.writes.length, 2);
});

test('failed deferred uploads keep the result and do not retry on every run', async () => {
  const app = boot(); app.belowTop();
  await app.ranking.submitSolo(run(200)); await app.ranking.submitSolo(run(250));
  app.advance(6 * 3600000); app.fail(true);
  app.ranking.runStarted(); await settle();
  const key = app.ranking.board('s', 'a') + ':me';
  assert.equal(JSON.parse(app.storage.get('ps.rk.def.me'))[key].e.t, 250);
  const count = app.writes.length;
  app.ranking.runStarted(); await settle(); assert.equal(app.writes.length, count);
  app.fail(false); app.advance(6 * 3600000); app.ranking.runStarted(); await settle();
  assert.equal(app.docs.get('lb/' + app.ranking.board('s', 'a') + '/e/me').t, 250);
});
