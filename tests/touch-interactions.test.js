const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function element(editable = false, field = false) {
  return { nodeType: 1, isContentEditable: editable, closest: () => field ? {} : null };
}

function boot() {
  const handlers = new Map(), canvasHandlers = new Map();
  const listen = map => (name, fn, options = {}) => {
    if (!map.has(name)) map.set(name, []);
    map.get(name).push({ fn, options });
  };
  const canvas = { ...element(), addEventListener: listen(canvasHandlers), setPointerCapture() {} };
  const context = vm.createContext({
    G: { Settings: { touch: true, get: () => null }, Game: { state: 'playing' } },
    document: { addEventListener: listen(handlers), body: { classList: { add() {} } } },
    addEventListener() {}, performance: { now: () => 1000 }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/core/touch.js'), 'utf8'), context);
  context.G.Touch.init(canvas);
  return {
    touch: context.G.Touch, canvas, handlers,
    emit(type, props = {}, target = element()) {
      const event = { target, cancelable: true, defaultPrevented: false,
        preventDefault() { if (this.cancelable) this.defaultPrevented = true; }, ...props };
      for (const { fn } of handlers.get(type) || []) fn(event);
      if (target === canvas) for (const { fn } of canvasHandlers.get(type) || []) fn(event);
      return event;
    }
  };
}

test('blocks selection, context menus, dragging, and double clicks outside editable fields', () => {
  const app = boot();
  for (const name of ['selectstart', 'contextmenu', 'dragstart', 'dblclick']) {
    assert.equal(app.emit(name).defaultPrevented, true, name);
    assert.equal(app.emit(name, {}, { nodeType: 3, parentElement: element() }).defaultPrevented, true, name);
    assert.equal(app.emit(name, {}, element(false, true)).defaultPrevented, false, name);
    assert.equal(app.emit(name, {}, element(true)).defaultPrevented, false, name);
    assert.equal(app.emit(name, {}, { nodeType: 3, parentElement: element(true) }).defaultPrevented, false, name);
  }
});

test('blocks pinch gestures without blocking single-finger menu scrolling', () => {
  const app = boot();
  for (const name of ['touchstart', 'touchmove']) {
    assert.equal(app.emit(name, { touches: [{}] }).defaultPrevented, false, name);
    assert.equal(app.emit(name, { touches: [{}, {}] }).defaultPrevented, true, name);
    assert.equal(app.emit(name, { touches: [{}, {}] }, element(false, true)).defaultPrevented, true, name);
    assert.equal(app.handlers.get(name)[0].options.passive, false);
  }
  for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
    assert.equal(app.emit(name).defaultPrevented, true, name);
    assert.equal(app.handlers.get(name)[0].options.passive, false);
  }
});

test('blocks trackpad pinch and Ctrl-wheel zoom but preserves normal wheel scrolling', () => {
  const app = boot();
  assert.equal(app.emit('wheel', { ctrlKey: true }).defaultPrevented, true);
  assert.equal(app.emit('wheel', { ctrlKey: false }).defaultPrevented, false);
  assert.equal(app.emit('wheel', { ctrlKey: true, cancelable: false }).defaultPrevented, false);
  assert.equal(app.handlers.get('wheel')[0].options.passive, false);
});

test('keeps the joystick and second-finger attack working while browser gestures are blocked', () => {
  const app = boot(), { canvas, touch } = app;
  let attacks = 0;
  touch.addButton(200, 300, 50, 50, () => attacks++);
  app.emit('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 40, clientY: 200 }, canvas);
  app.emit('pointermove', { pointerId: 1, clientX: 65, clientY: 200 }, canvas);
  assert.ok(touch.vector()[0] > 0);
  const event = app.emit('touchstart', {
    touches: [{}, {}], changedTouches: [{ clientX: 220, clientY: 320 }]
  }, canvas);
  assert.equal(event.defaultPrevented, true);
  app.emit('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 220, clientY: 320 }, canvas);
  assert.equal(attacks, 1);
  assert.ok(touch.vector()[0] > 0);
  app.emit('pointercancel', { pointerId: 1 }, canvas);
  assert.equal(touch.vector(), null);
});
