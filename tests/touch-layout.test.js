const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function boot(safe = { top: 0, right: 0, bottom: 0, left: 0 }) {
  const settings = { stick: 1, pad: { bar: [0.7, 0.85] }, padPortrait: null };
  const context = vm.createContext({
    G: { Settings: { touch: true, get: k => settings[k] } }, innerWidth: 390, innerHeight: 844,
    addEventListener() {}, document: { createElement: () => ({ style: {}, remove() {} }), body: { appendChild() {} } },
    getComputedStyle: () => Object.fromEntries(Object.entries(safe).map(([k, v]) => ['padding' + k[0].toUpperCase() + k.slice(1), v + 'px']))
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/core/touch.js'), 'utf8'), context);
  return { touch: context.G.Touch, settings };
}

test('keeps four moves, their badges, the item, and pause inside phone safe areas', () => {
  for (const [w, h, safe] of [[320, 568, { top: 0, bottom: 0, left: 0, right: 0 }],
    [390, 844, { top: 47, bottom: 34, left: 0, right: 0 }], [440, 956, { top: 62, bottom: 34, left: 0, right: 0 }], [844, 390, { top: 0, bottom: 21, left: 47, right: 47 }]]) {
    const { touch, settings } = boot(safe);
    for (const position of [null, [0, 0], [1, 1]]) {
      settings[touch.padKey(w, h)] = position ? { bar: position, pause: position } : null;
      const c = touch.layout(w, h);
      assert.ok(c.size >= 48);
      assert.ok(c.bar.x >= safe.left);
      assert.ok(c.bar.x + c.bar.width <= w - safe.right);
      assert.ok(c.bar.y >= safe.top);
      assert.ok(c.bar.y + c.size + c.keyGap + c.keyHeight + 3 <= h - safe.bottom);
      assert.ok(c.pause.x >= safe.left && c.pause.x + 40 <= w - safe.right);
      assert.ok(c.pause.y >= safe.top && c.pause.y + 40 <= h - safe.bottom);
    }
  }
});

test('uses separate portrait positions and preserves existing landscape positions', () => {
  const { touch, settings } = boot();
  assert.equal(touch.spot('bar', 390, 844), null);
  assert.deepEqual(touch.spot('bar', 844, 390), [0.7, 0.85]);
  settings.padPortrait = { bar: [0.5, 0.8] };
  assert.deepEqual(touch.spot('bar', 390, 844), [0.5, 0.8]);
  assert.deepEqual(touch.spot('bar', 844, 390), [0.7, 0.85]);
  const fixed = touch.stickBase(320, 568), bar = touch.layout(320, 568).bar;
  assert.ok(fixed.y + touch.R() < bar.y);
});
