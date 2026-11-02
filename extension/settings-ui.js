/* One settings document, shared by the Chrome side panel and a full tab. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const panelMode = new URL(location.href).searchParams.get('panel') === '1';
  document.body.classList.toggle('side-panel', panelMode);
  const sections = [
    ['Focus and controls', [
      ['focus', 'Focus and presets'], ['restrictions', 'Usage limits'],
      ['protection', 'Settings protection'], ['filters', 'Content filters'], ['player', 'Player']
    ]],
    ['Appearance', [['appearance/all', 'All appearance settings'], ...YTV_CATALOG.categories.map(c => ['appearance/' + c.id, c.label])]],
    ['Your settings', [['presets', 'Presets and backup']]]
  ];
  const routes = new Map(sections.flatMap(([, items]) => items));
  for (const [caption, items] of sections) {
    const group = document.createElement('div'); group.className = 'nav-group';
    const heading = document.createElement('p'); heading.className = 'nav-heading'; heading.textContent = caption; group.append(heading);
    const options = document.createElement('optgroup'); options.label = caption;
    for (const [route, label] of items) {
      const link = document.createElement('a'); link.className = 'nav-button'; link.href = '#' + route; link.dataset.view = route; link.textContent = label; group.append(link);
      const option = document.createElement('option'); option.value = route; option.textContent = label; options.append(option);
    }
    $('settings-navigation').append(group); $('section-picker').append(options);
  }
  function currentRoute() { const route = location.hash.slice(1); return routes.has(route) ? route : 'appearance/all'; }
  function refresh() {
    const route = currentRoute(), [view, category] = route.split('/');
    document.querySelectorAll('#settings > [data-section]').forEach(node => { node.hidden = node.dataset.section !== view; });
    document.querySelectorAll('[data-view]').forEach(link => {
      if (link.dataset.view === route) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    $('section-picker').value = route;
    document.title = 'YFE — ' + routes.get(route);
    window.dispatchEvent(new CustomEvent('ytv:navigate', {detail: {view, category}}));
  }
  globalThis.YTVUI = Object.freeze({refresh});
  $('section-picker').addEventListener('change', () => { location.hash = $('section-picker').value; });
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
