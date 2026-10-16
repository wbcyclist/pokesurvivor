(() => {
  const revision = window.POKESURVIVOR_LAN.devRevision;
  const events = new EventSource('/__lan_dev/events');
  let reloading = false;
  events.onmessage = event => {
    const next = JSON.parse(event.data).revision;
    if (!next || next === revision || reloading) return;
    reloading = true;
    events.close();
    // Use the regular quit path to save earned progress before replacing the page.
    try { if (window.G && window.G.Game) window.G.Game.quit(); }
    catch (error) { console.warn('[LAN dev] Could not finish the run:', error); }
    location.reload();
  };
  // EventSource reconnects after a restart. Reload only when a ready server replies.
})();
