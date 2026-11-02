/* All mutations and session deadlines are owned by the extension worker. */
importScripts('catalog.js', 'core.js', 'filter-rules.js', 'feature-model.js');
void chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true}).catch(error => {
  console.warn('Could not enable the side panel toolbar action.', error);
});
const F = YTVFeatures;
const prefix = 'ytv.value.';
const keys = {features: 'ytv.features', protection: 'ytv.protection', runtime: 'ytv.runtime'};
const ports = new Set();
const portSnapshots = new WeakMap();
let scheduledBoundary, clockCheckAt;
let broadcastValue, broadcastKey, broadcastAccessKey;
let state;
let queue = Promise.resolve();
const serial = task => {
  const result = queue.then(async () => {
    try { return await task(); }
    finally { if (state) { await scheduleBoundary(); broadcast(); } }
  });
  queue = result.catch(() => {}); return result;
};
const ready = (async () => {
  await chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
  await chrome.storage.session.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
  const stored = await chrome.storage.local.get(null);
  state = {
    language: stored.yfeLanguage === 'ru' ? 'ru' : 'en',
    settings: YTV.normalizeSettings({enabled: stored['ytv.enabled'], values: Object.fromEntries(Object.entries(stored).filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), value]))}),
    presets: (stored['ytv.presets'] ?? []).map(preset => ({...preset, values: YTV.migrateValues(preset.values)})),
    features: stored[keys.features] ? F.validate(stored[keys.features]) : F.defaults(),
    protection: stored[keys.protection] ?? F.protectionDefaults(),
    runtime: stored[keys.runtime] ?? F.freshRuntime(),
    focusRuntime: stored['ytv.focusRuntime'] ?? {activePresetId: null, activeKey: null, baseline: null, manualKey: null},
  };
  for (const key of ['baseline', 'previousAppearance']) if (state.focusRuntime[key]?.values) state.focusRuntime[key].values = YTV.migrateValues(state.focusRuntime[key].values);
  await settle();
  await scheduleBoundary();
})();
function caller(sender) {
  if (sender.id !== chrome.runtime.id) return null;
  try {
    const url = new URL(sender.url);
    if (url.protocol === 'chrome-extension:' && url.hostname === chrome.runtime.id && ['/options.html', '/popup.html', '/features.html'].includes(url.pathname)) return 'ui';
    if (url.protocol === 'https:' && (url.hostname === 'www.youtube.com' || url.hostname === 'www.youtube-nocookie.com' && url.pathname.startsWith('/embed/')) && Number.isInteger(sender.tab?.id)) return 'content';
  } catch {}
  return null;
}
function reject(message, code = 'INVALID') { const error = new Error(message); error.code = code; throw error; }
function protectionView() {
  const p = state.protection;
  return {enabled: p.enabled, method: p.method, phrase: p.method === 'phrase' ? p.phrase : '', duration: p.duration, scopes: {...p.scopes}};
}
async function digest(credential, salt) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(credential), 'PBKDF2', false, ['deriveBits']);
  const bytes = await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 210000}, key, 256);
  return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('');
}
function equal(a, b) { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let n = 0; for (let i = 0; i < a.length; i++) n |= a.charCodeAt(i) ^ b.charCodeAt(i); return n === 0; }
async function authorize(sender, needed, credential, force = false) {
  const p = state.protection;
  if (!p.enabled || !force && !needed.some(scope => p.scopes[scope])) return;
  const documentKey = sender.documentId || sender.url;
  const auth = (await chrome.storage.session.get('ytv.auth'))['ytv.auth'] ?? {grants: {}, failures: 0, lockedUntil: 0};
  const now = Date.now();
  if (auth.grants[documentKey] > now) return;
  if (auth.lockedUntil > now) reject('Too many attempts. Wait 30 seconds.', 'AUTH_WAIT');
  if (typeof credential !== 'string') reject('Confirm this change first.', 'PROTECTION_REQUIRED');
  if (credential.length > 1000) reject('The password or phrase is too long.');
  const valid = p.method === 'phrase' ? equal(credential, p.phrase) : p.verifier && equal(await digest(credential, p.verifier.salt), p.verifier.digest);
  if (!valid) {
    auth.failures++;
    if (auth.failures >= 5) { auth.lockedUntil = now + 30000; auth.failures = 0; }
    await chrome.storage.session.set({'ytv.auth': auth});
    reject('Incorrect password or phrase.', 'AUTH_INVALID');
  }
  auth.failures = 0;
  auth.lockedUntil = 0;
  auth.grants = Object.fromEntries(Object.entries(auth.grants).filter(([, expiry]) => expiry > now));
  if (p.duration === '5m') auth.grants[documentKey] = now + 300000;
  await chrome.storage.session.set({'ytv.auth': auth});
}
async function saveRuntime() { await chrome.storage.local.set({[keys.runtime]: state.runtime}); }
const presets = () => [...YTV_CATALOG.presets, ...state.presets];
const presetById = id => presets().find(p => p.id === id);
async function saveFocus() { await chrome.storage.local.set({'ytv.focusRuntime': state.focusRuntime}); }
function validatePresetReferences(features, available = presets()) {
  const ids = new Set(available.map(p => p.id));
  if (features.focus.onOpen === 'preset' && !ids.has(features.focus.presetId) || features.focus.schedules.some(r => !ids.has(r.presetId))) reject('A preset is missing or used by automation. Update the automation first.');
}
async function setAppearance(values) {
  const next = YTV.normalizeSettings({enabled: state.settings.enabled, values});
  await chrome.storage.local.set(Object.fromEntries(Object.entries(next.values).map(([id, value]) => [prefix + id, value])));
  state.settings = next;
}
async function activatePreset(id, manual = false, savePrevious = false) {
  const preset = presetById(id); if (!preset) reject('Preset not found.');
  const settings = YTV.normalizeSettings({enabled: state.settings.enabled, values: preset.values});
  const focus = {...state.focusRuntime, activePresetId: id};
  if (manual) focus.manualKey = focus.activeKey;
  if (savePrevious) focus.previousAppearance = {values: {...state.settings.values}, id: state.focusRuntime.activePresetId, savedAt: Date.now()};
  await chrome.storage.local.set({'ytv.focusRuntime': focus, ...Object.fromEntries(Object.entries(settings.values).map(([key, value]) => [prefix + key, value]))});
  state.settings = settings; state.focusRuntime = focus;
}
async function reconcilePresets() {
  const f = state.focusRuntime;
  const {active} = F.presetWindow(state.settings.enabled ? state.features.focus.schedules : [], Date.now());
  if (f.activeKey !== (active?.key ?? null)) {
    if (f.activeKey && f.baseline && f.returnPrevious) {
      await setAppearance(f.baseline.values); f.activePresetId = f.baseline.id;
    }
    f.activeKey = active?.key ?? null; f.manualKey = null; f.baseline = null;
    if (active && presetById(active.rule.presetId)) {
      f.baseline = {values: {...state.settings.values}, id: f.activePresetId};
      f.returnPrevious = active.rule.returnPrevious;
      await activatePreset(active.rule.presetId);
    }
    await saveFocus();
  }
}
async function uiEntry(sender, complete = false) {
  const config = state.features.focus.openingPause;
  const key = sender.documentId || sender.url;
  const entries = (await chrome.storage.session.get('ytv.uiEntries'))['ytv.uiEntries'] ?? {};
  let value = entries[key];
  if (!config.enabled || !state.settings.enabled) return {done: true};
  if (!value) {
    value = entries[key] = {readyAt: Date.now() + config.seconds * 1000, done: false};
    for (const [id, entry] of Object.entries(entries)) if (entry.readyAt < Date.now() - 86400000) delete entries[id];
    await chrome.storage.session.set({'ytv.uiEntries': entries});
  }
  if (complete) {
    if (Date.now() < value.readyAt) reject('The pause has not finished yet.');
    value.done = true; await chrome.storage.session.set({'ytv.uiEntries': entries});
  }
  return {...config, ...value};
}
function access(now = Date.now()) {
  const r = state.features.restrictions;
  if (!state.settings.enabled) return {phase: 'open', blocked: false, nextAt: null};
  const automation = F.presetWindow(state.features.focus.schedules, now);
  const schedule = F.scheduleWindow(r.enabled ? r.schedules : [], now);
  const boundary = [schedule.nextStart, automation.nextAt].filter(Number.isFinite);
  const nextAt = boundary.length ? Math.min(...boundary) : null;
  if (r.enabled && (r.temporaryUntil > now || schedule.blockedUntil > now)) return {phase: r.temporaryUntil >= schedule.blockedUntil ? 'temporary' : 'schedule', blocked: true, until: Math.max(r.temporaryUntil, schedule.blockedUntil), nextAt: Math.max(r.temporaryUntil, schedule.blockedUntil)};
  if (state.runtime.cooldownUntil > now) return {phase: 'cooldown', blocked: true, sessionId: state.runtime.cooldownId, until: state.runtime.cooldownUntil, nextAt: state.runtime.cooldownUntil, skipPhrase: state.runtime.cooldownSkipPhrase, allowSkip: state.runtime.cooldownAllowSkip};
  if (state.runtime.session) {
    const deadlines = [nextAt, state.runtime.session.endsAt, state.runtime.session.idleAt].filter(Number.isFinite);
    return {phase: 'active', blocked: false, sessionId: state.runtime.session.id, startedAt: state.runtime.session.startedAt, presetId: state.focusRuntime.activePresetId, nextAt: deadlines.length ? Math.min(...deadlines) : null, endsAt: state.runtime.session.endsAt, idleAt: state.runtime.session.idleAt};
  }
  if (r.enabled && (r.entry.enabled || r.session.enabled) || state.features.focus.onOpen !== 'keep' || state.runtime.preparation?.manual) {
    const selected = state.features.focus.onOpen === 'preset' && !automation.active ? state.features.focus.presetId : state.focusRuntime.activePresetId;
    const values = {...r.session, ...(presetById(selected)?.sessionDefaults ?? {})};
    const appearanceLocked = Boolean(state.runtime.preparation?.manual && state.protection.enabled && state.protection.scopes.appearance);
    return {phase: state.runtime.preparation?.confirmed ? 'setup' : 'entry', blocked: true, preparationId: state.runtime.preparation?.id ?? null, readyAt: state.runtime.preparation?.readyAt ?? null,
      message: r.enabled && r.entry.enabled ? r.entry.message : 'Start a YouTube session?', phrase: r.enabled && r.entry.enabled ? r.entry.phrase : '',
      countdownStyle: r.entry.countdownStyle, seconds: r.enabled && r.entry.enabled ? r.entry.seconds : 0,
      configure: Boolean(r.enabled && r.session.enabled || state.runtime.preparation?.manual), minutes: values.minutes, idleMinutes: values.idleMinutes,
      appearanceLocked, choosePreset: !appearanceLocked && (state.features.focus.onOpen === 'ask' || Boolean(state.runtime.preparation?.manual)), selectedPreset: appearanceLocked ? '' : selected || '', presets: presets().map(p => ({id: p.id, label: p.label, sessionDefaults: p.sessionDefaults})), nextAt};
  }
  return {phase: 'open', blocked: false, nextAt};
}
async function settle(prepare = false) {
  await reconcilePresets();
  const before = JSON.stringify(state.runtime);
  const r = state.features.restrictions;
  state.runtime = F.advance(state.runtime, {...r, enabled: state.settings.enabled && (r.enabled || state.features.focus.onOpen !== 'keep' || state.runtime.preparation?.manual || state.runtime.session?.manual)}, Date.now());
  if (prepare && access().phase === 'entry' && !state.runtime.preparation) state.runtime.preparation = {id: crypto.randomUUID(), confirmed: !(r.enabled && r.entry.enabled), expiresAt: Date.now() + 900000, readyAt: Date.now() + (r.enabled && r.entry.enabled ? r.entry.seconds : 0) * 1000};
  if (before !== JSON.stringify(state.runtime)) await saveRuntime();
  if (prepare && state.runtime.preparation && !state.runtime.preparation.manual && state.features.focus.onOpen === 'preset' && !(r.enabled && (r.entry.enabled || r.session.enabled)) && ['entry', 'setup'].includes(access().phase)) {
    const selected = access().selectedPreset; if (selected) await activatePreset(selected);
    state.runtime.session = {id: crypto.randomUUID(), startedAt: Date.now(), endsAt: null, idleAt: Date.now() + 900000, idleMinutes: 15, cooldownMinutes: 0, allowSkip: false, skipPhrase: ''};
    state.runtime.preparation = null; await saveRuntime();
  }
}
// Only recurring wall-clock rules need periodic rechecks for OS clock/timezone changes.
async function scheduleBoundary() {
  const now = Date.now(), deadlines = [];
  const recurring = state.settings.enabled && (state.features.focus.schedules.some(rule => rule.enabled) || state.features.restrictions.enabled && state.features.restrictions.schedules.length);
  if (recurring) {
    if (!clockCheckAt || clockCheckAt <= now || clockCheckAt > now + 30000) clockCheckAt = now + 30000;
    deadlines.push(clockCheckAt);
  } else clockCheckAt = null;
  if (state.settings.enabled) {
    const features = state.features, runtime = state.runtime;
    const automation = F.presetWindow(features.focus.schedules, now);
    deadlines.push(automation.nextAt);
    if (state.focusRuntime.activeKey !== (automation.active?.key ?? null)) deadlines.push(now);
    if (features.restrictions.enabled) {
      const schedule = F.scheduleWindow(features.restrictions.schedules, now);
      deadlines.push(schedule.nextStart, schedule.blockedUntil);
      if (features.restrictions.temporaryUntil > now) deadlines.push(features.restrictions.temporaryUntil);
    }
    deadlines.push(runtime.session?.endsAt, runtime.session?.idleAt, runtime.cooldownUntil, runtime.preparation?.expiresAt);
  }
  const upcoming = deadlines.filter(at => Number.isFinite(at) && at > 0);
  const next = upcoming.length ? Math.max(now, Math.min(...upcoming)) : null;
  if (next === scheduledBoundary) return;
  if (next === null) await chrome.alarms.clear('ytv-boundary');
  else await chrome.alarms.create('ytv-boundary', {when: next});
  scheduledBoundary = next;
}
function snapshot(gate = access()) { return {version: chrome.runtime.getManifest().version, language: state.language, settings: state.settings, features: state.features, access: gate, focus: {activePresetId: state.focusRuntime.activePresetId, canRestoreAppearance: Boolean(state.focusRuntime.previousAppearance)}}; }
function broadcast() {
  if (!ports.size) return;
  const gate = access(), accessKey = JSON.stringify(gate);
  if (!broadcastValue || broadcastValue.settings !== state.settings || broadcastValue.features !== state.features || broadcastValue.language !== state.language ||
      broadcastValue.focus.activePresetId !== state.focusRuntime.activePresetId || broadcastValue.focus.canRestoreAppearance !== Boolean(state.focusRuntime.previousAppearance) || broadcastAccessKey !== accessKey) {
    broadcastValue = snapshot(gate); broadcastAccessKey = accessKey;
    broadcastKey = JSON.stringify(broadcastValue);
  }
  for (const port of ports) {
    if (portSnapshots.get(port) === broadcastKey) continue;
    try { port.postMessage({type: 'snapshot', value: broadcastValue}); portSnapshots.set(port, broadcastKey); }
    catch { ports.delete(port); }
  }
}
async function persistSettings(next) {
  await chrome.storage.local.set({'ytv.enabled': next.enabled, ...Object.fromEntries(Object.entries(next.values).map(([id, value]) => [prefix + id, value]))});
  state.settings = next;
  await settle();
}
function settingsScopes(next) {
  const result = [];
  if (state.settings.enabled !== next.enabled) result.push('disable');
  if (JSON.stringify(state.settings.values) !== JSON.stringify(next.values)) result.push('appearance');
  return result;
}
async function handle(message, sender) {
  await ready;
  const type = caller(sender);
  if (!type || !message || message.app !== 'ytv') reject('This request source is not allowed.');
  const readActions = ['snapshot', 'readSettings', 'readFeatures', 'readPresets', 'protectionInfo', 'uiEntryStatus'];
  if ((!message.clientVersion && !readActions.includes(message.action)) || message.clientVersion && message.clientVersion !== chrome.runtime.getManifest().version) reject('The extension was updated. Reload YouTube and the extension settings before changing anything.', 'VERSION_MISMATCH');
  if (type === 'ui') {
    if (message.action === 'uiEntryStatus') return uiEntry(sender);
    if (message.action === 'uiEntryComplete') return uiEntry(sender, true);
    if (!(await uiEntry(sender)).done) reject('Wait for settings to open first.', 'FOCUS_PAUSE');
  }
  await settle(type === 'content' && (message.action === 'heartbeat' || message.action === 'snapshot'));
  const {action, data, credential} = message;
  if (action === 'snapshot') return snapshot();
  if (action === 'openFeatures') { await chrome.tabs.create({url: chrome.runtime.getURL('options.html#restrictions')}); return true; }
  if (action === 'readSettings') return state.settings;
  if (action === 'heartbeat') {
    if (type !== 'content') reject('Invalid activity source.');
    if (data?.active === true && state.runtime.session && access().phase === 'active') {
      const minutes = state.runtime.session.idleMinutes ?? (state.features.restrictions.session.enabled ? state.features.restrictions.session.idleMinutes : 15);
      state.runtime.session.idleAt = minutes ? Date.now() + minutes * 60000 : null;
      await saveRuntime();
    }
    return snapshot();
  }
  if (action === 'prepareSession') {
    if (!state.settings.enabled) reject('Turn on the extension before starting a session.');
    if (data !== undefined && (!data || typeof data !== 'object' || Object.keys(data).some(key => key !== 'openYouTube') || data.openYouTube !== undefined && typeof data.openYouTube !== 'boolean')) reject('Invalid session request.');
    const gate = access();
    if (['temporary', 'schedule', 'cooldown'].includes(gate.phase)) reject('Wait for the current block or break to finish.');
    if (['open', 'entry', 'setup'].includes(gate.phase)) {
      const entry = state.features.restrictions;
      const now = Date.now();
      state.runtime.preparation = state.runtime.preparation ? {...state.runtime.preparation, manual: true} : {id: crypto.randomUUID(), manual: true, confirmed: !(entry.enabled && entry.entry.enabled), expiresAt: now + 900000, readyAt: now + (entry.enabled && entry.entry.enabled ? entry.entry.seconds : 0) * 1000};
      await saveRuntime();
    }
    if (type === 'ui' && data?.openYouTube) await chrome.tabs.create({url: 'https://www.youtube.com/'});
    return snapshot();
  }
  if (action === 'startSession') {
    if (type !== 'content') reject('Start the session on a YouTube page.');
    const gate = access();
    if (!['entry', 'setup'].includes(gate.phase) || !data?.preparationId || gate.preparationId !== data.preparationId) reject('The session has changed. Reload the page.');
    if (Date.now() < gate.readyAt) reject('Wait for the pause to finish.');
    if (gate.phase === 'entry' && gate.phrase && data.phrase !== gate.phrase) reject('Enter the complete phrase.');
    if (gate.phase === 'entry' && (gate.configure || gate.choosePreset)) {
      state.runtime.preparation.confirmed = true; await saveRuntime(); return snapshot();
    }
    const r = state.features.restrictions, now = Date.now();
    const selected = gate.choosePreset ? data.presetId : gate.selectedPreset;
    if (gate.choosePreset && !presetById(selected)) reject('Choose a preset for this session.');
    const parameters = {...r.session, ...(presetById(selected)?.sessionDefaults ?? {})};
    const minutes = gate.configure ? data.minutes ?? parameters.minutes : 0;
    const idleMinutes = gate.configure ? data.idleMinutes ?? parameters.idleMinutes : 15;
    if (![minutes, idleMinutes].every(v => Number.isInteger(v) && v >= 0 && v <= 1440)) reject('Session and inactivity limits must be between 0 and 1440 minutes.');
    if (selected) await activatePreset(selected, gate.choosePreset, gate.choosePreset && YTV_CATALOG.presets.some(p => p.id === selected));
    state.runtime = {preparation: null, cooldownUntil: 0, session: {id: crypto.randomUUID(), startedAt: now, manual: Boolean(state.runtime.preparation?.manual),
      endsAt: minutes ? now + minutes * 60000 : null, idleMinutes,
      idleAt: idleMinutes ? now + idleMinutes * 60000 : null, cooldownMinutes: r.enabled && r.session.enabled ? r.session.cooldownMinutes : 0,
      skipPhrase: r.session.skipPhrase, allowSkip: r.session.allowSkip}};
    await saveRuntime(); return snapshot();
  }
  if (action === 'cancelEntry') {
    if (type !== 'content' || data?.preparationId !== state.runtime.preparation?.id) reject('The session setup has changed.');
    state.runtime.preparation = null; await saveRuntime(); return true;
  }
  if (action === 'endSession') {
    const session = state.runtime.session;
    if (!session || data?.sessionId !== session.id) reject('This session has already ended.');
    state.runtime = {...F.freshRuntime(), cooldownId: session.id, cooldownSkipPhrase: session.skipPhrase ?? state.features.restrictions.session.skipPhrase, cooldownAllowSkip: session.allowSkip ?? state.features.restrictions.session.allowSkip, cooldownUntil: Date.now() + session.cooldownMinutes * 60000};
    await saveRuntime(); await settle(type === 'content'); return snapshot();
  }
  if (action === 'skipCooldown') {
    if (type !== 'content' || access().phase !== 'cooldown') reject('The break has already ended.');
    if (!state.runtime.cooldownAllowSkip || !data?.sessionId || data.sessionId !== state.runtime.cooldownId) reject('Skipping this break is disabled, or the session has changed.');
    const phrase = state.runtime.cooldownSkipPhrase;
    if (phrase && data?.phrase !== phrase) reject('Enter the complete phrase.');
    state.runtime.cooldownUntil = 0;
    await saveRuntime(); await settle(true); return snapshot();
  }
  if (action === 'filterAdd') {
    if (type !== 'content' || !state.features.filters.contextButtons || !F.kinds.includes(data?.kind)) reject('Adding filter rules from YouTube is disabled.');
    if (state.protection.enabled && state.protection.scopes.filters) reject('Filters are protected. Add the rule in the extension settings.');
    const next = structuredClone(state.features);
    next.filters[data.kind].push(data.rule);
    next.filters.enabled = true;
    state.features = F.validate(next);
    await chrome.storage.local.set({[keys.features]: state.features}); return true;
  }
  if (type !== 'ui') reject('This action is only available in the extension settings.');
  if (action === 'readPresets') return state.presets;
  if (action === 'readFeatures') return state.features;
  if (action === 'protectionInfo') return protectionView();
  if (action === 'activatePreset') {
    if (!data || typeof data !== 'object' || Object.keys(data).some(key => !['id', 'savePrevious'].includes(key)) || typeof data.id !== 'string' || data.savePrevious !== undefined && typeof data.savePrevious !== 'boolean') reject('Invalid preset change.');
    await authorize(sender, ['appearance'], credential);
    await activatePreset(data.id, true, data.savePrevious ?? YTV_CATALOG.presets.some(p => p.id === data.id)); return true;
  }
  if (action === 'restoreAppearance') {
    const previous = state.focusRuntime.previousAppearance;
    if (!previous) reject('No previous appearance has been saved.');
    await authorize(sender, ['appearance'], credential);
    const settings = YTV.normalizeSettings({enabled: state.settings.enabled, values: previous.values});
    const focus = {...state.focusRuntime, activePresetId: presetById(previous.id)?.id ?? null, manualKey: state.focusRuntime.activeKey};
    delete focus.previousAppearance;
    await chrome.storage.local.set({'ytv.focusRuntime': focus, ...Object.fromEntries(Object.entries(settings.values).map(([key, value]) => [prefix + key, value]))});
    state.settings = settings; state.focusRuntime = focus; return true;
  }
  if (action === 'writeSettings' || action === 'updateSettings') {
    let next;
    if (action === 'writeSettings') next = YTV.validateSettings(data);
    else {
      if (!data || typeof data !== 'object' || Object.keys(data).some(k => !['enabled', 'values'].includes(k))) reject('Invalid settings change.');
      next = YTV.validateSettings({...state.settings, ...data, values: {...state.settings.values, ...data.values}});
    }
    await authorize(sender, settingsScopes(next), credential);
    state.focusRuntime.manualKey = state.focusRuntime.activeKey;
    state.focusRuntime.activePresetId = null; await saveFocus();
    await persistSettings(next); return true;
  }
  if (action === 'writePresets') {
    const validated = YTV.exportData(state.settings, data).customPresets;
    validatePresetReferences(state.features, [...YTV_CATALOG.presets, ...validated]);
    await authorize(sender, ['appearance'], credential);
    await chrome.storage.local.set({'ytv.presets': validated}); state.presets = validated; return true;
  }
  if (action === 'writeFeature') {
    if (!['focus', 'restrictions', 'filters', 'player'].includes(data?.section)) reject('Unknown section.');
    const next = F.validate({...state.features, [data.section]: data.value});
    validatePresetReferences(next);
    await authorize(sender, data.section === 'focus' ? ['appearance', 'restrictions'] : [data.section], credential);
    const automationChanged = data.section === 'focus' && ['onOpen', 'presetId', 'schedules'].some(key => JSON.stringify(next.focus[key]) !== JSON.stringify(state.features.focus[key]));
    if (automationChanged && state.focusRuntime.activeKey) {
      if (state.focusRuntime.baseline && state.focusRuntime.returnPrevious) await setAppearance(state.focusRuntime.baseline.values);
      state.focusRuntime.activePresetId = state.focusRuntime.baseline?.id ?? state.focusRuntime.activePresetId;
      state.focusRuntime.activeKey = null; state.focusRuntime.baseline = null; state.focusRuntime.manualKey = null; await saveFocus();
    }
    await chrome.storage.local.set({[keys.features]: next}); state.features = next;
    if (data.section === 'restrictions') { state.runtime = F.freshRuntime(); await saveRuntime(); }
    await settle(); return true;
  }
  if (action === 'applyImport') {
    const next = YTV.importData(data);
    validatePresetReferences(next.features ?? state.features, [...YTV_CATALOG.presets, ...next.customPresets]);
    await authorize(sender, ['importReset', 'appearance', 'restrictions', 'filters', 'player', 'disable'], credential);
    const updates = {'ytv.enabled': next.settings.enabled, 'ytv.presets': next.customPresets,
      ...Object.fromEntries(Object.entries(next.settings.values).map(([id, value]) => [prefix + id, value]))};
    if (next.features) updates[keys.features] = next.features;
    await chrome.storage.local.set(updates);
    state.settings = next.settings; state.presets = next.customPresets;
    if (next.features) state.features = next.features;
    state.focusRuntime = {activePresetId: null, activeKey: null, baseline: null, manualKey: null}; await saveFocus();
    state.runtime = F.freshRuntime(); await saveRuntime(); await settle(); return true;
  }
  if (action === 'resetAppearance') {
    await authorize(sender, ['importReset', 'appearance', 'disable'], credential);
    await persistSettings(YTV.defaults()); return true;
  }
  if (action === 'configureProtection') {
    const value = data;
    if (!value || typeof value.enabled !== 'boolean' || !['phrase', 'password'].includes(value.method) || !['single', '5m'].includes(value.duration) || !value.scopes || Object.keys(value.scopes).length !== F.scopes.length || !F.scopes.every(s => typeof value.scopes[s] === 'boolean')) reject('Invalid settings protection configuration.');
    if (value.enabled && !Object.values(value.scopes).some(Boolean)) reject('Choose at least one section to protect.');
    const next = {...F.protectionDefaults(), enabled: value.enabled, method: value.method, duration: value.duration, scopes: {...value.scopes}};
    const replacement = typeof value.newCredential === 'string' ? value.newCredential : '';
    if (next.enabled) {
      if (!replacement && state.protection.enabled && state.protection.method === value.method) { next.verifier = state.protection.verifier; next.phrase = state.protection.phrase; }
      else {
        if (replacement.length < 8 || replacement.length > 200) reject('The password or phrase must contain 8 to 200 characters.');
        if (next.method === 'phrase') next.phrase = replacement;
        else { const salt = crypto.randomUUID(); next.verifier = {salt, digest: await digest(replacement, salt), algorithm: 'PBKDF2-SHA256', iterations: 210000}; }
      }
    }
    await authorize(sender, [], credential, true);
    await chrome.storage.local.set({[keys.protection]: next}); state.protection = next;
    await chrome.storage.session.remove('ytv.auth'); return protectionView();
  }
  if (action === 'lockProtection') { await chrome.storage.session.remove('ytv.auth'); return true; }
  reject('Unknown action.');
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.app !== 'ytv') return;
  serial(() => handle(message, sender)).then(value => respond({ok: true, value}), error => respond({ok: false, error: error.message, code: error.code || 'INVALID'}));
  return true;
});
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'ytv-updates' || !caller(port.sender)) { port.disconnect(); return; }
  ports.add(port); port.onDisconnect.addListener(() => ports.delete(port));
  serial(async () => { await ready; await settle(caller(port.sender) === 'content'); });
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== 'ytv-boundary') return;
  void serial(async () => { await ready; scheduledBoundary = null; await settle(); });
});
chrome.commands.onCommand.addListener(command => {
  if (command !== 'toggle-extension') return;
  void serial(async () => {
    await ready;
    if (state.protection.enabled && state.protection.scopes.disable || state.features.focus.openingPause.enabled) {
      await chrome.tabs.create({url: chrome.runtime.getURL('options.html?toggle=1')}); return;
    }
    await persistSettings({...state.settings, enabled: !state.settings.enabled});
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !Object.hasOwn(changes, 'yfeLanguage')) return;
  void serial(async () => { await ready; state.language = changes.yfeLanguage.newValue === 'ru' ? 'ru' : 'en'; });
});
