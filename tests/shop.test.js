const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function boot() {
  const save = { created: 123, partner: 813, coins: 20000, bag: {}, tms: {}, ptm: {}, pnat: {}, pabil: {}, pupg: {} };
  const G = { U: { TYPE_COLOR: {} }, DB: { save, commit() {} }, I18n: { lang: 'zh-CN' } };
  const context = vm.createContext({ G });
  for (const file of ['pokedex', 'natures', 'abilities', 'moves', 'tms', 'shop', 'starters']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, `../js/data/${file}.js`), 'utf8'), context);
  }
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/systems/mons.js'), 'utf8'), context);
  return { G, save };
}

test('nature and ability names use the local Simplified and Traditional Chinese locale codes', () => {
  const { G } = boot();
  for (const [lang, nature, ability] of [['zh-CN', '内敛', '自由者'], ['zh-TW', '內斂', '自由者']]) {
    G.I18n.lang = lang;
    assert.equal(G.Mons.name(G.NATURE_BY.modest.n), nature);
    assert.equal(G.Mons.abilityName('libero'), ability);
  }
  G.Mons.setNature(813, 'modest');
  const mon = G.Mons.monFor(813), base = G.DEX_BY[813];
  assert.equal(mon.pa, base.pa * 0.9); assert.equal(mon.sa, base.sa * 1.1);
  assert.notEqual(mon, base); assert.equal(base.nature, undefined);
  G.Mons.setAbility(813, 2); assert.equal(G.Mons.abilityOf(813).id, 'libero');
});

test('daily TMs can be purchased, learned once, and selected as the second starting move', () => {
  const { G, save } = boot();
  const daily = G.Shop.dailyTms();
  assert.equal(daily.length, 8); assert.equal(new Set(daily).size, 8);
  assert.deepEqual(G.Shop.dailyTms(), daily);
  const id = daily.find(id => G.Mons.canLearn(813, id));
  assert.ok(id); assert.equal(G.startChoices(813).includes(id), false);
  const before = save.coins;
  assert.equal(G.Shop.buy('tm:' + id).ok, true);
  assert.equal(save.coins, before - G.Shop.tmPrice(id));
  assert.equal(G.Mons.teach(813, id), true); assert.equal(G.Shop.tmCount(id), 0);
  assert.equal(G.Mons.teach(813, id), false);
  assert.equal(G.startChoices(813).includes(id), true);
  save.pstart2 = { 813: id }; save.pupg[813] = { start2: 1 };
  assert.equal(G.startMove2Of(813), null);
  save.pupg[813].moves = 1; assert.equal(G.startMove2Of(813), id);
  save.pupg[813].start = 1; save.pstart = { 813: id };
  assert.equal(G.startMove2Of(813), null);
});

test('unavailable TMs and insufficient coins cannot change the inventory', () => {
  const { G, save } = boot();
  assert.equal(G.Shop.buy('tm:missing').ok, false);
  assert.equal(G.Mons.teach(813, 'missing'), false);
  save.coins = 1499;
  assert.equal(G.Shop.buy('mint').ok, false);
  assert.equal(save.coins, 1499); assert.deepEqual(save.bag, {});
});
