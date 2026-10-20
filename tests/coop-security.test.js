const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function boot(host = true) {
  let receive;
  const rings = [];
  const G = {
    Net: { uid: host ? 'host' : 'guest', on: fn => { receive = fn; }, onPeer() {} },
    DEX_BY: { 25: { dex: 25 } }, Player: class { constructor() { this.maxHp = 100; } },
    Sprites: { preload() {} }, baseStartOf: () => 'tackle', FX: { ring: (...args) => rings.push(args) }
  };
  const context = vm.createContext({ G, performance: { now: () => 1000 }, document: { addEventListener() {} } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/net/coop.js'), 'utf8'), context);
  G.Coop.begin({ host: 'host', members: [{ uid: 'host', dex: 25 }, { uid: 'guest', dex: 25 }] },
    { xpMul: 1 }, { syncTeam() {} });
  return { G, rings, receive: (sender, frame) => receive(sender, frame) };
}

test('co-op clamps untrusted player state before calculating team XP', () => {
  const { G, receive } = boot();
  receive('guest', { k: 'f', p: [Infinity, -1e20, NaN, 1, Infinity, -100, 0, 'x'.repeat(100), 1e10, 1e20, NaN, Infinity], ev: [] });
  const mate = G.Coop.mate('guest');
  assert.equal(mate.pl.net.x, 0); assert.equal(mate.pl.net.y, -1e6);
  assert.equal(mate.pl.net.maxHp, 1); assert.equal(mate.pl.net.mv.length, 40);
  assert.equal(mate.xpMul, 1); assert.equal(Number.isFinite(G.Coop.xpFactor()), true);
  receive('guest', { k: 'f', p: Array(12).fill(1e20), ev: [] });
  assert.equal(mate.xpMul, 20);
});

test('co-op bounds remote rings and ignores invalid colors', () => {
  const { receive, rings } = boot(false);
  receive('host', { k: 'f', ev: [['fxr', Infinity, NaN, 1e100, '#fff'], ['fxr', 0, 0, 10, {}]] });
  assert.equal(rings.length, 1);
  assert.deepEqual(rings[0], [0, 0, 8, 2000, '#fff', 0.5, 3]);
});
