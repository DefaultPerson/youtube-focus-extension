/* Browser API differences shared by extension pages, content scripts and workers. */
(() => {
  'use strict';
  const api = globalThis.browser ?? globalThis.chrome;
  const isFirefox = api?.runtime?.getURL?.('')?.startsWith('moz-extension:') === true;
  function openPanel(options = {}) {
    // Keep the native call inside the user gesture; do not await other work here.
    return isFirefox ? api.sidebarAction.open() : api.sidePanel.open(options);
  }
  function openShortcutSettings() {
    if (isFirefox) return api.commands?.openShortcutSettings?.() ?? Promise.resolve(false);
    return api.tabs.create({url: 'chrome://extensions/shortcuts'});
  }
  globalThis.YFEPlatform = Object.freeze({
    api, isFirefox, openPanel, openShortcutSettings,
    canOpenShortcutSettings: !isFirefox || typeof api?.commands?.openShortcutSettings === 'function',
    shortcutInstructions: isFirefox
      ? 'Open about:addons, select Extensions, then use the gear menu → Manage Extension Shortcuts. Find YFE and “Turn the extension on or off” (toggle-extension).'
      : 'In Chrome keyboard shortcuts, find YFE and “Turn the extension on or off” (toggle-extension).',
    shortcutAddress: isFirefox ? 'Address: about:addons' : 'Address: chrome://extensions/shortcuts',
    shortcutButtonLabel: isFirefox ? 'Open extension keyboard shortcuts' : 'Open Chrome keyboard shortcuts'
  });
})();
