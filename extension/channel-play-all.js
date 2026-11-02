/* Channel uploads shortcut. Isolated world; no network requests. */
(() => {
  'use strict';
  const route = /^\/(?<channel>@[^/]+|(?:channel|c|user)\/[^/]+)\/videos\/?$/;
  const channelId = /^UC[\w-]{22}$/;
  const browse = 'ytd-browse[page-subtype="channels"]:not([hidden])';
  const header = `${browse} ytd-rich-grid-renderer > #header,${browse} #sub-menu`;
  const metadata = 'link[rel="canonical"],link[rel="alternate"]';
  let enabled = false, navigating = false, destroyed = false;
  let observer = null, frame = null, host = null, link = null, stopTranslation = null;
  let requestingId = false, currentId = null;
  const t = text => globalThis.YFEI18n?.t(text) ?? text;

  function receiveId(event) {
    if (!requestingId || typeof event.detail !== 'string' || event.detail.length > 512) return;
    try {
      const data = JSON.parse(event.detail);
      if (data.path === location.pathname && typeof data.id === 'string' && channelId.test(data.id)) currentId = data.id;
    } catch { /* Ignore malformed page messages; no settings cross this bridge. */ }
  }

  function idForCurrentChannel() {
    const match = location.pathname.match(route);
    if (!match) return null;
    const direct = match.groups.channel.match(/^channel\/(UC[\w-]{22})$/);
    if (direct) return direct[1];
    currentId = null; requestingId = true;
    document.dispatchEvent(new Event('yfe:channel-id-request'));
    requestingId = false;
    if (currentId) return currentId;
    // Initial HTML fallback only. SPA navigation adds a second canonical link
    // while leaving the original body metadata stale; never trust that pair.
    if (document.querySelectorAll('link[rel="canonical"]').length !== 1) return null;
    const current = `/${match.groups.channel}`;
    const matchesRoute = [...document.querySelectorAll('link[rel="alternate"][media]')].some(node => {
      try {
        const url = new URL(node.href);
        return ['www.youtube.com', 'm.youtube.com'].includes(url.hostname) &&
          url.pathname.replace(/\/videos\/?$/, '') === current;
      } catch { return false; }
    });
    if (!matchesRoute) return null;
    try {
      const url = new URL(document.querySelector('link[rel="canonical"]')?.href);
      const id = url.pathname.match(/^\/channel\/(UC[\w-]{22})\/?$/)?.[1];
      return url.hostname === 'www.youtube.com' && channelId.test(id || '') ? id : null;
    } catch { return null; }
  }
  function destination() {
    const id = idForCurrentChannel();
    // UULF is YouTube's regular-video uploads list (Shorts/live excluded).
    return id ? `https://www.youtube.com/playlist?list=UULF${id.slice(2)}&playnext=1` : null;
  }
  function remove() {
    stopTranslation?.(); stopTranslation = null;
    host?.remove(); host = link = null;
  }
  function render() {
    frame = null;
    if (!enabled || navigating || !route.test(location.pathname)) { remove(); return; }
    const href = destination();
    const container = document.querySelector(header);
    if (!href || !container) { remove(); return; }
    const mount = container.querySelector('chip-bar-view-model') ||
      container.querySelector('ytd-feed-filter-chip-bar-renderer #chips') || container;
    if (host?.parentElement !== mount) {
      remove();
      host = document.createElement('span'); host.id = 'yfe-channel-play-all';
      const root = host.attachShadow({mode: 'open'});
      const style = document.createElement('style');
      style.textContent = `:host{display:inline-flex;flex:0 0 auto;align-self:center;margin:12px 0 12px 12px}
        a{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0 12px;border-radius:8px;
          background:var(--yt-spec-badge-chip-background,rgba(128,128,128,.15));color:var(--yt-spec-text-primary,#0f0f0f);
          font:500 14px/20px Roboto,Arial,sans-serif;text-decoration:none;white-space:nowrap;box-sizing:border-box}
        a:hover{background:var(--yt-spec-button-chip-background-hover,rgba(128,128,128,.3))}
        a:focus-visible{outline:2px solid var(--yt-spec-call-to-action,#065fd4);outline-offset:3px}
        svg{width:18px;height:18px;fill:currentColor;flex:none}`;
      link = document.createElement('a');
      link.title = t('Play all channel videos, newest first (excluding Shorts and live streams).');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(svg.namespaceURI, 'path');
      path.setAttribute('d', 'M8 5v14l11-7z'); svg.append(path);
      const label = document.createElement('span'); label.textContent = t('Play all');
      link.append(svg, label);
      link.addEventListener('click', event => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); event.stopPropagation();
        const target = !navigating && enabled && destination();
        // A plain link has no YouTube navigation endpoint. Navigate explicitly
        // so its router cannot swallow an ordinary click or keyboard activation.
        if (target) location.assign(target);
      });
      root.append(style, link); mount.append(host);
      stopTranslation = globalThis.YFEI18n?.observe(root);
    }
    link.href = href;
  }
  function schedule() { if (enabled && frame === null) frame = requestAnimationFrame(render); }
  function refresh() {
    observer?.disconnect(); observer = null;
    if (enabled && !navigating && route.test(location.pathname)) {
      observer = new MutationObserver(changes => {
        if (changes.some(change => change.target.matches?.(metadata) ||
          change.type === 'attributes' && change.target.matches('ytd-browse') ||
          change.target.closest?.(header) || [...change.addedNodes, ...change.removedNodes].some(node =>
            node.nodeType === 1 && (node.matches(`${header},${metadata}`) || node.querySelector(`${header},${metadata}`))))) schedule();
      });
      observer.observe(document, {subtree: true, childList: true, attributes: true, attributeFilter: ['href', 'page-subtype', 'hidden']});
    }
    schedule();
  }
  function startNavigation() { navigating = true; observer?.disconnect(); remove(); }
  function finishNavigation() { navigating = false; refresh(); }
  const events = ['yt-navigate-finish', 'DOMContentLoaded'];
  function configure(value) {
    if (destroyed || enabled === value) return;
    enabled = value === true;
    if (enabled) {
      document.addEventListener('yt-navigate-start', startNavigation, true);
      document.addEventListener('yfe:channel-id-response', receiveId);
      document.addEventListener('yt-page-data-updated', schedule, true);
      for (const event of events) document.addEventListener(event, finishNavigation, true);
      window.addEventListener('popstate', finishNavigation);
      window.addEventListener('pageshow', finishNavigation);
      refresh();
    } else {
      observer?.disconnect(); observer = null;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null; navigating = false; remove();
      document.removeEventListener('yt-navigate-start', startNavigation, true);
      document.removeEventListener('yfe:channel-id-response', receiveId);
      document.removeEventListener('yt-page-data-updated', schedule, true);
      for (const event of events) document.removeEventListener(event, finishNavigation, true);
      window.removeEventListener('popstate', finishNavigation);
      window.removeEventListener('pageshow', finishNavigation);
    }
  }
  globalThis.YTVChannelPlayAll = Object.freeze({configure, destroy() { configure(false); destroyed = true; }});
})();
