/* Local rooms and transport use the same co-op messages as online rooms. */
G.Lan = (() => {
  const config = window.POKESURVIVOR_LAN;
  const enabled = !!config;
  const tag = document.querySelector('script[src*="app.min.js?v="]');
  const version = tag ? (tag.getAttribute('src').match(/v=([0-9a-f]+)/) || [])[1] : config && config.version;
  const ERRORS = {
    'not-found': 'Esa sala ya no existe.', full: 'La sala está llena (máximo 4).',
    playing: 'La partida de esa sala ya ha empezado.',
    'host-only': 'Sólo el anfitrión puede empezar la partida.',
    'not-ready': 'Esperando a que todos vuelvan a la sala.',
    profile: 'Escribe un nombre de 1 a 16 letras, números o espacios.',
    version: 'La versión no coincide. Reinicia el servidor local y recarga todos los dispositivos.',
    busy: 'El servidor local está lleno. Inténtalo de nuevo más tarde.',
    connection: 'No se pudo conectar al servidor local. Comprueba la dirección y la red.',
    'in-room': 'Sal de tu sala antes de entrar en otra.',
    'room-required': 'Esa sala ya no existe.'
  };
  let socket = null, connecting = null, cancelConnect = null, uid = null, room = null, run = null;
  let sequence = 0, heartbeat = 0, lastMessage = 0;
  const pending = new Map(), peers = new Set();
  const listeners = new Set(), handlers = new Set(), peerHandlers = new Set();
  const stats = { sent: 0, recv: 0, relaySent: 0 };
  const failure = code => ({ ok: false, error: ERRORS[code] || ERRORS.connection });
  const emit = (set, ...args) => { for (const fn of set) { try { fn(...args); } catch (error) { console.warn('[LAN]', error); } } };

  function syncMembers() {
    const next = new Set(room ? room.members.filter(m => m.uid !== uid && (room.isHost || m.uid === room.host)).map(m => m.uid) : []);
    for (const peer of [...peers]) if (!next.has(peer)) { peers.delete(peer); emit(peerHandlers, peer, 'closed'); }
    for (const peer of next) if (!peers.has(peer)) { peers.add(peer); emit(peerHandlers, peer, 'lan'); }
  }
  function setRoom(value, reason) {
    const previous = room;
    room = value ? { ...value, isHost: value.host === uid, lan: true } : null;
    if (!room) run = null;
    syncMembers();
    emit(listeners, !room && previous && reason ? 'room-closed' : 'room');
  }
  function close() {
    const current = socket;
    const wasHosting = room && room.isHost;
    socket = null;
    clearInterval(heartbeat); heartbeat = 0;
    for (const task of pending.values()) { clearTimeout(task.timer); task.resolve(failure('connection')); }
    pending.clear();
    if (cancelConnect) cancelConnect();
    setRoom(null, 'connection');
    if (wasHosting && G.Coop && G.Coop.active) G.Game.quit();
    uid = null;
    if (current) current.close();
  }
  function raw(message) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    if (socket.bufferedAmount > 2 * 1024 * 1024) { close(); return false; }
    try { socket.send(JSON.stringify(message)); return true; }
    catch { close(); return false; }
  }
  function request(op, data = {}) {
    return new Promise(resolve => {
      const id = ++sequence;
      const timer = setTimeout(() => { close(); }, 8000);
      pending.set(id, { resolve, timer });
      if (!raw({ ...data, op, id })) {
        clearTimeout(timer); pending.delete(id); resolve(failure('connection'));
      }
    });
  }
  function connect() {
    if (connecting) return connecting;
    if (socket && socket.readyState === WebSocket.OPEN && uid) return Promise.resolve({ ok: true });
    if (!enabled) return Promise.resolve(failure('connection'));
    connecting = new Promise(resolve => {
      let done = false;
      const finish = result => {
        if (done) return;
        done = true; clearTimeout(timer); cancelConnect = null;
        resolve(result);
      };
      const timer = setTimeout(() => { close(); }, 8000);
      cancelConnect = () => finish(failure('connection'));
      let ws;
      try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/lan'); }
      catch { finish(failure('connection')); return; }
      socket = ws;
      ws.onclose = () => { if (socket === ws) close(); };
      ws.onerror = () => { if (socket === ws) close(); };
      ws.onmessage = async event => {
        if (socket !== ws) return;
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (!msg || typeof msg !== 'object') return;
        lastMessage = Date.now();
        if (msg.op === 'welcome') {
          uid = msg.uid;
          const result = await request('hello', { protocol: config.protocol, version });
          if (socket !== ws) return;
          finish(result);
          if (!result.ok) { close(); return; }
          heartbeat = setInterval(() => {
            if (Date.now() - lastMessage > 12000) close();
            else raw({ op: 'ping' });
          }, 3000);
        } else if (msg.op === 'reply') {
          const task = pending.get(msg.id);
          if (!task) return;
          pending.delete(msg.id); clearTimeout(task.timer);
          task.resolve(msg.ok ? msg : failure(msg.error));
        } else if (msg.op === 'room') setRoom(msg.room, msg.reason);
        else if (msg.op === 'start' && room && msg.cfg && msg.cfg.room === room.id && msg.cfg.host === room.host && msg.cfg.run !== run) {
          run = msg.cfg.run;
          emit(handlers, room.host, msg.cfg);
        } else if (msg.op === 'data' && room && msg.run === run && peers.has(msg.from)) {
          stats.recv++; emit(handlers, msg.from, msg.data);
        }
      };
    }).finally(() => { connecting = null; });
    return connecting;
  }
  function memberInfo(name) {
    const save = G.DB.save;
    return { name: name || (room && room.members.find(m => m.uid === uid)?.name) || G.DB.user || 'Player',
      dex: save.partner, shiny: !!save.partnerShiny && G.DB.ownsShiny(save.partner) };
  }
  async function enter(op, name, code) {
    const connected = await connect();
    if (!connected.ok) return connected;
    return request(op, { profile: memberInfo(name), code });
  }
  function send(to, message) {
    if (!room || !run || !peers.has(to)) return;
    if (raw({ op: 'data', to, run, data: message })) stats.sent++;
  }
  const net = {
    open() {}, close() { setRoom(null); }, syncMembers, send,
    toHost(message) { if (room && !room.isHost) send(room.host, message); },
    broadcast(message, except) { for (const peer of peers) if (peer !== except) send(peer, message); },
    on(fn) { handlers.add(fn); }, off(fn) { handlers.delete(fn); },
    onPeer(fn) { peerHandlers.add(fn); },
    mode(peer) { return peers.has(peer) ? 'lan' : 'closed'; },
    slow(peer) { return !peers.has(peer); }, peers() { return [...peers]; },
    get open_() { return !!room; }, get isHost() { return !!room && room.isHost; },
    get uid() { return uid; }, get hostUid() { return room && room.host; }, stats
  };
  if (enabled) addEventListener('pagehide', close);
  return {
    enabled, net, close,
    create(name) { return enter('create', name); },
    join(name, code) { return enter('join', name, code); },
    async leaveRoom() { if (room) await request('leave'); },
    startRun() { return request('start'); },
    setOpen(open) { if (room && room.isHost && open) raw({ op: 'reopen' }); },
    setPlaying(playing) { if (room && !playing) raw({ op: 'finish' }); },
    refreshMember() { if (room && G.Game.state === 'ui') raw({ op: 'member', profile: memberInfo(), ready: true }); },
    on(fn) { listeners.add(fn); },
    get room() { return room; }, get uid() { return uid; },
    get me() { return room && room.members.find(m => m.uid === uid) || null; },
    get addresses() { return config && config.addresses || []; }
  };
})();
