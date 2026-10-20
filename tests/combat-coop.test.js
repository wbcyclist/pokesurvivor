const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function boot() {
  const enemies = [], damage = [];
  const noop = () => {};
  const G = {
    LIFT: 8, Coop: { active: true, cast: noop },
    U: { TYPE_COLOR: {}, dist: (x, y, a, b) => Math.hypot(x - a, y - b),
      dist2: (x, y, a, b) => (x - a) ** 2 + (y - b) ** 2, rand: (a, b) => (a + b) / 2 },
    EnemyMgr: { all: () => enemies, queryCircle: () => enemies },
    Projectiles: { nearest: () => null }, VFX: { forMove: () => ({}) },
    FX: { ring: noop, beam: noop }, Camera: { sees: () => false, kick: noop },
    Types: { mult: () => 1, label: () => '' }, Stats: { taken: () => 1 }, Weather: { mult: () => 1 },
    World: { propsInCircle: () => [] }
  };
  const context = vm.createContext({ G, performance: { now: () => 0 } });
  for (const file of ['js/data/moves.js', 'js/systems/combat.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  const player = { x: 0, y: 0, r: 8, aim: 0, cdMul: 1, atkFor: () => 1, cast: noop, onDealt: noop, dmgDealt: 0 };
  const enemy = (extra = {}) => {
    const e = { id: enemies.length, x: 140, y: 0, bodyH: 16, hurt: value => damage.push(value), ...extra };
    enemies.push(e);
    return e;
  };
  return { G, player, enemy, damage };
}

test('guest vortex replicas pull host enemies without duplicating damage or moving remote enemies', () => {
  const { G, player, enemy, damage } = boot();
  const local = enemy(), boss = enemy({ boss: true }), remote = enemy({ remote: true });
  G.Combat.ghostCast(player, 'whirlpool', 1, 0, false);
  G.Combat.updateFields(0.2);
  assert.ok(local.x < 140);
  assert.ok(boss.x < 140 && boss.x > local.x);
  assert.equal(remote.x, 140);
  assert.deepEqual(damage, []);
});

test('Hex uses burn, poison and slow received from the host but ignores shields', () => {
  for (const state of [0, 1, 2, 4, 8]) {
    const { G, player, enemy, damage } = boot();
    const move = G.Moves.instance('hex');
    player.target = enemy({ remote: true, net: { st: state } });
    player.activeGroup = () => [move];
    G.Combat.tick(0.01, player, 0);
    assert.equal(damage[0], move.dmg * ([1, 2, 8].includes(state) ? move.hex : 1));
  }
});
