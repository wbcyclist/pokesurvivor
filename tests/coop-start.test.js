const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function boot() {
  const noop = () => {}, requested = [];
  const G = {
    DB: { save: { partner: 4, partnerShiny: false }, ownsShiny: dex => dex === 1,
      upgradesOf: dex => { requested.push(dex); return { dex }; } },
    DEX_BY: { 1: { dex: 1 }, 4: { dex: 4 } }, Net: { uid: 'me' },
    Upgrades: { perks: value => value }, UI: { hideAll: noop, chrome: noop },
    FX: { clear: noop }, Projectiles: { clear: noop }, Combat: { clearFields: noop },
    EnemyMgr: { clear: noop }, Pickups: { clear: noop }, Spawner: { reset: noop },
    Orbs: { reset: noop }, Rift: { reset: noop }, Judgment: { reset: noop }, Events: { reset: noop },
    Weather: { reset: noop }, Path: { clear: noop }, Hazards: { clear: noop },
    World: { reset: noop, setBiome: noop }, U: { pick: noop },
    Player: class { constructor(mon, perks, shiny) { Object.assign(this, { mon, perks, shiny, x: 0, y: 0 }); } addMove() {} setAbility(id) { this.abilId = id; } },
    startMoveOf: noop, Coop: { begin: noop, isHost: false }, Social: { setPlaying: noop },
    Camera: {}, Sprites: { preload: noop }, Audio: { music: noop }, BIOME_MUSIC: ['forest'],
    Ranking: { runStarted: noop }
  };
  const context = vm.createContext({ G, performance: { now: () => 0 }, coopApi: {} });
  for (const file of ['data/natures', 'data/abilities', 'systems/mons']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, `../js/${file}.js`), 'utf8'), context);
  }
  const source = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('  function startRun('), source.indexOf('  function quitRun(')), context);
  return { context, G, requested };
}

test('co-op starts from the shared roster even if local selection changes while start is in flight', () => {
  const { context, G, requested } = boot();
  G.DB.save.pnat = { 1: ['modest', 1], 4: ['hardy', 1] };
  G.DB.save.pabil = { 1: [2, 1] };
  context.startRun({ seed: 123, host: 'host', members: [{ uid: 'host', dex: 4, shiny: false }, { uid: 'me', dex: 1, shiny: true }] });
  assert.equal(context.pl.mon.dex, 1); assert.equal(context.pl.shiny, true);
  assert.deepEqual(requested, [1]);
  assert.equal(context.pl.mon.nature, 'modest');
  assert.equal(context.pl.abilId, G.DEX_ABIL[1][2]);
  assert.equal(G.DB.save.partner, 4);
});

test('solo runs still use the current local partner and its upgrades', () => {
  const { context, requested } = boot();
  context.startRun();
  assert.equal(context.pl.mon.dex, 4); assert.equal(context.pl.shiny, false);
  assert.deepEqual(requested, [4]);
});
