/* Use the active CSS font stack for canvas text and startup loading. */
G.Fonts = (() => {
  const family = getComputedStyle(document.documentElement).getPropertyValue('--font').trim();
  const canvas = (weight, size) => `${weight} ${size}px ${family}`;

  function ready() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const sample = G.I18n.lang.startsWith('zh') ? '宝可梦寶可夢' : 'PokéSurvivor';
    return Promise.all([400, 700].map(weight => document.fonts.load(canvas(weight, 16), sample)));
  }

  return { canvas, ready };
})();
