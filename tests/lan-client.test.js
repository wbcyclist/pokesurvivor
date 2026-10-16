const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const WS = require('ws');
const { createLanServer } = require('../server/lan-server');

async function fixture(t) {
  const app = createLanServer();
  await app.listen(0, '127.0.0.1');
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  const contexts = [];
  t.after(async () => { for (const G of contexts) G.Lan.close(); await app.close(); });
  function browser(version = app.version, bundleVersion = null) {
    const onLeave = [];
    class WebSocket extends WS { constructor(url) { super(url, { origin }); } }
    const context = vm.createContext({
      window: { POKESURVIVOR_LAN: { protocol: 1, version } }, location: new URL(origin),
      document: { querySelector: () => bundleVersion ? { getAttribute: () => 'js/app.min.js?v=' + bundleVersion } : null },
      WebSocket, console, setTimeout, clearTimeout, setInterval, clearInterval, addEventListener() {},
      G: { DB: { save: { partner: 25 }, user: 'Guest', ownsShiny: () => false, onLeave: fn => onLeave.push(fn) }, Game: { state: 'ui' } }
    });
    for (const file of ['lan', 'social', 'net']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/net/' + file + '.js'), 'utf8'), context);
    contexts.push(context.G);
    return { G: context.G, onLeave };
  }
  return { app, browser };
}
function event(register, match = () => true) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => reject(new Error('Event timeout')), 2000);
    register((...args) => { if (!done && match(...args)) { done = true; clearTimeout(timer); resolve(args); } });
  });
}

test('LAN uses the existing Social and Net contracts for room membership and ordered co-op frames', async t => {
  const { browser } = await fixture(t);
  const host = browser().G, guest = browser().G;
  assert.equal((await host.Lan.create('房主')).ok, true);
  const joined = event(host.Social.on, () => host.Social.room.members.length === 2);
  assert.equal((await guest.Lan.join('伙伴', host.Social.room.id)).ok, true);
  await joined;
  assert.equal(host.Social.me.name, '房主');
  assert.equal(host.Net.uid, host.Social.uid);
  assert.equal(guest.Net.hostUid, host.Net.uid);
  assert.equal(guest.Net.mode(host.Net.uid), 'lan');
  assert.equal(guest.Net.slow(host.Net.uid), false);
  const hostStart = event(host.Net.on, (_, msg) => msg.k === 'start');
  const guestStart = event(guest.Net.on, (_, msg) => msg.k === 'start');
  assert.equal((await host.Lan.startRun()).ok, true);
  assert.equal((await hostStart)[1].run, (await guestStart)[1].run);
  const frames = [];
  const received = event(guest.Net.on, (from, msg) => {
    frames.push([from, msg.t]); return frames.length === 3;
  });
  for (let t = 1; t <= 3; t++) host.Net.broadcast({ k: 'f', t });
  await received;
  assert.deepEqual(frames, [[host.Net.uid, 1], [host.Net.uid, 2], [host.Net.uid, 3]]);
  const toHost = event(host.Net.on, (_, msg) => msg.k === 'f');
  guest.Net.toHost({ k: 'f', p: [10, 20] });
  assert.equal((await toHost)[0], guest.Net.uid);
});

test('a lost host notifies co-op before the lobby closes, and guests can create a new room', async t => {
  const { browser } = await fixture(t);
  const h = browser(), g = browser();
  await h.G.Lan.create('Host');
  await g.G.Lan.join('Guest', h.G.Social.room.id);
  const order = [];
  g.G.Net.onPeer((_, mode) => { if (mode === 'closed') order.push('peer'); });
  const closed = event(g.G.Social.on, what => {
    if (what !== 'room-closed') return false;
    order.push('room'); return true;
  });
  await h.onLeave[0]('logout');
  await closed;
  assert.deepEqual(order, ['peer', 'room']);
  assert.equal(g.G.Social.room, null);
  assert.equal(g.G.Net.open_, false);
  assert.equal((await g.G.Lan.create('New host')).ok, true);
  await g.G.Social.leaveRoom();
  assert.equal(g.G.Social.room, null);
});

test('local room updates preserve chosen Pokemon and require a return to the lobby before another run', async t => {
  const { browser } = await fixture(t);
  const host = browser().G, guest = browser().G;
  await host.Lan.create('Host'); await guest.Lan.join('Guest', host.Social.room.id);
  host.DB.save.partner = 1;
  const updated = event(host.Social.on, () => host.Social.room.members[0].dex === 1);
  host.Social.refreshMember(); await updated;
  await host.Lan.startRun();
  host.Social.setPlaying(false); host.Social.setOpen(true); host.Social.refreshMember();
  const denied = await host.Lan.startRun();
  assert.equal(denied.ok, false);
  guest.Social.setPlaying(false); guest.Social.refreshMember();
  const ready = event(host.Social.on, () => host.Social.room.members.every(m => m.ready));
  await ready;
  assert.equal((await host.Lan.startRun()).ok, true);
});

test('incompatible game builds fail without leaving a room or pending connection', async t => {
  const { app, browser } = await fixture(t);
  const { G } = browser(app.version, '0000000000');
  const result = await G.Lan.create('Player');
  assert.equal(result.ok, false); assert.match(result.error, /versión/);
  assert.equal(G.Social.room, null);
  assert.equal(G.Net.open_, false);
});

test('a local server loss ends the host run instead of leaving it in an unconnected co-op session', async t => {
  const { browser } = await fixture(t);
  const { G } = browser();
  await G.Lan.create('Host');
  let saved = 0;
  G.Coop = { active: true };
  G.Game.quit = () => { saved++; G.Coop.active = false; };
  G.Lan.close();
  assert.equal(saved, 1);
  assert.equal(G.Social.room, null);
  G.Lan.close();
  assert.equal(saved, 1);
});
