/* Desktop content filtering. All persistence is delegated to the isolated caller. */
(() => {
  'use strict';
  const rulesAPI = globalThis.YTVFilterRules;
  if (!rulesAPI) return;
  const selector = [
    'ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-grid-video-renderer',
    'ytd-rich-grid-slim-media', 'ytd-reel-item-renderer', 'ytd-compact-video-renderer',
    'ytd-playlist-renderer', 'ytd-playlist-video-renderer', 'ytd-playlist-panel-video-renderer',
    'ytd-comment-thread-renderer', 'ytd-backstage-post-thread-renderer',
    'ytd-backstage-post-renderer', 'ytd-channel-renderer', 'ytd-radio-renderer',
    'ytd-universal-watch-card-renderer', 'yt-lockup-view-model',
    'ytm-shorts-lockup-view-model', 'yt-shorts-lockup-view-model',
  ].join(',');
  const titleSelector = '#video-title,#video-title-link,yt-lockup-metadata-view-model h3,.shortsLockupViewModelHostMetadataTitle,yt-shorts-video-title-view-model,.reel-item-headline';
  const authorSelectors = {
    videos: 'ytd-channel-name a[href],.ytd-channel-name[title],#channel-thumbnail[href],yt-content-metadata-view-model a[href],yt-lockup-metadata-view-model a[href],yt-lockup-metadata-view-model .ytContentMetadataViewModelMetadataRow > span:first-child,#channel-name a[href],ytd-channel-renderer #main-link,.reel-player-header-channel a[href]',
    comments: '#author-text',
    posts: '#author-text,#author a[href]',
  };
  const marker = 'data-ytv-content-filter-hidden';
  const buttonMarker = 'data-ytv-filter-button';
  const style = document.createElement('style');
  style.textContent = `[${marker}]{display:none!important}ytd-menu-popup-renderer:has([${buttonMarker}]){max-height:80vh!important;max-width:none!important;min-width:220px}[${buttonMarker}]{display:block;width:100%;padding:10px 16px;border:0;background:transparent;color:inherit;text-align:left;font:inherit;cursor:pointer}[${buttonMarker}]:hover{background:rgba(128,128,128,.18)}[${buttonMarker}]:disabled{opacity:.65;cursor:default}`;
  const hidden = new Map();
  const pending = new Set();
  let config = {enabled: false, contextButtons: false};
  let compiled = {channels: [], videos: [], comments: [], posts: []};
  let onAdd = null;
  let observer = null;
  let frame = null;
  let fallback = null;
  let fullScan = false;
  let selected = null;
  let menu = null;
  let menuTarget = null;
  let destroyed = false;

  function category(element) {
    if (element.matches('ytd-comment-thread-renderer')) return 'comments';
    if (element.matches('ytd-backstage-post-thread-renderer,ytd-backstage-post-renderer') || element.querySelector('ytd-backstage-post-renderer,#post')) return 'posts';
    return 'videos';
  }
  function owner(node) {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    return element?.closest(selector) ?? null;
  }
  function collect(root) {
    const found = owner(root);
    if (found) pending.add(found);
    root.querySelectorAll?.(selector).forEach(element => pending.add(element));
  }
  function restore(element) {
    const previous = hidden.get(element);
    if (!previous) return;
    if (element.style.getPropertyValue('display') === 'none' && element.style.getPropertyPriority('display') === 'important') {
      if (previous.value) element.style.setProperty('display', previous.value, previous.priority);
      else element.style.removeProperty('display');
    }
    hidden.delete(element);
    element.removeAttribute(marker);
  }
  function names(element, kind) {
    const nodes = [...element.querySelectorAll(authorSelectors[kind])];
    const result = [];
    for (const node of kind === 'videos' ? nodes : nodes.slice(0, 1)) {
      const href = node.getAttribute('href');
      const identity = href && rulesAPI.identity('channels', href);
      if (href && !identity) continue;
      const raw = node.getAttribute('title') || node.textContent || '';
      if (raw.trim()) result.push({type: 'name', value: rulesAPI.foldName(raw), raw});
      if (identity) result.push({...identity, raw: identity.type === 'handle' ? `@${identity.value}` : identity.value});
    }
    return result;
  }
  function videoValues(element) {
    const values = [];
    for (const title of element.querySelectorAll(titleSelector)) {
      values.push(title.textContent || '', title.getAttribute('title') || '');
    }
    for (const link of element.querySelectorAll('a[href]')) {
      const href = link.getAttribute('href');
      const identity = rulesAPI.identity('videos', href);
      if (!identity) continue;
      const path = href.includes('/shorts/') ? `/shorts/${identity.value}` : `/watch?v=${identity.value}`;
      values.push(identity.value, path, `https://www.youtube.com${path}`, `https://youtube.com${path}`);
    }
    return values;
  }
  function textValues(element) {
    // Exclude our menu labels if YouTube mounts a menu inside a renderer.
    const copy = element.cloneNode(true);
    copy.querySelectorAll(`[${buttonMarker}]`).forEach(node => node.remove());
    return [copy.textContent || '', ...[...copy.querySelectorAll('a[href],[aria-label]')].map(node => `${node.getAttribute('href') || ''} ${node.getAttribute('aria-label') || ''}`)];
  }
  function matchText(rule, value) {
    return rule.type === 'regex' ? rule.value.test(value.slice(0, rulesAPI.MAX_INPUT_LENGTH)) : value.toLocaleLowerCase().includes(rule.value);
  }
  function evaluate(element) {
    if (!element.isConnected) { restore(element); return; }
    const kind = category(element);
    // Nested cards inside a post/comment belong to that enclosing item.
    const parent = element.parentElement?.closest(selector);
    if (parent && category(parent) !== 'videos') { restore(element); return; }
    const authors = names(element, kind);
    const channelMatch = compiled.channels.some(rule => authors.some(author => {
      if (rule.type === 'regex') return matchText(rule, author.raw);
      if (rule.type === 'name') return author.type !== 'id' && rule.value === author.value;
      return rule.type === author.type && rule.value === author.value;
    }));
    const values = compiled[kind].length ? (kind === 'videos' ? videoValues(element) : textValues(element)) : [];
    if (channelMatch || compiled[kind].some(rule => values.some(value => matchText(rule, value)))) {
      if (!hidden.has(element) || element.style.getPropertyValue('display') !== 'none' || element.style.getPropertyPriority('display') !== 'important') {
        hidden.set(element, {value: element.style.getPropertyValue('display'), priority: element.style.getPropertyPriority('display')});
        element.style.setProperty('display', 'none', 'important');
      }
      element.setAttribute(marker, '');
    } else restore(element);
  }
  function removeButtons() {
    menu?.querySelectorAll(`[${buttonMarker}]`).forEach(node => node.remove());
    menu = null;
    menuTarget = null;
  }
  function isVisible(element) {
    for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
      if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
      const css = getComputedStyle(node);
      if (css.display === 'none' || css.visibility === 'hidden') return false;
    }
    return true;
  }
  function targetRules(element) {
    const kind = category(element);
    const authors = names(element, kind);
    const channel = authors.find(value => value.type === 'id') || authors.find(value => value.type === 'handle') || authors.find(value => value.type === 'name');
    const choices = [];
    if (kind === 'videos') {
      const id = [...element.querySelectorAll('a[href]')].map(node => rulesAPI.identity('videos', node.getAttribute('href'))).find(Boolean);
      if (id) choices.push({kind, rule: id.value, label: 'Hide video'});
    } else {
      const id = [...element.querySelectorAll('a[href]')].map(node => rulesAPI.identity(kind, node.getAttribute('href'))).find(Boolean);
      if (id) choices.push({kind, rule: id.value, label: kind === 'comments' ? 'Hide comment' : 'Hide post'});
    }
    if (channel) choices.push({kind: 'channels', rule: channel.type === 'handle' ? `@${channel.value}` : channel.type === 'name' ? channel.raw : channel.value, label: 'Hide channel'});
    return choices;
  }
  function updateMenu() {
    if (!config.contextButtons || !selected?.isConnected || !onAdd) { removeButtons(); return; }
    const items = [...document.querySelectorAll('ytd-menu-popup-renderer #items,yt-sheet-view-model .ytListViewModelHost')].find(isVisible);
    if (!items) { removeButtons(); return; }
    if (items === menu && selected === menuTarget && menu.querySelector(`[${buttonMarker}]`)) return;
    removeButtons();
    menu = items;
    menuTarget = selected;
    const target = selected;
    for (const choice of targetRules(target)) {
      const rule = rulesAPI.normalizeRule(choice.kind, choice.rule);
      if (!rule) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute(buttonMarker, choice.kind);
      button.textContent = choice.label;
      button.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        button.disabled = true;
        button.textContent = 'Saving…';
        try {
          await onAdd(choice.kind, rule);
          if (destroyed || !config.enabled) return;
          const compiledRule = rulesAPI.compileRule(choice.kind, rule);
          if (compiledRule) compiled[choice.kind].push(compiledRule);
          button.textContent = 'Rule saved';
          schedule(true);
        } catch (error) {
          button.disabled = false;
          button.textContent = `${choice.label}: ${error?.message || 'failed, try again'}`;
          button.setAttribute('role', 'alert');
        }
      });
      items.append(button);
    }
  }
  function flush() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    clearTimeout(fallback); fallback = null;
    if (!config.enabled || destroyed) return;
    if (fullScan) { document.querySelectorAll(selector).forEach(element => pending.add(element)); fullScan = false; }
    for (const element of pending) evaluate(element);
    pending.clear();
    for (const element of hidden.keys()) if (!element.isConnected) restore(element);
    updateMenu();
  }
  function schedule(all = false) {
    if (!config.enabled || destroyed) return;
    fullScan ||= all;
    if (frame === null) { frame = requestAnimationFrame(flush); fallback = setTimeout(flush, 120); }
  }
  function mutations(records) {
    let changed = false;
    for (const record of records) {
      const element = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (element?.closest(`[${buttonMarker}]`)) continue;
      const menuChange = config.contextButtons && element?.closest('ytd-popup-container,tp-yt-iron-dropdown,yt-sheet-view-model');
      if (!menuChange && record.type === 'attributes' && record.attributeName === 'style' && (!hidden.has(element) || (element.style.getPropertyValue('display') === 'none' && element.style.getPropertyPriority('display') === 'important'))) continue;
      const target = owner(record.target);
      if (target) { pending.add(target); changed = true; }
      if (record.type === 'childList') {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1 || node.hasAttribute(buttonMarker)) continue;
          collect(node);
          changed = true;
        }
        if (record.removedNodes.length) changed = true;
      }
      if (menuChange) changed = true;
    }
    if (changed) schedule();
  }
  function click(event) {
    if (!config.contextButtons) return;
    if (!(event.target instanceof Element) || event.target.closest(`[${buttonMarker}]`)) return;
    const target = owner(event.target);
    if (target && event.target.closest('ytd-menu-renderer,yt-icon-button,button[aria-haspopup],#menu')) {
      selected = target;
      removeButtons();
      schedule();
    } else if (!event.target.closest('ytd-menu-popup-renderer,yt-sheet-view-model,tp-yt-iron-dropdown')) {
      selected = null;
      removeButtons();
    }
  }
  function navigation() { selected = null; removeButtons(); schedule(true); }
  function stop() {
    observer?.disconnect();
    observer = null;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    clearTimeout(fallback); fallback = null;
    pending.clear();
    fullScan = false;
    document.removeEventListener('click', click, true);
    for (const event of ['yt-navigate-finish', 'yt-page-data-updated']) document.removeEventListener(event, navigation);
    window.removeEventListener('popstate', navigation);
    window.removeEventListener('pageshow', navigation);
    document.removeEventListener('DOMContentLoaded', navigation);
    selected = null;
    removeButtons();
    for (const element of hidden.keys()) restore(element);
    style.remove();
  }
  function configure(next, addRule) {
    if (destroyed) return;
    stop();
    config = {enabled: next?.enabled === true, contextButtons: next?.contextButtons === true};
    onAdd = typeof addRule === 'function' ? addRule : null;
    compiled = Object.fromEntries(['channels', 'videos', 'comments', 'posts'].map(kind => [kind, (Array.isArray(next?.[kind]) ? next[kind] : []).map(rule => rulesAPI.compileRule(kind, rule)).filter(Boolean)]));
    if (!config.enabled || !document.documentElement) return;
    (document.head || document.documentElement).append(style);
    observer = new MutationObserver(mutations);
    observer.observe(document.documentElement, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['href', 'title', 'aria-label', 'video-id', 'style', 'hidden', 'aria-hidden', 'opened']});
    document.addEventListener('click', click, true);
    for (const event of ['yt-navigate-finish', 'yt-page-data-updated']) document.addEventListener(event, navigation);
    window.addEventListener('popstate', navigation);
    window.addEventListener('pageshow', navigation);
    document.addEventListener('DOMContentLoaded', navigation);
    schedule(true);
  }
  globalThis.YTVContentFilter = Object.freeze({configure, destroy() { stop(); destroyed = true; }});
})();
