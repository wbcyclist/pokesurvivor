/* Use the active CSS font stack for canvas text and startup loading. */
G.Fonts = (() => {
  const style = getComputedStyle(document.documentElement);
  const family = style.getPropertyValue('--font').trim();
  const smallFamily = style.getPropertyValue('--font-small').trim();
  const canvas = (weight, size) => `${weight} ${size}px ${family}`;
  const canvasSmall = () => smallFamily ? `400 8px ${smallFamily}` : canvas(700, 8);

  function ready() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const sample = G.I18n.lang.startsWith('zh') ? '宝可梦寶可夢' : 'PokéSurvivor';
    const fonts = [400, 700].map(weight => canvas(weight, 16));
    if (smallFamily) fonts.push(canvasSmall());
    return Promise.all(fonts.map(font => document.fonts.load(font, sample)));
  }

  return { canvas, canvasSmall, ready };
})();
