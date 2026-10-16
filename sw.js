/* ============ sw.js — para poder instalar el juego como app ============
 * - Código del juego (html, js, css): primero la red, así cada actualización
 *   llega al momento; si no hay conexión, la última copia guardada.
 * - Sprites, iconos y fuente: no cambian nunca, se sirven de la caché
 *   (se van guardando según se usan: no se descarga todo de golpe).
 * - Firebase y demás servicios de fuera no se tocan.
 */
const CODE = 'ps-code-v1', ART = 'ps-art-v1', MAX_CODE_ENTRIES = 128;
const CORE = ['./', './index.html', './css/style.css', './manifest.webmanifest'];
const coreURLs = new Set(CORE.map(p => new URL(p, location.href).href));
let codeWrites = Promise.resolve();

function cacheKey(req) {
  const url = new URL(req.url);
  const version = url.pathname.endsWith('/js/app.min.js') && url.searchParams.get('v');
  url.search = '';
  if (version) url.searchParams.set('v', version);
  return url.href;
}

async function pruneCode(cache) {
  const keys = await cache.keys();
  const bundles = keys.filter(k => new URL(k.url).pathname.endsWith('/js/app.min.js')).slice(-2);
  const keepBundles = new Set(bundles.map(k => k.url)), retained = [];
  for (const req of keys) {
    const url = new URL(req.url);
    if (url.pathname.endsWith('/version.json') || cacheKey(req) !== req.url
        || (url.pathname.endsWith('/js/app.min.js') && !keepBundles.has(req.url))) await cache.delete(req);
    else retained.push(req);
  }
  let count = retained.length;
  for (const req of retained) {
    if (count <= MAX_CODE_ENTRIES) break;
    if (coreURLs.has(req.url) || keepBundles.has(req.url)) continue;
    await cache.delete(req); count--;
  }
}

function saveCode(key, response) {
  codeWrites = codeWrites.catch(() => {}).then(async () => {
    const cache = await caches.open(CODE);
    await cache.put(key, response);
    await pruneCode(cache);
  });
  return codeWrites;
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CODE).then(c => c.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CODE && k !== ART).map(k => caches.delete(k))))
    .then(() => caches.open(CODE)).then(pruneCode).catch(() => {}).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.endsWith('/version.json') || req.cache === 'no-store') {
    e.respondWith(fetch(req));
    return;
  }
  const art = /\/assets\/(pokemon|icons|fonts)\//.test(url.pathname);
  const key = cacheKey(req);
  let save = Promise.resolve();
  let response;
  if (art) {
    response = (async () => {
      let cache;
      try {
        cache = await caches.open(ART);
        const hit = await cache.match(key);
        if (hit) return hit;
      } catch (err) { /* la red sigue disponible sin caché */ }
      const res = await fetch(req);
      if (res.ok && cache) save = cache.put(key, res.clone());
      return res;
    })();
  } else {
    response = fetch(req).then(res => {
      if (res.ok) save = saveCode(key, res.clone());
      return res;
    }).catch(async () => {
      // Sin red: la copia guardada. La página de inicio sólo sirve de respaldo
      // al abrir la web (nunca en lugar de un script o una imagen).
      try {
        const hit = await caches.match(key);
        if (hit) return hit;
        if (req.mode === 'navigate') return (await caches.match(new URL('./index.html', location.href).href)) || Response.error();
      } catch (err) { /* sin almacenamiento disponible */ }
      return Response.error();
    });
  }
  e.respondWith(response);
  e.waitUntil(response.then(() => save).catch(() => {}));
});
