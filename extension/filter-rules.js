/* Local rule parsing shared by the editor, privileged writer and DOM filter. */
(() => {
  'use strict';
  const kinds = new Set(['channels', 'videos', 'comments', 'posts']);
  const MAX_RULE_LENGTH = 512;
  const MAX_PATTERN_LENGTH = 128;
  const MAX_INPUT_LENGTH = 8192;
  const foldName = value => value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();

  function youtubeURL(value) {
    try {
      const url = new URL(value, 'https://www.youtube.com');
      if (!['http:', 'https:'].includes(url.protocol) || !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname)) return null;
      return url;
    } catch { return null; }
  }
  function identity(kind, value) {
    const url = youtubeURL(value);
    if (!url) return null;
    try {
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (kind === 'channels') {
        if (parts[0]?.startsWith('@') && parts[0].length > 1) return {type: 'handle', value: foldName(parts[0].slice(1))};
        if (parts[0] === 'channel' && parts[1]) return {type: 'id', value: parts[1]};
      }
      if (kind === 'videos') {
        const id = url.hostname === 'youtu.be' ? parts[0] : url.pathname === '/watch' ? url.searchParams.get('v') : parts[0] === 'shorts' ? parts[1] : null;
        if (id && /^[A-Za-z0-9_-]+$/.test(id)) return {type: 'id', value: id};
      }
      if (kind === 'comments' && url.searchParams.get('lc')) return {type: 'id', value: url.searchParams.get('lc')};
      if (kind === 'posts' && parts[0] === 'post' && parts[1]) return {type: 'id', value: parts[1]};
    } catch { /* Invalid percent escapes do not supply an identity. */ }
    return null;
  }
  function parseRegex(raw) {
    if (!raw.startsWith('/')) return undefined;
    let delimiter = -1;
    for (let i = raw.length - 1; i > 0; i--) {
      if (raw[i] !== '/') continue;
      let escapes = 0;
      for (let j = i - 1; j >= 0 && raw[j] === '\\'; j--) escapes++;
      if (escapes % 2 === 0) { delimiter = i; break; }
    }
    if (delimiter < 1) return undefined;
    const pattern = raw.slice(1, delimiter);
    const flags = raw.slice(delimiter + 1);
    if (!pattern || pattern.length > MAX_PATTERN_LENGTH || !/^[imsu]*$/.test(flags) || new Set(flags).size !== flags.length) return null;
    // A bounded subset: no groups, alternatives, repetitions or backreferences.
    // At most four optional atoms keep backtracking bounded independently of input.
    let escaped = false;
    let inClass = false;
    let optional = 0;
    for (const character of pattern) {
      if (escaped) {
        if (/[1-9kpcP]/.test(character)) return null;
        escaped = false;
        continue;
      }
      if (character === '\\') { escaped = true; continue; }
      if (character === '[' && !inClass) { inClass = true; continue; }
      if (character === ']' && inClass) { inClass = false; continue; }
      if (inClass) continue;
      if ('()*+{}|'.includes(character)) return null;
      if (character === '?' && ++optional > 4) return null;
    }
    if (escaped || inClass) return null;
    try { return new RegExp(pattern, flags); } catch { return null; }
  }
  function normalizeRule(kind, value) {
    if (!kinds.has(kind) || typeof value !== 'string') return null;
    const raw = value.trim();
    if (!raw || raw.length > MAX_RULE_LENGTH || /[\r\n\u0000-\u001f\u007f]/u.test(raw)) return null;
    const looksLikeURL = /^(?:https?:\/\/|\/\/|\/(?:@|channel\/|watch\?|shorts\/|post\/))/i.test(raw);
    if (looksLikeURL) {
      const found = identity(kind, raw);
      return found ? (kind === 'channels' && found.type === 'handle' ? `@${found.value}` : found.value) : null;
    }
    const regex = parseRegex(raw);
    if (regex === null) return null;
    if (regex) return raw;
    if (kind === 'channels' && raw.startsWith('@') && !raw.slice(1).trim()) return null;
    return raw;
  }
  function compileRule(kind, value) {
    const raw = normalizeRule(kind, value);
    if (!raw) return null;
    const regex = parseRegex(raw);
    if (regex) return {type: 'regex', value: regex};
    if (kind !== 'channels') return {type: 'literal', value: raw.toLocaleLowerCase()};
    if (raw.startsWith('@')) return {type: 'handle', value: foldName(raw.slice(1))};
    return /^UC[A-Za-z0-9_-]+$/.test(raw) ? {type: 'id', value: raw} : {type: 'name', value: foldName(raw)};
  }
  globalThis.YTVFilterRules = Object.freeze({normalizeRule, validateRule: (kind, value) => normalizeRule(kind, value) !== null, compileRule, identity, foldName, MAX_RULE_LENGTH, MAX_INPUT_LENGTH});
})();
