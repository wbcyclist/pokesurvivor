const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { WebSocketServer, WebSocket } = require('ws');

const ROOT = path.resolve(__dirname, '..');
const PROTOCOL = 1, MAX_PLAYERS = 4, MAX_CLIENTS = 64;
const MAX_PAYLOAD = 512 * 1024, MAX_BUFFER = 2 * 1024 * 1024;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };

function localAddresses() {
  return [...new Set(Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal)
    .map(a => a.address))];
}

function createLanServer({ development = false } = {}) {
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).v;
  const data = { G: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/data/pokedex.js'), 'utf8'), data);
  const dex = new Set(data.G.DEX.map(mon => mon.dex));
  const rooms = new Map(), clients = new Map();
  const reloadClients = new Set();
  let devRevision = crypto.randomUUID();
  const addresses = localAddresses();
  const hosts = new Set(['localhost', '127.0.0.1', '[::1]', os.hostname().toLowerCase(), ...addresses]);
  const pages = new Set(['en', 'zh', 'zh-tw', 'apoyar', 'contacto', 'guia', 'legendarios',
    'logros', 'movimientos', 'novedades', 'objetos', 'pokedex', 'shinies', 'tipos']);
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD, perMessageDeflate: false });
  const server = http.createServer((req, res) => { serve(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); }); });

  function allowedHost(req) {
    try {
      const url = new URL('http://' + req.headers.host);
      return hosts.has(url.hostname.toLowerCase()) && Number(url.port || 80) === server.address().port;
    } catch { return false; }
  }
  function urls() {
    const bound = server.address();
    return addresses.filter(address => ['0.0.0.0', '::', address].includes(bound.address))
      .map(address => 'http://' + address + ':' + bound.port + (development ? '/dev.html' : '/'));
  }
  function sendRevision(res) {
    if (!res.write('data: ' + JSON.stringify({ revision: devRevision }) + '\n\n')) res.end();
  }
  async function serve(req, res) {
    if (!allowedHost(req)) { res.writeHead(403); res.end(); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    let file, base = '';
    try { file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1); }
    catch { res.writeHead(400); res.end(); return; }
    if (!file || file.endsWith('/')) file += 'index.html';
    if (development) {
      const entry = file.match(/^(?:(en|zh|zh-tw)\/)?index\.html$/);
      if (entry && entry[1]) {
        // Keep the locale path for the game's existing language detection.
        file = 'dev.html'; base = '<base href="/">';
      } else if (entry) {
        const target = new URL(req.url, 'http://localhost');
        target.pathname = '/dev.html';
        res.writeHead(307, { Location: target.pathname + target.search, 'Cache-Control': 'no-store' });
        res.end(); return;
      }
      if (file === '__lan_dev/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
        if (req.method === 'HEAD') { res.end(); return; }
        res.write('retry: 500\n\n');
        reloadClients.add(res);
        res.on('close', () => reloadClients.delete(res));
        sendRevision(res); return;
      }
      if (file === '__lan_dev/client.js') {
        res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' });
        res.end(req.method === 'HEAD' ? undefined : await fs.promises.readFile(path.join(__dirname, 'lan-dev-client.js')));
        return;
      }
    }
    const parts = file.split('/'), ext = path.extname(file);
    const publicFile = parts.length === 1
      ? ['index.html', 'dev.html', '404.html', 'version.json', 'manifest.webmanifest', 'sw.js', 'robots.txt', 'sitemap.xml', 'favicon.ico'].includes(file)
      : (parts[0] === 'js' && ext === '.js') || (parts[0] === 'css' && ext === '.css')
        || (parts[0] === 'assets' && ['.png', '.svg', '.ico', '.woff2', '.woff', '.ttf'].includes(ext))
        || (pages.has(parts[0]) && ext === '.html');
    const missing = () => { res.writeHead(404); res.end(); };
    if (!publicFile || parts.some(part => part.startsWith('.') || part.includes('\\') || part.includes('\0'))) return missing();
    let resolved, stat;
    try { resolved = await fs.promises.realpath(path.join(ROOT, file)); stat = await fs.promises.stat(resolved); }
    catch { return missing(); }
    if (!resolved.startsWith(ROOT + path.sep) || !stat.isFile()) return missing();
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    if (ext === '.html') {
      // Capture the revision before reading so an edit during the read triggers another reload.
      const config = JSON.stringify({ protocol: PROTOCOL, version, addresses: urls(), ...(development ? { devRevision } : {}) }).replace(/</g, '\\u003c');
      const reloadScript = development ? '<script defer src="/__lan_dev/client.js"></script>' : '';
      const html = (await fs.promises.readFile(resolved, 'utf8')).replace('<head>', '<head>' + base + '<script>window.POKESURVIVOR_LAN=' + config + ';</script>' + reloadScript);
      res.end(req.method === 'HEAD' ? undefined : html);
    } else {
      res.setHeader('Content-Length', stat.size);
      if (req.method === 'HEAD') res.end();
      else { const stream = fs.createReadStream(resolved); stream.on('error', () => res.destroy()); stream.pipe(res); }
    }
  }

  function send(client, message) {
    if (client.ws.readyState !== WebSocket.OPEN) return;
    // Frames contain one-time events. Disconnect a slow peer instead of dropping events.
    if (client.ws.bufferedAmount > MAX_BUFFER) { client.ws.terminate(); return; }
    client.ws.send(JSON.stringify(message), error => { if (error) client.ws.terminate(); });
  }
  function snapshot(room) {
    return { id: room.id, host: room.host, open: room.open,
      members: [...room.members.values()].map(m => ({ uid: m.uid, ...m.profile, ready: m.ready })) };
  }
  function publish(room) {
    const message = { op: 'room', room: snapshot(room) };
    for (const member of room.members.values()) send(member, message);
  }
  function leave(client) {
    const room = client.room;
    if (!room) return;
    client.room = null; client.playing = false; client.ready = false;
    send(client, { op: 'room', room: null });
    if (room.host === client.uid) {
      rooms.delete(room.id);
      for (const member of room.members.values()) {
        if (member === client) continue;
        member.room = null; member.playing = false; member.ready = false;
        send(member, { op: 'room', room: null, reason: 'host-left' });
      }
    } else { room.members.delete(client.uid); publish(room); }
  }
  function profileOf(profile) {
    if (!profile || typeof profile.name !== 'string' || !/^[\p{L}\p{N} _.-]{1,16}$/u.test(profile.name.trim())
        || !dex.has(profile.dex) || typeof profile.shiny !== 'boolean') return null;
    return { name: profile.name.trim(), dex: profile.dex, shiny: profile.shiny };
  }
  function handle(client, msg) {
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
    const reply = (error, extra = {}) => {
      if (Number.isSafeInteger(msg.id)) send(client, { op: 'reply', id: msg.id, ok: !error, ...extra, ...(error ? { error } : {}) });
    };
    if (msg.op === 'hello') {
      client.compatible = msg.protocol === PROTOCOL && msg.version === version;
      return reply(client.compatible ? null : 'version');
    }
    if (!client.compatible) return reply('version');
    if (msg.op === 'ping') { send(client, { op: 'pong' }); return; }
    if (msg.op === 'leave') { leave(client); return reply(); }
    if (msg.op === 'create' || msg.op === 'join') {
      if (client.room) return reply('in-room');
      const profile = profileOf(msg.profile);
      if (!profile) return reply('profile');
      let room;
      if (msg.op === 'create') {
        if (rooms.size >= 16) return reply('busy');
        let code;
        do { code = Array.from(crypto.randomBytes(6), n => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n % 32]).join(''); } while (rooms.has(code));
        room = { id: code, host: client.uid, open: true, run: null, members: new Map() };
        rooms.set(code, room);
      } else {
        const code = typeof msg.code === 'string' ? msg.code.trim().toUpperCase() : '';
        room = rooms.get(code);
        if (!room) return reply('not-found');
        if (!room.open) return reply('playing');
        if (room.members.size >= MAX_PLAYERS) return reply('full');
      }
      Object.assign(client, { profile, room, ready: true, playing: false });
      room.members.set(client.uid, client);
      publish(room);
      return reply(null, { room: snapshot(room) });
    }
    const room = client.room;
    if (!room) return reply('room-required');
    const isHost = room.host === client.uid;
    if (msg.op === 'member') {
      const profile = profileOf(msg.profile);
      if (!profile) return reply('profile');
      if (client.playing) return reply('playing');
      client.profile = profile; client.ready = msg.ready === true;
      publish(room); return reply();
    }
    if (msg.op === 'finish') {
      client.playing = false; client.ready = false;
      if (isHost) room.run = null;
      publish(room); return reply();
    }
    if (msg.op === 'reopen') {
      if (!isHost) return reply('host-only');
      if (room.run) return reply('playing');
      room.open = true; publish(room); return reply();
    }
    if (msg.op === 'start') {
      if (!isHost) return reply('host-only');
      if (!room.open || room.run) return reply('playing');
      if (room.members.size < 2 || [...room.members.values()].some(m => !m.ready)) return reply('not-ready');
      room.open = false; room.run = crypto.randomUUID();
      const cfg = { k: 'start', room: room.id, run: room.run, seed: crypto.randomInt(1000000), host: room.host,
        members: [...room.members.values()].map(m => ({ uid: m.uid, ...m.profile })) };
      for (const member of room.members.values()) { member.ready = false; member.playing = true; }
      publish(room);
      for (const member of room.members.values()) send(member, { op: 'start', cfg });
      return reply();
    }
    if (msg.op === 'data') {
      if (!room.run || msg.run !== room.run || !client.playing) return reply('stale-run');
      if (!msg.data || msg.data.k !== 'f') return reply('invalid');
      const target = room.members.get(msg.to);
      if (!target || target === client || (!isHost && target.uid !== room.host)) return reply('peer');
      if (target.playing) send(target, { op: 'data', from: client.uid, run: room.run, data: msg.data });
      return reply();
    }
    reply('invalid');
  }

  server.on('upgrade', (req, socket, head) => {
    if (!allowedHost(req) || req.url !== '/lan' || req.headers.origin !== 'http://' + req.headers.host) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    if (clients.size >= MAX_CLIENTS) { socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', ws => {
    const client = { ws, uid: crypto.randomUUID(), room: null, compatible: false, alive: true, count: 0, since: Date.now() };
    clients.set(client.uid, client);
    send(client, { op: 'welcome', uid: client.uid });
    ws.on('pong', () => { client.alive = true; });
    ws.on('error', () => ws.terminate());
    ws.on('close', () => { leave(client); clients.delete(client.uid); });
    ws.on('message', (data, binary) => {
      if (Date.now() - client.since >= 1000) { client.since = Date.now(); client.count = 0; }
      if (binary || ++client.count > 240) { ws.close(1008, 'Message limit'); return; }
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      handle(client, msg);
    });
  });
  const heartbeat = setInterval(() => {
    for (const res of reloadClients) if (!res.write(': keep-alive\n\n')) res.end();
    for (const client of clients.values()) {
      if (!client.alive) { client.ws.terminate(); continue; }
      client.alive = false; client.ws.ping();
    }
  }, 5000);
  heartbeat.unref();

  return {
    server, version, urls,
    reload() {
      if (!development) return;
      devRevision = crypto.randomUUID();
      for (const res of reloadClients) sendRevision(res);
    },
    listen(port = 8765, host = '0.0.0.0') {
      if (host !== '0.0.0.0' && host !== '::') hosts.add(host.toLowerCase());
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => { server.off('error', reject); resolve(); });
      });
    },
    async close() {
      clearInterval(heartbeat);
      for (const res of reloadClients) res.end();
      for (const client of clients.values()) client.ws.terminate();
      await new Promise(resolve => wss.close(resolve));
      await new Promise(resolve => server.close(resolve));
    }
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  const port = Number(option('--port', '8765')), host = option('--host', '0.0.0.0');
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !host) throw new Error('Use --port 1..65535 and --host ADDRESS.');
  const development = args.includes('--dev');
  const app = createLanServer({ development });
  if (development && process.send) process.on('message', message => {
    if (message && message.type === 'reload') app.reload();
  });
  const shutdown = async () => { await app.close(); if (process.connected) process.disconnect(); };
  app.listen(port, host).then(() => {
    console.log('PokéSurvivor LAN' + (development ? ' development' : '') + ' is ready. Keep this terminal open.');
    console.log('This computer: http://localhost:' + port + (development ? '/dev.html' : '/'));
    for (const url of app.urls()) console.log('Same network:  ' + url);
    console.log('Open the same address on each device, choose Guest, then Local network.');
  }).catch(async error => { console.error('Cannot start LAN server:', error.message); process.exitCode = 1; await shutdown(); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, shutdown);
}

module.exports = { createLanServer };
