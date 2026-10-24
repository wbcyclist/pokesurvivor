const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function boot() {
  const noop = () => {}, notices = [], events = [];
  const G = {
    Camera: { zoom: 1, zoomTo: 1 }, Game: { state: 'playing' },
    Gamepad: { mode: true, label: () => 'L2' }, Touch: { active: false },
    U: { pick: list => list[0], dist2: (x, y, a, b) => (x - a) ** 2 + (y - b) ** 2 },
    T: s => s, Spawner: { say: s => notices.push(s) },
    Audio: { sfx: noop }, FX: { dmgText: noop, ring: noop },
    Coop: { active: false, isHost: false, orbUsed: (...args) => events.push(args) },
    DEX: [1, 2, 3, 4, 5].map(rarity => ({ dex: rarity, gen: 1, rarity })),
    SPRITE_META: { 1: {}, 2: {}, 3: {}, 4: {}, 5: {} }, Sprites: { hasShiny: () => true }
  };
  const context = vm.createContext({ G, performance: { now: () => 1 }, Date, Math: Object.assign(Object.create(Math), { random: () => 0.1 }) });
  for (const file of ['js/systems/orbs.js', 'js/systems/gacha.js']) vm.runInContext(source(file), context);
  const player = { x: 0, y: 0, bodyH: 16, critChance: 0.1, spdMul: 1, dead: false };
  G.Game.player = player;
  return { G, player, notices, events };
}

test('orbs keep stable slots, cap stacks and use the active controller label', () => {
  const { G, player, notices } = boot();
  G.Orbs.got(player, 'focus');
  assert.ok(notices[0].includes('L2 para usarla'));
  assert.equal(G.Orbs.add(player, 'focus'), true);
  assert.equal(G.Orbs.add(player, 'focus'), true);
  assert.equal(G.Orbs.add(player, 'focus'), false);
  for (const id of ['quick', 'luminous', 'slow']) assert.equal(G.Orbs.add(player, id), true);
  assert.equal(G.Orbs.add(player, 'slumber'), false);
  G.Orbs.take(player, 'quick');
  assert.equal(player.orbs[1], null);
  assert.equal(player.orbs[2].id, 'luminous');
  assert.equal(G.Orbs.add(player, 'slumber'), true);
  assert.equal(player.orbs[1].id, 'slumber');
});

test('orb buffs refresh without stacking and expire once; paused runs cannot consume them', () => {
  const { G, player } = boot();
  G.Orbs.add(player, 'focus'); G.Orbs.add(player, 'focus');
  G.Game.state = 'paused'; G.Orbs.useSelected(player);
  assert.equal(player.orbs[0].n, 2);
  G.Game.state = 'playing'; G.Orbs.useSelected(player);
  assert.equal(player.critChance, 0.35);
  G.Orbs.useSelected(player); assert.equal(player.orbs[0].n, 1);
  G.Orbs.update(1, player); G.Orbs.useSelected(player);
  assert.equal(player.critChance, 0.35);
  G.Orbs.update(15, player); G.Orbs.update(1, player);
  assert.ok(Math.abs(player.critChance - 0.1) < 1e-9);
  G.Orbs.add(player, 'luminous'); G.Orbs.useSelected(player);
  assert.equal(G.Camera.zoomTo, 1.35);
  G.Orbs.update(15, player); assert.equal(G.Camera.zoomTo, 1);
});

test('co-op guest orb use consumes locally, notifies the host and bounds teammate buffs', () => {
  const { G, player, events } = boot();
  G.Coop.active = true;
  G.Orbs.add(player, 'slumber'); G.Orbs.useSelected(player);
  assert.equal(player.orbs[0], null);
  assert.deepEqual(events[0], ['slumber', 0, 0, 1]);
  assert.equal(G.Orbs.onMateUse(player, 'slumber', 0, 0, 1), false);
  G.Orbs.nearBuff('quick', 1000, 0); assert.equal(player.spdMul, 1);
  G.Orbs.nearBuff('quick', 100, 0); assert.equal(player.spdMul, 1.4);
  G.Orbs.update(10, player); assert.equal(player.spdMul, 1);
});

test('100 pulls charge exactly once and keep an epic guarantee in each group of ten', () => {
  const { G } = boot();
  for (const use of ['t1', 't10']) {
    const save = { owned: {}, tickets: { t1: 100, t10: 10 }, stats: {}, coins: 0 };
    const draws = G.Gacha.pull(save, 100, 1, use);
    assert.equal(draws.length, 100);
    assert.equal(save.tickets[use], 0);
    assert.equal(save.tickets[use === 't1' ? 't10' : 't1'], use === 't1' ? 10 : 100);
    assert.equal(save.stats.pulls, 100);
    for (let i = 0; i < 100; i += 10) assert.ok(draws.slice(i, i + 10).some(r => r.rarity >= 4));
    const before = JSON.stringify(save);
    assert.equal(G.Gacha.pull(save, 100, 1, use), null);
    assert.equal(JSON.stringify(save), before);
  }
});

test('regional shiny charm requires the whole regional collection, including legendaries', () => {
  const { G } = boot(), save = { owned: { 1: {}, 2: {}, 3: {}, 4: {} } };
  assert.equal(G.Gacha.hasIris(save, 1), false);
  assert.equal(G.Gacha.shinyRate(save, 1), 0.01);
  save.owned[5] = {};
  assert.equal(G.Gacha.hasIris(save, 1), true);
  assert.equal(G.Gacha.shinyRate(save, 1), 0.02);
});
