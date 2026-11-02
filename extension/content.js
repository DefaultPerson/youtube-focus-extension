/* Isolated-world, local-only appearance controller. */
(() => {
  'use strict';
  const style = document.createElement('style');
  style.id = 'yt-appearance-styles';
  let settings = YTV.defaults();
  let settingsKey = JSON.stringify(settings);
  let revision = 0;
  let thumbnailObserver = null;
  const thumbnails = new Map();
  let scheduled = false;
  const pendingRoots = new Set();
  const imageSelector = ':is(ytd-thumbnail,yt-thumbnail-view-model,ytm-shorts-lockup-view-model) img';

  function replaceImage(img) {
    if (!(img instanceof HTMLImageElement) || !img.matches(imageSelector)) return;
    const mode = settings.enabled ? settings.values.video_card_replace_thumbnail : 'hqdefault';
    const current = img.getAttribute('src');
    if (!current) return;
    const previous = thumbnails.get(img);
    if (mode === 'hqdefault') {
      if (previous && current === previous.applied) img.setAttribute('src', previous.original);
      thumbnails.delete(img);
      return;
    }
    const original = previous && current === previous.applied ? previous.original : current;
    let url;
    try { url = new URL(original, location.href); } catch { return; }
    if (!['i.ytimg.com', 'i1.ytimg.com', 'i2.ytimg.com', 'i3.ytimg.com', 'i4.ytimg.com'].includes(url.hostname)) return;
    const match = url.pathname.match(/^\/(vi|vi_webp)\/([A-Za-z0-9_-]{11})\/[^/]+\.(?:jpg|webp)$/);
    if (!match) return;
    const applied = `https://i.ytimg.com/vi/${match[2]}/${mode}.jpg`;
    thumbnails.set(img, {original, applied});
    if (current !== applied) img.setAttribute('src', applied);
  }
  function scanThumbnails(root) {
    if (root instanceof HTMLImageElement) replaceImage(root);
    root.querySelectorAll?.(imageSelector).forEach(replaceImage);
  }
  function flushImages() {
    scheduled = false;
    for (const root of pendingRoots) if (root.isConnected) scanThumbnails(root);
    pendingRoots.clear();
    for (const img of thumbnails.keys()) if (!img.isConnected) thumbnails.delete(img);
  }
  function configureThumbnails() {
    const active = settings.enabled && settings.values.video_card_replace_thumbnail !== 'hqdefault';
    if (!active) {
      thumbnailObserver?.disconnect();
      thumbnailObserver = null;
      pendingRoots.clear();
      for (const img of thumbnails.keys()) replaceImage(img);
      return;
    }
    if (!thumbnailObserver && document.documentElement) {
      thumbnailObserver = new MutationObserver(records => {
        for (const record of records) {
          if (record.type === 'attributes') pendingRoots.add(record.target);
          for (const node of record.addedNodes) if (node.nodeType === Node.ELEMENT_NODE) pendingRoots.add(node);
        }
        if (!scheduled && pendingRoots.size) { scheduled = true; requestAnimationFrame(flushImages); }
      });
      thumbnailObserver.observe(document.documentElement, {subtree: true, childList: true, attributes: true, attributeFilter: ['src']});
    }
    scanThumbnails(document);
  }
  function apply() {
    const css = YTVStyles.compileCSS(settings, location.pathname);
    if (css) {
      if (style.textContent !== css) style.textContent = css;
      const parent = document.head || document.documentElement;
      if (parent && !style.isConnected) parent.append(style);
    } else {
      style.remove();
      style.textContent = '';
    }
    configureThumbnails();
  }
  function accept(next) {
    const key = JSON.stringify(next);
    if (key === settingsKey) return;
    settingsKey = key; settings = next; apply();
  }
  const unsubscribe = YTV.subscribe(next => { revision++; accept(next); });
  const initialRevision = revision;
  YTV.readSettings().then(next => {
    if (revision !== initialRevision) return;
    accept(next);
  }).catch(error => console.error('YFE: could not load settings.', error.message));
  document.addEventListener('DOMContentLoaded', apply, {once: true});
  document.addEventListener('yt-navigate-finish', apply);
  document.addEventListener('yt-page-data-updated', apply);
  window.addEventListener('popstate', apply);
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(apply, 150); });
  window.addEventListener('pageshow', apply);
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    unsubscribe();
    thumbnailObserver?.disconnect();
    thumbnails.clear();
  }, {once: true});
})();
