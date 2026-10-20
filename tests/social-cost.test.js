const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function boot(knownFriends = false) {
  const storage = new Map([['ps.nick.me', 'Trainer']]), calls = [], listeners = new Map();
  if (knownFriends) storage.set('ps.hasfr.me', '1');
  const G = {
    Lan: { enabled: false, on() {} },
    DB: { online: true, user: 'Trainer', onLeave() {}, fb: { uid: 'me', fs: {
      collection(name) {
        calls.push(name);
        return { where() { return this; }, onSnapshot(fn) {
          listeners.set(name, fn);
          return () => listeners.delete(name);
        } };
      }
    } } }
  };
  const context = vm.createContext({
    G, console, clearInterval() {},
    fetch: async () => ({ headers: { get: () => null } }),
    localStorage: { getItem: k => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/net/social.js'), 'utf8'), context);
  return { social: G.Social, calls, listeners, storage };
}

test('social startup has no friend reads or presence writes until friends are requested', async () => {
  const app = boot();
  assert.equal(await app.social.start(), 'ok');
  app.social.setPlaying(true); await app.social.refreshPresence();
  assert.deepEqual(app.calls, []);
  const first = app.social.ensureFriends(), second = app.social.ensureFriends();
  assert.equal(first, second); assert.deepEqual(app.calls, ['friendships']);
  app.listeners.get('friendships')({ forEach: fn => fn({
    id: 'me_friend', data: () => ({ users: ['me', 'friend'], status: 'ok', from: 'me', names: { friend: 'Friend' } })
  }) });
  await first;
  assert.equal(app.social.friends[0].uid, 'friend');
  assert.deepEqual(app.calls, ['friendships', 'inv']);
  assert.equal(app.storage.get('ps.hasfr.me'), '1');
  await app.social.stop('logout');
  assert.equal(app.listeners.size, 0);
  assert.equal(app.calls.includes('pres'), false);
});

test('known friends enable invitations at startup without reading the friend list', async () => {
  const app = boot(true);
  await app.social.start();
  assert.deepEqual(app.calls, ['inv']);
});
