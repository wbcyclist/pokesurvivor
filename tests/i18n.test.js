const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function boot({ saved = null, language = 'zh-CN', pathname = '/', blocked = false } = {}) {
  const calls = [];
  class Canvas {
    fillText(text) { calls.push(['fill', text]); }
    strokeText(text) { calls.push(['stroke', text]); }
    measureText(text) { calls.push(['measure', text]); return { width: text.length }; }
  }
  const storage = new Map(saved ? [['ps.lang', saved]] : []);
  const context = vm.createContext({
    G: {}, navigator: { language, languages: [language] },
    location: { pathname, reload() { calls.push(['reload']); } },
    document: { documentElement: {} },
    localStorage: {
      getItem(key) { if (blocked) throw new Error('Storage blocked'); return storage.get(key); },
      setItem(key, value) { if (blocked) throw new Error('Storage blocked'); storage.set(key, value); }
    },
    CanvasRenderingContext2D: Canvas,
    window: { confirm(text) { calls.push(['confirm', text]); return true; }, alert(text) { calls.push(['alert', text]); } }
  });
  for (const file of ['js/core/i18n.js', 'js/data/lang-en.js', 'js/data/lang-zh-CN.js', 'js/data/names-zh-CN.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return { ...context, calls, storage, Canvas };
}

test('detects Chinese and honors an explicit saved language before the path or browser', () => {
  for (const language of ['zh', 'zh-CN', 'zh-SG', 'zh-Hans', 'zh-TW']) {
    assert.equal(boot({ language }).G.I18n.lang, 'zh-CN');
  }
  assert.equal(boot({ saved: 'es' }).G.I18n.lang, 'es');
  assert.equal(boot({ saved: 'en' }).G.I18n.lang, 'en');
  assert.equal(boot({ saved: 'zh-CN', pathname: '/en/' }).G.I18n.lang, 'zh-CN');
  assert.equal(boot({ pathname: '/en/' }).G.I18n.lang, 'en');
  assert.equal(boot({ pathname: '/zh/', language: 'en' }).G.I18n.lang, 'zh-CN');
  assert.equal(boot({ pathname: '/zh/index.html', language: 'es' }).G.I18n.lang, 'zh-CN');
  assert.equal(boot({ pathname: '/zh/', saved: 'es' }).G.I18n.lang, 'es');
  assert.equal(boot({ saved: 'invalid' }).G.I18n.lang, 'zh-CN');
  assert.equal(boot({ language: 'es-MX' }).G.I18n.lang, 'es');
  assert.equal(boot({ language: 'fr-FR' }).G.I18n.lang, 'en');
  assert.equal(boot({ blocked: true }).document.documentElement.lang, 'zh-CN');
});

test('loads only the active dictionary and preserves Spanish and English', () => {
  assert.equal(boot().G.T('Volver'), '返回');
  assert.equal(boot({ language: 'en' }).G.T('Volver'), 'Back');
  assert.equal(boot({ language: 'es' }).G.T('Volver'), 'Volver');
  const { G, storage, calls } = boot();
  G.I18n.set('en');
  assert.equal(storage.get('ps.lang'), 'en');
  assert.deepEqual(calls, [['reload']]);
  G.I18n.set('invalid');
  assert.equal(storage.get('ps.lang'), 'en');
  assert.equal(calls.length, 1);
});

test('translates templates, names, whitespace, uppercase text, canvas metrics, and dialogs', () => {
  const { G, Canvas, window, calls } = boot();
  assert.equal(G.T('  Volver\n'), '  返回\n');
  assert.equal(G.T('VOLVER'), '返回');
  assert.equal(G.T('¡Has conseguido a Pikachu shiny!'), '你获得了异色皮卡丘！');
  assert.equal(G.I18n.f('Pregunta {x} de {x}', 2, 8), '第 2 题，共 8 题');
  const ctx = new Canvas();
  ctx.fillText('Pausa'); ctx.strokeText('Pausa'); ctx.measureText('Pausa');
  window.confirm('Volver'); window.alert('Volver');
  assert.deepEqual(calls, [['fill', '暂停'], ['stroke', '暂停'], ['measure', '暂停'], ['confirm', '返回'], ['alert', '返回']]);
});

test('Chinese covers every English dictionary key and preserves template arguments', () => {
  const dictionaries = {};
  const context = { G: { I18n: { add(dict, locale = 'en') { dictionaries[locale] = { ...dictionaries[locale], ...dict }; } } } };
  for (const file of ['js/data/lang-en.js', 'js/data/lang-zh-CN.js']) vm.runInNewContext(read(file), context);
  for (const key of Object.keys(dictionaries.en)) {
    const value = dictionaries['zh-CN'][key];
    assert.ok(value, `Missing translation: ${key}`);
    assert.equal((value.match(/\{x\}/g) || []).length, (key.match(/\{x\}/g) || []).length, key);
  }
});

test('every playable Pokemon has a Chinese name without changing game data', () => {
  const { G } = boot();
  vm.runInNewContext(read('js/data/pokedex.js'), { G });
  for (const pokemon of G.DEX) assert.match(G.T(pokemon.name), /\p{Script=Han}/u, pokemon.name);
  assert.equal(G.DEX_BY[25].name, 'Pikachu');
});

test('uses official Simplified Chinese names for Pokemon game terms', () => {
  const { G } = boot();
  const terms = JSON.parse(read('tests/fixtures/official-zh-CN.json'));
  for (const [source, expected] of Object.entries(terms)) assert.equal(G.T(source), expected, source);
  assert.equal(G.T('Pikachu'), '皮卡丘');
  assert.equal(G.T('Bulbasaur'), '妙蛙种子');
  assert.equal(G.T('Arceus'), '阿尔宙斯');
  assert.equal(G.T('Gholdengo'), '赛富豪');
});

test('translates every changelog entry and personality trait', () => {
  const { G } = boot();
  for (const file of ['js/data/changelog.js', 'js/data/starters.js']) vm.runInNewContext(read(file), { G });
  for (const day of G.CHANGELOG) {
    for (const pair of [day.title, ...day.new || [], ...day.chg || [], ...day.fix || []]) {
      assert.match(G.T(pair[0]), /\p{Script=Han}/u, pair[0]);
    }
  }
  for (const trait of Object.keys(G.TRAIT_TEXT)) assert.match(G.T(trait), /\p{Script=Han}/u, trait);
});

test('uses the most specific template for HUD distances and timers', () => {
  const { G } = boot();
  assert.equal(G.T('Grieta · 15 m · 30 s'), '裂隙 · 15 米 · 30 秒');
  assert.equal(G.T('GRIETA · 30 s'), '裂隙 · 30 秒');
});

test('guide links follow the active language', () => {
  for (const [saved, prefix] of [['es', ''], ['en', 'en/'], ['zh-CN', 'zh/']]) {
    const { G } = boot({ saved });
    assert.equal(G.I18n.pageLink('guide'), prefix ? prefix + 'guide/' : 'guia/');
    assert.equal(G.I18n.pageLink('pokedex'), prefix + 'pokedex/');
    assert.equal(G.I18n.pageLink('support'), prefix ? prefix + 'support/' : 'apoyar/');
    assert.equal(G.I18n.pageLink('contact'), 'contacto/?lang=' + saved);
  }
});
