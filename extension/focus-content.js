/* Isolated world. Focus options operate on the current page only. */
(() => {
  'use strict';
  const watchedMarker = 'data-ytv-focus-watched';
  const budgetMarker = 'data-ytv-focus-budget';
  const tabMarker = 'data-ytv-focus-tab';
  const style = document.createElement('style');
  style.textContent = `[${watchedMarker}="hidden"],[${budgetMarker}="hidden"],[${tabMarker}="hidden"]{display:none!important}`;
  const flagNames = [
    'header_disable_logo_link',
    'redirect_shorts_to_exclude_player', 'sidebar_auto_collapse_sidebar',
    'sidebar_auto_expand_playlists', 'sidebar_auto_expand_subscriptions',
    'video_page_auto_expand_description', 'video_page_auto_shows_chapters_in_sidebar',
    'video_page_auto_theater_mode', 'home_disable_infinity_scroll',
    'shorts_page_disable_exclude_scrolling', 'home_hide_watched_videos',
    'search_hide_watched_videos', 'subscriptions_hide_watched_videos',
    'video_page_hide_related_watched_videos', 'channel_hide_watched_videos',
  ];
  const tabRoutes = {home: ['', 'featured'], videos: ['videos'], shorts: ['shorts'], live: ['streams'], releases: ['releases'], podcasts: ['podcasts'], playlists: ['playlists'], community: ['community', 'posts'], channels: ['channels'], store: ['store']};
  const attributes = new Map();
  const ui = new Map();
  let options = {};
  let active = false;
  let destroyed = false;
  let observer = null;
  let observing = false;
  let resizeObserver = null;
  let frame = null;
  let fallback = null;
  let deadlineTimer = null;
  let navigation = location.href;
  let deadline = 0;
  let attempted = new WeakMap();
  let allowances = new Map();
  let carousel = null;
  let initialShort = '';
  let redirectSource = '';
  let redirectTarget = '';
  let scrollTop = 0;
  let fullUpdate = true;
  const enabled = name => options[name] === true;
  const value = (name, defaultValue) => options[name] ?? defaultValue;
  const all = (selector, root = document) => [...root.querySelectorAll(selector)];
  const channelPath = /^\/(?:@[^/]+|(?:channel|c|user)\/[^/]+)(?:\/([^/]+))?\/?$/;

  // Save each original attribute before writing, and never overwrite a later
  // page/user change while restoring it.
  function own(element, name, desired) {
    let owned = attributes.get(element);
    if (!owned) { owned = new Map(); attributes.set(element, owned); }
    if (!owned.has(name)) owned.set(name, {before: element.getAttribute(name), written: desired});
    const state = owned.get(name);
    state.written = desired;
    if (element.getAttribute(name) !== desired) {
      if (desired === null) element.removeAttribute(name);
      else element.setAttribute(name, desired);
    }
  }
  function release(element, name) {
    const owned = attributes.get(element);
    const state = owned?.get(name);
    if (!state) return;
    if (element.getAttribute(name) === state.written) {
      if (state.before === null) element.removeAttribute(name);
      else element.setAttribute(name, state.before);
    }
    owned.delete(name);
    if (!owned.size) attributes.delete(element);
  }
  function markers(name, next) {
    for (const [element, owned] of attributes) if (owned.has(name) && !next.has(element)) release(element, name);
    // YouTube sometimes clones a renderer, including our reserved attributes.
    for (const element of all(`[${name}="hidden"]`)) {
      if (!attributes.get(element)?.has(name)) element.removeAttribute(name);
    }
    for (const element of next) own(element, name, 'hidden');
  }
  function restoreUI(key) {
    const state = ui.get(key);
    if (!state) return;
    if (state.element.isConnected && state.changed()) state.undo();
    ui.delete(key);
  }
  function restore() {
    for (const key of [...ui.keys()]) restoreUI(key);
    for (const [element, owned] of [...attributes]) for (const name of [...owned.keys()]) release(element, name);
    for (const name of [watchedMarker, budgetMarker, tabMarker]) {
      for (const element of all(`[${name}="hidden"]`)) element.removeAttribute(name);
    }
    style.remove();
    allowances.clear();
  }
  function visible(element) {
    if (!element?.isConnected || element.hidden || !element.getClientRects().length) return false;
    const css = getComputedStyle(element);
    return css.display !== 'none' && css.visibility !== 'hidden';
  }
  function clickOnce(button, key) {
    if (!button?.isConnected || button.disabled || button.getAttribute('aria-disabled') === 'true') return false;
    let keys = attempted.get(button);
    if (!keys) { keys = new Set(); attempted.set(button, keys); }
    if (keys.has(key)) return false;
    keys.add(key);
    button.click();
    return true;
  }
  function rememberUI(key, element, changed, undo) {
    if (!ui.has(key)) ui.set(key, {element, changed, undo});
  }
  function targetURL(url) {
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) return null;
    if (url.pathname === '/') {
      const paths = {subscriptions: '/feed/subscriptions', history: '/feed/history', watch_later: '/playlist?list=WL', liked: '/playlist?list=LL', library: '/feed/you'};
      const path = paths[value('redirect_home_to', 'home')];
      if (path) return new URL(path, url.origin);
    }
    const channel = url.pathname.match(channelPath);
    const destination = value('redirect_channel_to', 'home');
    if (channel && (!channel[1] || channel[1] === 'featured') && destination !== 'home' && tabRoutes[destination]) {
      const base = url.pathname.replace(/\/(?:featured)?\/?$/, '');
      url.pathname = `${base}/${tabRoutes[destination][0]}`;
      return url;
    }
    const short = url.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})\/?$/);
    if (short && enabled('redirect_shorts_to_exclude_player')) {
      url.pathname = '/watch'; url.searchParams.set('v', short[1]); return url;
    }
    if (url.pathname === '/results' && url.searchParams.get('search_query')) {
      if (['uploadDate', 'viewCount', 'rating'].includes(value('search_page_sort_by', 'relevance'))) {
        // YouTube's search filter is a protobuf. Replace its sort field while
        // retaining other filters, rather than discarding duration/type/date.
        let bytes = [];
        try {
          let raw = url.searchParams.get('sp') || '';
          for (let i = 0; i < 2 && raw.includes('%'); i++) raw = decodeURIComponent(raw);
          bytes = [...atob(raw.replace(/-/g, '+').replace(/_/g, '/'))].map(c => c.charCodeAt(0));
        } catch { bytes = []; }
        const field = {uploadDate: 2, viewCount: 3, rating: 1}[value('search_page_sort_by', 'relevance')];
        if (bytes[0] === 8 && bytes[1] === field) return null;
        if (bytes[0] === 8 && bytes[1] < 128) bytes.splice(0, 2);
        const encoded = btoa(String.fromCharCode(8, field, ...bytes));
        url.searchParams.set('sp', encoded); return url;
      }
    }
    return null;
  }
  function redirect() {
    const source = location.href;
    const target = targetURL(new URL(source));
    if (!target || target.href === source || (redirectSource === source && redirectTarget === target.href)) return false;
    redirectSource = source; redirectTarget = target.href;
    // A short-lived per-tab guard also survives a server ignoring a requested
    // filter/tab and sending the browser straight back to the source URL.
    const key = 'ytv-focus-redirect';
    try {
      const last = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (last?.source === source && last?.target === target.href && Date.now() - last.time < 10000) return false;
      sessionStorage.setItem(key, JSON.stringify({source, target: target.href, time: Date.now()}));
    } catch { /* Site storage may be disabled. The in-document guard remains. */ }
    location.replace(target.href);
    return true;
  }
  function sidebar() {
    const app = document.querySelector('ytd-app');
    const guideButton = document.querySelector('#masthead #guide-button');
    if (enabled('sidebar_auto_collapse_sidebar') && app?.hasAttribute('guide-persistent-and-visible')) {
      if (clickOnce(guideButton, 'collapse-guide')) rememberUI('sidebar_auto_collapse_sidebar', app,
        () => !app.hasAttribute('guide-persistent-and-visible'), () => guideButton?.isConnected && guideButton.click());
    }
    for (const [name, links] of [['playlists', 'a[href*="feed/you"],a[href*="feed/playlists"],a[href*="list=WL"]'], ['subscriptions', 'a[href*="feed/guide_builder"],a[href^="/@"]']]) {
      if (!enabled(`sidebar_auto_expand_${name}`)) continue;
      for (const section of all('ytd-guide-section-renderer, ytd-guide-collapsible-entry-renderer', document.querySelector('tp-yt-app-drawer#guide') || document.createElement('div'))) {
        if (!section.querySelector(links)) continue;
        const expander = section.querySelector('#expander-item');
        if (!visible(expander) || section.hasAttribute('is-expanded') || expander.getAttribute('aria-expanded') === 'true') continue;
        if (clickOnce(expander, `expand-${name}`)) rememberUI(`sidebar_auto_expand_${name}`, section,
          () => visible(section.querySelector('#collapser-item')), () => section.querySelector('#collapser-item')?.click());
      }
    }
  }
  function watchPage() {
    if (location.pathname !== '/watch') return;
    const watch = document.querySelector('ytd-watch-flexy');
    if (enabled('video_page_auto_theater_mode') && watch && !watch.hasAttribute('theater')) {
      const button = watch.querySelector('.ytp-size-button');
      if (clickOnce(button, 'theater')) rememberUI('video_page_auto_theater_mode', watch,
        () => watch.hasAttribute('theater'), () => button?.isConnected && button.click());
    }
    if (enabled('video_page_auto_expand_description')) {
      const description = document.querySelector('ytd-watch-metadata #description, ytd-video-secondary-info-renderer #description');
      const expand = description?.querySelector('#expand') || document.querySelector('tp-yt-paper-button#expand');
      if (expand && !expand.hidden && expand.getAttribute('aria-expanded') !== 'true' && !description?.hasAttribute('is-expanded')) {
        if (clickOnce(expand, 'description')) rememberUI('video_page_auto_expand_description', description || expand,
          () => visible(description?.querySelector('#collapse') || document.querySelector('tp-yt-paper-button#collapse')),
          () => (description?.querySelector('#collapse') || document.querySelector('tp-yt-paper-button#collapse'))?.click());
      }
    }
    if (enabled('video_page_auto_shows_chapters_in_sidebar')) {
      const selector = 'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-macro-markers-description-chapters"],ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-macro-markers-auto-chapters"]';
      const panels = all(selector, watch || document);
      if (panels.some(panel => panel.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED')) return;
      const button = document.querySelector('.ytp-chapter-title');
      if (button && clickOnce(button, 'chapters')) {
        const panel = panels.find(node => node.querySelector('ytd-macro-markers-list-renderer')) || panels[0];
        if (panel) rememberUI('video_page_auto_shows_chapters_in_sidebar', panel,
          () => panel.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED',
          () => (panel.querySelector('#visibility-button button') || panel.querySelector('#visibility-button'))?.click());
      } else if (!button) {
        // Some layouts render the chapters but omit the player chapter button.
        const panel = panels.find(node => node.querySelector('ytd-macro-markers-list-renderer'));
        if (panel) own(panel, 'visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
      }
    }
  }
  function watchedSelector() {
    const path = location.pathname;
    let selector = '';
    if (path === '/' && enabled('home_hide_watched_videos')) selector = 'ytd-browse[page-subtype="home"] ytd-rich-item-renderer';
    if (path === '/results' && enabled('search_hide_watched_videos')) selector = 'ytd-search ytd-video-renderer, ytd-search yt-lockup-view-model';
    if (path === '/feed/subscriptions' && enabled('subscriptions_hide_watched_videos')) selector = 'ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer, ytd-browse[page-subtype="subscriptions"] ytd-grid-video-renderer';
    if (path === '/watch' && enabled('video_page_hide_related_watched_videos')) selector = 'ytd-watch-next-secondary-results-renderer ytd-compact-video-renderer, ytd-watch-next-secondary-results-renderer yt-lockup-view-model';
    if (channelPath.test(path) && enabled('channel_hide_watched_videos')) selector = 'ytd-browse[page-subtype="channels"] ytd-rich-item-renderer, ytd-browse[page-subtype="channels"] ytd-grid-video-renderer';
    return selector;
  }
  function watched() {
    const selector = watchedSelector(), next = new Set();
    if (selector) for (const card of all(selector)) {
      const progress = all('ytd-thumbnail-overlay-resume-playback-renderer #progress,yt-thumbnail-overlay-progress-bar-view-model [style*="width"],.ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment,[role="progressbar"][aria-valuenow]', card);
      if (progress.some(node => {
        const width = node.style.width.trim();
        if (/^\d+(?:\.\d+)?%$/.test(width)) return parseFloat(width) > 0;
        const current = Number(node.getAttribute('aria-valuenow'));
        const minimum = Number(node.getAttribute('aria-valuemin') || 0);
        const maximum = Number(node.getAttribute('aria-valuemax') || 100);
        return node.hasAttribute('aria-valuenow') && Number.isFinite(current) && maximum > minimum && current > minimum;
      })) next.add(card);
    }
    markers(watchedMarker, next);
  }
  function homeBudget() {
    const rows = {row_1: 1, row_2: 2}[value('home_suggestions_rows_count', 'default')] || 0;
    const stop = enabled('home_disable_infinity_scroll');
    const next = new Set();
    // Remove only our budget before measuring; other filters still apply.
    for (const [element, owned] of [...attributes]) if (owned.has(budgetMarker)) release(element, budgetMarker);
    if (location.pathname === '/' && (rows || stop)) {
      for (const grid of all('ytd-browse[page-subtype="home"] ytd-rich-grid-renderer')) {
        const contents = grid.querySelector(':scope > #contents');
        if (!contents) continue;
        const continuations = all(':scope > ytd-continuation-item-renderer', contents);
        const candidates = all(':scope > ytd-rich-item-renderer', contents).filter(card =>
          !card.querySelector('ytd-ad-slot-renderer,ytd-display-ad-renderer') && card.querySelector('a[href*="/watch?"]'));
        if (stop && !allowances.has(grid) && candidates.length && continuations.length) allowances.set(grid, candidates.length);
        const visibleItems = candidates.filter(visible);
        let columns = Number(getComputedStyle(grid).getPropertyValue('--ytd-rich-grid-items-per-row'));
        if (!Number.isInteger(columns) || columns < 1 || columns > 30) {
          const first = visibleItems[0]?.getBoundingClientRect();
          columns = first?.width ? visibleItems.filter(card => Math.abs(card.getBoundingClientRect().top - first.top) < 2).length : 0;
        }
        const rowLimit = rows && columns ? rows * columns : Infinity;
        const limit = Math.min(rowLimit, stop ? allowances.get(grid) ?? Infinity : Infinity);
        visibleItems.slice(limit).forEach(card => next.add(card));
        if (stop || Number.isFinite(rowLimit)) continuations.forEach(node => next.add(node));
      }
    } else allowances.clear();
    for (const grid of allowances.keys()) if (!grid.isConnected) allowances.delete(grid);
    markers(budgetMarker, next);
  }
  function channelTabs() {
    const next = new Set();
    if (channelPath.test(location.pathname)) {
      for (const tab of all('ytd-browse[page-subtype="channels"] yt-tab-shape, ytd-browse[page-subtype="channels"] tp-yt-paper-tab')) {
        const link = tab.querySelector('a[href]');
        let route = null;
        if (link) {
          try {
            const target = new URL(link.getAttribute('href'), location.href);
            const channel = target.hostname === location.hostname && target.pathname.match(channelPath);
            if (channel) route = channel[1] || '';
          } catch { /* Unknown tab. */ }
        }
        // Current tabs often have no anchor; endpoint metadata is not exposed
        // to the isolated world, so use their accessible RU/EN names as fallback.
        const label = (tab.textContent || tab.getAttribute('aria-label') || '').trim().toLocaleLowerCase();
        const labels = {home: ['home', 'главная'], videos: ['videos', 'видео'], shorts: ['shorts'], live: ['live', 'трансляции'], releases: ['releases', 'релизы'], podcasts: ['podcasts', 'подкасты'], playlists: ['playlists', 'плейлисты'], community: ['community', 'сообщество', 'posts', 'записи'], channels: ['channels', 'каналы'], store: ['store', 'магазин']};
        for (const [name, routes] of Object.entries(tabRoutes)) {
          if (enabled(`channel_hide_channel_menu_button_${name}`) && (route !== null ? routes.includes(route) : labels[name].includes(label))) next.add(tab);
        }
      }
    }
    markers(tabMarker, next);
  }
  function blockScroll(event) {
    const target = event.target instanceof Element ? event.target : null;
    // Preserve scrolling in comments, descriptions and other engagement panels.
    if (target?.closest('ytd-engagement-panel-section-list-renderer, ytd-comments, input, textarea, [contenteditable="true"]')) return;
    if (event.type === 'keydown' && !['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }
  function blockLogo(event) {
    if (!enabled('header_disable_logo_link') || !(event.target instanceof Element) || !event.target.closest('ytd-topbar-logo-renderer')) return;
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }
  function detachCarousel() {
    if (!carousel) return;
    carousel.removeEventListener('wheel', blockScroll, true);
    carousel.removeEventListener('touchmove', blockScroll, true);
    document.removeEventListener('keydown', blockScroll, true);
    carousel.removeEventListener('scroll', restoreScroll);
    carousel = null;
  }
  function restoreScroll() {
    if (carousel && Math.abs(carousel.scrollTop - scrollTop) > 1) carousel.scrollTop = scrollTop;
  }
  function shorts() {
    const needed = enabled('shorts_page_disable_exclude_scrolling') && /^\/shorts\//.test(location.pathname);
    const node = needed ? document.querySelector('#carousel-scrollable-wrapper, ytd-shorts #shorts-container') : null;
    const short = needed ? location.pathname : '';
    if (node === carousel && short === initialShort) return;
    detachCarousel(); initialShort = short;
    if (!node) return;
    carousel = node; scrollTop = node.scrollTop;
    for (const name of ['wheel', 'touchmove']) node.addEventListener(name, blockScroll, {capture: true, passive: false});
    document.addEventListener('keydown', blockScroll, {capture: true, passive: false});
    node.addEventListener('scroll', restoreScroll, {passive: true});
  }
  function scan() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null; clearTimeout(fallback); fallback = null;
    if (!active) return;
    if (navigation !== location.href) resetNavigation();
    updateObserver();
    if (redirect()) return;
    const owns = marker => [...attributes.values()].some(owned => owned.has(marker));
    if (fullUpdate || watchedSelector() || owns(watchedMarker)) watched();
    if (fullUpdate || enabled('home_disable_infinity_scroll') || ['row_1', 'row_2'].includes(value('home_suggestions_rows_count', 'default')) || owns(budgetMarker)) homeBudget();
    if (fullUpdate || Object.keys(tabRoutes).some(name => enabled(`channel_hide_channel_menu_button_${name}`)) || owns(tabMarker)) channelTabs();
    if (fullUpdate || enabled('shorts_page_disable_exclude_scrolling') || carousel) shorts();
    fullUpdate = false;
    if (Date.now() <= deadline) { sidebar(); watchPage(); searchHome(); }
    for (const [element, owned] of [...attributes]) if (!element.isConnected) for (const name of [...owned.keys()]) release(element, name);
  }
  function searchHome() {
    if (location.pathname !== '/' || value('redirect_home_to', 'home') !== 'search') return;
    const input = document.querySelector('input[name="search_query"],input#search');
    if (!visible(input) || !['BODY', 'HTML'].includes(document.activeElement?.tagName)) return;
    const keys = attempted.get(input) ?? new Set();
    if (keys.has('search-focus')) return;
    keys.add('search-focus'); attempted.set(input, keys);
    input.focus({preventScroll: true});
  }
  function schedule() {
    if (!active || frame !== null) return;
    frame = requestAnimationFrame(scan); fallback = setTimeout(scan, 120);
  }
  function resetNavigation() {
    navigation = location.href;
    fullUpdate = true;
    // Navigation owns the new YouTube state; do not undo old native UI actions
    // against renderer nodes that the SPA has already reused for another video.
    ui.clear();
    for (const [element, owned] of [...attributes]) for (const name of [...owned.keys()]) release(element, name);
    attempted = new WeakMap(); allowances.clear(); detachCarousel();
    redirectSource = ''; redirectTarget = '';
    deadline = Date.now() + 15000;
    clearTimeout(deadlineTimer); deadlineTimer = setTimeout(schedule, 15020);
    updateObserver(); schedule();
  }
  function onNavigation() { if (navigation !== location.href) resetNavigation(); schedule(); }
  function relevant(changes) {
    // Detached cards no longer match selectors scoped to their former page.
    if (attributes.size && changes.some(change => change.removedNodes.length)) {
      for (const [element, owned] of [...attributes]) if (!element.isConnected) for (const name of [...owned.keys()]) release(element, name);
    }
    const path = location.pathname;
    // Automatic clicks have a bounded discovery window; preserve that fallback
    // while late-rendered native controls are still appearing.
    if (Date.now() <= deadline && (flagNames.some(name => name.includes('auto_') && enabled(name)) || path === '/' && value('redirect_home_to', 'home') === 'search')) return true;
    const scopes = [watchedSelector()];
    if (path === '/' && (enabled('home_disable_infinity_scroll') || ['row_1', 'row_2'].includes(value('home_suggestions_rows_count', 'default')))) scopes.push('ytd-rich-grid-renderer');
    if (channelPath.test(path) && Object.keys(tabRoutes).some(name => enabled(`channel_hide_channel_menu_button_${name}`))) scopes.push('yt-tab-shape,tp-yt-paper-tab');
    if (path.startsWith('/shorts/') && enabled('shorts_page_disable_exclude_scrolling')) scopes.push('ytd-shorts');
    const selector = scopes.filter(Boolean).join(',');
    if (!selector) return false;
    return changes.some(change => {
      const target = change.target.nodeType === 1 ? change.target : change.target.parentElement;
      if (target?.closest(selector)) return true;
      return change.type === 'childList' && [...change.addedNodes, ...change.removedNodes].some(node => node.nodeType === 1 && (node.matches(selector) || node.querySelector(selector)));
    });
  }
  const documentEvents = ['yt-navigate-finish', 'yt-page-data-updated', 'DOMContentLoaded'];
  function updateObserver() {
    if (!observer || !active) return;
    const path = location.pathname;
    const automatic = Date.now() <= deadline && (flagNames.some(name => name.includes('auto_') && enabled(name)) || path === '/' && value('redirect_home_to', 'home') === 'search');
    const home = path === '/' && (enabled('home_disable_infinity_scroll') || enabled('home_hide_watched_videos') || ['row_1', 'row_2'].includes(value('home_suggestions_rows_count', 'default')));
    const changing = automatic || home ||
      path === '/results' && enabled('search_hide_watched_videos') ||
      path === '/feed/subscriptions' && enabled('subscriptions_hide_watched_videos') ||
      path === '/watch' && enabled('video_page_hide_related_watched_videos') ||
      /^\/shorts\//.test(path) && enabled('shorts_page_disable_exclude_scrolling') ||
      channelPath.test(path) && (enabled('channel_hide_watched_videos') || Object.keys(tabRoutes).some(name => enabled(`channel_hide_channel_menu_button_${name}`)));
    if (changing && !observing) {
      observer.observe(document, {childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'href', 'hidden', 'aria-valuenow', 'aria-expanded', 'theater', 'guide-persistent-and-visible', 'can-show-more', 'visibility']});
      observing = true;
    } else if (!changing && observing) { observer.disconnect(); observing = false; }
  }
  function stop() {
    active = false;
    observer?.disconnect(); observer = null; observing = false;
    resizeObserver?.disconnect(); resizeObserver = null;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null; clearTimeout(fallback); fallback = null; clearTimeout(deadlineTimer); deadlineTimer = null;
    for (const name of documentEvents) document.removeEventListener(name, onNavigation, true);
    for (const name of ['click', 'auxclick', 'keydown']) document.removeEventListener(name, blockLogo, true);
    window.removeEventListener('popstate', onNavigation); window.removeEventListener('pageshow', onNavigation); window.removeEventListener('resize', schedule);
    detachCarousel(); restore();
    attempted = new WeakMap();
  }
  function configure(config) {
    if (destroyed) return;
    const previous = options;
    options = config?.values && typeof config.values === 'object' ? {...config.values} : {};
    fullUpdate = true;
    const needed = config?.enabled === true && (
      flagNames.some(enabled) || Object.keys(tabRoutes).some(name => enabled(`channel_hide_channel_menu_button_${name}`)) ||
      value('redirect_home_to', 'home') !== 'home' ||
      value('redirect_channel_to', 'home') !== 'home' || value('search_page_sort_by', 'relevance') !== 'relevance' ||
      ['row_1', 'row_2'].includes(value('home_suggestions_rows_count', 'default')));
    if (!needed) { stop(); return; }
    for (const key of [...ui.keys()]) if (!enabled(key)) restoreUI(key);
    if (!enabled('video_page_auto_shows_chapters_in_sidebar')) {
      for (const [element, owned] of [...attributes]) if (owned.has('visibility')) release(element, 'visibility');
    }
    if (previous['home_disable_infinity_scroll'] !== options['home_disable_infinity_scroll']) allowances.clear();
    const automationChanged = flagNames.some(name => /auto_/.test(name) && previous[name] !== options[name]);
    if (automationChanged) {
      attempted = new WeakMap(); deadline = Date.now() + 15000;
      clearTimeout(deadlineTimer); deadlineTimer = setTimeout(schedule, 15020);
    }
    if (!active) {
      active = true;
      resetNavigation();
      observer = new MutationObserver(changes => { if (relevant(changes)) schedule(); });
      updateObserver();
      for (const name of documentEvents) document.addEventListener(name, onNavigation, true);
      for (const name of ['click', 'auxclick', 'keydown']) document.addEventListener(name, blockLogo, true);
      window.addEventListener('popstate', onNavigation); window.addEventListener('pageshow', onNavigation); window.addEventListener('resize', schedule);
      if (typeof ResizeObserver === 'function') {
        let width = -1;
        resizeObserver = new ResizeObserver(entries => { const next = entries[0]?.contentRect.width; if (next !== width) { width = next; schedule(); } });
        if (document.documentElement) resizeObserver.observe(document.documentElement);
      }
    }
    const parent = document.head || document.documentElement;
    if (parent && !style.isConnected) parent.append(style);
    schedule();
  }
  globalThis.YTVFocus = Object.freeze({configure, destroy() { stop(); destroyed = true; }});
})();
