/* One search index for appearance, focus, sessions, filters and preferences. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const input = $('search'), panel = $('search-panel');
  const clean = text => text.replace(/\s+/g, ' ').trim();
  const fold = text => clean(text).toLocaleLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/ё/g, 'е');
  const translate = (text, lang) => globalThis.YFEI18n?.t(text, lang) || text;
  let timer, generated = 0;
  function labelText(label) {
    const copy = label.cloneNode(true);
    copy.querySelectorAll('input, select, textarea, button, svg').forEach(node => node.remove());
    return clean(copy.textContent);
  }
  function index() {
    const entries = YTV_CATALOG.options.map(option => {
      const category = YTV_CATALOG.categories.find(item => item.id === option.category);
      const group = category.groups.find(item => item.id === option.group);
      return {title: option.label, context: [category.label, group?.label].filter(Boolean), extra: [option.description || '', ...(option.choices || []).map(c => c.label)], route: 'appearance/' + option.category, target: $('option-' + option.id)};
    });
    document.querySelectorAll('#settings > [data-section]:not([data-section="appearance"])').forEach(section => {
      const route = section.dataset.section, context = YTVUI.routes.get(route);
      section.querySelectorAll('input:not([type="file"]), select, textarea').forEach(control => {
        const label = control.labels?.[0] || control.closest('label');
        const title = label && labelText(label);
        if (!title || control.closest('[data-i18n-ignore]')) return;
        if (!control.id) control.id = 'search-target-' + (++generated);
        const legend = control.closest('fieldset')?.querySelector('legend')?.textContent || control.closest('details')?.querySelector('summary')?.textContent;
        entries.push({title, context: [context, legend].filter(Boolean), extra: [control.id.replaceAll('-', ' ')], route, target: control});
      });
      for (const id of ['export', 'import', 'restore-appearance', 'reset-all', 'focus-start-session']) {
        const target = section.querySelector('#' + id);
        if (target) entries.push({title: clean(target.textContent), context: [context], extra: [], route, target});
      }
    });
    return entries.filter(entry => entry.target);
  }
  function open(entry) {
    input.value = ''; panel.hidden = true;
    if (entry.route.startsWith('appearance/')) { $('changed-only').checked = false; $('changed-only').dispatchEvent(new Event('change')); }
    const same = location.hash === '#' + entry.route;
    location.hash = entry.route;
    if (same) YTVUI.refresh();
    for (let parent = entry.target.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      entry.target.scrollIntoView({block: 'center', behavior: 'instant'});
      entry.target.focus({preventScroll: true});
      const row = entry.target.closest('.option-row, label, fieldset') || entry.target;
      row.classList.add('search-highlight'); setTimeout(() => row.classList.remove('search-highlight'), 1800);
    }));
  }
  function render() {
    clearTimeout(timer);
    const terms = fold(input.value).split(' ').filter(Boolean);
    if (!terms.length) { panel.hidden = true; YTVUI.refresh(); return; }
    document.querySelectorAll('#settings > [data-section]').forEach(section => { section.hidden = true; });
    panel.hidden = false;
    const results = index().filter(entry => {
      const text = fold([entry.title, ...entry.context, ...entry.extra].flatMap(part => [translate(part, 'en'), translate(part, 'ru')]).join(' '));
      return terms.every(term => text.includes(term));
    });
    $('search-results').replaceChildren();
    for (const entry of results) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'search-result';
      const copy = document.createElement('span'), context = document.createElement('small'), title = document.createElement('strong');
      context.textContent = entry.context.map(text => translate(text)).join(' / ');
      title.textContent = translate(entry.title); copy.append(context, title); button.append(copy, YFEIcons('arrow'));
      button.addEventListener('click', () => open(entry)); $('search-results').append(button);
    }
    $('search-count').textContent = results.length + ' ' + translate('matching settings');
    $('search-empty').hidden = results.length > 0;
  }
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 100); });
  $('clear-search').addEventListener('click', () => { input.value = ''; render(); input.focus(); });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); input.focus(); }
    if (event.key === 'Escape' && document.activeElement === input && input.value) { input.value = ''; render(); }
  });
  window.addEventListener('yfe:languagechange', () => { if (input.value.trim()) render(); });
  window.addEventListener('ytv:navigate', () => { if (input.value.trim()) render(); });
})();
