/* Isolated world. Local DOM features; settings arrive only from content.js. */
(() => {
  'use strict';
  const channel = 'ytv-local-player-v1';
  const qualities = new Set(['auto', 'lowest', 'tiny', 'small', 'medium', 'large', 'hd720', 'hd1080', 'hd1440', 'hd2160', 'highres', 'highest']);
  const defaults = {enabled: false, quality: 'auto', playbackSpeed: 0, autoFullscreen: false, nativeControls: false, disableAutoplay: false, disableNextAutoplay: false, skipAds: false, seekAds: false};
  const playerSelector = '#movie_player, .html5-video-player, ytd-video-preview, ytm-video-preview, ytd-channel-video-player-renderer';
  const nativeStyle = document.createElement('style');
  nativeStyle.textContent = '[data-ytv-native-controls="on"] .ytp-chrome-bottom,[data-ytv-native-controls="on"] .ytp-gradient-bottom{display:none!important} [data-ytv-native-controls="on"] video::-webkit-media-controls{display:flex!important}';
  const videos = new Map();
  const nativePlayers = new Map();
  let config = {...defaults};
  let observer = null;
  let timer = null;
  let frame = null;
  let fallback = null;
  let active = false;
  let destroyed = false;
  let navigation = location.href;
  let nextOriginal = null;
  let nextOwned = false;
  let nextButton = null;
  let userPlayers = new WeakMap();
  const clickedAt = new WeakMap();
  let adCandidates = new WeakMap();
  let fullscreenOwned = null;
  let fullscreenHandled = false;
  let fullscreenPending = false;
  let fullscreenEpoch = 0;

  function mainPlayer(video) {
    if (!(location.pathname === '/watch' || /^\/(?:embed|shorts)\//.test(location.pathname))) return null;
    return video.closest('#movie_player, .html5-video-player');
  }
  function isAd(player) { return player.matches('.ad-showing, .ad-interrupting'); }
  function restoreSpeed(video, state) {
    if (state.speed) {
      if (video.playbackRate === state.speed.applied) video.playbackRate = state.speed.rate;
      if (video.defaultPlaybackRate === state.speed.applied) video.defaultPlaybackRate = state.speed.defaultRate;
    }
    state.speed = null; state.speedApplied = false; state.speedStarted = false;
  }
  function applySpeed(video, state) {
    const player = mainPlayer(video);
    if (!config.playbackSpeed || !player || isAd(player) || video.duration === Infinity) {
      if (state.speed) restoreSpeed(video, state);
      return;
    }
    if (state.speedApplied) return;
    state.speed ??= {rate: video.playbackRate, defaultRate: video.defaultPlaybackRate};
    state.speed.applied = config.playbackSpeed;
    state.speedApplied = true;
    video.defaultPlaybackRate = config.playbackSpeed;
    video.playbackRate = config.playbackSpeed;
  }
  function exitOwnedFullscreen() {
    fullscreenEpoch++; fullscreenPending = false;
    if (fullscreenOwned && document.fullscreenElement === fullscreenOwned) void document.exitFullscreen().catch(() => {});
    fullscreenOwned = null; fullscreenHandled = false;
  }
  function onFullscreenChange() {
    if (document.fullscreenElement?.querySelector('video')) fullscreenHandled = true;
    if (document.fullscreenElement !== fullscreenOwned) fullscreenOwned = null;
  }
  function enterFullscreen(video) {
    if (!config.autoFullscreen || fullscreenHandled || fullscreenPending || location.pathname.startsWith('/shorts/')) return;
    const player = mainPlayer(video);
    if (!player || !video.readyState || isAd(player) || !visible(player) || !document.fullscreenEnabled || document.fullscreenElement || !navigator.userActivation?.isActive) return;
    const epoch = fullscreenEpoch;
    fullscreenPending = true;
    // Request during the play gesture; delayed synthetic clicks lose activation.
    player.requestFullscreen().then(() => {
      if (epoch !== fullscreenEpoch || !active || !config.autoFullscreen) {
        if (document.fullscreenElement === player) void document.exitFullscreen().catch(() => {});
        return;
      }
      fullscreenOwned = player; fullscreenHandled = true;
    }).catch(() => { /* A frame policy or Chrome may decline; the next Play can retry. */ })
      .finally(() => { if (epoch === fullscreenEpoch) fullscreenPending = false; });
  }

  function sendQuality() {
    window.postMessage({channel, type: 'configure', config: {enabled: config.enabled, quality: config.quality}}, location.origin);
  }
  function onBridge(event) {
    if (event.source === window && event.origin === location.origin && event.data?.channel === channel && event.data.type === 'ready') sendQuality();
  }
  function media(video) {
    let state = videos.get(video);
    if (!state) {
      const userAt = userPlayers.get(video.closest(playerSelector)) || 0;
      state = {controls: video.getAttribute('controls'), autoplay: video.getAttribute('autoplay'), controlsOwned: false, autoplayOwned: false, allowed: Date.now() - userAt < 2000, userAt, source: video.currentSrc || video.getAttribute('src') || ''};
      videos.set(video, state);
    }
    return state;
  }
  function restoreAttribute(element, name, value) {
    if (value === null) element.removeAttribute(name);
    else element.setAttribute(name, value);
  }
  function releaseVideo(video, state) {
    restoreSpeed(video, state);
    if (state.controlsOwned && video.controls) restoreAttribute(video, 'controls', state.controls);
    if (state.autoplayOwned && !video.autoplay) restoreAttribute(video, 'autoplay', state.autoplay);
    videos.delete(video);
  }
  function checkVideo(video) {
    if (!(video instanceof HTMLVideoElement) || !video.closest(playerSelector)) return;
    const state = media(video);
    applySpeed(video, state);
    if (config.nativeControls) {
      if (!state.controlsOwned) state.controls = video.getAttribute('controls');
      state.controlsOwned = true;
      if (!video.controls) video.controls = true;
    } else if (state.controlsOwned) {
      if (video.controls) restoreAttribute(video, 'controls', state.controls);
      state.controlsOwned = false;
    }
    if (config.disableAutoplay) {
      if (!state.autoplayOwned) state.autoplay = video.getAttribute('autoplay');
      state.autoplayOwned = true;
      if (video.autoplay) video.autoplay = false;
      if (!state.allowed && !video.paused && !video.ended) video.pause();
    } else if (state.autoplayOwned) {
      if (!video.autoplay) restoreAttribute(video, 'autoplay', state.autoplay);
      state.autoplayOwned = false;
      state.allowed = false;
    }
  }
  function visible(element) {
    if (!element || !element.isConnected || element.hidden || element.disabled || element.getAttribute('aria-disabled') === 'true' || !element.getClientRects().length) return false;
    const css = getComputedStyle(element);
    return css.display !== 'none' && css.visibility !== 'hidden';
  }
  function clickThrottled(button, allowHidden = false) {
    if (allowHidden ? !button?.isConnected || button.disabled || button.getAttribute('aria-disabled') === 'true' : !visible(button)) return;
    const now = Date.now();
    if (now - (clickedAt.get(button) || 0) < 1500) return;
    clickedAt.set(button, now);
    button.click();
  }
  function autoplayButton() { return [...document.getElementsByClassName('ytp-autonav-toggle-button')].find(button => button.hasAttribute('aria-checked')); }
  function restoreNext() {
    const button = autoplayButton() || nextButton;
    if (nextOwned && nextOriginal === true && button?.isConnected && button.getAttribute('aria-checked') === 'false') button.click();
    nextOriginal = null;
    nextOwned = false;
    nextButton = null;
  }
  function scan() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    clearTimeout(fallback); fallback = null;
    if (!active) return;
    if (navigation !== location.href) resetNavigation();
    const polling = (config.skipAds || config.seekAds || config.disableNextAutoplay) && (document.getElementById('movie_player') || document.getElementsByClassName('html5-video-player').length || ['ytd-video-preview', 'ytm-video-preview', 'ytd-channel-video-player-renderer'].some(tag => document.getElementsByTagName(tag).length));
    if (polling && timer === null) timer = setInterval(schedule, 750);
    else if (!polling && timer !== null) { clearInterval(timer); timer = null; }
    for (const [video, state] of videos) if (!video.isConnected || !video.closest(playerSelector)) releaseVideo(video, state);
    document.querySelectorAll('video').forEach(checkVideo);
    for (const [player, original] of nativePlayers) {
      if (!config.nativeControls || !player.isConnected) {
        if (player.getAttribute('data-ytv-native-controls') === 'on') restoreAttribute(player, 'data-ytv-native-controls', original);
        nativePlayers.delete(player);
      }
    }
    if (config.nativeControls) {
      const parent = document.head || document.documentElement;
      if (parent && !nativeStyle.isConnected) parent.append(nativeStyle);
      document.querySelectorAll('#movie_player, .html5-video-player').forEach(player => {
        if (!nativePlayers.has(player)) nativePlayers.set(player, player.getAttribute('data-ytv-native-controls'));
        if (player.getAttribute('data-ytv-native-controls') !== 'on') player.setAttribute('data-ytv-native-controls', 'on');
      });
    } else nativeStyle.remove();
    if (config.disableNextAutoplay) {
      const button = autoplayButton();
      if (button) {
        if (nextOriginal === null) nextOriginal = button.getAttribute('aria-checked') === 'true';
        nextButton = button;
        if (button.getAttribute('aria-checked') === 'true') {
          nextOwned = true;
          // Native controls hide YouTube's chrome, including this switch.
          clickThrottled(button, true);
        }
      }
      for (const button of document.getElementsByClassName('ytp-autonav-endscreen-upnext-cancel-button')) clickThrottled(button);
    }
    if (config.skipAds) {
      document.querySelectorAll('#movie_player.ad-showing, #movie_player.ad-interrupting, .html5-video-player.ad-showing, .html5-video-player.ad-interrupting').forEach(player => {
        player.querySelectorAll('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button').forEach(button => clickThrottled(button));
      });
    }
    if (config.seekAds) for (const player of document.querySelectorAll('#movie_player,.html5-video-player')) {
      const video = player.querySelector('video');
      const overlay = [...player.querySelectorAll('.ytp-ad-player-overlay,.ytp-ad-text,.ytp-ad-preview-container')].some(visible);
      if (!video || !player.classList.contains('ad-showing') || !overlay || !Number.isFinite(video.duration) || video.duration <= 0 || video.ended) { if (video) adCandidates.delete(video); continue; }
      const key = `${video.currentSrc}|${video.duration}`, previous = adCandidates.get(video);
      if (!previous || previous.key !== key) { adCandidates.set(video, {key, at: Date.now(), sought: false}); continue; }
      if (previous.sought || Date.now() - previous.at < 250) continue;
      const target = video.duration - 0.05;
      for (let i = 0; i < video.seekable.length; i++) if (video.seekable.start(i) <= target && target <= video.seekable.end(i)) {
        try { video.currentTime = target; previous.sought = true; } catch {}
        break;
      }
    }
  }
  function schedule() { if (active && frame === null) { frame = requestAnimationFrame(scan); fallback = setTimeout(scan, 120); } }
  function mutations(records) {
    if (records.some(record => {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (target?.closest(playerSelector) || nativePlayers.has(target) || [...videos.keys()].some(video => video === target || target?.contains(video))) return true;
      return record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && (node.matches(playerSelector) || node.querySelector(playerSelector)));
    })) schedule();
  }
  function resetNavigation() {
    navigation = location.href;
    userPlayers = new WeakMap();
    adCandidates = new WeakMap();
    fullscreenEpoch++; fullscreenPending = false; fullscreenHandled = Boolean(document.fullscreenElement);
    for (const [video, state] of videos) { restoreSpeed(video, state); state.allowed = false; state.source = ''; }
    schedule();
  }
  function onMedia(event) {
    const video = event.target;
    if (!(video instanceof HTMLVideoElement)) return;
    if (event.type === 'emptied') {
      const state = videos.get(video);
      if (state) {
        // A click can start loading a source; do not revoke that same gesture.
        if (!video.closest('#movie_player, .html5-video-player') && Date.now() - state.userAt > 2000) state.allowed = false;
        state.source = '';
      }
    } else if (event.type === 'loadedmetadata') {
      const state = media(video);
      state.speedApplied = false; state.speedStarted = false;
      const source = video.currentSrc || video.getAttribute('src') || '';
      if (state.source && source && source !== state.source && !video.closest('#movie_player, .html5-video-player') && Date.now() - state.userAt > 2000) state.allowed = false;
      state.source = source;
    }
    if (event.type === 'playing') {
      const state = media(video);
      if (!state.speedStarted) { state.speedApplied = false; state.speedStarted = true; }
    }
    checkVideo(video);
    if (['play', 'playing'].includes(event.type) && !video.paused) enterFullscreen(video);
    schedule();
  }
  function allowUserPlay(event) {
    if (!config.disableAutoplay || !event.isTrusted) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return;
    let player = target.closest(playerSelector);
    if (event.type === 'keydown') {
      if (![' ', 'Enter', 'k', 'K', 'MediaPlayPause', 'MediaPlay'].includes(event.key) || event.repeat) return;
      if (event.key === 'Enter' && !target.closest('video, .ytp-play-button, .ytp-large-play-button, .ytp-cued-thumbnail-overlay')) return;
      if (!player && target === document.body && [' ', 'k', 'K', 'MediaPlayPause', 'MediaPlay'].includes(event.key)) player = document.querySelector('#movie_player, .html5-video-player');
    } else if (event.button !== 0 || !target.closest('video, .ytp-play-button, .ytp-large-play-button, .ytp-cued-thumbnail-overlay')) return;
    if (!player) return;
    userPlayers.set(player, Date.now());
    player.querySelectorAll('video').forEach(video => { const state = media(video); state.allowed = true; state.userAt = Date.now(); });
  }
  function fullscreenGesture(event) {
    if (!config.autoFullscreen || !event.isTrusted || event.repeat) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return;
    let player = target.closest('#movie_player, .html5-video-player');
    if (event.type === 'keydown') {
      if (![' ', 'Enter', 'k', 'K', 'MediaPlayPause', 'MediaPlay'].includes(event.key)) return;
      if (event.key === 'Enter' && !target.closest('video, .ytp-play-button, .ytp-large-play-button, .ytp-cued-thumbnail-overlay')) return;
      if (!player && target === document.body && event.key !== 'Enter') player = document.querySelector('#movie_player, .html5-video-player');
    } else if (event.button !== 0 || !target.closest('video, .ytp-play-button, .ytp-large-play-button, .ytp-cued-thumbnail-overlay')) return;
    const video = player?.querySelector('video');
    if (video && (video.paused || video.ended)) enterFullscreen(video);
  }
  const mediaEvents = ['play', 'playing', 'loadedmetadata', 'emptied'];
  const navigationEvents = ['yt-navigate-start', 'yt-navigate-finish', 'yt-page-data-updated'];
  function stop() {
    active = false;
    observer?.disconnect(); observer = null;
    if (timer !== null) clearInterval(timer);
    timer = null;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    clearTimeout(fallback); fallback = null;
    for (const name of mediaEvents) document.removeEventListener(name, onMedia, true);
    for (const name of navigationEvents) document.removeEventListener(name, onNavigation, true);
    document.removeEventListener('pointerdown', allowUserPlay, true);
    document.removeEventListener('keydown', allowUserPlay, true);
    document.removeEventListener('click', fullscreenGesture, true);
    document.removeEventListener('keydown', fullscreenGesture, true);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    document.removeEventListener('DOMContentLoaded', schedule);
    window.removeEventListener('popstate', resetNavigation);
    for (const [video, state] of videos) releaseVideo(video, state);
    for (const [player, original] of nativePlayers) if (player.getAttribute('data-ytv-native-controls') === 'on') restoreAttribute(player, 'data-ytv-native-controls', original);
    nativePlayers.clear(); nativeStyle.remove();
    userPlayers = new WeakMap();
    exitOwnedFullscreen();
    restoreNext();
  }
  function onNavigation(event) {
    if (event.type === 'yt-navigate-start' || navigation !== location.href) resetNavigation();
    schedule();
  }
  function configure(value) {
    if (destroyed) return;
    const previous = config;
    config = {...defaults, enabled: value?.enabled === true, quality: qualities.has(value?.quality) ? value.quality : 'auto'};
    if (typeof value?.playbackSpeed === 'number' && value.playbackSpeed >= 0.25 && value.playbackSpeed <= 4 && Number.isInteger(value.playbackSpeed * 4)) config.playbackSpeed = value.playbackSpeed;
    for (const key of ['autoFullscreen', 'nativeControls', 'disableAutoplay', 'disableNextAutoplay', 'skipAds', 'seekAds']) config[key] = value?.[key] === true;
    sendQuality();
    const needed = config.enabled && (config.playbackSpeed || config.autoFullscreen || config.nativeControls || config.disableAutoplay || config.disableNextAutoplay || config.skipAds || config.seekAds);
    if (!needed) { stop(); return; }
    if (previous.disableNextAutoplay && !config.disableNextAutoplay) restoreNext();
    if (previous.playbackSpeed !== config.playbackSpeed) for (const [video, state] of videos) restoreSpeed(video, state);
    if (previous.autoFullscreen && !config.autoFullscreen) exitOwnedFullscreen();
    if (!active) {
      active = true;
      navigation = location.href;
      observer = new MutationObserver(mutations);
      observer.observe(document, {subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'controls', 'autoplay', 'aria-checked', 'disabled', 'hidden']});
      for (const name of mediaEvents) document.addEventListener(name, onMedia, true);
      for (const name of navigationEvents) document.addEventListener(name, onNavigation, true);
      document.addEventListener('pointerdown', allowUserPlay, true);
      document.addEventListener('keydown', allowUserPlay, true);
      document.addEventListener('click', fullscreenGesture, true);
      document.addEventListener('keydown', fullscreenGesture, true);
      document.addEventListener('fullscreenchange', onFullscreenChange);
      document.addEventListener('DOMContentLoaded', schedule);
      window.addEventListener('popstate', resetNavigation);
    }
    if (timer !== null) clearInterval(timer);
    timer = null;
    scan();
  }
  function destroy() {
    if (destroyed) return;
    config = {...defaults}; sendQuality(); stop(); destroyed = true;
    window.removeEventListener('message', onBridge);
    window.removeEventListener('pagehide', onPageHide);
  }
  function onPageHide(event) { if (!event.persisted) destroy(); }
  window.addEventListener('message', onBridge);
  window.addEventListener('pagehide', onPageHide);
  globalThis.YTVPlayer = Object.freeze({configure, destroy});
})();
