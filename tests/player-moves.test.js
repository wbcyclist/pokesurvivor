const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function boot() {
  const effects = [];
  const G = {
    LIFT: 8,
    U: { TYPE_COLOR: {} },
    Sprites: { Animator: class {}, hovers: () => false, bodyRadius: () => 8, bodyHeight: () => 16 },
    Projectiles: { clearOrbs: () => effects.push('clearOrbs') },
    Audio: { sfx: sound => effects.push(sound) },
    FX: { ring: () => effects.push('ring'), dmgText: () => effects.push('dmgText') }
  };
  const context = vm.createContext({ G });
  for (const file of ['js/data/moves.js', 'js/entities/player.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  }
  return { player: new G.Player({ dex: 1, hp: 100, spd: 100, atk: 10 }), effects };
}

test('the first learned move is active without a switch effect', () => {
  const { player, effects } = boot();
  assert.equal(player.addMove('tackle'), true);
  assert.equal(player.activeMove().id, 'tackle');
  assert.equal(player.activeGroup(), player.slots[0]);
  assert.deepEqual(effects, []);
});

test('learning a move preserves the selected move and its cooldown without clearing orbs', () => {
  const { player, effects } = boot();
  player.addMove('tackle');
  player.addMove('ember');
  player.setActive(1);
  const selected = player.activeGroup();
  selected[0].t = 1.25;
  effects.length = 0;

  assert.equal(player.addMove('water-gun'), true);
  assert.equal(player.hasMove('water-gun'), true);
  assert.equal(player.activeGroup(), selected);
  assert.equal(player.activeMove().t, 1.25);
  assert.deepEqual(effects, []);

  player.setActive(2);
  assert.equal(player.activeMove().id, 'water-gun');
  assert.deepEqual(effects, ['clearOrbs', 'select', 'ring']);
  player.cycle(-1);
  assert.equal(player.activeGroup(), selected);
});

test('learning a bound move preserves the active group when its slot changes', () => {
  const { player, effects } = boot();
  player.bind = { tackle: 3, ember: 0 };
  player.addMove('tackle');
  const selected = player.activeGroup();
  assert.equal(player.addMove('ember'), true);
  assert.equal(player.active, 1);
  assert.equal(player.activeGroup(), selected);
  assert.equal(player.addMove('water-gun'), true);
  assert.equal(player.active, 2);
  assert.equal(player.activeGroup(), selected);
  assert.deepEqual(effects, []);
});

test('learning a move preserves a fused group through slot rearrangement', () => {
  const { player, effects } = boot();
  player.addMove('tackle');
  player.addMove('ember');
  player.bonds = 1;
  const selected = player.fuse(player.moves.slice());
  player.bind = { 'water-gun': 0 };
  effects.length = 0;

  assert.equal(player.addMove('water-gun'), true);
  assert.equal(player.active, 1);
  assert.equal(player.activeGroup(), selected);
  assert.equal(player.activeGroup().length, 2);
  assert.deepEqual(effects, []);
});

test('learning with Choice Band preserves its locked move without a switch warning', () => {
  const { player, effects } = boot();
  player.addMove('tackle');
  player.item = 'choiceband';
  player.bind = { ember: 0 };
  assert.equal(player.addMove('ember'), true);
  assert.equal(player.activeMove().id, 'tackle');
  assert.deepEqual(effects, []);
  player.setActive(0);
  assert.equal(player.activeMove().id, 'tackle');
  assert.deepEqual(effects, ['dmgText']);
});

test('duplicate moves and full slots leave the learned moves and selection unchanged', () => {
  const { player, effects } = boot();
  for (const id of ['tackle', 'ember', 'water-gun', 'vine-whip']) player.addMove(id);
  player.setActive(1);
  const selected = player.activeGroup();
  const moves = Array.from(player.moves);
  effects.length = 0;
  assert.equal(player.addMove('ember'), false);
  assert.equal(player.addMove('thunder-shock'), false);
  assert.deepEqual(Array.from(player.moves), moves);
  assert.equal(player.activeGroup(), selected);
  assert.deepEqual(effects, []);
});
