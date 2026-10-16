const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../js/core/updater.js'), 'utf8');
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function boot({ forced = false, state = 'playing', flush = async () => {}, production = true, protocol = 'https:' } = {}) {
  let now = 1000000, id = 0, loop;
  const timers = new Map(), calls = [], screens = new Set();
  const game = { state, quit() { calls.push('quit'); this.state = 'over'; } };
  const context = vm.createContext({
    G: { Game: game, UI: { toast: text => calls.push(text), isOpen: name => screens.has(name) },
      DB: { syncState: 'pending', flush() { calls.push('flush'); return flush(); } } },
    Date: class extends Date { static now() { return now; } }, console: { log() {} },
    fetch: async () => ({ ok: true, json: async () => ({ v: 'bb22', force: forced }) }),
    location: { protocol, reload() { calls.push('reload'); } },
    document: {
      querySelector: () => production ? { getAttribute: () => 'js/app.min.js?v=aa11' } : null,
      getElementById: name => screens.has(name) ? {} : null, activeElement: null,
      addEventListener() {}
    },
    setTimeout(fn, ms) { timers.set(++id, { fn, due: now + ms }); return id; },
    clearTimeout: timer => timers.delete(timer),
    setInterval(fn) { loop = fn; return ++id; }, clearInterval() { loop = null; }
  });
  vm.runInContext(source, context);
  context.G.Updater.init();
  return { updater: context.G.Updater, game, calls, screens, context, timers,
    pulse() { if (loop) loop(); },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        timers.delete(next[0]); now = next[1].due; next[1].fn(); await settle();
      }
      now = end; await settle();
    }
  };
}

test('normal updates wait until the run ends and reload after the menu countdown', async () => {
  const app = boot(); await app.updater.check(); app.pulse(); await app.advance(20000);
  assert.equal(app.updater.pending, true); assert.deepEqual(app.calls, []);
  app.game.state = 'over'; app.pulse(); assert.deepEqual(app.calls, []);
  app.game.state = 'ui'; app.pulse(); await app.advance(4999);
  assert.equal(app.calls.includes('reload'), false);
  await app.advance(1); assert.deepEqual(app.calls.slice(-2), ['flush', 'reload']);
  assert.equal(app.calls.includes('quit'), false);
});

test('required updates end active and paused runs once after ten seconds, then flush before reload', async () => {
  for (const state of ['playing', 'paused', 'levelup']) {
    const app = boot({ forced: true, state }); await app.updater.check(); app.pulse();
    await app.advance(9999); assert.equal(app.calls.includes('quit'), false);
    await app.advance(1); assert.equal(app.game.state, 'over');
    assert.equal(app.calls.filter(call => call === 'quit').length, 1);
    assert.equal(app.calls.includes('reload'), false);
    app.pulse(); await app.advance(4000);
    assert.deepEqual(app.calls.slice(-3), ['quit', 'flush', 'reload']);
  }
});

test('finishing during a required update countdown does not quit the run twice', async () => {
  const app = boot({ forced: true }); await app.updater.check(); app.pulse();
  await app.advance(3000); app.game.state = 'over'; await app.advance(1000);
  assert.equal(app.calls.includes('quit'), false);
  assert.deepEqual(app.calls.slice(-2), ['flush', 'reload']);
});

test('required updates bound the cloud flush wait when the network does not respond', async () => {
  const app = boot({ forced: true, flush: () => new Promise(() => {}) });
  await app.updater.check(); app.pulse(); await app.advance(19999);
  assert.equal(app.calls.includes('reload'), false);
  await app.advance(1); assert.deepEqual(app.calls.slice(-3), ['quit', 'flush', 'reload']);
});

test('entering settings cancels a menu countdown until the screen is closed', async () => {
  const app = boot({ state: 'ui' }); await app.updater.check(); app.pulse();
  await app.advance(2000); app.screens.add('scr-settings'); await app.advance(1000);
  assert.equal(app.calls.includes('reload'), false); app.pulse();
  app.screens.clear(); app.pulse(); await app.advance(5000);
  assert.deepEqual(app.calls.slice(-2), ['flush', 'reload']);
});

test('development and file pages do not schedule automatic updates', async () => {
  for (const options of [{ production: false }, { protocol: 'file:' }]) {
    const app = boot(options); app.pulse(); await app.advance(60000);
    assert.equal(app.timers.size, 0); assert.deepEqual(app.calls, []);
  }
});
