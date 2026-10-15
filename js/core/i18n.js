/* ============ i18n.js — idiomas (español / inglés / chino simplificado / chino tradicional) ============
 * El juego está escrito en español. Los otros idiomas usan su diccionario
 * en js/data/lang-*.js para traducir lo que se enseña, sin tener que
 * tocar cada pantalla:
 *   - el DOM (menús, cartas, avisos...) con un MutationObserver,
 *   - el canvas (HUD, avisos, números) envolviendo fillText/strokeText,
 *   - confirm()/alert().
 *
 * El diccionario usa el texto español como clave. Tres niveles:
 *   1. frase exacta                    'Volver' -> 'Back'
 *   2. patrón con huecos {x}           '¡Has conseguido a {x} shiny!' -> 'You got a shiny {x}!'
 *                                      (lo que cae en el hueco también se traduce)
 *   3. trozos dentro de un texto más largo, sólo palabras enteras
 * Lo que escriben los jugadores (apodos) va marcado con translate="no".
 *
 * Idioma: el elegido en Ajustes; si no, /en/, /zh/ o /zh-tw/ en la dirección o el del navegador
 * (español, chino simplificado, chino tradicional o inglés como idioma de respaldo).
 */
G.I18n = (() => {
  const KEY = 'ps.lang';
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* nada */ }
  const byPath = /\/zh-tw(\/|$)/.test(location.pathname) ? 'zh-TW' : /\/zh(\/|$)/.test(location.pathname) ? 'zh-CN' : /\/en(\/|$)/.test(location.pathname) ? 'en' : null;
  const nav = ((navigator.languages && navigator.languages[0]) || navigator.language || 'es').toLowerCase();
  const supported = ['es', 'en', 'zh-CN', 'zh-TW'];
  const chinese = nav.includes('-hant') || (!nav.includes('-hans') && /^zh-(tw|hk|mo)(-|$)/.test(nav)) ? 'zh-TW' : 'zh-CN';
  const lang = supported.includes(saved) ? saved : byPath || (nav.startsWith('zh') ? chinese : nav.startsWith('es') ? 'es' : 'en');
  document.documentElement.lang = lang;

  const exact = new Map(), exactLow = new Map();
  let patterns = [], frag = null, fragLow = null, fragMap = new Map();
  const cache = new Map();
  const L = '\\p{L}\\p{N}';
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /** Añade traducciones { 'texto en español': 'English text' }. */
  function add(dict, locale = 'en') {
    if (locale !== lang) return;
    const fr = [];
    for (const [es, en] of Object.entries(dict)) {
      if (!en || es === en) continue;
      if (es.includes('{x}')) {
        const parts = es.split('{x}').map(reEsc);
        patterns.push({ re: new RegExp('^' + parts.join('(.+?)') + '$', 'u'), reI: new RegExp('^' + parts.join('(.+?)') + '$', 'iu'), en, specificity: es.replace(/\{x\}/g, '').length });
      } else {
        exact.set(es, en);
        exactLow.set(es.toLowerCase(), en);
        if (es.length >= (lang.startsWith('zh') ? 2 : 4) || /\s/.test(es)) { fr.push(es); fragMap.set(es.toLowerCase(), en); }
      }
    }
    // Una sola expresión con todos los trozos (los más largos primero), sólo palabras enteras.
    const all = [...fragMap.keys()].sort((a, b) => b.length - a.length).map(reEsc).join('|');
    frag = all ? new RegExp(`(?<![${L}])(${all})(?![${L}])`, 'giu') : null;
    patterns.sort((a, b) => b.specificity - a.specificity);
    cache.clear();
  }

  function keepCase(src, en) {
    if (src === src.toUpperCase() && /\p{L}/u.test(src)) return en.toUpperCase();
    return en;
  }

  /** Traduce un texto (sin espacios de los lados) al idioma actual. */
  function t(s) {
    if (lang === 'es' || !s || typeof s !== 'string') return s;
    if (!/\p{L}/u.test(s)) return s;
    const c = cache.get(s);
    if (c !== undefined) return c;
    let r = core(s);
    if (cache.size > 4000) cache.clear();
    cache.set(s, r);
    return r;
  }

  function core(s) {
    // Respeta los espacios de alrededor (nodos de texto del DOM).
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    // Los textos del HTML pueden ocupar varias líneas: se comparan con los espacios juntos.
    const lead = m[1], tail = m[3], body = m[2].replace(/\s+/g, ' ');
    if (!body) return s;
    const upper = body === body.toUpperCase() && /\p{L}/u.test(body);
    let r = exact.get(body);
    if (r === undefined && upper) { const e = exactLow.get(body.toLowerCase()); if (e !== undefined) r = keepCase(body, e); }
    if (r === undefined) {
      for (const p of patterns) {
        const mm = (upper ? p.reI : p.re).exec(body);
        if (!mm) continue;
        let i = 1;
        r = p.en.replace(/\{x\}/g, () => { const g = mm[i++]; return g === undefined ? '' : core(g); });
        r = keepCase(body, r);
        break;
      }
    }
    if (r === undefined && frag) {
      r = body.replace(frag, w => keepCase(w, fragMap.get(w.toLowerCase()) || w));
    }
    return lead + (r === undefined ? body : r) + tail;
  }

  /** Texto con huecos para el código: T('Nivel {x}', 5). */
  function f(es, ...vals) { let i = 0; return t(es).replace(/\{x\}/g, () => vals[i++]); }

  function moveName(name) {
    return t(name === 'Psíquico' && lang.startsWith('zh') ? 'Psíquico (movimiento)' : name);
  }

  // ---------------- DOM ----------------
  const ATTRS = ['placeholder', 'title', 'alt', 'aria-label'];
  const skipEl = el => !!(el && el.closest && el.closest('[translate="no"], script, style, code'));

  function doText(n) {
    const p = n.parentElement;
    if (!p || skipEl(p)) return;
    const v = n.nodeValue;
    if (n.__tr === v) return;
    const r = t(v);
    n.__tr = r;
    if (r !== v) n.nodeValue = r;
  }
  function doEl(el) {
    if (skipEl(el)) return;
    for (const a of ATTRS) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v) { const r = t(v); if (r !== v) el.setAttribute(a, r); }
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 || skipEl(root)) return;
    doEl(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = tw.nextNode())) { if (n.nodeType === 3) doText(n); else doEl(n); }
  }

  const PAGE_PATHS = {
    es: { guide: 'guia/', pokedex: 'pokedex/', support: 'apoyar/', contact: 'contacto/?lang=es' },
    en: { guide: 'en/guide/', pokedex: 'en/pokedex/', support: 'en/support/', contact: 'contacto/?lang=en' },
    'zh-TW': { guide: 'zh-tw/guide/', pokedex: 'zh-tw/pokedex/', support: 'zh-tw/support/', contact: 'contacto/?lang=zh-TW' },
    'zh-CN': { guide: 'zh/guide/', pokedex: 'zh/pokedex/', support: 'zh/support/', contact: 'contacto/?lang=zh-CN' }
  };
  function pageLink(page) { return PAGE_PATHS[lang][page]; }

  function startDom() {
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      for (const paths of Object.values(PAGE_PATHS)) {
        const page = Object.keys(paths).find(key => paths[key] === href);
        if (page) { a.setAttribute('href', pageLink(page)); break; }
      }
    });
    if (lang === 'es') return;
    walk(document.body);
    new MutationObserver(ms => {
      for (const m of ms) {
        if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doEl(m.target);
        else m.addedNodes.forEach(walk);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    document.title = t(document.title);
  }

  // ---------------- canvas y ventanas del navegador ----------------
  if (lang !== 'es') {
    const P = CanvasRenderingContext2D.prototype;
    for (const k of ['fillText', 'strokeText', 'measureText']) {
      const orig = P[k];
      P[k] = function (s, ...a) { return orig.call(this, typeof s === 'string' ? t(s) : s, ...a); };
    }
    const oc = window.confirm, oa = window.alert;
    window.confirm = s => oc.call(window, t(s));
    window.alert = s => oa.call(window, t(s));
  }

  function set(l) {
    if (!supported.includes(l)) return;
    try { localStorage.setItem(KEY, l); } catch (e) { /* nada */ }
    location.reload();
  }

  return { lang, add, t, f, set, startDom, walk, pageLink, moveName };
})();
G.T = G.I18n.t;
