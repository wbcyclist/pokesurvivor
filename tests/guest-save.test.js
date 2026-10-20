const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../js/core/db.js'), 'utf8');
const SAVE = 'ps.guest.save', ACTIVE = 'ps.guest.active';

function boot(data = new Map(), { cloud = false, lan = false, user = null, remote = null, failSDK = false, transaction = null } = {}) {
  const events = {}, documentEvents = {}, requests = [], timers = new Map();
  let timerId = 0, now = Date.now(), read = null;
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
    G: { Lan: { enabled: lan }, FIREBASE_CONFIG: cloud ? { apiKey: 'test', projectId: 'test' } : null,
      DEX_BY: { 1: {}, 4: {} }, Upgrades: { BY: { hp: { max: 5 } } } },
    localStorage: storage, location: { protocol: 'http:', hostname: 'localhost' }, navigator: { onLine: true },
    window: {}, TextEncoder, Uint8Array, Date: class extends Date { static now() { return now; } }, console: { warn() {} },
    setTimeout(fn, ms) { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: id => timers.delete(id),
    addEventListener(name, fn) { (events[name] ||= []).push(fn); },
    document: { hidden: false, visibilityState: 'visible',
      addEventListener(name, fn) { (documentEvents[name] ||= []).push(fn); },
      createElement: () => ({}), head: { appendChild(el) { queueMicrotask(() => failSDK ? el.onerror() : el.onload()); } } },
    firebase: { initializeApp() {}, auth: authFactory, firestore: () => ({
      settings() {}, collection: () => ({ doc: uid => ({ get: async () => { requests.push(['read', uid]); return read ? read(uid) : { exists: !!remote, data: () => ({ save: JSON.parse(JSON.stringify(remote)) }) }; } }) }),
      runTransaction(fn) { requests.push(['write']); return transaction ? transaction(fn) : Promise.resolve(); }
    }) }
  });
  context.firebase.firestore.FieldValue = { serverTimestamp: () => 0 };
  vm.runInContext(source, context);
  return { db: context.G.DB, context, data, requests, timers,
    advance(ms) { now += ms; }, setRemote(value) { remote = value; }, setRead(fn) { read = fn; },
    block(value = true) { blocked = value; },
    emit(name) { for (const fn of events[name] || []) fn(); },
    hide() { context.document.hidden = true; context.document.visibilityState = 'hidden'; for (const fn of documentEvents.visibilitychange || []) fn(); },
    show() { context.document.hidden = false; context.document.visibilityState = 'visible'; for (const fn of documentEvents.visibilitychange || []) fn(); } };
}

function progress(db) {
  db.save.partner = 1; db.save.starter = 1; db.grant(1, 'starter'); db.grantShiny(4, 'wild');
  db.save.coins = 734; db.save.pupg = { 1: { hp: 2 } }; db.save.tickets.t1 = 3;
  db.save.ach.first = 123; db.save.stats.runs = 2; db.save.stats.bestTime = 97;
}

test('LAN mode skips Firebase even on localhost and preserves local guest saves', async () => {
  const app = boot(new Map(), { cloud: true, lan: true });
  app.context.document.head.appendChild = () => { assert.fail('LAN must not load a cloud SDK'); };
  assert.equal(await app.db.ready(), false);
  assert.equal(app.db.mode, 'local'); assert.equal(app.db.localReason, 'lan');
  app.db.playAsGuest(); progress(app.db); app.db.commit('run');
  const next = boot(app.data, { cloud: true, lan: true });
  assert.equal(await next.db.ready(), true);
  assert.equal(next.db.save.coins, 734); assert.equal(next.db.online, false);
  assert.deepEqual(app.requests, []);
});

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

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function cloudFixture(transaction) {
  const seed = boot(); await seed.db.ready(); seed.db.playAsGuest(); seed.db.save.partner = 1; seed.db.commit();
  const remote = JSON.parse(seed.data.get(SAVE));
  const app = boot(new Map(), { cloud: true, user: { uid: 'old-account' }, remote, transaction });
  await app.db.ready();
  return app;
}

test('logout waits for an in-flight upload before opening a guest save', async () => {
  const done = deferred();
  const app = await cloudFixture(() => done.promise);
  const upload = app.db.flush();
  let loggedOut = false;
  const logout = app.db.logout().then(() => { loggedOut = true; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(loggedOut, false);
  done.resolve(); await upload; await logout;
  app.db.playAsGuest(); assert.equal(app.db.syncState, 'local'); assert.equal(app.data.has('ps.cloud.null'), false);
});

test('an old transaction cannot read a new guest save or change its sync state', async () => {
  const gate = deferred(), writes = [];
  const app = await cloudFixture(fn => gate.promise.then(() => fn({
    get: async () => ({ exists: false }), set: (ref, doc) => writes.push(doc)
  })));
  app.db.grant(4, 'old'); const upload = app.db.flush();
  app.db.playAsGuest(); gate.resolve(); await upload;
  assert.equal(writes.length, 0); assert.equal(app.db.owns(4), false);
  assert.equal(app.db.syncState, 'local'); assert.equal(app.data.has('ps.cloud.null'), false);
});

test('an upload completion from a previous account cannot merge into the next account', async () => {
  const done = deferred(), prepared = deferred();
  const app = await cloudFixture(async fn => {
    await fn({ get: async () => ({ exists: false }), set() {} });
    prepared.resolve(); await done.promise;
  });
  app.db.grant(4, 'old'); const upload = app.db.flush(); await prepared.promise;
  await app.db.login('Trainer', 'secret');
  assert.equal(app.db.fb.uid, 'account'); assert.equal(app.db.owns(4), false);
  done.resolve(); await upload;
  assert.equal(app.db.owns(4), false); assert.equal(app.data.has('ps.cloudok.account'), false);
  assert.equal(JSON.parse(app.data.get('ps.cloud.account')).owned[4], undefined);
});

test('upload retries use the original snapshot and preserve later local edits', async () => {
  const read = deferred(), writes = [];
  const app = await cloudFixture(fn => fn({ get: () => read.promise, set: (ref, doc) => writes.push(doc) }));
  app.db.grant(1, 'before'); const upload = app.db.flush();
  app.db.grant(4, 'during'); app.db.save.coins = 123; app.db.commit();
  read.resolve({ exists: false }); await upload;
  assert.equal(writes[0].save.owned[4], undefined);
  assert.equal(app.db.owns(4), true); assert.equal(app.db.save.coins, 123);
  assert.equal([...app.timers.values()].some(t => t.ms === 12000), false);
});

test('a timed-out transaction cannot write later or affect a new session', async () => {
  const read = deferred(), writes = [];
  const app = await cloudFixture(fn => fn({ get: () => read.promise, set: (ref, doc) => writes.push(doc) }));
  const upload = app.db.flush();
  [...app.timers.values()].find(t => t.ms === 12000).fn(); await upload;
  app.db.playAsGuest(); read.resolve({ exists: false });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(writes.length, 0); assert.equal(app.db.syncState, 'local');
});

test('an old completion cannot clear the next account upload lock', async () => {
  const done = [deferred(), deferred()], prepared = [deferred(), deferred()]; let count = 0;
  const app = await cloudFixture(async fn => {
    const index = count++;
    await fn({ get: async () => ({ exists: false }), set() {} });
    prepared[index].resolve(); await done[index].promise;
  });
  const oldUpload = app.db.flush(); await prepared[0].promise;
  await app.db.login('Trainer', 'secret');
  const newUpload = app.db.flush(); await prepared[1].promise;
  done[0].resolve(); await oldUpload;
  const duplicate = app.db.flush(); await Promise.resolve();
  assert.equal(count, 2);
  done[1].resolve(); await newUpload; await duplicate;
  assert.equal(count, 2); assert.equal(app.db.fb.uid, 'account');
});

test('device ledgers merge earned and spent currency once across uploads and reloads', async () => {
  const seed = boot(); await seed.db.ready(); seed.db.playAsGuest();
  seed.db.save.tickets = { t1: 10, t10: 2 }; seed.db.commit();
  let remote = JSON.parse(seed.data.get(SAVE));
  const transaction = fn => fn({
    get: async () => ({ exists: true, data: () => ({ save: structuredClone(remote), ban: true }) }),
    set(ref, doc) { remote = structuredClone(doc.save); assert.equal(doc.ban, true); }
  });
  const device = id => boot(new Map([['ps.dev', JSON.stringify(id)]]), {
    cloud: true, user: { uid: 'account' }, remote, transaction
  });
  const a = device('devicea'), b = device('deviceb');
  await a.db.ready(); await b.db.ready();
  a.db.save.coins += 100; a.db.save.tickets.t1 += 2; a.db.save.tickets.t10--;
  b.db.save.coins -= 150; b.db.save.tickets.t1 -= 3; b.db.save.tickets.t10++;
  a.db.commit(); b.db.commit();
  await a.db.flush(); await b.db.flush();
  assert.equal(remote.coins, 450);
  assert.deepEqual(remote.tickets, { t1: 9, t10: 2 });
  assert.deepEqual(remote.led.devicea.c, [100, 0]);
  assert.deepEqual(remote.led.deviceb.c, [0, 150]);
  a.advance(65001); await a.db.flush();
  assert.equal(remote.coins, 450); assert.deepEqual(remote.tickets, { t1: 9, t10: 2 });
  const next = boot(a.data, { cloud: true, user: { uid: 'account' }, remote });
  await next.db.ready();
  assert.equal(next.db.save.coins, 450); assert.equal(next.db.save.tickets.t1, 9);
});

test('returning after thirty minutes pulls cloud progress only after the run ends', async () => {
  const app = await cloudFixture();
  app.context.G.Game = { state: 'playing' };
  const remote = JSON.parse(JSON.stringify(app.db.save)); remote.owned[4] = { at: 1, from: 'remote' };
  app.setRemote(remote); app.hide(); app.advance(30 * 60000 + 1); app.show();
  assert.equal(app.requests.filter(r => r[0] === 'read').length, 1);
  const retry = [...app.timers.values()].find(t => t.ms === 20000);
  assert.ok(retry); app.context.G.Game.state = 'ui'; retry.fn();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(app.db.owns(4), true);
  assert.equal(app.requests.filter(r => r[0] === 'read').length, 2);
  app.show(); assert.equal(app.requests.filter(r => r[0] === 'read').length, 2);
});

test('a delayed cloud pull cannot change a new session for the same account', async () => {
  const app = await cloudFixture(), gate = deferred();
  await app.db.login('Trainer', 'secret');
  const stale = JSON.parse(JSON.stringify(app.db.save)); stale.owned[4] = { at: 1, from: 'old-session' };
  app.setRead(() => gate.promise);
  app.hide(); app.advance(30 * 60000 + 1); app.show();
  assert.equal(app.requests.filter(r => r[0] === 'read').length, 3);
  app.setRead(null); await app.db.logout(); await app.db.login('Trainer', 'secret');
  gate.resolve({ exists: true, data: () => ({ save: stale }) });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(app.db.fb.uid, 'account'); assert.equal(app.db.owns(4), false);
  assert.equal(JSON.parse(app.data.get('ps.cloud.account')).owned[4], undefined);
});

test('entering guest mode cancels a cloud pull waiting for the menu', async () => {
  const app = await cloudFixture(); app.context.G.Game = { state: 'playing' };
  app.hide(); app.advance(30 * 60000 + 1); app.show();
  assert.equal([...app.timers.values()].some(t => t.ms === 20000), true);
  app.db.playAsGuest();
  assert.equal([...app.timers.values()].some(t => t.ms === 20000), false);
});

test('cloud changes wait 30 minutes without tab-hide uploads; manual save stays available', async () => {
  const app = await cloudFixture();
  const before = app.requests.filter(r => r[0] === 'write').length;
  app.db.grant(4, 'test'); app.db.commit(true);
  const scheduled = [...app.timers.values()].find(t => t.ms === 30 * 60 * 1000);
  assert.ok(scheduled);
  app.advance(5 * 60 * 1000); app.db.commit(true); app.hide();
  assert.equal(app.requests.filter(r => r[0] === 'write').length, before);
  assert.equal([...app.timers.values()].includes(scheduled), true);
  await app.db.saveNow();
  assert.equal(app.requests.filter(r => r[0] === 'write').length, before + 1);
});
