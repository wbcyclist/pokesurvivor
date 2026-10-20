const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const watchers = [];
let child = null, pending = null, timer = null, killTimer = null;
let restarting = false, stopping = false;
let languagesDirty = true;

function buildLanguages() {
  if (!languagesDirty) return;
  const modulePath = require.resolve('./build_langs.js');
  delete require.cache[modulePath];
  require(modulePath).build();
  languagesDirty = false;
}

function launch() {
  child = fork(path.join(ROOT, 'server/lan-server.js'), ['--dev', ...args], { stdio: 'inherit' });
  child.on('error', error => console.error('[LAN dev]', error.message));
  child.on('exit', (code, signal) => {
    child = null;
    clearTimeout(killTimer);
    if (stopping) return;
    if (restarting) { restarting = false; launch(); }
    else console.log('[LAN dev] Server stopped (' + (signal || code) + '). Waiting for a file change.');
  });
}

function stopChild() {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  // A broken server must not block the next edit or leave an orphan process.
  killTimer = setTimeout(() => { if (child) child.kill('SIGKILL'); }, 3000);
}

function changed(file, action) {
  if (stopping) return;
  if (/^js\/data\/(?:lang-|names-)/.test(file) || file === 'tools/build_langs.js') languagesDirty = true;
  if (!pending || action === 'restart') pending = { file, action };
  clearTimeout(timer);
  timer = setTimeout(() => {
    const update = pending; pending = null;
    try { buildLanguages(); }
    catch (error) { console.error('[LAN dev] Cannot build languages:', error.message); return; }
    if (update.action === 'restart' || !child) {
      console.log('[LAN dev] Restarting after ' + update.file);
      if (child) { restarting = true; stopChild(); }
      else launch();
    } else if (child.connected && !restarting) {
      console.log('[LAN dev] Reloading browsers after ' + update.file);
      child.send({ type: 'reload' }, () => {});
    }
  }, 180);
}

function watch(directory, recursive, classify) {
  const watcher = fs.watch(path.join(ROOT, directory), { recursive }, (_, filename) => {
    if (!filename) { changed(directory || 'root', 'restart'); return; }
    const file = path.join(directory, String(filename)).split(path.sep).join('/');
    const action = classify(file);
    if (action) changed(file, action);
  });
  watcher.on('error', error => {
    console.error('[LAN dev] File watcher failed:', error.message);
    process.exitCode = 1; shutdown();
  });
  watchers.push(watcher);
}

function shutdown() {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  for (const watcher of watchers) watcher.close();
  stopChild();
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, shutdown);
try {
  buildLanguages();
  // Watch directories so editor saves that replace a file keep working.
  watch('', false, file => file === 'version.json' ? 'restart' : file === 'dev.html' ? 'reload' : null);
  watch('server', true, file => file.endsWith('.js') ? 'restart' : null);
  watch('tools', false, file => file === 'tools/build_langs.js' ? 'reload' : null);
  watch('js', true, file => file === 'js/data/pokedex.js' ? 'restart'
    : file.endsWith('.js') && file !== 'js/app.min.js' && !file.startsWith('js/lang/') ? 'reload' : null);
  watch('css', true, file => file.endsWith('.css') ? 'reload' : null);
  watch('assets', true, file => /\.(png|svg|ico|woff2?|ttf)$/.test(file) ? 'reload' : null);
  console.log('[LAN dev] Watching frontend sources and server code. Edits end active runs and rooms.');
  launch();
} catch (error) {
  console.error('[LAN dev] Cannot watch files:', error.message);
  process.exitCode = 1; shutdown();
}
