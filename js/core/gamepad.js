/* Standard Gamepad API input. Poll once before each game frame. */
G.Gamepad = (() => {
  const BUTTONS = { confirm: 0, back: 1, reroll: 2, previous: 4, next: 5, pause: 9 };
  const LABELS = {
    xbox: { face: ['A', 'B', 'X', 'Y'], previous: 'LB', next: 'RB', pause: 'Start' },
    playstation: { face: ['×', '○', '□', '△'], previous: 'L1', next: 'R1', pause: 'Options' },
    nintendo: { face: ['B', 'A', 'Y', 'X'], previous: 'L', next: 'R', pause: '+' },
    generic: { face: ['↓', '→', '←', '↑'], previous: 'L', next: 'R', pause: '☰' }
  };
  // Known USB/Bluetooth pairs from Chromium's gamepad_id_list.h.
  const DEVICES = {
    '054c': { playstation: ['0268', '05c4', '09cc', '0ba0', '0ce6', '0df2'] },
    '045e': { xbox: ['028e', '028f', '0291', '02a1', '02d1', '02dd', '02e0', '02e3', '02ea', '02fd', '0719', '0b00', '0b05', '0b06', '0b0a', '0b0c', '0b12', '0b13', '0b20', '0b21', '0b22'] },
    '057e': { nintendo: ['2009', '200e'], generic: ['2006', '2007'] }
  };
  const DEAD_ZONE = 0.2;
  let current = null, previous = [], pressed = new Set();
  let vector = [0, 0], direction = '', focused = true, armed = false, disconnected = false;
  let usingGamepad = false, activity = false, detectedLayout = 'generic', activityVector = [0, 0];

  function detectLayout(id) {
    const ids = id.match(/vendor:\s*([0-9a-f]{4}).*?product:\s*([0-9a-f]{4})/i)
      || id.match(/\b([0-9a-f]{4})[-:]([0-9a-f]{4})\b/i);
    if (ids) {
      for (const [style, products] of Object.entries(DEVICES[ids[1].toLowerCase()] || {})) {
        if (products.includes(ids[2].toLowerCase())) return style;
      }
    }
    if (/joy-?con/i.test(id)) return /\(l\s*\+\s*r\)/i.test(id) ? 'nintendo' : 'generic';
    if (/dualsense|dualshock|playstation|\bps[345]\b/i.test(id)) return 'playstation';
    if (/\bxbox\b|\bxinput\b/i.test(id)) return 'xbox';
    if (/\bswitch\b.*\bpro\b/i.test(id)) return 'nintendo';
    return 'generic';
  }
  function layout() {
    const choice = G.Settings && G.Settings.get('gamepadLayout');
    return Object.prototype.hasOwnProperty.call(LABELS, choice) ? choice : detectedLayout;
  }
  function otherInput() { usingGamepad = false; activityVector = vector; }
  addEventListener('keydown', otherInput);
  addEventListener('pointerdown', otherInput);
  addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse' && Math.hypot(e.movementX || 0, e.movementY || 0) > 2) otherInput();
  });

  function suspend() {
    vector = [0, 0]; direction = ''; pressed.clear(); previous = []; armed = false;
    usingGamepad = false; activity = false; activityVector = [0, 0];
  }
  addEventListener('blur', () => { focused = false; suspend(); });
  addEventListener('focus', () => { focused = true; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });

  function poll() {
    activity = false;
    pressed.clear(); disconnected = false; vector = [0, 0]; direction = '';
    let pads = [];
    try { pads = Array.from(navigator.getGamepads ? navigator.getGamepads() : []); } catch (e) { /* API can be blocked by policy. */ }
    pads = pads.filter(p => p && p.connected && p.mapping === 'standard');
    let pad = current && pads.find(p => p.index === current.index && p.id === current.id);
    if (!pad) {
      disconnected = !!current;
      pad = pads[0] || null;
      suspend();
      detectedLayout = pad ? detectLayout(pad.id) : 'generic';
    }
    current = pad;
    if (!pad || !focused || document.hidden) return;

    const buttons = Array.from(pad.buttons, b => !!b && (b.pressed || b.value > 0.5));
    const x = Number.isFinite(pad.axes[0]) ? pad.axes[0] : 0;
    const y = Number.isFinite(pad.axes[1]) ? pad.axes[1] : 0;
    const length = Math.hypot(x, y);
    // Reconnection and focus changes must not turn a held button into a new action.
    if (!armed) {
      armed = !buttons.some(Boolean) && length <= DEAD_ZONE;
      previous = buttons;
      return;
    }
    buttons.forEach((down, index) => { if (down && !previous[index]) pressed.add(index); });
    previous = buttons;
    const dx = Number(!!buttons[15]) - Number(!!buttons[14]);
    const dy = Number(!!buttons[13]) - Number(!!buttons[12]);
    if (dx || dy) {
      const n = Math.hypot(dx, dy);
      vector = [dx / n, dy / n];
    } else if (length > DEAD_ZONE) {
      const scale = (Math.min(1, length) - DEAD_ZONE) / (1 - DEAD_ZONE) / length;
      vector = [x * scale, y * scale];
    }
    const nx = dx || (Math.abs(x) >= 0.55 ? x : 0);
    const ny = dy || (Math.abs(y) >= 0.55 ? y : 0);
    if (nx || ny) direction = Math.abs(nx) > Math.abs(ny) ? (nx > 0 ? 'right' : 'left') : (ny > 0 ? 'down' : 'up');
    activity = pressed.size > 0 || (Math.hypot(...vector) > 0 && Math.hypot(vector[0] - activityVector[0], vector[1] - activityVector[1]) > 0.08);
    if (activity) { usingGamepad = true; activityVector = vector; }
    else if (!vector[0] && !vector[1]) activityVector = vector;
  }

  return {
    poll, axis: () => vector, tap: action => pressed.has(BUTTONS[action]),
    faceTap: index => index >= 0 && index < 4 && pressed.has(index),
    faceLabel: index => LABELS[layout()].face[index],
    label(action) { const labels = LABELS[layout()]; return labels.face[BUTTONS[action]] || labels[action] || ''; },
    get layout() { return layout(); },
    get mode() { return !!current && usingGamepad; },
    get connected() { return !!current; },
    get disconnected() { return disconnected; },
    get direction() { return direction; },
    get active() { return activity; }
  };
})();
