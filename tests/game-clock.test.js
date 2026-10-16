const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function boot() {
  const source = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');
  const calls = [], network = [], renders = [];
  const noop = () => {};
  const context = vm.createContext({
    last: 0, speedK: 1, state: 'playing', fpsAcc: 0, fpsN: 0, fpsShown: 0, frameDt: 0,
    pl: { anim: { update: noop } },
    G: { Settings: { sample: noop }, Gamepad: { poll: noop }, GamepadUI: { update: noop },
      Coop: { active: true, tick: dt => network.push(dt) }, FX: { update: noop }, UI: { tick: noop }, Input: { endFrame: noop } },
    handleKeys: noop, update: dt => calls.push(dt), render: () => renders.push(context.frameDt)
  });
  vm.runInContext(source.slice(source.indexOf('  function frame(ts)'), source.indexOf('  function update(dt)')), context);
  return { context, calls, network, renders, frame: ts => context.frame(ts), elapsed: () => calls.reduce((a, b) => a + b, 0) };
}

for (const fps of [15, 20, 30, 60, 120, 144]) test('advances ten game seconds in ten wall seconds at ' + fps + ' FPS', () => {
  const app = boot();
  for (let i = 1; i <= fps * 10; i++) app.frame(i * 1000 / fps);
  assert.ok(Math.abs(app.elapsed() - 10) < 1e-6);
  assert.ok(app.calls.every(dt => dt > 0 && dt <= 1 / 30));
  assert.equal(app.renders.length, fps * 10); assert.equal(app.network.length, fps * 10);
  assert.ok(Math.abs(app.renders.reduce((a, b) => a + b, 0) - 10) < 1e-6);
});

test('bounds catch-up after stalls and never simulates a negative delta', () => {
  const app = boot(); app.frame(5000);
  assert.ok(app.elapsed() <= 0.25); assert.ok(app.calls.length <= 8);
  const elapsed = app.elapsed(); app.frame(4000); assert.equal(app.elapsed(), elapsed);
});

test('pause and resume discard paused wall time, including a resumed background frame', () => {
  const app = boot(); app.frame(20); const before = app.elapsed();
  app.context.handleKeys = () => { app.context.state = 'paused'; }; app.frame(70);
  assert.equal(app.elapsed(), before);
  app.context.handleKeys = () => { app.context.state = 'playing'; }; app.frame(5000);
  assert.equal(app.elapsed(), before);
  app.context.handleKeys = () => {}; app.frame(5050);
  assert.ok(Math.abs(app.elapsed() - before - 0.05) < 1e-6);
});

test('stops catch-up when gameplay opens a reward or ends the run', () => {
  const app = boot();
  app.context.update = dt => { app.calls.push(dt); app.context.state = 'levelup'; };
  app.frame(100);
  assert.equal(app.calls.length, 1); assert.equal(app.renders.length, 1);
  app.context.handleKeys = () => { app.context.state = 'playing'; }; app.frame(200);
  assert.equal(app.calls.length, 1);
});
