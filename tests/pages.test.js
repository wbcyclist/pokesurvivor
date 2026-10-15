const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const site = 'https://pokesurvivor.com/';
const suffixes = ['', 'guide/', 'pokedex/', 'legendaries/', 'shinies/', 'types/', 'moves/', 'items/', 'achievements/', 'news/', 'support/'];
const routes = {
  es: ['', 'guia/', 'pokedex/', 'legendarios/', 'shinies/', 'tipos/', 'movimientos/', 'objetos/', 'logros/', 'novedades/', 'apoyar/'],
  en: suffixes.map(s => 'en/' + s),
  'zh-CN': suffixes.map(s => 'zh/' + s)
};
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map(m => attrs(m[0]));

// Check the generated output, including references that a source-only test misses.
test('all language pages publish reciprocal alternates and matching canonical URLs', () => {
  for (const [lang, paths] of Object.entries(routes)) {
    paths.forEach((route, i) => {
      const html = read(route + 'index.html');
      assert.match(html, new RegExp(`<html lang="${lang}">`), route);
      const links = tags(html, 'link');
      assert.equal(links.find(l => l.rel === 'canonical').href, site + route, route);
      const alts = links.filter(l => l.rel === 'alternate');
      assert.equal(alts.length, 4, route);
      for (const [other, otherPaths] of Object.entries(routes)) {
        assert.equal(alts.find(l => l.hreflang === other).href, site + otherPaths[i], route);
      }
      assert.equal(alts.find(l => l.hreflang === 'x-default').href, site + routes.es[i]);
      if (i) {
        assert.ok(tags(html, 'a').some(a => a['data-game-lang'] === lang && new URL(a.href, site + route).href === site + paths[0]), route);
        const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
        const breadcrumb = ld['@graph'].find(n => n['@type'] === 'BreadcrumbList');
        assert.equal(breadcrumb.itemListElement[1].item, site + route);
      }
    });
  }
});

test('Chinese page links, stylesheets, scripts, and sprite paths resolve locally', () => {
  for (const route of routes['zh-CN']) {
    const html = read(route + 'index.html');
    const base = new URL(tags(html, 'base')[0]?.href || '', site + route);
    for (const tag of ['a', 'link', 'script', 'img']) {
      for (const element of tags(html, tag)) {
        const raw = element.href || element.src;
        if (!raw || raw.startsWith('#')) continue;
        const url = new URL(raw, base);
        if (url.origin !== new URL(site).origin) continue;
        const local = decodeURIComponent(url.pathname).slice(1);
        const target = path.join(root, local.endsWith('/') || !local ? local + 'index.html' : local);
        assert.ok(fs.existsSync(target), `${route}: ${raw}`);
      }
    }
  }
});

test('Chinese reference pages include every playable Pokemon with its official name', () => {
  const names = {};
  const G = { I18n: { add(dict) { Object.assign(names, dict); } } };
  vm.runInNewContext(read('js/data/pokedex.js'), { G });
  vm.runInNewContext(read('js/data/names-zh-CN.js'), { G });
  const html = read('zh/pokedex/index.html');
  assert.equal(tags(html, 'li').length, G.DEX.length);
  for (const pokemon of G.DEX) {
    assert.ok(html.includes(`<span class="nm">${names[pokemon.name]}</span>`), pokemon.name);
  }
  assert.match(read('zh/moves/index.html'), /大字爆炎/);
  assert.match(read('zh/moves/index.html'), /十万伏特/);
  assert.match(read('zh/items/index.html'), /气势披带/);
  assert.match(read('zh/items/index.html'), /吃剩的东西/);
  assert.match(read('zh/types/index.html'), /×1\.6/);
  assert.doesNotMatch(read('zh/types/index.html'), /×1,6/);
});

test('Chinese guides render without JavaScript and FAQ metadata matches visible answers', () => {
  for (const route of routes['zh-CN'].slice(1)) {
    const html = read(route + 'index.html');
    assert.match(html.match(/<main>([\s\S]*?)<\/main>/)[1], /[\u3400-\u9fff]/, route);
    assert.equal(tags(html, 'script').filter(s => s.src).length, 0, route);
    assert.equal(tags(html, 'meta').find(m => m.property === 'og:locale').content, 'zh_CN');
  }
  const guide = read('zh/guide/index.html');
  const ld = JSON.parse(guide.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const faq = ld['@graph'].find(n => n['@type'] === 'FAQPage');
  assert.equal(faq.inLanguage, 'zh-CN');
  assert.equal(faq.mainEntity.length, 10);
  for (const question of faq.mainEntity) {
    assert.ok(guide.includes(`<h3>${question.name}</h3><p>${question.acceptedAnswer.text}</p>`));
  }
  assert.match(read('zh/index.html').match(/<noscript>([\s\S]*?)<\/noscript>/)[1], /游戏指南/);
});

test('sitemap includes every language route and its alternates', () => {
  const xml = read('sitemap.xml');
  const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m => m[1]);
  assert.equal(entries.length, 33);
  for (const paths of Object.values(routes)) {
    paths.forEach((route, i) => {
      const entry = entries.find(e => e.includes(`<loc>${site + route}</loc>`));
      assert.ok(entry, route);
      for (const [lang, altPaths] of Object.entries(routes)) {
        assert.ok(entry.includes(`hreflang="${lang}" href="${site + altPaths[i]}"`), route);
      }
    });
  }
});
