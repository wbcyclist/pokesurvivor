const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function element(id, { tags = ['button'], y = 0, z = 20 } = {}) {
  const classes = new Set();
  return {
    id, tags, dataset: {}, children: [], disabled: false, clicks: 0, style: { zIndex: z, visibility: 'visible', pointerEvents: 'auto' },
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
    closest: () => classes.has('hidden') ? {} : null,
    getClientRects: () => [1], getAttribute: () => null, hasAttribute: () => false,
    matches: selector => selector.split(',').some(s => tags.includes(s.trim())),
    getBoundingClientRect: () => ({ left: 0, top: y, width: 100, height: 30 }),
    querySelectorAll() { return this.children; },
    focus() {}, scrollIntoView() {}, click() { this.clicks++; if (this.onclick) this.onclick(); }
  };
}

function boot() {
  const panels = [], actions = new Set(), calls = [], listeners = {};
  const pad = { connected: true, disconnected: false, direction: '', mode: true, layout: 'xbox',
    faceTap: i => actions.has('face' + i), faceLabel: i => ['A', 'B', 'X', 'Y'][i],
    label: () => 'Start', tap: action => actions.has(action),
    get active() { return !!this.direction || actions.size > 0; } };
  const context = vm.createContext({
    G: { Gamepad: pad, Game: { state: 'playing', player: { cycle: n => calls.push(['cycle', n]), setActive: i => calls.push(['slot', i]) },
      autoPause: () => calls.push(['autoPause']), togglePause: () => calls.push(['pause']) },
    Judgment: { cinematic: false, skip: () => calls.push(['skip']) },
    RunUI: { reroll: () => calls.push(['reroll']) }, UI: { toast: () => {} } },
    document: { body: { classList: { toggle() {} } }, querySelectorAll: selector => selector.startsWith('.scr') ? panels : [] },
    addEventListener: (name, fn) => { listeners[name] = fn; }, getComputedStyle: el => el.style
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/ui/gamepad-ui.js'), 'utf8'), context);
  return {
    context, panels, pad, calls, listeners, ui: context.G.GamepadUI,
    update(ts = 0, action) { actions.clear(); if (action) actions.add(action); context.G.GamepadUI.update(ts); },
    panel(id, children, z = 20) { const el = element(id, { z }); el.children = children; panels.push(el); return el; }
  };
}

test('routes combat actions and cinematic skip without opening menus', () => {
  const app = boot();
  app.update(0, 'previous'); app.update(1, 'next'); app.update(2, 'pause');
  assert.deepEqual(app.calls, [['cycle', -1], ['cycle', 1], ['pause']]);
  app.context.G.Judgment.cinematic = true;
  app.update(3, 'confirm');
  assert.deepEqual(app.calls.at(-1), ['skip']);
});

test('face buttons select the four combat slots but never pass through a modal or cinematic', () => {
  const app = boot();
  for (let i = 0; i < 4; i++) app.update(i, 'face' + i);
  assert.deepEqual(app.calls, [['slot', 0], ['slot', 1], ['slot', 2], ['slot', 3]]);
  app.calls.length = 0;
  const modal = app.panel('scr-levelup', []);
  for (let i = 0; i < 4; i++) app.update(i + 10, 'face' + i);
  assert.deepEqual(app.calls, []);
  modal.classList.add('hidden'); app.context.G.Judgment.cinematic = true;
  for (let i = 0; i < 4; i++) app.update(i + 20, 'face' + i);
  assert.deepEqual(app.calls, []);
  app.context.G.Judgment.cinematic = false; app.context.G.Game.state = 'paused';
  app.update(30, 'face0'); assert.deepEqual(app.calls, []);
});

test('only the top modal receives confirm and back; hidden and disabled controls are skipped', () => {
  const app = boot(), underlying = element('play'), disabled = element('disabled'), close = element('close', { tags: ['button', '[data-gamepad-back]'] });
  disabled.disabled = true;
  app.panel('scr-menu', [underlying]);
  app.panel('scr-settings', [disabled, close], 60);
  app.update(0, 'confirm'); app.update(1, 'back'); app.update(2, 'next');
  assert.equal(close.clicks, 2);
  assert.equal(underlying.clicks, 0);
  assert.equal(disabled.clicks, 0);
  assert.equal(app.ui.blocking, true);
  assert.deepEqual(app.calls, []);
});

test('repeats navigation by elapsed time and requires release when the screen changes', () => {
  const app = boot(), first = element('first'), second = element('second', { y: 50 });
  app.panel('scr-test', [first, second]);
  app.update(0, 'reroll');
  app.pad.direction = 'down'; app.update(10);
  assert.ok(second.classList.contains('gamepad-focus'));
  app.update(359); assert.ok(second.classList.contains('gamepad-focus'));
  app.update(360); assert.ok(first.classList.contains('gamepad-focus'));
  const next = element('next'), last = element('last', { y: 50 });
  app.panel('scr-result', [next, last]); app.update(500); app.update(1000);
  assert.ok(next.classList.contains('gamepad-focus'));
  app.pad.direction = ''; app.update(1010);
  app.pad.direction = 'down'; app.update(1020);
  assert.ok(last.classList.contains('gamepad-focus'));
});

test('selects level cards, rerolls, and resumes only from the pause screen', () => {
  const app = boot(), card = element('card', { tags: ['.card'] });
  const level = app.panel('scr-levelup', [card]);
  app.update(0, 'confirm'); assert.equal(card.clicks, 1);
  app.update(1, 'reroll'); app.update(2, 'pause');
  assert.deepEqual(app.calls, [['reroll']]);
  level.classList.add('hidden'); app.panel('scr-pause', []);
  app.update(3, 'pause'); assert.deepEqual(app.calls.at(-1), ['pause']);
});

test('keeps focus on the same setting after its DOM node is replaced', () => {
  for (const [id, dataset] of [['', { k: 'quality', v: 'high' }], ['', { k: 'fps' }], ['set-full', {}]]) {
    const app = boot(), close = element('set-close'), old = element(id, { y: 50 });
    old.dataset = dataset;
    const panel = app.panel('scr-settings', [close, old]);
    const replacement = element(id, { y: 50 }); replacement.dataset = { ...dataset };
    old.onclick = () => { old.getClientRects = () => []; panel.children = [close, replacement]; };
    app.update(0, 'reroll'); app.pad.direction = 'down'; app.update(1);
    app.pad.direction = ''; app.update(2, 'confirm'); app.update(3);
    assert.equal(replacement.classList.contains('gamepad-focus'), true);
    assert.equal(close.classList.contains('gamepad-focus'), false);
    app.update(4, 'confirm'); assert.equal(replacement.clicks, 1);
    assert.equal(close.clicks, 0);
  }
});

test('disconnect pauses through the game policy and removes stale focus and movement blocking', () => {
  const app = boot(), card = element('card'); app.panel('scr-test', [card]);
  app.update(0, 'reroll'); assert.ok(card.classList.contains('gamepad-focus'));
  app.pad.disconnected = true; app.pad.connected = false; app.update(1);
  assert.deepEqual(app.calls, [['autoPause']]);
  assert.equal(card.classList.contains('gamepad-focus'), false);
  assert.equal(app.ui.blocking, false);
});

test('pointer and keyboard interaction remove the gamepad focus until the next gamepad input', () => {
  const app = boot(), button = element('button'); app.panel('scr-test', [button]);
  app.update(0, 'reroll'); app.listeners.pointerdown(); app.update(1);
  assert.equal(button.classList.contains('gamepad-focus'), false);
  app.update(2, 'confirm'); assert.equal(button.clicks, 1);
  app.listeners.keydown(); app.update(3);
  assert.equal(button.classList.contains('gamepad-focus'), false);
});
