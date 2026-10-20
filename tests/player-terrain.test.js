const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function boot(dex, liquid) {
  let axis = [1, 0], onLiquid = true, collisions = 0;
  const effects = [];
  const G = {
    Settings: { get: () => false }, Gamepad: { rumble() {} },
    Tiles: { T: 16, BIOMES: [{ liquid }] },
    Weather: { speedFor: () => 1 },
    Input: { axis: () => axis },
    EnemyMgr: { all: () => [] },
    Projectiles: { nearest: () => null, clearOrbs() {} },
    Audio: { sfx() {} }, Camera: { kick() {} },
    FX: { burst: () => effects.push('burst'), ring() {}, dmgText() {} }
  };
  const math = Object.create(Math);
  math.random = () => 0;
  const context = vm.createContext({ G, window: { G }, Math: math });
  for (const file of ['js/core/util.js', 'js/data/pokedex.js', 'js/data/sprites-meta.js',
    'js/core/sprites.js', 'js/systems/stats.js', 'js/world/world.js', 'js/entities/player.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  }
  G.World.isLiquid = () => onLiquid;
  G.World.collide = () => { collisions++; };
  G.World.nearestBreakable = () => null;
  const player = new G.Player(G.DEX_BY[dex]);
  return {
    G, player, effects,
    move(x, y) { axis = [x, y]; },
    terrain(value) { onLiquid = value; },
    get collisions() { return collisions; },
    tick(frames = 1) { for (let i = 0; i < frames; i++) player.update(1 / 60); }
  };
}

test('flying and hovering players ignore water and swamp slowdown and ice sliding', () => {
  for (const dex of [12, 151]) {
    for (const liquid of ['water', 'swamp', 'ice']) {
      const app = boot(dex, liquid), { player } = app;
      app.tick();
      player.x = 0;
      app.tick(60);
      assert.equal(player.inLiquid, true, `${dex}: ${liquid}`);
      assert.equal(player.hp, player.maxHp, `${dex}: ${liquid}`);
      assert.ok(Math.abs(player.x - player.baseSpd) < 1e-8, `${dex}: ${liquid}`);
      assert.equal(player.lavaTick, 0);
      app.move(0, 0);
      const x = player.x;
      app.tick();
      assert.equal(player.x, x, `${dex}: ${liquid} must not cause sliding`);
    }
  }
});

test('terrain movement immunity follows the sprite hover flag rather than the Flying type', () => {
  for (const [dex, hovering] of [[12, true], [81, true], [6, false], [722, false]]) {
    const app = boot(dex, 'water');
    assert.equal(app.G.Sprites.hovers(dex), hovering);
    app.tick();
    assert.equal(app.player.inLiquid, true);
    assert.equal(app.player.spd, app.player.baseSpd * (hovering ? 1 : 0.6));
  }
});

test('flying players still take terrain damage unless their type is immune', () => {
  for (const dex of [12, 151]) {
    for (const liquid of ['lava', 'poison', 'spark']) {
      const app = boot(dex, liquid), { player } = app;
      app.tick();
      assert.ok(player.hp < player.maxHp, `${dex}: ${liquid}`);
      assert.ok(player.lavaTick > 0);
      const hp = player.hp;
      app.tick();
      assert.equal(player.hp, hp);
      app.tick(60);
      assert.ok(player.hp < hp);
    }
  }
  for (const liquid of ['poison', 'spark']) {
    const app = boot(81, liquid);
    assert.equal(app.G.Sprites.hovers(81), true);
    app.tick(60);
    assert.equal(app.player.hp, app.player.maxHp);
  }
});

test('grounded players keep water and swamp slowdown, ice sliding, and terrain damage', () => {
  for (const [liquid, factor] of [['water', 0.6], ['swamp', 0.45]]) {
    const app = boot(19, liquid);
    app.tick();
    assert.equal(app.player.spd, app.player.baseSpd * factor);
    assert.ok(app.effects.length > 0);
    app.terrain(false);
    app.tick();
    assert.equal(app.player.inLiquid, false);
    assert.equal(app.player.spd, app.player.baseSpd);
  }
  const ice = boot(19, 'ice');
  ice.tick(10);
  ice.move(0, 0);
  const x = ice.player.x;
  ice.tick();
  assert.ok(ice.player.x > x);
  for (const liquid of ['lava', 'poison', 'spark']) {
    const app = boot(19, liquid);
    app.tick();
    assert.ok(app.player.hp < app.player.maxHp, liquid);
    assert.ok(app.player.lavaTick > 0, liquid);
  }
});

test('grounded type immunities remain effective', () => {
  for (const [dex, liquid] of [[7, 'water'], [7, 'swamp'], [4, 'lava'], [1, 'poison'], [25, 'spark'], [220, 'ice']]) {
    const app = boot(dex, liquid), { player } = app;
    assert.equal(app.G.Sprites.hovers(dex), false);
    app.tick(30);
    assert.equal(player.spd, player.baseSpd);
    assert.equal(player.hp, player.maxHp);
    app.move(0, 0);
    const x = player.x;
    app.tick();
    assert.equal(player.x, x);
  }
});

test('flying players still check obstacles and take combat damage', () => {
  const app = boot(12, 'water');
  app.tick(10);
  assert.equal(app.collisions, 10);
  const hp = app.player.hp;
  app.player.hurt(12);
  assert.equal(app.player.hp, hp - 12);
});
