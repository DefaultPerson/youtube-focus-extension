/* Firefox cannot give an expanded-principal content script an anonymous CORS origin.
 * Create the optional font link in the page's own context. No extension APIs or
 * privileged data are available here; messages can only select Google font CSS. */
(() => {
  'use strict';
  let link = null;
  document.addEventListener('yfe:font-configure', event => {
    if (event.detail === '') { link?.remove(); link = null; return; }
    if (typeof event.detail !== 'string' || event.detail.length > 250) return;
    let url;
    try { url = new URL(event.detail); } catch { return; }
    if (url.origin !== 'https://fonts.googleapis.com' || url.pathname !== '/css2' || url.username || url.password || url.hash ||
        [...url.searchParams.keys()].sort().join(',') !== 'display,family' || url.searchParams.get('display') !== 'swap' ||
        !/^[A-Za-z ]{1,60}:wght@(?:400;500;600;700|400;500;700|400;600;700|400;700)$/.test(url.searchParams.get('family') || '')) return;
    if (link?.href !== url.href) {
      link?.remove();
      link = document.createElement('link');
      link.id = 'yt-appearance-google-font';
      link.rel = 'stylesheet';
      link.referrerPolicy = 'no-referrer';
      link.crossOrigin = 'anonymous';
      link.href = url.href;
    }
    const parent = document.head || document.documentElement;
    if (parent && !link.isConnected) parent.append(link);
  });
  document.dispatchEvent(new Event('yfe:font-ready'));
})();
