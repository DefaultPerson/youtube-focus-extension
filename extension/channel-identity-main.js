/* Read-only page bridge. Exposes only the current public channel ID and path. */
(() => {
  'use strict';
  document.addEventListener('yfe:channel-id-request', () => {
    if (!/^\/(?:@[^/]+|(?:channel|c|user)\/[^/]+)\/videos\/?$/.test(location.pathname)) return;
    const data = document.querySelector('ytd-app')?.data;
    const id = data?.response?.metadata?.channelMetadataRenderer?.externalId;
    if (typeof id !== 'string' || !/^UC[\w-]{22}$/.test(id)) return;
    try {
      const url = new URL(data.url, location.origin);
      if (url.origin !== location.origin || url.pathname !== location.pathname) return;
      document.dispatchEvent(new CustomEvent('yfe:channel-id-response', {
        detail: JSON.stringify({path: url.pathname, id}),
      }));
    } catch { /* The page may be between navigation states. */ }
  });
})();
