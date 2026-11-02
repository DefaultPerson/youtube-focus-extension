/* MAIN world: deliberately limited to the public YouTube quality methods. */
(() => {
  'use strict';
  const channel = 'ytv-local-player-v1';
  const levels = ['tiny', 'small', 'medium', 'large', 'hd720', 'hd1080', 'hd1440', 'hd2160', 'highres'];
  const choices = new Set(['auto', 'lowest', 'highest', ...levels]);
  let quality = 'auto';
  let timer = null;
  let previousKey = '';
  const owned = new Set();

  function release() {
    for (const player of owned) {
      try {
        if (player.isConnected !== false) {
          player.setPlaybackQualityRange?.('auto', 'auto');
          player.setPlaybackQuality?.('auto');
        }
      } catch {}
    }
    owned.clear();
    previousKey = '';
  }
  function apply() {
    const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
    if (!player || typeof player.getAvailableQualityLevels !== 'function' || typeof player.setPlaybackQualityRange !== 'function') return;
    try {
      const available = player.getAvailableQualityLevels();
      if (!Array.isArray(available)) return;
      const sorted = levels.filter(level => available.includes(level));
      if (!sorted.length) return;
      let target;
      if (quality === 'lowest') target = sorted[0];
      else if (quality === 'highest') target = sorted.at(-1);
      else target = sorted.filter(level => levels.indexOf(level) <= levels.indexOf(quality)).at(-1) || sorted[0];
      const key = [location.href, player.getVideoData?.()?.video_id || '', target, sorted.join(',')].join('|');
      if (owned.has(player) && previousKey === key) return;
      player.setPlaybackQualityRange(target, target);
      owned.add(player);
      player.setPlaybackQuality?.(target);
      previousKey = key;
      for (const old of owned) if (old !== player && old.isConnected === false) owned.delete(old);
    } catch { /* The player API may disappear during SPA replacement. */ }
  }
  function refresh() { previousKey = ''; apply(); }
  function setQuality(next) {
    if (next === quality && (next === 'auto' || timer !== null)) return;
    if (timer !== null) clearInterval(timer);
    timer = null;
    for (const name of ['yt-navigate-finish', 'yt-page-data-updated', 'loadedmetadata']) document.removeEventListener(name, refresh, true);
    release();
    quality = next;
    if (quality === 'auto') return;
    for (const name of ['yt-navigate-finish', 'yt-page-data-updated', 'loadedmetadata']) document.addEventListener(name, refresh, true);
    timer = setInterval(apply, 1500);
    apply();
  }
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const message = event.data;
    if (!message || message.channel !== channel || message.type !== 'configure') return;
    const config = message.config;
    if (!config || typeof config.enabled !== 'boolean' || !choices.has(config.quality)) return;
    // No command names, object paths, storage, or account data cross this bridge.
    setQuality(config.enabled ? config.quality : 'auto');
  });
  window.addEventListener('pagehide', event => { if (!event.persisted) setQuality('auto'); });
  window.postMessage({channel, type: 'ready'}, location.origin);
})();
