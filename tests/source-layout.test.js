const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { SOURCES } = require('../tools/build_langs.js');

test('locale sources have distinct paths on case-insensitive filesystems', () => {
  assert.equal(new Set(SOURCES.map(file => file.toLowerCase())).size, SOURCES.length);
});

test('the development entry loads each game module once', () => {
  const html = fs.readFileSync(path.join(__dirname, '../dev.html'), 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(scripts).size, scripts.length);
  assert.equal(scripts.filter(file => file === 'js/core/gamepad.js').length, 1);
  assert.ok(scripts.includes('js/net/lan.js'));
  assert.ok(scripts.includes('js/net/codec.js'));
});
