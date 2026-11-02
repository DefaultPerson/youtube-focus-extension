/* Local feature schema and clock calculations shared by the UI and worker. */
(() => {
  'use strict';
  const scopes = ['appearance', 'restrictions', 'filters', 'player', 'disable', 'importReset'];
  const quality = ['auto', 'lowest', 'tiny', 'small', 'medium', 'large', 'hd720', 'hd1080', 'hd1440', 'hd2160', 'highres', 'highest'];
  const kinds = ['channels', 'videos', 'comments', 'posts'];
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function fail(message) { throw new Error(message); }
  function shape(value, keys) { if (!object(value) || Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) fail('Unsupported settings structure.'); }
  function bool(value) { if (typeof value !== 'boolean') fail('Expected a boolean value.'); return value; }
  function integer(value, min, max) { if (!Number.isSafeInteger(value) || value < min || value > max) fail(`Value must be an integer from ${min} to ${max}.`); return value; }
  function text(value, max = 1000) { if (typeof value !== 'string' || value.length > max) fail(`Text must be no longer than ${max} characters.`); return value.trim(); }
  function defaults() {
    return {
      version: 2,
      focus: {openingPause: {enabled: false, seconds: 3, message: 'Which settings would you like to change?', style: 'hidden'}, showSessionWidget: false, onOpen: 'keep', presetId: '', schedules: []},
      restrictions: {enabled: false, temporaryUntil: 0, schedules: [],
        entry: {enabled: false, message: 'Why are you opening YouTube?', seconds: 5, phrase: '', countdownStyle: 'detailed'},
        session: {enabled: false, minutes: 20, idleMinutes: 15, cooldownMinutes: 5, skipPhrase: '', allowSkip: true}},
      filters: {enabled: false, contextButtons: false, channels: [], videos: [], comments: [], posts: []},
      player: {enabled: false, quality: 'auto', nativeControls: false, disableAutoplay: false, disableNextAutoplay: false, skipAds: false, seekAds: false},
    };
  }
  function validate(raw) {
    if (raw?.version === 1) {
      shape(raw, ['version', 'restrictions', 'filters', 'player']);
      raw = structuredClone(raw); raw.version = 2; raw.focus = defaults().focus;
      raw.restrictions.entry.countdownStyle = 'detailed';
      raw.restrictions.session.allowSkip = Boolean(raw.restrictions.session.skipPhrase);
    }
    if (raw?.version === 2 && raw.player && !Object.hasOwn(raw.player, 'seekAds')) { raw = structuredClone(raw); raw.player.seekAds = false; }
    if (raw?.version === 2 && object(raw.focus) && !Object.hasOwn(raw.focus, 'showSessionWidget')) { raw = structuredClone(raw); raw.focus.showSessionWidget = false; }
    shape(raw, ['version', 'focus', 'restrictions', 'filters', 'player']);
    if (raw.version !== 2) fail('Unsupported feature settings version.');
    // Migrate only the exact defaults shipped before the language setting existed.
    if (raw.focus?.openingPause?.message === 'Какие настройки вы хотите изменить?' || raw.restrictions?.entry?.message === 'Зачем вы открываете YouTube?') {
      raw = structuredClone(raw);
      if (raw.focus?.openingPause?.message === 'Какие настройки вы хотите изменить?') raw.focus.openingPause.message = defaults().focus.openingPause.message;
      if (raw.restrictions?.entry?.message === 'Зачем вы открываете YouTube?') raw.restrictions.entry.message = defaults().restrictions.entry.message;
    }
    const focus = raw.focus;
    shape(focus, ['openingPause', 'showSessionWidget', 'onOpen', 'presetId', 'schedules']);
    shape(focus.openingPause, ['enabled', 'seconds', 'message', 'style']);
    if (!['keep', 'ask', 'preset'].includes(focus.onOpen) || !['hidden', 'subtle', 'detailed'].includes(focus.openingPause.style)) fail('Unknown focus mode.');
    const focusValue = {openingPause: {enabled: bool(focus.openingPause.enabled), seconds: integer(focus.openingPause.seconds, 0, 300), message: text(focus.openingPause.message), style: focus.openingPause.style}, showSessionWidget: bool(focus.showSessionWidget), onOpen: focus.onOpen, presetId: text(focus.presetId, 80), schedules: []};
    if (focus.onOpen === 'preset' && !focusValue.presetId) fail('Choose a preset to apply when opening YouTube.');
    if (!Array.isArray(focus.schedules) || focus.schedules.length > 50) fail('You can add up to 50 preset schedules.');
    const ids = new Set(), occupied = new Uint8Array(10080);
    for (const rule of focus.schedules) {
      shape(rule, ['id', 'enabled', 'days', 'from', 'to', 'presetId', 'returnPrevious']);
      const id = text(rule.id, 80), presetId = text(rule.presetId, 80);
      if (!id || ids.has(id) || !presetId) fail('Check the schedule ID and preset.'); ids.add(id);
      validateSchedule(rule);
      const item = {id, presetId, enabled: bool(rule.enabled), days: [...rule.days], from: rule.from, to: rule.to, returnPrevious: bool(rule.returnPrevious)};
      if (item.enabled) for (const day of item.days) {
        const start = day * 1440 + minutes(item.from), length = (minutes(item.to) - minutes(item.from) + 1440) % 1440 || 1440;
        for (let i = start; i < start + length; i++) { if (occupied[i % 10080]) fail('Preset schedules overlap.'); occupied[i % 10080] = 1; }
      }
      focusValue.schedules.push(item);
    }
    const r = raw.restrictions, f = raw.filters, p = raw.player;
    shape(r, ['enabled', 'temporaryUntil', 'schedules', 'entry', 'session']);
    shape(r.entry, ['enabled', 'message', 'seconds', 'phrase', 'countdownStyle']);
    shape(r.session, ['enabled', 'minutes', 'idleMinutes', 'cooldownMinutes', 'skipPhrase', 'allowSkip']);
    if (!['hidden', 'subtle', 'detailed'].includes(r.entry.countdownStyle)) fail('Unknown countdown style.');
    if (!Array.isArray(r.schedules) || r.schedules.length > 50) fail('You can add up to 50 schedule intervals.');
    const schedules = r.schedules.map(s => {
      shape(s, ['days', 'from', 'to']);
      validateSchedule(s);
      return {days: [...s.days], from: s.from, to: s.to};
    });
    shape(f, ['enabled', 'contextButtons', ...kinds]);
    const filters = {enabled: bool(f.enabled), contextButtons: bool(f.contextButtons)};
    for (const kind of kinds) {
      if (!Array.isArray(f[kind])) fail('Rules must be a list.');
      filters[kind] = [...new Set(f[kind].map(rule => {
        if (typeof rule !== 'string' || !rule.trim() || rule.length > 500) fail('A rule must contain between 1 and 500 characters.');
        const normalized = globalThis.YTVFilterRules?.normalizeRule(kind, rule);
        if (!normalized || !YTVFilterRules.validateRule(kind, normalized)) fail(`Invalid rule: ${rule.slice(0, 80)}`);
        return normalized;
      }))];
    }
    shape(p, ['enabled', 'quality', 'nativeControls', 'disableAutoplay', 'disableNextAutoplay', 'skipAds', 'seekAds']);
    if (!quality.includes(p.quality)) fail('Unknown video quality.');
    return {version: 2, focus: focusValue,
      restrictions: {enabled: bool(r.enabled), temporaryUntil: integer(r.temporaryUntil, 0, 8640000000000000), schedules,
        entry: {enabled: bool(r.entry.enabled), message: text(r.entry.message), seconds: integer(r.entry.seconds, 0, 300), phrase: text(r.entry.phrase), countdownStyle: r.entry.countdownStyle},
        session: {enabled: bool(r.session.enabled), minutes: integer(r.session.minutes, 0, 1440), idleMinutes: integer(r.session.idleMinutes, 0, 1440), cooldownMinutes: integer(r.session.cooldownMinutes, 0, 1440), skipPhrase: text(r.session.skipPhrase), allowSkip: bool(r.session.allowSkip)}},
      filters, player: Object.fromEntries(Object.entries(p).map(([key, value]) => [key, key === 'quality' ? value : bool(value)]))};
  }
  function protectionDefaults() {
    return {enabled: false, method: 'password', phrase: '', verifier: null, duration: 'single', scopes: Object.fromEntries(scopes.map(s => [s, true]))};
  }
  const minutes = time => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
  function validateSchedule(s) {
    if (!Array.isArray(s.days) || !s.days.length || s.days.length > 7 || new Set(s.days).size !== s.days.length) fail('Choose weekdays without duplicates.');
    s.days.forEach(day => integer(day, 0, 6));
    if (![s.from, s.to].every(v => typeof v === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v))) fail('Invalid schedule time.');
  }
  function presetWindow(schedules, now) {
    const current = new Date(now); let active = null, nextAt = null;
    for (const rule of schedules.filter(r => r.enabled)) for (let offset = -1; offset <= 7; offset++) {
      const day = new Date(current.getFullYear(), current.getMonth(), current.getDate() + offset);
      if (!rule.days.includes(day.getDay())) continue;
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes(rule.from)).getTime();
      const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + (minutes(rule.to) <= minutes(rule.from) ? 1 : 0), 0, minutes(rule.to)).getTime();
      if (start <= now && now < end) active = {rule, key: `${rule.id}:${start}`, end};
      for (const at of [start, end]) if (at > now && (nextAt === null || at < nextAt)) nextAt = at;
    }
    return {active, nextAt};
  }
  // A day belongs to the start of its interval. Equal times mean 24 hours.
  function scheduleWindow(schedules, now) {
    const current = new Date(now);
    let blockedUntil = 0, nextStart = null;
    for (const schedule of schedules) for (let offset = -1; offset <= 7; offset++) {
      const day = new Date(current.getFullYear(), current.getMonth(), current.getDate() + offset);
      if (!schedule.days.includes(day.getDay())) continue;
      const [fh, fm] = schedule.from.split(':').map(Number), [th, tm] = schedule.to.split(':').map(Number);
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), fh, fm).getTime();
      const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + (th * 60 + tm <= fh * 60 + fm ? 1 : 0), th, tm).getTime();
      if (start <= now && now < end) blockedUntil = Math.max(blockedUntil, end);
      if (start > now && (nextStart === null || start < nextStart)) nextStart = start;
    }
    return {blockedUntil, nextStart};
  }
  function freshRuntime() { return {session: null, preparation: null, cooldownUntil: 0, cooldownId: null, cooldownSkipPhrase: '', cooldownAllowSkip: false}; }
  function advance(runtime, config, now) {
    const next = structuredClone(runtime);
    if (next.preparation && next.preparation.expiresAt <= now) next.preparation = null;
    if (next.cooldownUntil <= now) next.cooldownUntil = 0;
    if (next.session) {
      const ends = [next.session.endsAt, next.session.idleAt].filter(Number.isFinite);
      const endedAt = Math.min(...ends);
      if (endedAt <= now) {
        next.cooldownId = next.session.id;
        next.cooldownSkipPhrase = next.session.skipPhrase ?? config.session?.skipPhrase ?? '';
        next.cooldownAllowSkip = next.session.allowSkip ?? config.session?.allowSkip ?? false;
        next.cooldownUntil = Math.max(0, endedAt + next.session.cooldownMinutes * 60000);
        if (next.cooldownUntil <= now) next.cooldownUntil = 0;
        next.session = null;
        next.preparation = null;
      }
    }
    if (!config.enabled) return freshRuntime();
    return next;
  }
  globalThis.YTVFeatures = Object.freeze({defaults, validate, scopes, kinds, quality, protectionDefaults, scheduleWindow, presetWindow, freshRuntime, advance});
})();
