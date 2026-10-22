const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

async function boot() {
  const data = { rooms: {} }, listeners = new Map(), timers = new Map(), writes = [], events = [], disconnects = [];
  let failed = false, timer = 0;
  const value = key => key.split('/').reduce((o, k) => o?.[k], data) ?? null;
  function put(key, v) {
    const parts = key.split('/'), last = parts.pop();
    const parent = parts.reduce((o, k) => o[k] ||= {}, data);
    if (v == null) delete parent[last]; else parent[last] = structuredClone(v);
  }
  function ref(key) {
    return {
      key: key.split('/').at(-1), child: sub => ref(key + '/' + sub), push: () => ref('rooms/room1'),
      get: async () => { if (failed) throw Error('offline'); return { val: () => value(key) }; },
      set: async v => { if (failed) throw Error('offline'); writes.push(key); put(key, v); },
      remove: async () => put(key, null),
      on(event, fn, error) { listeners.set(key, { fn, error }); }, off() { listeners.delete(key); },
      onDisconnect: () => ({ remove: () => { disconnects.push(key); }, cancel: async () => {} })
    };
  }
  const G = {
    Lan: { enabled: false, on() {} }, Coop: { keeps: () => true },
    DB: { online: true, user: 'Trainer', save: { partner: 813 }, ownsShiny: () => false, onLeave() {},
      fb: { uid: 'host', rtdb: { ref, goOnline() {}, goOffline() {} } } }
  };
  const context = vm.createContext({ G, console, structuredClone,
    localStorage: { getItem: k => k === 'ps.nick.host' ? 'Trainer' : null, setItem() {} },
    fetch: async () => ({ headers: { get: () => null } }),
    firebase: { database: { ServerValue: { TIMESTAMP: 1 } } },
    setTimeout(fn, ms) { timers.set(++timer, { fn, ms }); return timer; }, clearTimeout: id => timers.delete(id)
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/net/social.js'), 'utf8'), context);
  const social = G.Social;
  social.on(event => events.push(event));
  await social.start(); await social.createRoom();
  put('rooms/room1/m/guest', { name: 'Guest', dex: 1, at: 2 });
  listeners.get('rooms/room1/m').fn({ val: () => value('rooms/room1/m') });
  return { social, data, events, writes, disconnects,
    fail(value = true) { failed = value; },
    async lose() { listeners.get('rooms/room1/host').fn({ val: () => null }); await settle(); },
    async fire(ms) {
      const entry = [...timers].find(([, t]) => t.ms === ms);
      assert.ok(entry, `Missing ${ms} ms retry`); timers.delete(entry[0]); entry[1].fn(); await settle();
    }
  };
}

test('the host restores a lost RTDB room and its roster without ending an active run', async () => {
  const app = await boot();
  app.social.setPlaying(true);
  delete app.data.rooms.room1;
  await app.lose();
  assert.equal(app.social.room.lost, false);
  assert.equal(app.data.rooms.room1.host, 'host');
  assert.equal(app.data.rooms.room1.open, false);
  assert.deepEqual(Object.keys(app.data.rooms.room1.m).sort(), ['guest', 'host']);
  assert.equal(app.events.includes('room-closed'), false);
  assert.ok(app.disconnects.includes('rooms/room1'));
});

test('room recovery closes an idle room after three failures but keeps an active run', async () => {
  const idle = await boot(); idle.fail(); await idle.lose();
  await idle.fire(4000); await idle.fire(4000);
  assert.equal(idle.social.room, null); assert.ok(idle.events.includes('room-closed'));
  const active = await boot(); active.social.setPlaying(true); active.fail(); await active.lose();
  for (let i = 0; i < 4; i++) await active.fire(8000);
  assert.equal(active.social.room.lost, true); assert.equal(active.events.includes('room-closed'), false);
  await active.social.leaveRoom();
  const count = active.writes.length;
  active.fail(false); await active.fire(8000);
  assert.equal(active.social.room, null); assert.equal(active.writes.length, count);
});
