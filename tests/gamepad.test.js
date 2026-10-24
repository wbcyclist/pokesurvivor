const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function boot() {
  const events = {}, documentEvents = {};
  let pads = [];
  const context = vm.createContext({
    G: { U: { norm: (x, y) => { const n = Math.hypot(x, y); return n ? [x / n, y / n] : [0, 0]; } } },
    performance: { now: () => 1234 },
    navigator: { getGamepads: () => pads },
    document: { hidden: false, addEventListener: (name, fn) => { documentEvents[name] = fn; } },
    addEventListener: (name, fn) => { (events[name] ||= []).push(fn); }
  });
  for (const file of ['js/core/gamepad.js', 'js/core/input.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  }
  return {
    context, pad: context.G.Gamepad, input: context.G.Input,
    connect(...values) { pads = values; context.G.Gamepad.poll(); },
    emit(name, event = {}) { for (const fn of events[name] || []) fn(event); },
    visibility(hidden) { context.document.hidden = hidden; documentEvents.visibilitychange(); }
  };
}

function device(index = 0) {
  return { index, id: 'Standard controller ' + index, connected: true, mapping: 'standard', axes: [0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
}

test('orb triggers have device labels and do not select move slots', () => {
  const app = boot(), controller = device(); app.connect(controller);
  for (const [layout, use, next] of [['xbox', 'LT', 'RT'], ['playstation', 'L2', 'R2'], ['nintendo', 'ZL', 'ZR']]) {
    app.context.G.Settings = { get: () => layout };
    assert.equal(app.pad.label('orbUse'), use);
    assert.equal(app.pad.label('orbNext'), next);
    for (const [button, action] of [[6, 'orbUse'], [7, 'orbNext']]) {
      controller.buttons[button].pressed = true; app.pad.poll();
      assert.equal(app.pad.tap(action), true);
      assert.equal([0, 1, 2, 3].some(i => app.pad.faceTap(i)), false);
      app.pad.poll(); assert.equal(app.pad.tap(action), false);
      controller.buttons[button].pressed = false; app.pad.poll();
    }
  }
});

test('applies a radial dead zone, preserves analog speed, and caps diagonal movement', () => {
  const app = boot(), pad = device();
  app.connect(pad);
  pad.axes = [0.1, -0.1]; app.pad.poll();
  assert.deepEqual(Array.from(app.input.axis()), [0, 0]);
  pad.axes = [0.6, 0]; app.pad.poll();
  assert.ok(Math.abs(app.input.axis()[0] - 0.5) < 1e-12);
  pad.axes = [1, -1]; app.pad.poll();
  assert.ok(Math.abs(Math.hypot(...app.input.axis()) - 1) < 1e-12);
});

test('uses the D-pad and keeps keyboard and touch input independent', () => {
  const app = boot(), pad = device(); app.connect(pad);
  pad.buttons[12].pressed = true; pad.buttons[15].pressed = true; app.pad.poll();
  assert.ok(app.input.axis()[0] > 0 && app.input.axis()[1] < 0);
  app.emit('keydown', { code: 'KeyA', preventDefault() {} });
  assert.deepEqual(Array.from(app.input.axis()), [-1, 0]);
  app.context.G.Touch = { vector: () => [0, 0.7] };
  assert.deepEqual(Array.from(app.input.axis()), [0, 0.7]);
  app.context.G.Touch = null;
  app.emit('keyup', { code: 'KeyA' });
  app.context.G.GamepadUI = { blocking: true };
  assert.deepEqual(Array.from(app.input.axis()), [0, 0]);
});

test('emits one action per press and ignores buttons held while connecting', () => {
  const app = boot(), pad = device(); pad.buttons[0].pressed = true;
  app.connect(pad); assert.equal(app.pad.tap('confirm'), false);
  pad.buttons[0].pressed = false; app.pad.poll();
  pad.buttons[0].pressed = true; app.pad.poll(); assert.equal(app.pad.tap('confirm'), true);
  app.pad.poll(); assert.equal(app.pad.tap('confirm'), false);
  pad.buttons[0].pressed = false; app.pad.poll();
  pad.buttons[9].pressed = true; app.pad.poll(); assert.equal(app.pad.tap('pause'), true);
});

test('rerolls with the right shoulder and shows the matching controller label', () => {
  const app = boot(), pad = device(); app.connect(pad);
  for (const [layout, label] of [['xbox', 'RB'], ['playstation', 'R1'], ['nintendo', 'R'], ['generic', 'R']]) {
    app.context.G.Settings = { get: () => layout };
    assert.equal(app.pad.label('reroll'), label);
    pad.buttons[5].pressed = true; app.pad.poll();
    assert.equal(app.pad.tap('reroll'), true);
    assert.equal(app.pad.tap('next'), true);
    assert.equal(app.pad.tap('confirm'), false);
    app.pad.poll(); assert.equal(app.pad.tap('reroll'), false);
    pad.buttons[5].pressed = false; app.pad.poll();
    pad.buttons[2].pressed = true; app.pad.poll();
    assert.equal(app.pad.tap('reroll'), false);
    pad.buttons[2].pressed = false; app.pad.poll();
  }
});

test('clears movement on disconnect and keeps one controller active through sparse slots', () => {
  const app = boot(), first = device(1), second = device(3);
  app.connect(null, first, null, second);
  first.axes = [1, 0]; second.axes = [-1, 0]; app.pad.poll();
  assert.equal(app.input.axis()[0], 1);
  first.connected = false; app.pad.poll();
  assert.equal(app.pad.disconnected, true);
  app.connect(null, null, null, second);
  assert.equal(app.pad.disconnected, false);
  app.connect();
  assert.equal(app.pad.connected, false);
  assert.deepEqual(Array.from(app.input.axis()), [0, 0]);
});

test('drops stale controls on blur and waits for release after focus returns', () => {
  const app = boot(), pad = device(); app.connect(pad);
  pad.axes = [1, 0]; pad.buttons[9].pressed = true; app.pad.poll();
  app.emit('blur'); app.pad.poll();
  assert.deepEqual(Array.from(app.input.axis()), [0, 0]);
  app.emit('focus'); app.pad.poll();
  assert.equal(app.pad.tap('pause'), false);
  pad.axes = [0, 0]; pad.buttons[9].pressed = false; app.pad.poll();
  pad.buttons[9].pressed = true; app.pad.poll();
  assert.equal(app.pad.tap('pause'), true);
  app.visibility(true); app.pad.poll();
  assert.equal(app.pad.tap('pause'), false);
});

test('falls back safely when the API is missing, denied, or has no standard mapping', () => {
  const app = boot(), pad = device(); pad.mapping = '';
  app.connect(pad); assert.equal(app.pad.connected, false);
  app.context.navigator.getGamepads = () => { throw new Error('SecurityError'); };
  assert.doesNotThrow(() => app.pad.poll());
  app.context.navigator.getGamepads = undefined;
  assert.doesNotThrow(() => app.pad.poll());
  assert.deepEqual(Array.from(app.input.axis()), [0, 0]);
});

test('keeps face button positions fixed for every label style', () => {
  const app = boot(), pad = device(); app.connect(pad);
  for (const layout of ['xbox', 'playstation', 'nintendo', 'generic']) {
    app.context.G.Settings = { get: () => layout };
    for (let i = 0; i < 4; i++) {
      pad.buttons[i].pressed = true; app.pad.poll();
      assert.equal(app.pad.faceTap(i), true);
      for (let j = 0; j < 4; j++) if (i !== j) assert.equal(app.pad.faceTap(j), false);
      app.pad.poll(); assert.equal(app.pad.faceTap(i), false);
      pad.buttons[i].pressed = false; app.pad.poll();
    }
  }
});

test('uses A or circle to confirm and B or cross to cancel without changing combat slots', () => {
  const app = boot(), pad = device(); app.connect(pad);
  for (const [layout, confirm, back, confirmLabel, backLabel] of [
    ['xbox', 0, 1, 'A', 'B'], ['playstation', 1, 0, '○', '×'],
    ['nintendo', 1, 0, 'A', 'B'], ['generic', 0, 1, '↓', '→']
  ]) {
    app.context.G.Settings = { get: () => layout };
    assert.equal(app.pad.label('confirm'), confirmLabel);
    assert.equal(app.pad.label('back'), backLabel);
    for (const [action, index] of [['confirm', confirm], ['back', back]]) {
      pad.buttons[index].pressed = true; app.pad.poll();
      assert.equal(app.pad.tap(action), true);
      assert.equal(app.pad.tap(action === 'confirm' ? 'back' : 'confirm'), false);
      assert.equal(app.pad.faceTap(index), true);
      app.pad.poll(); assert.equal(app.pad.tap(action), false);
      pad.buttons[index].pressed = false; app.pad.poll();
    }
  }
});

test('detects known IDs before names and uses generic positions for uncertain devices', () => {
  for (const [id, expected] of [
    ['Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', 'playstation'],
    ['054c-0ce6-Wireless Controller', 'playstation'],
    ['Xbox (Vendor: 054c Product: 0df2)', 'playstation'],
    ['Controller (Vendor: 045e Product: 028e)', 'xbox'],
    ['Pro Controller (Vendor: 057e Product: 2009)', 'nintendo'],
    ['Joy-Con (L+R)', 'nintendo'], ['DualSense Wireless Controller', 'playstation'],
    ['Xbox Wireless Controller', 'xbox'], ['Nintendo Switch Pro Controller', 'nintendo'],
    ['Joy-Con (R) (Vendor: 057e Product: 2007)', 'generic'],
    ['Joy-Con (L)', 'generic'], ['Wireless Controller', 'generic'],
    ['8BitDo Pro 2', 'generic'], ['Unknown (Vendor: 054c Product: ffff)', 'generic']
  ]) {
    const app = boot(), pad = device(); pad.id = id; app.connect(pad);
    assert.equal(app.pad.layout, expected, id);
  }
});

test('manual button styles override detection and fall back for auto or invalid settings', () => {
  const app = boot(), pad = device(); pad.id = 'Xbox Wireless Controller'; app.connect(pad);
  const styles = { xbox: ['A', 'B', 'X', 'Y'], playstation: ['×', '○', '□', '△'], nintendo: ['B', 'A', 'Y', 'X'], generic: ['↓', '→', '←', '↑'] };
  for (const [style, labels] of Object.entries(styles)) {
    app.context.G.Settings = { get: () => style };
    assert.deepEqual(labels.map((_, i) => app.pad.faceLabel(i)), labels);
  }
  app.context.G.Settings = { get: () => 'auto' };
  assert.equal(app.pad.layout, 'xbox');
  app.context.G.Settings = { get: () => 'invalid' };
  assert.equal(app.pad.layout, 'xbox');
});

test('switches hints on fresh input rather than a connected or held controller', () => {
  const app = boot(), pad = device(); app.connect(pad);
  assert.equal(app.pad.mode, false);
  pad.axes = [0.35, 0]; app.pad.poll();
  assert.equal(app.pad.mode, true);
  app.emit('keydown', { code: 'Digit2', preventDefault() {} }); app.pad.poll();
  assert.equal(app.pad.mode, false);
  pad.buttons[3].pressed = true; app.pad.poll(); assert.equal(app.pad.mode, true);
  app.emit('pointermove', { pointerType: 'mouse', movementX: 10, movementY: 0 }); app.pad.poll();
  assert.equal(app.pad.mode, false);
  pad.axes = [0.8, 0]; app.pad.poll(); assert.equal(app.pad.mode, true);
  app.emit('pointerdown', { pointerType: 'touch' }); app.pad.poll();
  assert.equal(app.pad.mode, false);
  app.connect(); assert.equal(app.pad.mode, false);
});

test('recognizes a slow stick movement without treating neutral drift as input', () => {
  const app = boot(), pad = device(); app.connect(pad);
  for (let x = 0.01; x < 0.19; x += 0.01) { pad.axes[0] = x; app.pad.poll(); }
  assert.equal(app.pad.mode, false);
  for (let x = 0.19; x < 0.4; x += 0.01) { pad.axes[0] = x; app.pad.poll(); }
  assert.equal(app.pad.mode, true);
});

test('right-stick aiming is separate from movement and clears on blur or disable', () => {
  const app = boot(), pad = device();
  app.connect(pad);
  pad.axes = [0, 0, 0.7, -0.7]; app.pad.poll();
  assert.deepEqual(Array.from(app.pad.aim()), [0.7, -0.7]);
  assert.deepEqual(Array.from(app.input.axis()), [0, 0]);
  assert.equal(app.pad.aimAt, 1234); assert.equal(app.pad.mode, true);
  app.emit('blur'); assert.equal(app.pad.aim(), null);
  app.emit('focus'); app.pad.poll(); assert.equal(app.pad.aim(), null);
  pad.axes = [0, 0, 0, 0]; app.pad.poll();
  pad.axes[2] = 1; app.pad.poll(); assert.equal(app.pad.aim()[0], 1);
  app.context.G.Settings = { get: key => key !== 'gamepad' };
  app.pad.poll(); assert.equal(app.pad.connected, false);
  assert.equal(app.pad.aim(), null);
});

test('rumble follows its setting and tolerates unsupported browser actuators', async () => {
  const app = boot(), pad = device(), effects = [];
  app.context.G.Settings = { get: () => true };
  app.connect(pad); app.pad.rumble();
  pad.vibrationActuator = { playEffect: (kind, options) => { effects.push([kind, options]); return Promise.reject(Error('blocked')); } };
  app.pad.rumble(3, 140); await Promise.resolve();
  assert.equal(effects.length, 1); assert.equal(effects[0][0], 'dual-rumble');
  assert.equal(effects[0][1].strongMagnitude, 1);
  app.context.G.Settings = { get: key => key !== 'padRumble' };
  app.pad.rumble(); assert.equal(effects.length, 1);
});
