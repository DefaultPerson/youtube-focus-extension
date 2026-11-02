/* Local access gate and integration of optional content controllers. */
(() => {
  'use strict';
  let snapshot = null, host = null, root = null, gateKey = '', deadline = null, ticker = null, heartbeat = null, lastActivity = Date.now(), stopped = false, inFlight = false;
  let inertApp = null, appWasInert = false;
  let gateObserver = null;
  let filterConfig = '', playerConfig = '', focusConfig = '';
  function el(tag, text) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; }
  function pause(event) {
    if (!snapshot?.access.blocked) return;
    if (event?.target instanceof HTMLMediaElement) event.target.pause();
    document.querySelectorAll('video,audio').forEach(media => { if (!media.paused) media.pause(); });
  }
  function removeGate() {
    gateObserver?.disconnect(); gateObserver = null;
    host?.remove(); host = root = null; gateKey = '';
    clearInterval(ticker); ticker = null;
    document.removeEventListener('play', pause, true);
    if (inertApp && inertApp.inert === true) inertApp.inert = appWasInert;
    inertApp = null;
  }
  function holdGate() {
    if (!host) return;
    if (!host.isConnected) document.documentElement?.append(host);
    const app = document.querySelector('ytd-app');
    if (app && app !== inertApp) {
      if (inertApp && inertApp.inert === true) inertApp.inert = appWasInert;
      inertApp = app; appWasInert = app.inert;
    }
    if (inertApp && !inertApp.inert) inertApp.inert = true;
  }
  function countdown() {
    if (!root || !snapshot) return;
    const access = snapshot.access, now = Date.now();
    const remaining = Math.max(0, Math.ceil(((access.phase === 'entry' ? access.readyAt : access.until) - now) / 1000));
    const status = root.querySelector('#countdown');
    if (status) {
      status.hidden = access.phase === 'setup' || access.phase === 'entry' && access.countdownStyle !== 'detailed';
      status.textContent = access.phase === 'entry' ? remaining ? `Pause: ${remaining} s` : 'Ready to continue' : `${Math.floor(remaining / 60)} min ${remaining % 60} s remaining`;
    }
    const progress = root.querySelector('progress'); if (progress) progress.value = Math.max(0, access.seconds - remaining);
    const phraseRow = root.querySelector('#phrase-row'); if (phraseRow && access.phase === 'entry') phraseRow.hidden = remaining > 0;
    const button = root.querySelector('#continue');
    if (button) button.disabled = remaining > 0 || !access.preparationId;
    if (!['entry', 'setup'].includes(access.phase) && !remaining && !inFlight) void refresh();
  }
  function showGate() {
    if (!document.documentElement) return;
    const gate = snapshot.access;
    const key = [gate.phase, gate.preparationId, gate.sessionId, gate.message, gate.phrase, gate.skipPhrase, gate.countdownStyle, gate.configure, gate.choosePreset, JSON.stringify(gate.presets)].join('|');
    if (host && key === gateKey) { holdGate(); countdown(); pause(); return; }
    removeGate(); gateKey = key;
    host = document.createElement('div'); host.id = 'ytv-access-gate';
    host.style.cssText = 'position:fixed!important;inset:0!important;z-index:2147483647!important;display:block!important;';
    root = host.attachShadow({mode: 'open'});
    const style = el('style'); style.textContent = ':host{color-scheme:dark}*{box-sizing:border-box}.backdrop{position:fixed;inset:0;display:grid;place-items:center;padding:20px;background:#10151ff5;color:#edf2fa;font:16px/1.5 system-ui,sans-serif;overflow:auto}.panel{width:min(520px,100%);padding:28px;border:1px solid #40506b;border-radius:14px;background:#1a2231}h1{font-size:24px;margin:0 0 18px}p{white-space:pre-wrap;overflow-wrap:anywhere}input,textarea,select,button{font:inherit;border:1px solid #586f93;border-radius:6px;padding:10px;color:#edf2fa;background:#23324a}input,textarea,select{display:block;width:100%;margin:10px 0}textarea{resize:vertical}progress{width:100%}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid #8db5ff;outline-offset:3px}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:20px}.error{color:#ffb6b6}';
    const backdrop = el('div'); backdrop.className = 'backdrop';
    const panel = el('section'); panel.className = 'panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'gate-title');
    const titles = {entry: 'Pause before YouTube', setup: 'Set up this session', temporary: 'YouTube is temporarily blocked', schedule: 'Time away from YouTube', cooldown: 'Break between sessions'};
    const title = el('h1', titles[gate.phase]); title.id = 'gate-title'; panel.append(title);
    if (gate.phase === 'entry') panel.append(el('p', gate.message || 'Start a new session?'));
    else if (gate.until) panel.append(el('p', `Available after ${new Date(gate.until).toLocaleString('en')}`));
    if (gate.phase === 'entry' && gate.countdownStyle === 'subtle') { const progress = el('progress'); progress.max = Math.max(1, gate.seconds); panel.append(progress); }
    const count = el('p'); count.id = 'countdown'; panel.append(count);
    const phrase = gate.phase === 'entry' ? gate.phrase : gate.phase === 'cooldown' ? gate.skipPhrase : '';
    let input;
    if (phrase) {
      const row = el('div'); row.id = 'phrase-row';
      const label = el('label', `Type: ${phrase}`); input = el('textarea'); input.rows = 3; input.id = 'gate-phrase'; input.autocomplete = 'off'; input.maxLength = 1000; label.htmlFor = input.id; row.append(label, input); panel.append(row);
    }
    let select, minutes, idle;
    if (gate.phase === 'setup') {
      if (gate.choosePreset) {
        const label = el('label', 'Session preset'); select = el('select'); select.id = 'session-preset';
        for (const p of gate.presets) { const option = el('option', p.label); option.value = p.id; select.append(option); }
        select.value = gate.selectedPreset || gate.presets[0]?.id || ''; label.append(select); panel.append(label);
      }
      if (gate.configure) {
        const field = (text, id, value) => { const label = el('label', text), control = el('input'); control.type = 'number'; control.id = id; control.min = '0'; control.max = '1440'; control.required = true; control.value = value; label.append(control); panel.append(label); return control; };
        minutes = field('Duration in minutes (0 = no limit)', 'session-minutes', gate.minutes);
        idle = field('Idle timeout in minutes (0 = off)', 'session-idle', gate.idleMinutes);
        panel.append(el('p', 'These settings apply only to the new session.'));
        const defaultsForPreset = () => { const p = gate.presets.find(p => p.id === select?.value); minutes.value = p?.sessionDefaults?.minutes ?? gate.minutes; idle.value = p?.sessionDefaults?.idleMinutes ?? gate.idleMinutes; };
        select?.addEventListener('change', defaultsForPreset); if (select) defaultsForPreset();
      }
    }
    const error = el('p'); error.className = 'error'; error.setAttribute('role', 'alert'); panel.append(error);
    const actions = el('div'); actions.className = 'actions';
    if (['entry', 'setup'].includes(gate.phase) || gate.phase === 'cooldown' && gate.allowSkip) {
      const button = el('button', gate.phase === 'entry' ? 'Continue' : gate.phase === 'setup' ? 'Start session' : 'End break'); button.type = 'button'; if (gate.phase === 'entry') button.id = 'continue';
      button.addEventListener('click', async () => {
        if (minutes && (!minutes.reportValidity() || !idle.reportValidity())) return;
        button.disabled = true;
        try { apply(await YTV.request(gate.phase === 'cooldown' ? 'skipCooldown' : 'startSession', {preparationId: gate.preparationId, sessionId: gate.sessionId, phrase: input?.value || '', ...(minutes ? {minutes: Number(minutes.value), idleMinutes: Number(idle.value)} : {}), ...(select ? {presetId: select.value} : {})})); }
        catch (failure) { error.textContent = failure.message; button.disabled = false; }
      }); actions.append(button);
    }
    if (['entry', 'setup'].includes(gate.phase)) {
      const cancel = el('button', 'Not now'); cancel.type = 'button';
      cancel.addEventListener('click', async () => { try { await YTV.request('cancelEntry', {preparationId: gate.preparationId}); if (history.length > 1) history.back(); else location.replace('about:blank'); } catch (failure) { error.textContent = failure.message; } }); actions.append(cancel);
    }
    const settings = el('button', 'Restriction settings'); settings.type = 'button'; settings.addEventListener('click', () => void YTV.request('openFeatures').catch(failure => { error.textContent = failure.message; })); actions.append(settings);
    panel.append(actions); backdrop.append(panel); root.append(style, backdrop); document.documentElement.append(host);
    holdGate(); gateObserver = new MutationObserver(holdGate);
    gateObserver.observe(document.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ['inert']});
    document.addEventListener('play', pause, true); pause();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    root.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...root.querySelectorAll('button:not(:disabled),input,textarea,select')].filter(e => !e.closest('[hidden]'));
      if (!controls.length) return;
      if (event.shiftKey && root.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && root.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
    });
    countdown(); ticker = setInterval(countdown, 1000);
    (input || actions.querySelector('button:not(:disabled)'))?.focus();
  }
  function apply(value) {
    if (stopped) return;
    snapshot = value;
    const enabled = value.settings.enabled;
    const accessible = enabled && !value.access.blocked;
    const filters = {...value.features.filters, enabled: accessible && value.features.filters.enabled};
    const autoplay = value.settings.values.video_page_disable_autoplay === true;
    const player = {...(value.features.player.enabled ? value.features.player : {quality: 'auto', nativeControls: false, disableAutoplay: false, disableNextAutoplay: false, skipAds: false}), enabled: accessible && (value.features.player.enabled || autoplay), disableNextAutoplay: autoplay || value.features.player.enabled && value.features.player.disableNextAutoplay};
    const focus = {enabled: accessible, values: value.settings.values};
    if (document.documentElement && JSON.stringify(focus) !== focusConfig) { focusConfig = JSON.stringify(focus); YTVFocus.configure(focus); }
    if (document.documentElement && JSON.stringify(filters) !== filterConfig) { filterConfig = JSON.stringify(filters); YTVContentFilter.configure(filters, (kind, rule) => YTV.request('filterAdd', {kind, rule})); }
    if (JSON.stringify(player) !== playerConfig) { playerConfig = JSON.stringify(player); YTVPlayer.configure(player); }
    if (value.access.blocked) showGate(); else removeGate();
    clearTimeout(deadline);
    if (value.access.nextAt) deadline = setTimeout(() => void refresh(), Math.min(86400000, Math.max(50, value.access.nextAt - Date.now() + 20)));
    const tracksSession = enabled && (value.features.restrictions.enabled || value.features.focus.onOpen !== 'keep');
    if (tracksSession && !heartbeat) heartbeat = setInterval(() => void refresh(true), 15000);
    if (!tracksSession && heartbeat) { clearInterval(heartbeat); heartbeat = null; }
    if (value.access.phase === 'entry' && !value.access.preparationId) void refresh();
  }
  async function refresh(activity = false) {
    if (inFlight || stopped) return;
    inFlight = true;
    try {
      const playing = [...document.querySelectorAll('video,audio')].some(v => !v.paused && !v.ended);
      apply(await YTV.request(activity ? 'heartbeat' : 'snapshot', activity ? {active: playing || !document.hidden && Date.now() - lastActivity < 20000} : undefined));
    } catch (error) { console.warn('YFE:', error.message); }
    finally { inFlight = false; }
  }
  function activity(event) { if (event.isTrusted) lastActivity = Date.now(); }
  for (const event of ['pointerdown', 'keydown', 'scroll']) document.addEventListener(event, activity, {passive: true});
  document.addEventListener('yt-navigate-finish', () => void refresh());
  document.addEventListener('DOMContentLoaded', () => { if (snapshot) apply(snapshot); }, {once: true});
  window.addEventListener('pageshow', () => void refresh());
  const unsubscribe = YTV.subscribeSnapshots(apply);
  void refresh();
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    stopped = true; unsubscribe(); clearTimeout(deadline); clearInterval(heartbeat); removeGate(); YTVContentFilter.destroy(); YTVPlayer.destroy(); YTVFocus.destroy();
  });
})();
