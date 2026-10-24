const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function element(id, { tags = ['button'], y = 0, z = 20 } = {}) {
  const classes = new Set();
  return {
    id, tags, dataset: {}, children: [], parentElement: null, isConnected: true, scrollTop: 0, scrollLeft: 0, disabled: false, clicks: 0, style: { zIndex: z, visibility: 'visible', pointerEvents: 'auto' },
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
    closest: () => classes.has('hidden') ? {} : null,
    getClientRects() { return this.isConnected ? [1] : []; }, getAttribute: () => null, hasAttribute: () => false,
    matches: selector => selector.split(',').some(s => tags.includes(s.trim())),
    getBoundingClientRect: () => ({ left: 0, top: y, width: 100, height: 30 }),
    querySelectorAll() { return this.children; },
    contains(el) { return el === this || this.children.includes(el); },
    focus() {}, scrollIntoView() { this.scrolls = (this.scrolls || 0) + 1; }, click() { this.clicks++; if (this.onclick) this.onclick(); }
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
      autoPause: () => calls.push(['autoPause']), togglePause: () => calls.push(['pause']), cycleWatch: n => calls.push(['watch', n]) },
    Judgment: { cinematic: false, skip: () => calls.push(['skip']) },
    Orbs: { useSelected: () => calls.push(['orbUse']), next: () => calls.push(['orbNext']) },
    RunUI: { reroll: () => calls.push(['reroll']) }, UI: { toast: () => {} } },
    document: { body: { classList: { toggle() {} } }, addEventListener: (name, fn) => { listeners[name] = fn; }, getElementById: id => panels.find(p => p.id === id), querySelectorAll: selector => selector.startsWith('.scr') ? panels : [] },
    addEventListener: (name, fn) => { listeners[name] = fn; }, getComputedStyle: el => el.style
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/ui/gamepad-ui.js'), 'utf8'), context);
  return {
    context, panels, pad, calls, listeners, ui: context.G.GamepadUI,
    update(ts = 0, action) { actions.clear(); if (action) actions.add(action); context.G.GamepadUI.update(ts); },
    panel(id, children, z = 20) { const el = element(id, { z }); el.children = children; children.forEach(c => c.parentElement = el); panels.push(el); return el; }
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

test('orb triggers are blocked by death, pause, cinematics and modal screens', () => {
  const app = boot();
  app.update(0, 'orbUse'); app.update(1, 'orbNext');
  assert.deepEqual(app.calls, [['orbUse'], ['orbNext']]);
  app.calls.length = 0;
  app.context.G.Game.player.dead = true;
  app.update(2, 'orbUse'); app.update(3, 'orbNext');
  app.context.G.Game.player.dead = false; app.context.G.Game.state = 'paused';
  app.update(4, 'orbUse'); app.update(5, 'orbNext');
  app.context.G.Game.state = 'playing'; app.context.G.Judgment.cinematic = true;
  app.update(6, 'orbUse'); app.update(7, 'orbNext');
  app.context.G.Judgment.cinematic = false; app.panel('scr-levelup', []);
  app.update(8, 'orbUse'); app.update(9, 'orbNext');
  assert.deepEqual(app.calls, []);
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

test('shoulder buttons change the spectator target while down and switch moves after revival', () => {
  const app = boot();
  app.context.G.Game.player.dead = true;
  app.update(0, 'previous'); app.update(1, 'next');
  assert.deepEqual(app.calls, [['watch', -1], ['watch', 1]]);
  app.context.G.Game.player.dead = false;
  app.update(2, 'next');
  assert.deepEqual(app.calls.at(-1), ['cycle', 1]);
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


test('keeps keyed controls and nested scroll offsets after a menu rebuild', () => {
  const app = boot(), close = element('close'), buy = element('', { y: 100 });
  buy.dataset.gamepadKey = 'upgrade:hp:buy';
  const panel = app.panel('scr-upgrades', [close, buy]);
  app.update(0, 'reroll'); app.pad.direction = 'down'; app.update(1); app.pad.direction = '';
  panel.scrollTop = 420; panel.scrollLeft = 20;
  const next = element('', { y: 100 }); next.dataset.gamepadKey = buy.dataset.gamepadKey; next.parentElement = panel;
  buy.onclick = () => { buy.isConnected = false; panel.children = [close, next]; panel.scrollTop = panel.scrollLeft = 0; };
  app.update(2, 'confirm'); app.update(3);
  assert.ok(next.classList.contains('gamepad-focus'));
  assert.deepEqual([panel.scrollTop, panel.scrollLeft], [420, 20]);
  assert.equal(next.scrolls || 0, 0, 'restoring a rebuilt control must not scroll it into view again');
});

test('restores focus and scroll when returning from a modal', () => {
  const app = boot(), first = element('first'), chosen = element('chosen', { y: 100 });
  const menu = app.panel('scr-dex', [first, chosen]);
  app.update(0, 'reroll'); app.pad.direction = 'down'; app.update(1); app.pad.direction = '';
  menu.scrollTop = 350;
  const close = element('profile-close', { tags: ['button', '[data-gamepad-back]'] });
  let modal;
  chosen.onclick = () => { modal = app.panel('scr-profile', [close], 60); };
  close.onclick = () => modal.classList.add('hidden');
  app.update(2, 'confirm'); app.update(3); app.update(4, 'back'); menu.scrollTop = 0; app.update(5);
  assert.ok(chosen.classList.contains('gamepad-focus'));
  assert.equal(menu.scrollTop, 350);
});

test('uses a nearby enabled action when the selected purchase becomes disabled', () => {
  const app = boot(), close = element('close', { tags: ['button', '[data-back]'] });
  const buy = element('buy', { y: 300 }), other = element('other', { y: 350 });
  app.panel('scr-upgrades', [close, buy, other]);
  app.update(0, 'reroll'); app.pad.direction = 'down'; app.update(1); app.pad.direction = '';
  buy.onclick = () => { buy.disabled = true; };
  app.update(2, 'confirm'); app.update(3);
  assert.ok(other.classList.contains('gamepad-focus'));
  assert.equal(close.classList.contains('gamepad-focus'), false);
});

test('restores an asynchronously rebuilt row by identity after scrolling and reordering', () => {
  const app = boot(), close = element('close'), row = element('', { y: 100 });
  row.dataset.gamepadKey = 'friend:uid:invite';
  const panel = app.panel('scr-friends', [close, row]);
  app.update(0, 'reroll'); app.pad.direction = 'down'; app.update(1); app.pad.direction = '';
  panel.scrollTop = 180; app.listeners.scroll({ target: panel });
  const next = element('', { y: 200 }); next.dataset.gamepadKey = row.dataset.gamepadKey; next.parentElement = panel;
  const newRow = element('new-row', { y: 100 }); newRow.parentElement = panel;
  row.isConnected = false; panel.children = [close, newRow, next]; panel.scrollTop = 0;
  app.update(2);
  assert.ok(next.classList.contains('gamepad-focus'));
  assert.equal(panel.scrollTop, 180);
});

test('keeps separate focus history for a nested view within the same screen', () => {
  const app = boot(), close = element('close'), slot = element('favorite-slot', { y: 200 });
  const pick = element('pick', { tags: ['.cell', '[data-gamepad-default]'], y: 100 });
  const panel = app.panel('scr-goals', [close, slot]); pick.parentElement = panel;
  slot.onclick = () => { panel.dataset.gamepadView = 'favorite'; panel.children = [close, pick]; slot.isConnected = false; panel.scrollTop = 0; };
  pick.onclick = () => { panel.dataset.gamepadView = ''; panel.children = [close, slot]; slot.isConnected = true; pick.isConnected = false; };
  app.update(0, 'reroll'); app.pad.direction = 'down'; app.update(1); app.pad.direction = ''; panel.scrollTop = 200;
  app.update(2, 'confirm'); app.update(3); app.update(4, 'confirm'); app.update(5);
  assert.ok(slot.classList.contains('gamepad-focus'));
  assert.equal(panel.scrollTop, 200);
});

test('back returns from a nested picker before closing the containing screen', () => {
  const app = boot(), close = element('close', { tags: ['button', '[data-back]'] });
  const back = element('fav-back', { tags: ['button', '[data-gamepad-back]'] });
  app.panel('scr-goals', [close, back]);
  app.update(0, 'back');
  assert.equal(back.clicks, 1);
  assert.equal(close.clicks, 0);
});

test('right-stick scrolling uses elapsed time and leaves the active move unchanged', () => {
  const app = boot(), card = element('card');
  const panel = app.panel('scr-dex', [card]);
  panel.clientHeight = 300; panel.scrollHeight = 900;
  app.pad.aim = () => [0, 1];
  app.update(0, 'reroll'); app.update(1000 / 60);
  assert.equal(panel.scrollTop, 10);
  assert.deepEqual(app.calls, []);
});
