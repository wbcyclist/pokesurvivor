const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const WebSocket = require('ws');
const { createLanServer } = require('../server/lan-server');

async function fixture(t) {
  const app = createLanServer();
  await app.listen(0, '127.0.0.1');
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  const sockets = [];
  t.after(async () => { for (const ws of sockets) ws.terminate(); await app.close(); });
  async function client() {
    const ws = new WebSocket(origin.replace('http:', 'ws:') + '/lan', { origin });
    sockets.push(ws);
    const messages = [], waiters = [];
    ws.on('message', data => {
      const msg = JSON.parse(data);
      const i = waiters.findIndex(w => w.match(msg));
      if (i < 0) messages.push(msg);
      else { const w = waiters.splice(i, 1)[0]; clearTimeout(w.timer); w.resolve(msg); }
    });
    const next = match => {
      const i = messages.findIndex(match);
      if (i >= 0) return Promise.resolve(messages.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const w = { match, resolve };
        w.timer = setTimeout(() => reject(new Error('Message timeout')), 2000);
        waiters.push(w);
      });
    };
    const welcome = await next(m => m.op === 'welcome');
    let seq = 0;
    const request = (op, data = {}) => {
      const id = ++seq;
      ws.send(JSON.stringify({ ...data, op, id }));
      return next(m => m.op === 'reply' && m.id === id);
    };
    await request('hello', { protocol: 1, version: app.version });
    return { ws, next, request, uid: welcome.uid, messages };
  }
  return { app, origin, client };
}
const profile = name => ({ name, dex: 25, shiny: false });

test('LAN serves game pages with local configuration and blocks private files and foreign origins', async t => {
  const { origin } = await fixture(t);
  for (const page of ['/', '/dev.html', '/zh/', '/zh-tw/']) {
    const res = await fetch(origin + page);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /window\.POKESURVIVOR_LAN=/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  }
  for (const file of ['/package.json', '/server/lan-server.js', '/.git/config', '/work_tmp/test.html', '/tools/build.js', '/%2e%2e/meta/README.md']) {
    assert.equal((await fetch(origin + file)).status, 404, file);
  }
  assert.equal((await fetch(origin + '/js/net/coop.js')).status, 200);
  assert.equal((await fetch(origin + '/assets/pokemon/25/Idle.png')).status, 200);
  const ws = new WebSocket(origin.replace('http:', 'ws:') + '/lan', { origin: 'https://unrelated.test' });
  const [error] = await once(ws, 'error');
  assert.match(error.message, /403/);
});

test('rooms enforce capacity, host control, membership, and one shared start configuration', async t => {
  const { client } = await fixture(t);
  const host = await client(), guests = await Promise.all([client(), client(), client()]), extra = await client();
  const created = await host.request('create', { profile: profile('房主') });
  assert.equal(created.ok, true);
  const code = created.room.id;
  assert.match(code, /^[A-Z2-9]{6}$/);
  for (const [i, guest] of guests.entries()) assert.equal((await guest.request('join', { code, profile: profile('Player ' + i) })).ok, true);
  assert.equal((await extra.request('join', { code, profile: profile('Extra') })).error, 'full');
  assert.equal((await guests[0].request('start')).error, 'host-only');
  assert.equal((await host.request('start')).ok, true);
  const starts = await Promise.all([host, ...guests].map(c => c.next(m => m.op === 'start')));
  for (const event of starts) assert.deepEqual(event.cfg, starts[0].cfg);
  assert.equal(starts[0].cfg.members.length, 4);
  assert.equal(starts[0].cfg.host, host.uid);
  assert.equal((await host.request('start')).error, 'playing');
  assert.equal((await extra.request('join', { code, profile: profile('Late') })).error, 'playing');
});

test('only current run members can send frames through the host, with server-assigned sender IDs', async t => {
  const { client } = await fixture(t);
  const host = await client(), guest = await client(), stranger = await client();
  const code = (await host.request('create', { profile: profile('Host') })).room.id;
  await guest.request('join', { code, profile: profile('Guest') });
  await host.request('start');
  const { cfg } = await guest.next(m => m.op === 'start');
  const frame = { k: 'f', p: [3, 4], ev: [] };
  guest.ws.send(JSON.stringify({ op: 'data', to: host.uid, from: stranger.uid, run: cfg.run, data: frame }));
  const received = await host.next(m => m.op === 'data');
  assert.equal(received.from, guest.uid);
  assert.deepEqual(received.data, frame);
  assert.equal((await stranger.request('data', { to: host.uid, run: cfg.run, data: frame })).error, 'room-required');
  assert.equal((await guest.request('data', { to: host.uid, run: 'old', data: frame })).error, 'stale-run');
  assert.equal((await guest.request('data', { to: host.uid, run: cfg.run, data: { k: 'start' } })).error, 'invalid');
  assert.equal((await host.request('data', { to: stranger.uid, run: cfg.run, data: frame })).error, 'peer');
});

test('leaving and host disconnect release rooms, and a new run waits for everyone to return', async t => {
  const { client } = await fixture(t);
  const host = await client(), guest = await client();
  const code = (await host.request('create', { profile: profile('Host') })).room.id;
  await guest.request('join', { code, profile: profile('Guest') });
  await host.request('start');
  await host.request('finish');
  await host.request('reopen');
  await host.request('member', { profile: profile('Host'), ready: true });
  assert.equal((await host.request('start')).error, 'not-ready');
  await guest.request('finish');
  await guest.request('member', { profile: profile('Guest'), ready: true });
  assert.equal((await host.request('start')).ok, true);
  const closed = guest.next(m => m.op === 'room' && !m.room);
  host.ws.terminate();
  assert.equal((await closed).reason, 'host-left');
  assert.equal((await guest.request('join', { code, profile: profile('Guest') })).error, 'not-found');
  assert.equal((await guest.request('create', { profile: profile('New host') })).ok, true);
  assert.equal((await guest.request('leave')).ok, true);
});

test('invalid profiles, malformed input, and incompatible clients do not create rooms', async t => {
  const { app, client } = await fixture(t);
  const c = await client();
  assert.equal((await c.request('create', { profile: { ...profile('Good'), dex: 999999 } })).error, 'profile');
  assert.equal((await c.request('create', { profile: profile('<script>') })).error, 'profile');
  c.ws.send('null'); c.ws.send('{');
  assert.equal((await c.request('hello', { protocol: 99, version: app.version })).error, 'version');
  assert.equal((await c.request('create', { profile: profile('Player') })).error, 'version');
});
