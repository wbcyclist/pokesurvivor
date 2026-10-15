const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../js/core/db.js'), 'utf8');
const SAVE = 'ps.guest.save', ACTIVE = 'ps.guest.active';

function boot(data = new Map(), { cloud = false, user = null, remote = null, failSDK = false } = {}) {
  const events = {}, documentEvents = {}, requests = [];
  let blocked = false;
  const storage = {
    getItem: key => data.get(key) ?? null,
    setItem(key, value) { if (blocked) throw new Error('QuotaExceededError'); data.set(key, String(value)); },
    removeItem: key => data.delete(key), key: i => [...data.keys()][i], get length() { return data.size; }
  };
  const auth = {
    currentUser: user, setPersistence: async () => {},
    onAuthStateChanged(fn) { queueMicrotask(() => fn(user)); return () => {}; },
    signOut: async () => {},
    signInWithEmailAndPassword: async () => ({ user: { uid: 'account', displayName: 'Trainer' } })
  };
  const authFactory = Object.assign(() => auth, { Auth: { Persistence: { LOCAL: 'local' } } });
  const context = vm.createContext({
    G: { FIREBASE_CONFIG: cloud ? { apiKey: 'test', projectId: 'test' } : null,
      DEX_BY: { 1: {}, 4: {} }, Upgrades: { BY: { hp: { max: 5 } } } },
    localStorage: storage, location: { protocol: 'http:', hostname: 'localhost' }, navigator: { onLine: true },
    window: {}, TextEncoder, Uint8Array, console: { warn() {} },
    setTimeout: () => 1, clearTimeout() {},
    addEventListener(name, fn) { (events[name] ||= []).push(fn); },
    document: { hidden: false, visibilityState: 'visible',
      addEventListener(name, fn) { (documentEvents[name] ||= []).push(fn); },
      createElement: () => ({}), head: { appendChild(el) { queueMicrotask(() => failSDK ? el.onerror() : el.onload()); } } },
    firebase: { initializeApp() {}, auth: authFactory, firestore: () => ({
      settings() {}, collection: () => ({ doc: uid => ({ get: async () => { requests.push(['read', uid]); return { exists: !!remote, data: () => ({ save: remote }) }; } }) }),
      runTransaction() { requests.push(['write']); return Promise.resolve(); }
    }) }
  });
  vm.runInContext(source, context);
  return { db: context.G.DB, context, data, requests,
    block(value = true) { blocked = value; },
    emit(name) { for (const fn of events[name] || []) fn(); },
    hide() { context.document.hidden = true; context.document.visibilityState = 'hidden'; for (const fn of documentEvents.visibilitychange || []) fn(); } };
}

function progress(db) {
  db.save.partner = 1; db.save.starter = 1; db.grant(1, 'starter'); db.grantShiny(4, 'wild');
  db.save.coins = 734; db.save.pupg = { 1: { hp: 2 } }; db.save.tickets.t1 = 3;
  db.save.ach.first = 123; db.save.stats.runs = 2; db.save.stats.bestTime = 97;
}

test('a fresh browser stays at login, then guest progress survives a new page', async () => {
  const app = boot(); assert.equal(await app.db.ready(), false); assert.equal(app.data.has(SAVE), false);
  assert.equal(app.db.playAsGuest().isNew, true);
  progress(app.db); assert.equal(app.db.commit('run'), true);
  const next = boot(app.data); assert.equal(await next.db.ready(), true);
  assert.equal(next.db.guest, true); assert.equal(next.db.online, false);
  assert.equal(next.db.save.partner, 1); assert.equal(next.db.save.coins, 734);
  assert.equal(next.db.owns(1), true); assert.equal(next.db.ownsShiny(4), true);
  assert.equal(next.db.save.pupg[1].hp, 2); assert.equal(next.db.save.tickets.t1, 3);
  assert.equal(next.db.save.ach.first, 123); assert.equal(next.db.save.stats.runs, 2);
  assert.equal(next.db.save.stats.bestTime, 97);
  next.db.save.coins = 700; assert.equal(next.db.playAsGuest().isNew, false);
  assert.equal(next.db.save.coins, 700);
});

test('page hide and tab hide save guest progress without a run snapshot', async () => {
  const app = boot(); await app.db.ready(); app.db.playAsGuest(); progress(app.db);
  app.emit('pagehide'); assert.equal(JSON.parse(app.data.get(SAVE)).coins, 734);
  app.db.save.coins = 812; app.hide();
  const next = boot(app.data); await next.db.ready(); assert.equal(next.db.save.coins, 812);
  assert.equal('run' in next.db.save, false);
});

test('logout preserves the guest save and requires explicit guest re-entry', async () => {
  const app = boot(); await app.db.ready(); app.db.playAsGuest(); progress(app.db);
  await app.db.logout(); assert.equal(app.data.has(ACTIVE), false);
  const next = boot(app.data); assert.equal(await next.db.ready(), false);
  assert.equal(next.db.playAsGuest().isNew, false); assert.equal(next.db.save.coins, 734);
});

test('guest and local account saves remain separate through login and logout', async () => {
  const app = boot(); await app.db.ready(); app.db.playAsGuest(); progress(app.db); app.db.commit();
  assert.equal((await app.db.register('Trainer', 'secret')).ok, true);
  assert.equal(app.db.guest, false); assert.equal(app.db.save.coins, 500); assert.equal(app.data.has(ACTIVE), false);
  app.db.save.coins = 901; app.db.commit();
  const next = boot(app.data); await next.db.ready(); assert.equal(next.db.guest, false); assert.equal(next.db.save.coins, 901);
  await next.db.logout(); assert.equal(await boot(app.data).db.ready(), false);
  next.db.playAsGuest(); assert.equal(next.db.save.coins, 734);
  assert.equal((await next.db.login('Trainer', 'wrong')).ok, false); assert.equal(next.db.guest, true);
  assert.equal((await next.db.login('Trainer', 'secret')).ok, true); assert.equal(next.db.save.coins, 901);
  assert.equal(JSON.parse(app.data.get(SAVE)).coins, 734); assert.equal(app.data.has(ACTIVE), false);
});

test('active guests restore with Firebase configured and never read or upload account saves', async () => {
  const seed = boot(); await seed.db.ready(); seed.db.playAsGuest(); progress(seed.db); seed.db.commit();
  const app = boot(seed.data, { cloud: true, user: { uid: 'account' } });
  assert.equal(await app.db.ready(), true); assert.equal(app.db.mode, 'cloud'); assert.equal(app.db.guest, true);
  app.db.save.coins = 456; app.db.commit(true); await app.db.flush(); app.emit('pagehide');
  assert.deepEqual(app.requests, []); assert.equal(app.db.fb.uid, null); assert.equal(app.db.online, false);
  assert.equal(JSON.parse(app.data.get(SAVE)).coins, 456);
});

test('an account login uses its own cloud save and does not import guest progress', async () => {
  const seed = boot(); await seed.db.ready(); seed.db.playAsGuest(); progress(seed.db); seed.db.commit();
  const remote = JSON.parse(seed.data.get(SAVE)); remote.coins = 250; remote.owned = {}; remote.shiny = {}; remote.partner = null;
  const app = boot(seed.data, { cloud: true, remote }); await app.db.ready();
  assert.equal((await app.db.login('Trainer', 'secret')).ok, true);
  assert.equal(app.db.guest, false); assert.equal(app.db.save.coins, 250); assert.equal(app.db.ownsShiny(4), false);
  assert.equal(app.data.has(ACTIVE), false); assert.equal(JSON.parse(app.data.get(SAVE)).coins, 734);
  const next = boot(app.data, { cloud: true, user: { uid: 'account' }, remote });
  assert.equal(await next.db.ready(), true); assert.equal(next.db.guest, false); assert.equal(next.db.save.coins, 250);
});

test('guest saves restore when the cloud SDK fails and migrate older save fields', async () => {
  const data = new Map([[ACTIVE, 'true'], [SAVE, JSON.stringify({ name: 'Invitado', v: 1, coins: 12, partner: 1, owned: { 1: {} }, upgrades: { hp: 2 }, pity: 3 })]]);
  const app = boot(data, { cloud: true, failSDK: true });
  assert.equal(await app.db.ready(), true); assert.equal(app.db.guest, true);
  assert.equal(app.db.save.pupg[1].hp, 2); assert.equal(app.db.save.pity[1], 3); assert.equal(app.db.save.v, 3);
});

test('invalid guest data does not crash startup or replace the stored copy', async () => {
  for (const invalid of ['{broken', 'null', '[]', '42', '{"stats":"invalid"}']) {
    const data = new Map([[ACTIVE, 'true'], [SAVE, invalid]]), app = boot(data);
    assert.equal(await app.db.ready(), false); assert.equal(app.db.loggedIn, false);
    assert.equal(data.get(SAVE), invalid);
  }
});

test('failed storage writes retain the last save, report failure, and can recover', async () => {
  const app = boot(); await app.db.ready(); app.db.playAsGuest(); progress(app.db); app.db.commit();
  app.block(); app.db.save.coins = 999;
  assert.equal(app.db.commit(), false); assert.equal(app.db.storageOk, false);
  assert.equal(JSON.parse(app.data.get(SAVE)).coins, 734);
  app.block(false); assert.equal(app.db.commit(), true); assert.equal(app.db.storageOk, true);
  const next = boot(app.data); await next.db.ready(); assert.equal(next.db.save.coins, 999);
});
