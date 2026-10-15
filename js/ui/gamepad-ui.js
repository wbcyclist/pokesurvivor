/* Route gamepad actions to the visible screen or the active run. */
G.GamepadUI = (() => {
  const TARGETS = 'button, a[href], input, select, .tab, .card, .cell, .answer, [role="button"], [tabindex]';
  const PANELS = '.scr, #boot, #tap-start, #rotate, #pull-fx, #sound-panel, #invite-pop';
  let scope = null, selected = null, active = false, blocking = false;
  let lastDirection = '', repeatAt = 0, waitDirection = false;

  function visible(el) {
    return !!el && !el.closest('.hidden, [hidden]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  }
  function enabled(el) {
    return visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true'
      && !el.closest('.cards.done, [inert]') && getComputedStyle(el).pointerEvents !== 'none';
  }
  function clearFocus() {
    if (selected) selected.classList.remove('gamepad-focus');
    selected = null;
  }
  function pointerMode() { active = false; clearFocus(); }
  addEventListener('pointerdown', pointerMode);
  addEventListener('keydown', pointerMode);

  function topPanel() {
    let top = null, z = -Infinity;
    for (const el of document.querySelectorAll(PANELS)) {
      if (!visible(el)) continue;
      const level = Number.parseInt(getComputedStyle(el).zIndex, 10) || 0;
      if (level >= z) { top = el; z = level; }
    }
    return top;
  }
  function targets() {
    if (!scope) return [];
    if (scope.id === 'tap-start') return [scope];
    const list = [...scope.querySelectorAll(TARGETS)];
    if (scope.id === 'scr-menu') list.push(...document.querySelectorAll('#topbar button, #user-pill, #credits-line a'));
    return list.filter(enabled);
  }
  function focus(el) {
    if (selected === el) return;
    clearFocus();
    selected = el;
    if (!el) return;
    if (!el.hasAttribute('tabindex') && !el.matches('button, a, input, select')) el.tabIndex = -1;
    el.classList.add('gamepad-focus');
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function initial(list) {
    return list.find(el => el.matches('[data-gamepad-default], .card, .answer, .menu-item.play')) || list[0];
  }
  function adjust(el, direction) {
    if (!['left', 'right'].includes(direction)) return false;
    const step = direction === 'right' ? 1 : -1;
    if (el.matches('input[type="range"]')) {
      const before = el.value;
      if (step > 0) el.stepUp(); else el.stepDown();
      if (el.value !== before) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    }
    if (el.matches('select')) {
      let index = el.selectedIndex + step;
      while (el.options[index] && el.options[index].disabled) index += step;
      if (el.options[index]) { el.selectedIndex = index; el.dispatchEvent(new Event('change', { bubbles: true })); }
      return true;
    }
    return false;
  }
  function navigate(direction, list) {
    if (!selected || !list.includes(selected)) { focus(initial(list)); return; }
    if (adjust(selected, direction)) return;
    const rect = selected.getBoundingClientRect(), horizontal = ['left', 'right'].includes(direction);
    const sign = ['left', 'up'].includes(direction) ? -1 : 1;
    let best = null, score = Infinity;
    for (const el of list) {
      if (el === selected) continue;
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - rect.left - rect.width / 2;
      const dy = r.top + r.height / 2 - rect.top - rect.height / 2;
      const forward = (horizontal ? dx : dy) * sign, across = Math.abs(horizontal ? dy : dx);
      if (forward <= 1) continue;
      const distance = forward + across * 3;
      if (distance < score) { best = el; score = distance; }
    }
    focus(best || list[(list.indexOf(selected) + sign + list.length) % list.length]);
  }
  function back(list) {
    if (scope.id === 'sound-panel') { scope.classList.add('hidden'); return; }
    const button = list.find(el => el.matches('[data-gamepad-back], [data-back]'));
    if (button) button.click();
  }

  function update(ts) {
    const pad = G.Gamepad;
    document.body.classList.toggle('gamepad-mode', pad.mode);
    for (const el of document.querySelectorAll('[data-gamepad-label]')) {
      const key = el.dataset.gamepadLabel;
      const text = key === 'faces' ? [0, 1, 2, 3].map(i => pad.faceLabel(i)).join(' / ') : pad.label(key);
      if (el.textContent !== text) el.textContent = text;
    }
    if (pad.disconnected) {
      G.Game.autoPause();
      G.UI.toast('Mando desconectado. Puedes seguir con teclado o pantalla táctil.', 4000);
    }
    if (!pad.connected) { pointerMode(); scope = null; blocking = false; return; }
    const next = topPanel();
    blocking = !!next;
    if (next !== scope) {
      scope = next; clearFocus(); lastDirection = ''; repeatAt = 0;
      waitDirection = !!pad.direction;
    }
    if (!pad.mode) pointerMode();
    if (pad.active) active = true;
    if (!scope) {
      clearFocus();
      if (G.Judgment.cinematic) {
        if (pad.tap('confirm') || pad.tap('back') || pad.tap('pause')) G.Judgment.skip();
      } else if (pad.tap('pause')) G.Game.togglePause();
      else if (G.Game.state === 'playing' && G.Game.player) {
        for (let i = 0; i < 4; i++) if (pad.faceTap(i)) G.Game.player.setActive(i);
        if (pad.tap('previous')) G.Game.player.cycle(-1);
        if (pad.tap('next')) G.Game.player.cycle(1);
      }
      return;
    }
    if (!active) return;
    if (pad.tap('pause') && scope.id === 'scr-pause') { G.Game.togglePause(); return; }
    // Query large collections only when navigation or a screen change needs them.
    const needsFocus = !selected || !enabled(selected);
    const direction = pad.direction;
    if (!direction) { waitDirection = false; lastDirection = ''; }
    const move = direction && !waitDirection && (direction !== lastDirection || ts >= repeatAt);
    if (!needsFocus && !move && !['confirm', 'back', 'reroll'].some(action => pad.tap(action))) return;
    const list = targets();
    if (needsFocus) focus(initial(list));
    if (pad.tap('back')) { back(list); return; }
    if (pad.tap('reroll') && scope.id === 'scr-levelup') { G.RunUI.reroll(); return; }
    if (move) {
      if (!needsFocus) navigate(direction, list);
      repeatAt = ts + (direction === lastDirection ? 140 : 350);
      lastDirection = direction;
    }
    if (pad.tap('confirm') && selected && enabled(selected)) selected.click();
  }

  return { update, get blocking() { return blocking; } };
})();
