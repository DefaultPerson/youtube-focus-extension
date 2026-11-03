const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;
const source = path.join(__dirname, '..', 'extension');
const version = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'))).version;

// Exercise the real background message handlers with simulated browser events/time.
// The Firefox database adapter itself is covered by browser persistence checks.
function boot(firefox, initial = {}, at = Date.UTC(2026, 10, 2, 10)) {
  let now = at;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const data = structuredClone(initial), shared = {}, session = {}, events = {}, alarms = new Map();
  const event = name => ({addListener(fn) { events[name] = fn; }});
  const store = data => ({
    async get(keys) {
      if (keys == null) return structuredClone(data);
      return Object.fromEntries((typeof keys === 'string' ? [keys] : keys).filter(k => Object.hasOwn(data, k)).map(k => [k, structuredClone(data[k])]));
    },
    async set(values) { Object.assign(data, structuredClone(values)); },
    async remove(key) { delete data[key]; },
    async setAccessLevel() {}
  });
  const base = firefox ? 'moz-extension://random-installation-uuid/' : 'chrome-extension://test/';
  const api = {
    runtime: {id: 'test', getURL: p => base + p, getManifest: () => ({version}), onMessage: event('message'), onConnect: event('connect'), onStartup: event('startup')},
    storage: {local: store(firefox ? shared : data), session: store(session), onChanged: event('storage')},
    alarms: {create: async (name, value) => alarms.set(name, value), clear: async name => alarms.delete(name), onAlarm: event('alarm')},
    sidePanel: {setPanelBehavior: async () => {}}, sidebarAction: {open: async () => {}}, action: {onClicked: event('toolbar')},
    commands: {onCommand: event('command')}, tabs: {create: async value => { events.opened = value; }}
  };
  const context = vm.createContext({[firefox ? 'browser' : 'chrome']: api, Date: Clock, crypto, URL, TextEncoder, structuredClone, console, setTimeout, clearTimeout});
  const load = name => vm.runInContext(fs.readFileSync(path.join(source, name), 'utf8'), context, {filename: name});
  if (firefox) {
    load('platform.js');
    context.YFEStorage = {local: store(data), initialize: async () => {}};
    ['catalog.js', 'core.js', 'filter-rules.js', 'feature-model.js'].forEach(load);
  } else context.importScripts = (...names) => names.forEach(load);
  load('background.js');
  const ui = {id: 'test', url: base + 'options.html', documentId: 'settings-one'};
  const content = {id: 'test', url: 'https://www.youtube.com/watch?v=test', tab: {id: 1}, documentId: 'video-one'};
  const call = (action, value, sender = ui, credential) => new Promise((resolve, reject) => {
    events.message({app: 'ytv', clientVersion: version, action, data: value, credential}, sender, result => {
      if (result.ok) resolve(structuredClone(result.value));
      else reject(Object.assign(new Error(result.error), {code: result.code}));
    });
  });
  return {call, ui, content, context, data, shared, session, events, alarms, base, advance: ms => { now += ms; }, now: () => now};
}
for (const firefox of [false, true]) {
  const name = firefox ? 'Firefox event page' : 'Chrome worker';
  test(`${name}: catalog values and invalid inputs through real messages`, async () => {
    const b = boot(firefox);
    for (const option of b.context.YTV_CATALOG.options) {
      const value = option.type === 'boolean' ? !option.default : option.type === 'color' ? '#123abc' : option.choices.at(-1).value;
      await b.call('updateSettings', {values: {[option.id]: value}});
      assert.equal((await b.call('readSettings')).values[option.id], value);
    }
    await assert.rejects(b.call('updateSettings', {values: {unknown: true}}));
  });
  test(`${name}: only this installation's UI origin can authorize mutations`, async () => {
    const b = boot(firefox);
    for (const url of ['https://example.com/options.html', 'moz-extension://other/options.html', 'chrome-extension://other/options.html', b.base + 'untrusted.html']) {
      await assert.rejects(b.call('readSettings', undefined, {...b.ui, url}));
    }
    await assert.rejects(b.call('readSettings', undefined, {...b.ui, id: 'other'}));
    assert.equal((await b.call('snapshot', undefined, b.content)).language, 'en');
    for (const action of ['configureProtection', 'requestRecovery', 'cancelRecovery', 'writeSettings']) await assert.rejects(b.call(action, {}, b.content));
  });
  test(`${name}: five-minute approval is scoped to one document`, async () => {
    const b = boot(firefox), p = await b.call('protectionInfo');
    await b.call('configureProtection', {...p, enabled: true, duration: '5m', newCredential: 'test-password'});
    await b.call('updateSettings', {values: {header_hide_search_bar: true}}, b.ui, 'test-password');
    await b.call('updateSettings', {values: {header_hide_search_bar: false}});
    await assert.rejects(b.call('updateSettings', {values: {header_hide_search_bar: true}}, {...b.ui, documentId: 'settings-two'}), {code: 'PROTECTION_REQUIRED'});
    b.advance(300001);
    await assert.rejects(b.call('updateSettings', {values: {header_hide_search_bar: true}}), {code: 'PROTECTION_REQUIRED'});
  });
  test(`${name}: reset request, cancel and expiry preserve settings across restart`, async () => {
    const b = boot(firefox), p = await b.call('protectionInfo');
    await b.call('updateSettings', {values: {header_hide_search_bar: true}});
    await b.call('configureProtection', {...p, enabled: true, recoveryMinutes: 1, newCredential: 'test-password'});
    const first = await b.call('requestRecovery');
    await b.call('cancelRecovery', {id: first.recovery.id});
    b.advance(60001); assert.equal((await b.call('protectionInfo')).enabled, true);
    const next = await b.call('requestRecovery');
    const restarted = boot(firefox, b.data, next.recovery.readyAt - 1);
    assert.equal((await restarted.call('protectionInfo')).enabled, true);
    restarted.advance(1); restarted.events.alarm({name: 'ytv-boundary'});
    assert.equal((await restarted.call('protectionInfo')).enabled, false);
    assert.equal((await restarted.call('readSettings')).values.header_hide_search_bar, true);
    assert.equal(restarted.data['ytv.protection'].verifier, null);
  });
  test(`${name}: browser startup rebuilds session deadlines and expiry`, async () => {
    const b = boot(firefox);
    const prepared = await b.call('prepareSession');
    const started = await b.call('startSession', {preparationId: prepared.access.preparationId, minutes: 1, idleMinutes: 0, presetId: 'quiet'}, b.content);
    const restarted = boot(firefox, b.data, b.now() + 10000);
    restarted.events.startup();
    assert.equal((await restarted.call('snapshot')).access.sessionId, started.access.sessionId);
    assert.equal(restarted.alarms.get('ytv-boundary').when, started.access.endsAt);
    restarted.advance(50001);
    assert.equal((await restarted.call('snapshot')).access.phase, 'open');
  });
  test(`${name}: built-in preset restores exact prior appearance after restart`, async () => {
    const b = boot(firefox);
    await b.call('updateSettings', {values: {appearance_font: 'Inter'}});
    const before = await b.call('readSettings');
    await b.call('activatePreset', {id: 'quiet', savePrevious: true});
    const restarted = boot(firefox, b.data);
    await restarted.call('restoreAppearance');
    assert.deepEqual(await restarted.call('readSettings'), before);
  });
}
test('Firefox private record changes notify settings pages without exposing values to YouTube', async () => {
  const b = boot(true), uiMessages = [], contentMessages = [];
  const port = (sender, messages) => ({name: 'ytv-updates', sender, onDisconnect: {addListener() {}}, postMessage: message => messages.push(structuredClone(message))});
  b.events.connect(port(b.ui, uiMessages));
  b.events.connect(port(b.content, contentMessages));
  const p = await b.call('protectionInfo');
  await b.call('configureProtection', {...p, enabled: true, newCredential: 'test-password'});
  assert.deepEqual(uiMessages.filter(m => m.type === 'recordsChanged'), [{type: 'recordsChanged', keys: ['ytv.protection']}]);
  assert.equal(contentMessages.filter(m => m.type === 'recordsChanged').length, 0);
  assert(!JSON.stringify([...uiMessages, ...contentMessages]).includes('verifier'));
});
