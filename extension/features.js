(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const t = text => YFEI18n.t(text);
  const stockMessage = value => ['Why are you opening YouTube?', 'Зачем вы открываете YouTube?'].includes(value);
  const controls = '[data-section="restrictions"] button, [data-section="protection"] button, [data-section="filters"] button, [data-section="player"] button';
  let features, protection, busy = false, accessState;
  const scopeLabels = {appearance: 'Appearance and presets', restrictions: 'Schedules, sessions and blocks', filters: 'Filter rules', player: 'Player settings', disable: 'Extension on/off switch', importReset: 'Import and reset'};
  function showError(error) { $('error').hidden = false; $('error').textContent = error.message; $('save-status').textContent = 'Change not applied.'; }
  async function mutate(action) {
    if (busy) return;
    busy = true; $('error').hidden = true; $('save-status').textContent = 'Saving…';
    document.querySelectorAll(controls).forEach(b => b.disabled = true);
    try { await action(); features = await YTV.readFeatures(); $('save-status').textContent = 'Saved in this browser.'; }
    catch (error) { showError(error); }
    finally { busy = false; document.querySelectorAll(controls).forEach(b => b.disabled = false); }
  }
  function scheduleRow(value = {days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00'}) {
    const row = document.createElement('div'); row.className = 'schedule-row';
    const days = document.createElement('div'); days.className = 'weekdays';
    for (const [day, label] of [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']]) {
      const wrap = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.dataset.day = day; input.checked = value.days.includes(day); wrap.append(input, label); days.append(wrap);
    }
    const times = document.createElement('div'); times.className = 'schedule-times';
    for (const [key, caption] of [['from', 'From'], ['to', 'To']]) { const label = document.createElement('label'), input = document.createElement('input'); label.textContent = caption; input.type = 'time'; input.required = true; input.dataset.time = key; input.value = value[key]; label.append(input); times.append(label); }
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove period'; remove.addEventListener('click', () => row.remove()); times.append(remove);
    row.append(days, times); $('schedule-rows').append(row);
  }
  function render() {
    const r = features.restrictions;
    $('restriction-enabled').checked = r.enabled; $('entry-enabled').checked = r.entry.enabled; $('entry-message').value = stockMessage(r.entry.message) ? t(r.entry.message) : r.entry.message; $('entry-seconds').value = r.entry.seconds; $('entry-phrase').value = r.entry.phrase;
    $('entry-countdown').value = r.entry.countdownStyle; $('allow-skip').checked = r.session.allowSkip;
    $('session-enabled').checked = r.session.enabled; $('session-minutes').value = r.session.minutes; $('idle-minutes').value = r.session.idleMinutes; $('cooldown-minutes').value = r.session.cooldownMinutes; $('cooldown-phrase').value = r.session.skipPhrase;
    $('schedule-rows').replaceChildren(); r.schedules.forEach(scheduleRow);
    $('filters-enabled').checked = features.filters.enabled; $('filter-buttons').checked = features.filters.contextButtons;
    for (const kind of YTVFeatures.kinds) $('filter-' + kind).value = features.filters[kind].join('\n');
    const p = features.player;
    $('player-enabled').checked = p.enabled; $('player-quality').value = p.quality;
    for (const [id, key] of [['native-controls', 'nativeControls'], ['disable-autoplay', 'disableAutoplay'], ['disable-next', 'disableNextAutoplay'], ['skip-ads', 'skipAds'], ['seek-ads', 'seekAds']]) $(id).checked = p[key];
    renderProtection();
  }
  function renderProtection() {
    $('protection-enabled').checked = protection.enabled; $('protection-method').value = protection.method; $('protection-duration').value = protection.duration;
    for (const scope of YTVFeatures.scopes) $('scope-' + scope).checked = protection.scopes[scope];
    $('new-credential').value = ''; $('repeat-credential').value = '';
  }
  function write(section, value) { return YTV.request('writeFeature', {section, value}); }
  function restrictionInput() {
    return {enabled: $('restriction-enabled').checked, temporaryUntil: features.restrictions.temporaryUntil,
      schedules: [...document.querySelectorAll('#schedule-rows > .schedule-row')].map(row => ({days: [...row.querySelectorAll('[data-day]:checked')].map(i => Number(i.dataset.day)), from: row.querySelector('[data-time=from]').value, to: row.querySelector('[data-time=to]').value})),
      entry: {enabled: $('entry-enabled').checked, message: stockMessage($('entry-message').value) ? YFEI18n.source($('entry-message').value) : $('entry-message').value, seconds: Number($('entry-seconds').value), phrase: $('entry-phrase').value, countdownStyle: $('entry-countdown').value},
      session: {enabled: $('session-enabled').checked, minutes: Number($('session-minutes').value), idleMinutes: Number($('idle-minutes').value), cooldownMinutes: Number($('cooldown-minutes').value), skipPhrase: $('cooldown-phrase').value, allowSkip: $('allow-skip').checked}};
  }
  function describe(access) {
    accessState = access;
    const names = {open: 'Access allowed', active: 'Session active', temporary: 'Temporary block', schedule: 'Scheduled block', entry: 'Waiting to start a session', setup: 'Setting up a new session', cooldown: 'Break between sessions'};
    $('session-status').textContent = names[access.phase] + (access.until ? ` until ${new Date(access.until).toLocaleString(YFEI18n.language)}` : access.endsAt ? ` — ${Math.max(0, Math.ceil((access.endsAt - Date.now()) / 60000))} min left` : '');
    $('end-session').hidden = access.phase !== 'active';
  }
  async function init() {
    for (const [value, label] of [['auto', 'Automatic'], ['lowest', 'Lowest'], ['tiny', '144p'], ['small', '240p'], ['medium', '360p'], ['large', '480p'], ['hd720', '720p'], ['hd1080', '1080p'], ['hd1440', '1440p'], ['hd2160', '2160p (4K)'], ['highres', '4320p (8K)'], ['highest', 'Highest']]) { const option = document.createElement('option'); option.value = value; option.textContent = label; $('player-quality').append(option); }
    for (const [scope, caption] of Object.entries(scopeLabels)) { const label = document.createElement('label'); label.className = 'check'; const input = document.createElement('input'); input.type = 'checkbox'; input.id = 'scope-' + scope; label.append(input, caption); $('protection-scopes').append(label); }
    [features, protection] = await Promise.all([YTV.readFeatures(), YTV.request('protectionInfo')]); render();
    $('add-schedule').addEventListener('click', () => scheduleRow());
    $('restrictions-form').addEventListener('submit', e => { e.preventDefault(); void mutate(() => write('restrictions', restrictionInput())); });
    $('temporary-start').addEventListener('click', () => { if (!$('temporary-minutes').reportValidity()) return; void mutate(async () => { const current = (await YTV.readFeatures()).restrictions; await write('restrictions', {...current, enabled: true, temporaryUntil: Date.now() + Number($('temporary-minutes').value) * 60000}); $('restriction-enabled').checked = true; }); });
    $('temporary-stop').addEventListener('click', () => void mutate(async () => { const current = (await YTV.readFeatures()).restrictions; await write('restrictions', {...current, temporaryUntil: 0}); }));
    $('filters-form').addEventListener('submit', e => { e.preventDefault(); void mutate(async () => { await write('filters', {enabled: $('filters-enabled').checked, contextButtons: $('filter-buttons').checked, ...Object.fromEntries(YTVFeatures.kinds.map(kind => [kind, $('filter-' + kind).value.split(/\r?\n/).map(v => v.trim()).filter(Boolean)]))}); const current = await YTV.readFeatures(); for (const kind of YTVFeatures.kinds) $('filter-' + kind).value = current.filters[kind].join('\n'); }); });
    $('player-form').addEventListener('submit', e => { e.preventDefault(); void mutate(() => write('player', {enabled: $('player-enabled').checked, quality: $('player-quality').value, nativeControls: $('native-controls').checked, disableAutoplay: $('disable-autoplay').checked, disableNextAutoplay: $('disable-next').checked, skipAds: $('skip-ads').checked, seekAds: $('seek-ads').checked})); });
    $('protection-form').addEventListener('submit', e => { e.preventDefault(); void mutate(async () => {
      if ($('new-credential').value !== $('repeat-credential').value) throw new Error('The password or phrase does not match its confirmation.');
      protection = await YTV.request('configureProtection', {enabled: $('protection-enabled').checked, method: $('protection-method').value, duration: $('protection-duration').value,
        scopes: Object.fromEntries(YTVFeatures.scopes.map(scope => [scope, $('scope-' + scope).checked])), newCredential: $('new-credential').value}); renderProtection();
    }); });
    $('lock-protection').addEventListener('click', () => void mutate(() => YTV.request('lockProtection')));
    $('end-session').addEventListener('click', () => void mutate(() => YTV.request('endSession', {sessionId: accessState?.sessionId})));
    YTV.subscribeSnapshots(snapshot => describe(snapshot.access));
    window.addEventListener('ytv:imported', () => { void YTV.readFeatures().then(value => { features = value; render(); }).catch(showError); });
    setInterval(() => { if (accessState) describe(accessState); }, 1000);
    if (new URL(location.href).searchParams.get('toggle') === '1') {
      const url = new URL(location.href); url.searchParams.delete('toggle'); history.replaceState(null, '', url); await YTV.updateSettings({enabled: !(await YTV.readSettings()).enabled});
    }
    $('save-status').textContent = 'Settings loaded.';
  }
  document.querySelectorAll(controls).forEach(b => b.disabled = true);
  window.addEventListener('yfe:languagechange', () => { if (stockMessage($('entry-message').value)) $('entry-message').value = t($('entry-message').value); if (accessState) describe(accessState); });
  init().then(() => document.querySelectorAll(controls).forEach(b => b.disabled = false)).catch(showError);
})();
