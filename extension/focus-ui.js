/* Local focus controls. Session and authorization decisions belong to the worker. */
(() => {
  'use strict';
  const t = text => globalThis.YFEI18n?.t(text) ?? text;
  const stockMessage = value => ['Which settings would you like to change?', 'Какие настройки вы хотите изменить?'].includes(value);
  const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  const section = el('section'); section.dataset.section = 'focus'; section.hidden = location.hash !== '#focus';
  document.querySelector('main').append(section);
  section.innerHTML = `<h2>Focus and presets</h2>
    <p class="muted">Presets change how YouTube looks. Filters and limits apply to all presets. Preset session defaults take effect when a new session starts.</p>
    <fieldset><legend>Current YouTube session</legend>
      <p id="focus-session-status" role="status"></p><p id="focus-session-idle" class="muted"></p>
      <div class="button-row"><button id="focus-start-session" type="button">Start session on YouTube</button><button id="focus-end-session" type="button" hidden>End session</button><button id="focus-configure-session" type="button">Configure session defaults</button></div>
      <p class="muted">Start a session to choose its preset, duration and inactivity timeout. The session is shared across YouTube tabs.</p>
    </fieldset>
    <p id="focus-active" role="status" class="muted"></p>
    <form id="focus-activate-form"><fieldset><legend>Choose a preset now</legend>
      <label>Preset<select id="focus-active-preset" required></select></label>
      <button type="submit">Apply preset</button></fieldset></form>
    <form id="focus-form"><fieldset><legend>Pause before settings</legend>
      <label class="check"><input id="focus-pause-enabled" type="checkbox"> Pause before opening settings</label>
      <label>Message<textarea id="focus-pause-message" rows="2" maxlength="1000"></textarea></label>
      <label>Pause in seconds<input id="focus-pause-seconds" type="number" min="0" max="300" step="1" required></label>
      <label>Countdown<select id="focus-pause-style"><option value="hidden">Hidden</option><option value="subtle">Progress bar</option><option value="detailed">Seconds remaining</option></select></label>
    </fieldset><fieldset><legend>When a new YouTube session starts</legend>
      <label>Preset selection<select id="focus-on-open"><option value="keep">Keep current preset</option><option value="ask">Ask every time</option><option value="preset">Apply selected preset</option></select></label>
      <label id="focus-open-preset-label">Preset<select id="focus-open-preset"></select></label>
      <p class="muted">Opening another tab during an active session does not start a new session.</p>
    </fieldset><fieldset><legend>Preset schedule</legend>
      <p class="muted">Uses your computer’s local time. Overnight periods belong to the day they start. All day runs from midnight to midnight. A manual selection lasts until the next scheduled change.</p>
      <div id="focus-schedules"></div><button id="focus-add-schedule" type="button">Add period</button>
    </fieldset><button type="submit" class="primary">Save focus settings</button></form>
    <h3>Session defaults for my presets</h3>
    <p class="muted">Built-in presets use the shared session defaults. Custom presets can set a session length and idle timeout; 0 means no limit. Turn off custom defaults to use the shared values.</p>
    <div id="focus-defaults"></div>
    <fieldset><legend>Keyboard shortcut</legend>
      <p>In Chrome keyboard shortcuts, find YFE and “Turn the extension on or off” (toggle-extension).</p>
      <p class="muted">Address: chrome://extensions/shortcuts</p>
      <button id="focus-shortcuts" type="button">Open Chrome keyboard shortcuts</button>
    </fieldset>`;
  const $ = id => section.querySelector('#' + id);
  let presets = [], customPresets = [], busy = false, loaded = false, activePresetId = '', sessionAccess = null;
  const option = (id, label) => { const node = el('option', label); node.value = id; return node; };
  function presetSelect(select, id = '') {
    select.replaceChildren(option('', 'Choose a preset'), ...presets.map(p => { const node = option(p.id, p.label); if (!YTV_CATALOG.presets.some(b => b.id === p.id)) node.dataset.i18nIgnore = ''; return node; }));
    if (id && !presets.some(p => p.id === id)) select.append(option(id, 'Preset deleted — choose another'));
    select.value = id;
  }
  function field(caption, input) { const label = el('label', caption); label.append(input); return label; }
  function check(caption, checked) { const input = el('input'); input.type = 'checkbox'; input.checked = checked; const label = el('label', undefined, 'check'); label.append(input, caption); return {input, label}; }
  function number(value) { const input = el('input'); input.type = 'number'; input.min = '0'; input.max = '1440'; input.step = '1'; input.required = true; input.value = value; return input; }
  function showError(error) { const target = document.getElementById('error'); target.hidden = false; target.textContent = error.message; document.getElementById('save-status').textContent = 'Change not applied.'; }
  async function mutate(action) {
    if (busy || !loaded) return;
    busy = true; document.getElementById('error').hidden = true; document.getElementById('save-status').textContent = 'Saving…';
    section.querySelectorAll('fieldset').forEach(node => { node.disabled = true; });
    section.querySelectorAll('button').forEach(node => { node.disabled = true; });
    try { await action(); document.getElementById('save-status').textContent = 'Saved in this browser.'; }
    catch (error) { showError(error); }
    finally { busy = false; section.querySelectorAll('fieldset').forEach(node => { node.disabled = false; }); section.querySelectorAll('button').forEach(node => { node.disabled = false; }); }
  }
  function onOpenMode() { const usePreset = $('focus-on-open').value === 'preset'; $('focus-open-preset-label').hidden = !usePreset; $('focus-open-preset').required = usePreset; $('focus-open-preset').disabled = !usePreset; }
  function scheduleRow(value = {id: crypto.randomUUID(), enabled: true, days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00', presetId: '', returnPrevious: true}) {
    const row = el('div', undefined, 'schedule-row'); row.dataset.focusSchedule = value.id;
    const enabled = check('Enable period', value.enabled); enabled.input.dataset.focusEnabled = ''; row.append(enabled.label);
    const days = el('div', undefined, 'weekdays');
    for (const [day, caption] of [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']]) {
      const choice = check(caption, value.days.includes(day)); choice.input.dataset.focusDay = day; days.append(choice.label);
    }
    const firstDay = days.querySelector('input');
    function validateDays() { firstDay.setCustomValidity(days.querySelector('input:checked') ? '' : t('Select at least one day of the week.')); }
    days.addEventListener('change', validateDays); validateDays(); row.append(days);
    const allDay = check('All day', value.from === value.to); row.append(allDay.label);
    const times = el('div', undefined, 'schedule-times');
    const timeInputs = ['from', 'to'].map((key, index) => { const input = el('input'); input.type = 'time'; input.required = true; input.value = value[key]; input.dataset.focusTime = key; times.append(field(index ? 'To' : 'From', input)); return input; });
    function updateAllDay() { for (const input of timeInputs) { input.disabled = allDay.input.checked; if (allDay.input.checked) input.value = '00:00'; } }
    allDay.input.addEventListener('change', updateAllDay); updateAllDay(); row.append(times);
    const select = el('select'); select.dataset.focusPreset = ''; select.required = true; presetSelect(select, value.presetId); row.append(field('Preset', select));
    const restore = check('Restore the previous preset after this period', value.returnPrevious); restore.input.dataset.focusReturn = ''; row.append(restore.label);
    const remove = el('button', 'Remove period'); remove.type = 'button'; remove.addEventListener('click', () => { row.remove(); $('focus-add-schedule').focus(); }); row.append(remove);
    $('focus-schedules').append(row);
  }
  function readFocus() {
    return {openingPause: {enabled: $('focus-pause-enabled').checked, seconds: Number($('focus-pause-seconds').value), message: stockMessage($('focus-pause-message').value) ? YFEI18n.source($('focus-pause-message').value) : $('focus-pause-message').value, style: $('focus-pause-style').value},
      onOpen: $('focus-on-open').value, presetId: $('focus-open-preset').value,
      schedules: [...$('focus-schedules').children].map(row => ({id: row.dataset.focusSchedule, enabled: row.querySelector('[data-focus-enabled]').checked,
        days: [...row.querySelectorAll('[data-focus-day]:checked')].map(input => Number(input.dataset.focusDay)), from: row.querySelector('[data-focus-time=from]').value, to: row.querySelector('[data-focus-time=to]').value,
        presetId: row.querySelector('[data-focus-preset]').value, returnPrevious: row.querySelector('[data-focus-return]').checked}))};
  }
  function describeActive() { const preset = presets.find(p => p.id === activePresetId), name = preset && (YTV_CATALOG.presets.some(p => p.id === preset.id) ? t(preset.label) : preset.label); $('focus-active').textContent = t(name ? `Active preset: ${name}` : 'No active preset, or settings have been changed manually.'); }
  function describeSession() {
    const access = sessionAccess; if (!access) return;
    const now = Date.now();
    const clock = milliseconds => { const seconds = Math.max(0, Math.floor(milliseconds / 1000)); return `${Math.floor(seconds / 60)} min ${seconds % 60} s`; };
    let status = 'No active session';
    if (access.phase === 'active') status = Number.isFinite(access.endsAt) ? `Session remaining: ${clock(access.endsAt - now)}` : `Session elapsed: ${clock(now - access.startedAt)}`;
    else if (access.phase === 'cooldown') status = `Break remaining: ${clock(access.until - now)}`;
    else if (['entry', 'setup'].includes(access.phase)) status = 'Session setup is waiting on YouTube';
    else if (['temporary', 'schedule'].includes(access.phase)) status = 'YouTube is currently blocked';
    $('focus-session-status').textContent = t(status);
    $('focus-session-idle').textContent = access.phase === 'active' ? t(Number.isFinite(access.idleAt) ? `Inactivity timeout in: ${clock(access.idleAt - now)}` : 'Inactivity timeout is off') : '';
    $('focus-end-session').hidden = access.phase !== 'active';
    $('focus-start-session').hidden = access.phase === 'active' || ['temporary', 'schedule', 'cooldown'].includes(access.phase);
    $('focus-start-session').textContent = t(['entry', 'setup'].includes(access.phase) ? 'Continue session setup on YouTube' : 'Start session on YouTube');
  }
  function renderDefaults() {
    $('focus-defaults').replaceChildren();
    if (!customPresets.length) { $('focus-defaults').append(el('p', 'Save a custom preset in “Presets and backup” first.', 'muted')); return; }
    for (const preset of customPresets) {
      const form = el('form'), group = el('fieldset'), legend = el('legend', preset.label); legend.dataset.i18nIgnore = ''; group.append(legend);
      const override = check('Custom defaults for new sessions', Boolean(preset.sessionDefaults)); group.append(override.label);
      const minutes = number(preset.sessionDefaults?.minutes ?? 20), idle = number(preset.sessionDefaults?.idleMinutes ?? 15);
      const fields = el('div', undefined, 'form-grid'); fields.append(field('Session length in minutes (0 = unlimited)', minutes), field('Idle timeout in minutes (0 = off)', idle)); group.append(fields);
      const refresh = () => { minutes.disabled = idle.disabled = !override.input.checked; }; override.input.addEventListener('change', refresh); refresh();
      const save = el('button', 'Save preset defaults'); save.type = 'submit'; group.append(save); form.append(group);
      form.addEventListener('submit', event => { event.preventDefault(); if (!form.reportValidity()) return; void mutate(async () => {
        const fresh = await YTV.readPresets(); if (!fresh.some(p => p.id === preset.id)) throw new Error('This preset was deleted. Reload the settings page.');
        const next = fresh.map(p => { if (p.id !== preset.id) return p; const result = {...p}; if (override.input.checked) result.sessionDefaults = {minutes: Number(minutes.value), idleMinutes: Number(idle.value)}; else delete result.sessionDefaults; return result; });
        await YTV.writePresets(next); customPresets = await YTV.readPresets(); presets = [...YTV_CATALOG.presets, ...customPresets]; renderDefaults();
      }); });
      $('focus-defaults').append(form);
    }
  }
  function render(focus) {
    $('focus-pause-enabled').checked = focus.openingPause.enabled; $('focus-pause-seconds').value = focus.openingPause.seconds; $('focus-pause-message').value = stockMessage(focus.openingPause.message) ? t(focus.openingPause.message) : focus.openingPause.message; $('focus-pause-style').value = focus.openingPause.style;
    $('focus-on-open').value = focus.onOpen; presetSelect($('focus-open-preset'), focus.presetId); onOpenMode();
    presetSelect($('focus-active-preset'), activePresetId); $('focus-schedules').replaceChildren(); focus.schedules.forEach(scheduleRow); renderDefaults(); describeActive();
  }
  $('focus-on-open').addEventListener('change', onOpenMode);
  $('focus-add-schedule').addEventListener('click', () => scheduleRow());
  $('focus-form').addEventListener('submit', event => { event.preventDefault(); if (!$('focus-form').reportValidity()) return; const value = readFocus(); void mutate(() => YTV.request('writeFeature', {section: 'focus', value})); });
  $('focus-activate-form').addEventListener('submit', event => { event.preventDefault(); if (!$('focus-activate-form').reportValidity()) return; const id = $('focus-active-preset').value; void mutate(async () => { const preset = presets.find(p => p.id === id); if (YTV_CATALOG.presets.some(p => p.id === id) && !(await globalThis.YTVUI.confirmPreset(preset))) return; await YTV.request('activatePreset', {id, savePrevious: YTV_CATALOG.presets.some(p => p.id === id)}); activePresetId = id; describeActive(); }); });
  $('focus-start-session').addEventListener('click', () => void mutate(() => YTV.request('prepareSession', {openYouTube: true})));
  $('focus-end-session').addEventListener('click', () => void mutate(() => YTV.request('endSession', {sessionId: sessionAccess?.sessionId})));
  $('focus-configure-session').addEventListener('click', () => { location.hash = '#restrictions'; setTimeout(() => document.getElementById('session-enabled')?.closest('fieldset')?.scrollIntoView({block: 'start'}), 0); });
  setInterval(() => { if (!section.hidden) describeSession(); }, 1000);
  $('focus-shortcuts').addEventListener('click', () => { void chrome.tabs.create({url: 'chrome://extensions/shortcuts'}).catch(showError); });
  section.querySelectorAll('button').forEach(node => { node.disabled = true; });
  Promise.all([YTV.readFeatures(), YTV.readPresets()]).then(([features, personal]) => {
    customPresets = personal; presets = [...YTV_CATALOG.presets, ...personal]; render(features.focus); loaded = true;
    section.querySelectorAll('button').forEach(node => { node.disabled = false; });
    YTV.subscribeSnapshots(snapshot => { activePresetId = snapshot.focus?.activePresetId || ''; sessionAccess = snapshot.access; describeActive(); describeSession(); });
    window.addEventListener('ytv:imported', () => {
      void Promise.all([YTV.readFeatures(), YTV.readPresets()]).then(([features, personal]) => {
        customPresets = personal; presets = [...YTV_CATALOG.presets, ...personal]; render(features.focus);
      }).catch(showError);
    });
    window.addEventListener('ytv:navigate', () => {
      void YTV.readPresets().then(personal => {
        if (JSON.stringify(personal) === JSON.stringify(customPresets)) return;
        customPresets = personal; presets = [...YTV_CATALOG.presets, ...personal];
        for (const select of [$('focus-active-preset'), $('focus-open-preset'), ...$('focus-schedules').querySelectorAll('[data-focus-preset]')]) presetSelect(select, select.value);
        renderDefaults(); describeActive();
      }).catch(showError);
    });
  }).catch(showError);
  window.addEventListener('yfe:languagechange', () => {
    if (stockMessage($('focus-pause-message').value)) $('focus-pause-message').value = t($('focus-pause-message').value);
    for (const days of section.querySelectorAll('.weekdays')) days.dispatchEvent(new Event('change'));
    describeActive(); describeSession();
  });
})();
