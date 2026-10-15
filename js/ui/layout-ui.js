/* ============ layout-ui.js — colocar los botones (móvil) ============
 * Ajustes > Controles > Colocar los botones: se ven los ataques (con el
 * objeto), la pausa y, si es fijo, el joystick, y se arrastran a donde se
 * quiera. Se guarda el centro de cada cosa en proporción a la pantalla
 * (G.Settings 'pad' o 'padPortrait'); lo que no se mueve se queda en su sitio de siempre.
 * El HUD (hud.js) y el joystick (touch.js) leen esas posiciones.
 * Comparte las medidas con el HUD mediante G.Touch.layout().
 */
G.LayoutUI = (() => {
  let el = null, pos = null, moved = null, mode = 'float';

  function viewport() {
    const canvas = document.getElementById('game');
    return { w: canvas.clientWidth, h: canvas.clientHeight };
  }

  function current(k, w, h) {
    const c = G.Touch.layout(w, h);
    if (k === 'stick') { const b = G.Touch.stickBase(w, h); return [b.x, b.y]; }
    const b = k === 'bar' ? c.bar : c.pause;
    return [b.x + (b.width || b.size) / 2, b.y + (b.height || b.size) / 2];
  }

  function fit(k, x, y, w, h) {
    const c = G.Touch.layout(w, h), sa = c.safe;
    if (k === 'bar') return [G.U.clamp(x, sa.left + 6 + c.bar.width / 2, w - sa.right - c.bar.width / 2 - 6),
      G.U.clamp(y, sa.top + 24 + c.size / 2, h - c.bottom - c.size / 2 - c.keyHeight - c.keyGap - 6)];
    if (k === 'pause') return [G.U.clamp(x, sa.left + 24, w - sa.right - 24), G.U.clamp(y, sa.top + 30, h - sa.bottom - 24)];
    const r = G.Touch.R();
    return [G.U.clamp(x, r + 4, w - r - 4), G.U.clamp(y, r + 4, h - r - 4)];
  }

  function build() {
    el = document.createElement('section');
    el.id = 'scr-layout';
    el.className = 'scr hidden';
    const slots = Array.from({ length: 4 }, (_, i) => `<div class="lay-slot${i === 0 ? ' on' : ''}"><i>${i + 1}</i></div>`).join('');
    el.innerHTML = `
      <div class="lay-thing lay-bar" data-k="bar"><div class="lay-slot item"></div>${slots}<span class="lay-tag">Ataques</span></div>
      <div class="lay-thing lay-pause" data-k="pause"><b></b><b></b></div>
      <div class="lay-thing lay-stick" data-k="stick"><div class="knob"></div><span class="lay-tag">Joystick</span></div>
      <div class="box lay-panel">
        <h3>Arrastra los botones a donde quieras</h3>
        <p class="lay-turn">Los controles se guardan por separado en vertical y horizontal.</p>
        <div class="chips set-chips" id="lay-mode"><b>Joystick</b>
          <button class="chip" data-m="float">Flotante</button><button class="chip" data-m="fixed">Fijo</button>
        </div>
        <small class="lay-help">Flotante: aparece donde pones el dedo. Fijo: siempre en el mismo sitio.</small>
        <div class="row wrap lay-btns">
          <button class="btn small ghost" id="lay-cancel" data-gamepad-back>Cancelar</button>
          <button class="btn small" id="lay-reset">Restablecer</button>
          <button class="btn small gold" id="lay-save">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelectorAll('.lay-thing').forEach(drag);
    el.querySelectorAll('#lay-mode .chip').forEach(b => { b.onclick = () => { mode = b.dataset.m; paint(); }; });
    el.querySelector('#lay-cancel').onclick = close;
    el.querySelector('#lay-reset').onclick = () => {
      moved = {}; mode = 'float';
      const { w, h } = viewport(), c = G.Touch.layout(w, h, 4, 4, false);
      pos = { bar: [c.bar.x + c.bar.width / 2, c.bar.y + c.size / 2],
              pause: [c.pause.x + 20, c.pause.y + 20],
              stick: [G.Touch.STICK_DEF[0] * w, h > w ? Math.min(G.Touch.STICK_DEF[1] * h, c.bar.y - G.Touch.R() - 24) : G.Touch.STICK_DEF[1] * h] };
      for (const k in pos) pos[k] = fit(k, pos[k][0], pos[k][1], w, h);
      paint();
    };
    el.querySelector('#lay-save').onclick = save;
    const resize = () => { if (isOpen()) { load(); paint(); } };
    addEventListener('resize', resize);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(document.getElementById('game'));
  }

  function drag(node) {
    const k = node.dataset.k;
    let off = null;
    node.addEventListener('pointerdown', e => {
      e.preventDefault();
      off = [e.clientX - pos[k][0], e.clientY - pos[k][1]];
      node.classList.add('held');
      try { node.setPointerCapture(e.pointerId); } catch (err) { /* nada */ }
    });
    node.addEventListener('pointermove', e => {
      if (!off) return;
      const { w, h } = viewport();
      pos[k] = fit(k, e.clientX - off[0], e.clientY - off[1], w, h);
      moved[k] = true;
      paint();
    });
    const up = () => { off = null; node.classList.remove('held'); };
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
  }

  function load() {
    const { w, h } = viewport();
    pos = {}; moved = {};
    for (const k of ['bar', 'pause', 'stick']) {
      const c = current(k, w, h);
      pos[k] = fit(k, c[0], c[1], w, h);
      moved[k] = !!G.Touch.spot(k, w, h);
    }
  }

  function paint() {
    const r = G.Touch.R();
    const place = (k, ww, hh) => {
      const n = el.querySelector(`[data-k="${k}"]`);
      n.style.left = (pos[k][0] - ww / 2) + 'px'; n.style.top = (pos[k][1] - hh / 2) + 'px';
      n.style.width = ww + 'px'; n.style.height = hh + 'px';
      return n;
    };
    const { w, h } = viewport(), c = G.Touch.layout(w, h);
    place('bar', c.bar.width, c.size).style.setProperty('--slot-size', c.size + 'px');
    place('pause', 40, 40);
    place('stick', r * 2, r * 2).classList.toggle('hidden', mode !== 'fixed');
    el.querySelectorAll('#lay-mode .chip').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
  }

  function save() {
    const { w, h } = viewport(), pad = {};
    for (const k in pos) if (moved[k]) pad[k] = [+(pos[k][0] / w).toFixed(4), +(pos[k][1] / h).toFixed(4)];
    G.Settings.set(G.Touch.padKey(w, h), Object.keys(pad).length ? pad : null);
    G.Settings.set('stickMode', mode);
    G.UI.toast('Botones colocados');
    close();
  }

  function open() {
    if (!el) build();
    mode = G.Settings.get('stickMode') === 'fixed' ? 'fixed' : 'float';
    load();
    el.classList.remove('hidden');
    paint();
  }
  function close() { if (el) el.classList.add('hidden'); }
  const isOpen = () => !!el && !el.classList.contains('hidden');

  return { open, close, get isOpen() { return isOpen(); } };
})();
