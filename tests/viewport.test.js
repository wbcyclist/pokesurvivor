const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function boot() {
  const events = new Map(), observers = [], frames = [];
  let writes = 0, width = 300, height = 150;
  const canvas = {
    clientWidth: 440, clientHeight: 894,
    getContext: () => ({}),
    get width() { return width; },
    set width(value) { width = value; writes++; },
    get height() { return height; },
    set height(value) { height = value; writes++; }
  };
  const context = vm.createContext({
    G: {
      Touch: { active: true, init() {}, reset() {}, clearButtons() {} },
      RunUI: { wirePause() {} },
      World: { reset() {}, setBiome() {}, isFree: () => true },
      Sprites: { Animator: class {}, bodyRadius: () => 8 },
      U: { rand: () => 0 }
    },
    document: { getElementById: id => id === 'game' ? canvas : null, addEventListener() {} },
    window: { devicePixelRatio: 3 },
    innerWidth: 440, innerHeight: 894,
    performance: { now: () => 0 },
    setTimeout: () => 1, clearTimeout() {},
    requestAnimationFrame(callback) { frames.push(callback); },
    addEventListener(name, fn) { events.set(name, fn); },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; }
      observe(target) { observers.push({ target, callback: this.callback }); }
    }
  });
  for (const file of ['js/core/camera.js', 'js/game.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  }
  context.G.Game.init();
  frames.length = 0;
  return {
    context, canvas, events,
    layout() { observers.filter(o => o.target === canvas).forEach(o => o.callback([])); },
    frame() { frames.splice(0).forEach(callback => callback()); },
    get writes() { return writes; }
  };
}

test('updates the canvas and camera when mobile layout settles after the window resize event', () => {
  const app = boot(), { context, canvas, events } = app;
  context.innerWidth = 956; context.innerHeight = 440;
  canvas.clientWidth = 956;
  events.get('resize')();
  assert.deepEqual([canvas.width, canvas.height], [1434, 1341]);

  // Safari can finish layout after its last window resize event.
  canvas.clientHeight = 440;
  app.layout();
  assert.deepEqual([canvas.width, canvas.height], [1434, 660]);
  assert.equal(canvas.width / canvas.height, canvas.clientWidth / canvas.clientHeight);
  assert.equal(context.G.Camera.scale, 440 / 420);
  assert.equal(context.G.Camera.h, 420);
});

test('rechecks layout on the next frame when a transient size returns to the last observed size', () => {
  const app = boot();
  app.layout();
  app.canvas.clientHeight = 440;
  app.events.get('resize')();
  assert.equal(app.canvas.height, 660);
  app.canvas.clientHeight = 894;
  // The observer need not report a size equal to its previous delivery.
  app.frame();
  assert.equal(app.canvas.height, 1341);
});

test('does not clear the canvas for duplicate size notifications, but updates a changed pixel ratio', () => {
  const app = boot(), writes = app.writes;
  app.layout();
  app.events.get('resize')();
  assert.equal(app.writes, writes);
  app.context.window.devicePixelRatio = 1;
  app.events.get('resize')();
  assert.deepEqual([app.canvas.width, app.canvas.height], [440, 894]);
  assert.equal(app.context.G.Camera.dpr, 1);
});

test('keeps valid canvas and camera dimensions through a temporary zero-size layout', () => {
  const app = boot();
  app.canvas.clientWidth = 0; app.canvas.clientHeight = 0;
  app.events.get('resize')();
  assert.deepEqual([app.canvas.width, app.canvas.height], [660, 1341]);
  assert.ok(Number.isFinite(app.context.G.Camera.w));
  app.canvas.clientWidth = 956; app.canvas.clientHeight = 440;
  app.layout();
  assert.deepEqual([app.canvas.width, app.canvas.height], [1434, 660]);
});

test('keeps the same minimum world area when rotating between portrait and landscape', () => {
  const { context, canvas, events } = boot(), camera = context.G.Camera;
  camera.x = 120; camera.y = -80;
  for (const [width, height] of [[390, 844], [320, 568], [844, 390], [768, 1024]]) {
    canvas.clientWidth = width; canvas.clientHeight = height; events.get('resize')();
    const portrait = height > width;
    assert.ok(camera.w >= (portrait ? 420 : 768) - 1e-6);
    assert.ok(camera.h >= (portrait ? 768 : 420) - 1e-6);
    assert.equal(camera.scale, Math.min(width / (portrait ? 420 : 768), height / (portrait ? 768 : 420)));
    assert.deepEqual([camera.x, camera.y], [120, -80]);
  }
});

test('orb zoom preserves viewport proportions through rotation and returns to normal', () => {
  const { context, canvas, events } = boot(), camera = context.G.Camera;
  for (const [w, h] of [[390, 844], [844, 390]]) {
    canvas.clientWidth = w; canvas.clientHeight = h; events.get('resize')();
    const base = camera.scale;
    camera.zoom = 1.35; camera.fit();
    assert.equal(camera.scale, base / 1.35);
    assert.ok(Math.abs(camera.w / camera.h - w / h) < 1e-9);
    camera.zoom = 1; camera.fit();
    assert.equal(camera.scale, base);
  }
});

test('uses the full canvas size when an installed app reports a shorter window height', () => {
  const app = boot();
  app.canvas.clientHeight = 956;
  app.layout();
  assert.equal(app.context.innerHeight, 894);
  assert.deepEqual([app.canvas.width, app.canvas.height], [660, 1434]);
  assert.equal(app.context.G.Camera.h * app.context.G.Camera.scale, 956);
});
