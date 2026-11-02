/* Local settings and validation. No accounts, entitlements or network calls. */
(() => {
  'use strict';
  const catalog = globalThis.YTV_CATALOG;
  const clientVersion = '0.6.0';
  const options = new Map(catalog.options.map(option => [option.id, option]));
  let authorizationHandler = null;
  let entryHandler = null;
  const subscribers = new Set();
  let port = null;
  let reconnect = null;
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function canonicalOptionId(id) {
    if (options.has(id)) return id;
    // Earlier local exports added a vendor prefix to the same descriptive IDs.
    const matches = [...options.keys()].filter(key => id.endsWith('_' + key));
    return matches.length === 1 ? matches[0] : null;
  }
  function migrateValues(values) {
    if (!plain(values)) return {};
    const result = {};
    for (const [id, value] of Object.entries(values)) {
      const key = canonicalOptionId(id);
      if (key && !Object.hasOwn(values, key)) result[key] = value;
    }
    for (const [id, value] of Object.entries(values)) if (options.has(id)) result[id] = value;
    return result;
  }
  function validValue(option, value) {
    if (option.type === 'boolean') return typeof value === 'boolean';
    if (option.type === 'color') return value === 'default' || (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value));
    return option.type === 'enum' && typeof value === 'string' && option.choices.some(choice => choice.value === value);
  }
  function defaults() {
    return {version: 1, enabled: true, values: Object.fromEntries(catalog.options.map(option => [option.id, option.default]))};
  }
  function normalizeSettings(raw) {
    const settings = defaults();
    if (!plain(raw)) return settings;
    if (typeof raw.enabled === 'boolean') settings.enabled = raw.enabled;
    const values = migrateValues(raw.values);
    for (const option of catalog.options) {
      if (validValue(option, values[option.id])) settings.values[option.id] = values[option.id];
    }
    return settings;
  }
  function validateValues(values) {
    if (!plain(values)) throw new Error('Settings must be an object.');
    for (const [id, value] of Object.entries(values)) {
      const key = canonicalOptionId(id);
      if (!key) throw new Error(`Unknown setting: ${id.slice(0, 100)}`);
      if (!validValue(options.get(key), value)) throw new Error(`Invalid value: ${options.get(key).label}`);
    }
    return migrateValues(values);
  }
  function validateSettings(raw) {
    if (!plain(raw) || raw.version !== 1 || typeof raw.enabled !== 'boolean' || Object.keys(raw).some(key => !['version', 'enabled', 'values'].includes(key))) {
      throw new Error('Unsupported settings format.');
    }
    validateValues(raw.values);
    return normalizeSettings(raw);
  }
  async function request(action, data) {
    if (!globalThis.chrome?.runtime?.id) throw new Error('Open the installed extension.');
    if (chrome.runtime.getManifest().version !== clientVersion) {
      const error = new Error('The settings page and extension are different versions. Reload YFE at chrome://extensions, then reload this page.');
      error.code = 'VERSION_MISMATCH'; throw error;
    }
    let result = await chrome.runtime.sendMessage({app: 'ytv', clientVersion, action, data});
    if (!result?.ok && result?.code === 'FOCUS_PAUSE' && entryHandler) {
      await entryHandler();
      result = await chrome.runtime.sendMessage({app: 'ytv', clientVersion, action, data});
    }
    if (!result?.ok && result?.code === 'PROTECTION_REQUIRED' && authorizationHandler) {
      const credential = await authorizationHandler();
      if (credential === null) throw new Error('Change cancelled.');
      result = await chrome.runtime.sendMessage({app: 'ytv', clientVersion, action, data, credential});
    }
    if (!result?.ok) { const error = new Error(result?.error || 'The background service is unavailable. Reload the extension and page.'); error.code = result?.code; throw error; }
    return result.value;
  }
  async function readSettings() {
    return request('readSettings');
  }
  async function writeSettings(raw) {
    const settings = validateSettings(raw);
    return request('writeSettings', settings);
  }
  async function updateSettings(patch) {
    if (!plain(patch) || Object.keys(patch).some(key => !['enabled', 'values'].includes(key))) throw new Error('Invalid settings change.');
    if ('enabled' in patch) {
      if (typeof patch.enabled !== 'boolean') throw new Error('Invalid extension state.');
    }
    if ('values' in patch) validateValues(patch.values);
    return request('updateSettings', patch);
  }
  function connect() {
    if (port || !subscribers.size) return;
    try {
      const current = chrome.runtime.connect({name: 'ytv-updates'});
      port = current;
      current.onMessage.addListener(message => { if (message?.type === 'snapshot') for (const callback of subscribers) callback(message.value); });
      current.onDisconnect.addListener(() => { if (port === current) port = null; if (subscribers.size && chrome.runtime?.id) reconnect = setTimeout(connect, 1000); });
    } catch { /* An extension reload invalidates old tabs until they reload. */ }
  }
  function subscribeSnapshots(callback) {
    subscribers.add(callback); connect();
    return () => { subscribers.delete(callback); if (!subscribers.size) { clearTimeout(reconnect); const old = port; port = null; old?.disconnect(); } };
  }
  function subscribe(callback) {
    return subscribeSnapshots(snapshot => callback(snapshot.settings));
  }
  function validatePresets(raw) {
    if (!Array.isArray(raw)) throw new Error('Presets must be a list.');
    const ids = new Set();
    return raw.map(preset => {
      if (!plain(preset) || Object.keys(preset).some(key => !['id', 'label', 'values', 'sessionDefaults'].includes(key)) || typeof preset.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(preset.id) || ids.has(preset.id) || catalog.presets.some(p => p.id === preset.id) || typeof preset.label !== 'string' || !preset.label.trim() || preset.label.length > 60) throw new Error('Invalid saved preset.');
      ids.add(preset.id);
      const result = {id: preset.id, label: preset.label.trim(), values: validateValues(preset.values)};
      if (preset.sessionDefaults !== undefined) {
        const s = preset.sessionDefaults;
        if (!plain(s) || Object.keys(s).length !== 2 || !['minutes', 'idleMinutes'].every(k => Number.isInteger(s[k]) && s[k] >= 0 && s[k] <= 1440)) throw new Error('Invalid preset session defaults.');
        result.sessionDefaults = {...s};
      }
      return result;
    });
  }
  async function readPresets() {
    return validatePresets(await request('readPresets'));
  }
  async function writePresets(presets) {
    return request('writePresets', validatePresets(presets));
  }
  function exportData(settings, presets, features) {
    const result = {format: 'yfe', version: features ? 2 : 1, settings: validateSettings(settings), customPresets: validatePresets(presets)};
    if (features) { result.features = YTVFeatures.validate(features); result.features.restrictions.temporaryUntil = 0; }
    return result;
  }
  function importData(raw) {
    if (!plain(raw) || !['yfe', 'yt-appearance'].includes(raw.format) || ![1, 2].includes(raw.version) || Object.keys(raw).some(key => !['format', 'version', 'settings', 'customPresets', ...(raw.version === 2 ? ['features'] : [])].includes(key))) throw new Error('This is not a supported version 1 or 2 settings file.');
    const result = {settings: validateSettings(raw.settings), customPresets: validatePresets(raw.customPresets)};
    if (raw.version === 2) { result.features = YTVFeatures.validate(raw.features); result.features.restrictions.temporaryUntil = 0; }
    return result;
  }
  globalThis.YTV = Object.freeze({defaults, normalizeSettings, validateSettings, migrateValues, readSettings, writeSettings, updateSettings, subscribe, subscribeSnapshots, readPresets, writePresets, exportData, importData, request,
    readFeatures: () => request('readFeatures'), applyImport: raw => request('applyImport', raw),
    setAuthorizationHandler: handler => { authorizationHandler = handler; },
    setEntryHandler: handler => { entryHandler = handler; }});
})();
