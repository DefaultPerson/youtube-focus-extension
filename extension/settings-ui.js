/* One settings document, shared by the Chrome side panel and a full tab. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const panelMode = new URL(location.href).searchParams.get('panel') === '1';
  document.body.classList.toggle('side-panel', panelMode);
  const sections = [
    ['Focus and controls', [
      ['focus', 'Focus sessions'], ['restrictions', 'Usage limits'],
      ['protection', 'Settings protection'], ['filters', 'Content filters'], ['player', 'Player']
    ]],
    ['Appearance', [['appearance/all', 'All appearance settings'], ...YTV_CATALOG.categories.map(c => ['appearance/' + c.id, c.label])]],
    ['Your settings', [['presets', 'Presets and backup'], ['general', 'General settings']]]
  ];
  const routes = new Map(sections.flatMap(([, items]) => items));
  for (const [caption, items] of sections) {
    const group = document.createElement('div'); group.className = 'nav-group';
    const heading = document.createElement('p'); heading.className = 'nav-heading'; heading.textContent = caption; group.append(heading);
    for (const [route, label] of items) {
      const link = document.createElement('a'); link.className = 'nav-button'; link.href = '#' + route; link.dataset.view = route;
      const name = {focus: 'focus', restrictions: 'clock', protection: 'shield', filters: 'filter', player: 'player', presets: 'presets', general: 'settings'}[route] || ({all: 'grid', homePage: 'home', searchPage: 'search', subscriptionsPage: 'list', channelPage: 'channel', videoCard: 'card', header: 'header', navigationSidebar: 'sidebar', appearance: 'colors', youPage: 'list'}[route.split('/')[1]] || 'player');
      const text = document.createElement('span'); text.textContent = label; link.append(YFEIcons(name), text); group.append(link);
      link.addEventListener('click', () => { $('search').value = ''; setNavigation(false); refresh(); });
    }
    $('settings-navigation').append(group);
  }
  function currentRoute() { const route = location.hash.slice(1); return routes.has(route) ? route : 'appearance/all'; }
  function refresh() {
    const route = currentRoute(), [view, category] = route.split('/');
    document.querySelectorAll('#settings > [data-section]').forEach(node => { node.hidden = node.dataset.section !== view; });
    document.querySelectorAll('[data-view]').forEach(link => {
      if (link.dataset.view === route) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    $('search-panel').hidden = true;
    document.title = globalThis.YFEI18n?.t(routes.get(route)) || routes.get(route);
    window.dispatchEvent(new CustomEvent('ytv:navigate', {detail: {view, category}}));
  }
  async function confirmPreset(preset) {
    if (!YTV_CATALOG.presets.some(p => p.id === preset.id)) return true;
    const dialog = $('confirm-dialog');
    $('confirm-title').textContent = 'Apply built-in preset?';
    $('confirm-description').textContent = 'Your current appearance will be saved so you can restore it later. Filters and usage limits will stay the same.';
    $('confirm-action').textContent = 'Apply preset'; dialog.returnValue = 'cancel';
    return new Promise(resolve => { dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), {once: true}); dialog.showModal(); });
  }
  function setNavigation(open) {
    document.body.classList.toggle('navigation-open', open);
    $('navigation-toggle').setAttribute('aria-expanded', String(open));
    if (open) document.querySelector('.sidebar').scrollTop = 0;
  }
  globalThis.YTVUI = Object.freeze({refresh, confirmPreset, currentRoute, routes});
  $('navigation-toggle').append(YFEIcons('menu')); $('navigation-close').append(YFEIcons('close'));
  $('navigation-toggle').addEventListener('click', () => setNavigation(!document.body.classList.contains('navigation-open')));
  $('navigation-close').addEventListener('click', () => { setNavigation(false); $('navigation-toggle').focus(); });
  document.addEventListener('click', event => {
    if (document.body.classList.contains('navigation-open') && !event.target.closest('.sidebar, #navigation-toggle')) setNavigation(false);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setNavigation(false); });
  const language = $('interface-language');
  void YFEI18n.ready.then(() => { language.value = YFEI18n.language; });
  language.addEventListener('change', () => { void YFEI18n.setLanguage(language.value).catch(showError); });
  window.addEventListener('yfe:languagechange', () => { language.value = YFEI18n.language; document.title = YFEI18n.t(routes.get(currentRoute())); });
  window.addEventListener('hashchange', () => { refresh(); window.scrollTo(0, 0); });
  document.addEventListener('DOMContentLoaded', refresh, {once: true});

  function switches(root) {
    if (!(root instanceof Element)) return;
    if (root.matches('input[type="checkbox"]')) root.setAttribute('role', 'switch');
    root.querySelectorAll('input[type="checkbox"]').forEach(input => input.setAttribute('role', 'switch'));
  }
  switches(document.body);
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) switches(node);
  }).observe(document.body, {childList: true, subtree: true});

  function showError(error) { $('error').textContent = error.message; $('error').hidden = false; }
  $('open-page').hidden = !panelMode;
  $('open-page').replaceChildren(YFEIcons('external')); $('open-panel').replaceChildren(YFEIcons('panel'));
  $('open-page').addEventListener('click', () => {
    void chrome.tabs.create({url: chrome.runtime.getURL('options.html#' + currentRoute())}).catch(showError);
  });
  $('open-panel').hidden = panelMode;
  $('open-panel').disabled = true;
  let windowId;
  void chrome.windows.getCurrent().then(window => { windowId = window.id; $('open-panel').disabled = false; }).catch(showError);
  $('open-panel').addEventListener('click', () => {
    // Call directly from the gesture; looking up the window happens beforehand.
    void chrome.sidePanel.open({windowId}).catch(showError);
  });
})();
