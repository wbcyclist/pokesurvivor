G.LanUI = (() => {
  const $ = G.UI.$;
  let busy = false;

  function init() {
    $('lan-create').onclick = () => enter(false);
    $('lan-join-form').onsubmit = event => { event.preventDefault(); enter(true); };
    $('lan-name').addEventListener('input', () => $('lan-error').textContent = '');
  }
  function open() {
    if (G.Social.room) { G.LobbyUI.open(); return; }
    G.UI.show('scr-lan', true);
    $('lan-controls').classList.toggle('hidden', !G.Lan.enabled);
    $('lan-setup').classList.toggle('hidden', G.Lan.enabled);
    $('lan-error').textContent = '';
    try { $('lan-name').value = localStorage.getItem('ps.lan.name') || (G.DB.guest ? '' : G.DB.user || ''); }
    catch { $('lan-name').value = ''; }
    const code = new URLSearchParams(location.search).get('room');
    if (code && /^[A-Z2-9]{6}$/i.test(code)) $('lan-code').value = code.toUpperCase();
  }
  async function enter(join) {
    if (busy) return;
    const name = $('lan-name').value.trim(), code = $('lan-code').value.trim().toUpperCase();
    if (!/^[\p{L}\p{N} _.-]{1,16}$/u.test(name)) {
      $('lan-error').textContent = 'Escribe un nombre de 1 a 16 letras, números o espacios.'; return;
    }
    if (join && !/^[A-Z2-9]{6}$/.test(code)) { $('lan-error').textContent = 'Escribe el código de 6 caracteres de la sala.'; return; }
    busy = true;
    $('lan-create').disabled = $('lan-join').disabled = true;
    $('lan-error').textContent = 'Conectando…';
    try {
      const result = await (join ? G.Lan.join(name, code) : G.Lan.create(name));
      if (!result.ok) { $('lan-error').textContent = result.error; return; }
      try { localStorage.setItem('ps.lan.name', name); } catch { /* Storage is optional. */ }
      $('lan-error').textContent = '';
      if (G.Game.state === 'ui') G.LobbyUI.open();
    } finally {
      busy = false;
      $('lan-create').disabled = $('lan-join').disabled = false;
    }
  }
  function renderRoom(room) {
    const panel = $('lobby-lan');
    panel.classList.toggle('hidden', !room.lan);
    if (!room.lan) return;
    $('lobby-code').textContent = room.id;
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    const addresses = local && G.Lan.addresses.length ? G.Lan.addresses : [location.origin + '/'];
    const link = $('lobby-link');
    link.value = addresses.map(address => new URL('?room=' + room.id, address).href).join('\n');
    link.rows = addresses.length;
  }
  return { init, open, renderRoom };
})();
