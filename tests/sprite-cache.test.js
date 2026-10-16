const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function boot() {
  const images = [], canvases = [], G = { SPRITE_META: {} };
  const context = vm.createContext({ G, performance: { now: () => 0 }, Date: { now: () => 0 },
    Image: class { constructor() { images.push(this); } },
    document: { createElement() { const c = { width: 0, height: 0, getContext: () => ({ drawImage() {}, fillRect() {} }) }; canvases.push(c); return c; } }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/core/sprites.js'), 'utf8'), context);
  return { G, images, canvases, sheet(id, size = 32) {
    G.SPRITE_META[id] = { a: { Idle: { w: size, h: size, n: 1, r: 1 } } };
    return G.Sprites.sheet(id, 'Idle');
  } };
}

test('rapid sprite requests stay below the sheet limit and retain recently used images', () => {
  const app = boot(), first = app.sheet(1), second = app.sheet(2);
  for (let i = 3; i <= 200; i++) app.sheet(i);
  assert.equal(app.G.Sprites.sheet(1, 'Idle'), first);
  app.sheet(201);
  assert.equal(app.G.Sprites.sheet(1, 'Idle'), first); assert.equal(second.img.src, '');
  for (let i = 202; i <= 300; i++) app.sheet(i);
  assert.ok(app.G.Sprites.sheetCount <= 200);
  assert.ok(app.images.filter(i => i.src).length <= 200);
});

test('decoded sprite size enforces a byte budget even below the count limit', () => {
  const app = boot();
  for (let i = 0; i < 80; i++) app.sheet(i, 1024);
  assert.ok(app.images.filter(i => i.src).length * 1024 * 1024 * 4 <= 96 * 1024 * 1024);
});

test('white flash images have a separate bounded cache and are released with their sheets', () => {
  const app = boot(), first = app.sheet(1);
  first.img.width = first.img.height = 32;
  const white = app.G.Sprites.white(first.img);
  assert.equal(app.G.Sprites.white(first.img), white);
  for (let i = 2; i <= 201; i++) app.sheet(i);
  assert.equal(white.width * white.height, 0);
  for (let i = 0; i < 40; i++) app.G.Sprites.white({ width: 1024, height: 1024 });
  assert.ok(app.canvases.reduce((sum, c) => sum + c.width * c.height * 4, 0) <= 32 * 1024 * 1024);
});

test('late image callbacks cannot revive an evicted sheet', () => {
  const app = boot(), first = app.sheet(1), load = first.img.onload;
  for (let i = 2; i <= 201; i++) app.sheet(i);
  load();
  assert.equal(first.ready, false); assert.equal(first.img.onload, null);
  assert.notEqual(app.G.Sprites.sheet(1, 'Idle'), first);
});

test('loaded dimensions are charged to the byte budget and oversized sheets are rejected', () => {
  const app = boot();
  for (let i = 0; i < 30; i++) {
    const sheet = app.sheet(i); sheet.img.naturalWidth = sheet.img.naturalHeight = 1024; sheet.img.onload();
  }
  assert.ok(app.G.Sprites.cacheBytes <= 96 * 1024 * 1024);
  assert.equal(app.sheet(40, 8192), null);
  const sheet = app.sheet(41); sheet.img.naturalWidth = sheet.img.naturalHeight = 8192; sheet.img.onload();
  assert.equal(sheet.ready, false); assert.equal(sheet.img.src, '');
});
