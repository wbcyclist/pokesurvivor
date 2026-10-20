const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const { createLanServer } = require('../server/lan-server');

const ROOT = path.resolve(__dirname, '..');
const revisionOf = html => JSON.parse(html.match(/window\.POKESURVIVOR_LAN=(.*?);<\/script>/)[1]).devRevision;

async function fixture(t, development) {
  const app = createLanServer({ development });
  await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  return { app, origin: 'http://127.0.0.1:' + app.server.address().port };
}

async function stream(t, origin) {
  const controller = new AbortController();
  const response = await fetch(origin + '/__lan_dev/events', { signal: controller.signal });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const reader = response.body.getReader();
  t.after(() => { controller.abort(); return reader.cancel().catch(() => {}); });
  let buffer = '';
  return async function next() {
    for (;;) {
      const end = buffer.indexOf('\n\n');
      if (end >= 0) {
        const event = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const data = event.match(/^data: (.+)$/m);
        if (data) return JSON.parse(data[1]);
      } else {
        const chunk = await reader.read();
        if (chunk.done) throw new Error('Reload stream closed');
        buffer += new TextDecoder().decode(chunk.value);
      }
    }
  };
}

test('LAN development routes load sources and preserve room and language links', async t => {
  const { origin } = await fixture(t, true);
  for (const entry of ['/', '/index.html']) {
    const response = await fetch(origin + entry + '?room=ABC234', { redirect: 'manual' });
    assert.equal(response.status, 307);
    const target = new URL(response.headers.get('location'), origin);
    assert.equal(target.pathname, '/dev.html');
    assert.equal(target.searchParams.get('room'), 'ABC234');
  }
  for (const entry of ['/zh/', '/en/index.html', '/zh-tw/']) {
    const response = await fetch(origin + entry + '?room=ABC234', { redirect: 'manual' });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<base href="\/">/);
    assert.match(html, /src="js\/game.js"/);
    assert.doesNotMatch(html, /src="js\/app.min.js/);
  }
  const html = await (await fetch(origin + '/dev.html')).text();
  assert.ok(revisionOf(html));
  assert.match(html, /src="js\/game.js"/);
  assert.doesNotMatch(html, /src="js\/app.min.js/);
  assert.match(html, /src="\/__lan_dev\/client.js"/);
  assert.equal((await fetch(origin + '/__lan_dev/client.js')).status, 200);
});

test('normal LAN serving has no development endpoints, redirects, or reload scripts', async t => {
  const { origin } = await fixture(t, false);
  const response = await fetch(origin + '/', { redirect: 'manual' });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /app.min.js\?v=/);
  assert.doesNotMatch(html, /__lan_dev|devRevision/);
  for (const route of ['/__lan_dev/client.js', '/__lan_dev/events']) {
    assert.equal((await fetch(origin + route)).status, 404);
  }
});

test('reload revisions reach all devices and survive a missed connection', { timeout: 10000 }, async t => {
  const { app, origin } = await fixture(t, true);
  const initial = revisionOf(await (await fetch(origin + '/dev.html')).text());
  const first = await stream(t, origin), second = await stream(t, origin);
  assert.equal((await first()).revision, initial);
  assert.equal((await second()).revision, initial);
  app.reload();
  const changed = await first();
  assert.notEqual(changed.revision, initial);
  assert.deepEqual(await second(), changed);
  const reconnected = await stream(t, origin);
  assert.deepEqual(await reconnected(), changed);
  assert.equal(revisionOf(await (await fetch(origin + '/dev.html')).text()), changed.revision);
});

test('the browser waits for a new ready revision and saves the run once before reloading', () => {
  const effects = [];
  let connection;
  class EventSource {
    constructor(url) { assert.equal(url, '/__lan_dev/events'); connection = this; }
    close() { effects.push('close'); }
  }
  const context = {
    window: { POKESURVIVOR_LAN: { devRevision: 'initial' }, G: { Game: { quit: () => effects.push('save') } } },
    EventSource, location: { reload: () => effects.push('reload') }, console
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'server/lan-dev-client.js'), 'utf8'), context);
  connection.onmessage({ data: JSON.stringify({ revision: 'initial' }) });
  assert.deepEqual(effects, []);
  if (connection.onerror) connection.onerror();
  assert.deepEqual(effects, []);
  connection.onmessage({ data: JSON.stringify({ revision: 'restarted' }) });
  connection.onmessage({ data: JSON.stringify({ revision: 'another-edit' }) });
  assert.deepEqual(effects, ['close', 'save', 'reload']);
});

test('reload still works when a frontend edit prevents startup or breaks the quit path', () => {
  for (const game of [undefined, { Game: { quit() { throw new Error('Broken edit'); } } }]) {
    let connection, reloads = 0;
    class EventSource {
      constructor() { connection = this; }
      close() {}
    }
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'server/lan-dev-client.js'), 'utf8'), {
      window: { POKESURVIVOR_LAN: { devRevision: 'initial' }, G: game },
      EventSource, location: { reload() { reloads++; } }, console: { warn() {} }
    });
    connection.onmessage({ data: JSON.stringify({ revision: 'fixed' }) });
    assert.equal(reloads, 1);
  }
});

async function until(check, description) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { const result = await check(); if (result) return result; } catch { /* Retry during startup. */ }
    await delay(50);
  }
  throw new Error('Timed out: ' + description);
}

test('the dev command watches sources, restarts server data, recovers from errors, and stops its child', { timeout: 30000 }, async t => {
  fs.mkdirSync(path.join(ROOT, 'work_tmp'), { recursive: true });
  const root = fs.mkdtempSync(path.join(ROOT, 'work_tmp/lan-dev-'));
  for (const directory of ['tools', 'server', 'js/data', 'css', 'assets']) fs.mkdirSync(path.join(root, directory), { recursive: true });
  for (const file of ['tools/dev-lan.js', 'tools/build_langs.js', ...require('../tools/build_langs.js').SOURCES,
    'server/lan-server.js', 'server/lan-dev-client.js', 'version.json', 'js/data/pokedex.js']) {
    fs.copyFileSync(path.join(ROOT, file), path.join(root, file));
  }
  fs.writeFileSync(path.join(root, 'dev.html'), '<html><head></head><body>Initial</body></html>');
  fs.writeFileSync(path.join(root, 'css/style.css'), 'body {}');
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, [path.join(root, 'tools/dev-lan.js'), '--host', '127.0.0.1', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const exited = once(child, 'exit');
  t.after(async () => { if (child.exitCode === null) child.kill('SIGTERM'); await exited; });
  const origin = 'http://127.0.0.1:' + port;
  const read = async () => {
    const response = await fetch(origin + '/dev.html', { signal: AbortSignal.timeout(500) });
    if (!response.ok) throw new Error('Not ready');
    return revisionOf(await response.text());
  };
  let revision = await until(read, 'development startup');
  const next = await stream(t, origin);
  assert.equal((await next()).revision, revision);
  // Atomic saves must not detach the watcher from the replacement file.
  const css = path.join(root, 'css/style.css');
  fs.writeFileSync(css + '.tmp', 'body { color: red; }');
  fs.renameSync(css + '.tmp', css);
  const update = await next();
  assert.notEqual(update.revision, revision); revision = update.revision;
  fs.appendFileSync(css, '\nbody { color: blue; }');
  const updateAgain = await next();
  assert.notEqual(updateAgain.revision, revision); revision = updateAgain.revision;
  fs.appendFileSync(path.join(root, 'js/data/lang-zh-CN.js'), '\nG.I18n.add({"Merge probe":"合并验证"}, "zh-CN");\n');
  const languageUpdate = await next();
  assert.notEqual(languageUpdate.revision, revision); revision = languageUpdate.revision;
  assert.match(fs.readFileSync(path.join(root, 'js/lang/zh-Hans.js'), 'utf8'), /合并验证/);
  for (const file of ['dev.html', 'js/source.js', 'assets/probe.svg']) {
    fs.appendFileSync(path.join(root, file), '\n');
    const update = await next();
    assert.notEqual(update.revision, revision); revision = update.revision;
  }
  assert.equal((output.match(/development is ready/g) || []).length, 1, 'Frontend edits must not restart the server');
  fs.writeFileSync(path.join(root, 'js/app.min.js'), '// Generated bundle.');
  fs.appendFileSync(path.join(root, 'js/lang/zh-Hans.js'), '\n');
  fs.writeFileSync(path.join(root, 'unrelated.log'), 'Unrelated output.');
  await delay(350);
  assert.equal(await read(), revision, 'Generated files and logs must not trigger a reload');
  fs.appendFileSync(path.join(root, 'js/data/pokedex.js'), '\n// Updated server data.\n');
  revision = await until(async () => { const value = await read(); return value !== revision && value; }, 'server data restart');
  const server = path.join(root, 'server/lan-server.js'), source = fs.readFileSync(server, 'utf8');
  fs.appendFileSync(server, '\ninvalid syntax !!!');
  await until(() => output.includes('SyntaxError'), 'server error');
  fs.writeFileSync(server, source);
  revision = await until(async () => { const value = await read(); return value !== revision && value; }, 'recovery after server fix');
  fs.writeFileSync(path.join(root, 'version.json'), '{"v":"test-version"}\n');
  await until(async () => { const value = await read(); return value !== revision; }, 'build version restart');
  assert.match(await (await fetch(origin + '/dev.html')).text(), /"version":"test-version"/);
  assert.match(output, /Restarting/);
  child.kill('SIGTERM');
  assert.equal((await exited)[0], 0, output);
  await assert.rejects(read());
});
