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
  // Thompson's construction: every state is visited at most once per input
  // character, even for nested repetition and overlapping alternatives. Each
  // native predicate consumes one character or tests a zero-width assertion.
  function boundedRegex(pattern, flags) {
    let cursor = 0;
    const unicode = flags.includes('u');
    const states = [];
    const predicates = [];
    const predicateBySource = new Map();
    const emit = state => states.push(state) - 1;
    function atom() {
      const begin = cursor;
      const character = pattern[cursor++];
      if (character === '(') {
        if (pattern[cursor] === '?') {
          if (pattern.slice(cursor, cursor + 2) !== '?:') throw new SyntaxError('Only ordinary and noncapturing groups are supported');
          cursor += 2;
        }
        const group = expression();
        if (pattern[cursor++] !== ')') throw new SyntaxError('Unclosed group');
        return group;
      }
      if (character === '[') {
        while (cursor < pattern.length && pattern[cursor] !== ']') {
          if (pattern[cursor++] === '\\') cursor++;
        }
        if (pattern[cursor++] !== ']') throw new SyntaxError('Unclosed character class');
      } else if (character === '\\') {
        const escaped = pattern[cursor++];
        if (escaped === 'x' && /^[0-9a-f]{2}/i.test(pattern.slice(cursor))) cursor += 2;
        else if (escaped === 'u' && /^[0-9a-f]{4}/i.test(pattern.slice(cursor))) {
          cursor += 4;
          // Under /u, adjacent escaped UTF-16 surrogates form one atom.
          if (unicode && /^d[89ab][0-9a-f]{2}$/i.test(pattern.slice(cursor - 4, cursor)) && /^\\u[dD][c-fC-F][0-9a-f]{2}/.test(pattern.slice(cursor))) cursor += 6;
        } else if (escaped === 'u' && unicode && pattern[cursor] === '{') {
          const close = pattern.indexOf('}', cursor);
          if (close < 0) throw new SyntaxError('Unclosed Unicode escape');
          cursor = close + 1;
        } else if (escaped === '0' && !unicode) {
          let digits = 0;
          while (digits < 2 && /[0-7]/.test(pattern[cursor] || 'x')) { cursor++; digits++; }
        }
      } else {
        if ('*+?{}|)'.includes(character)) throw new SyntaxError('Unsupported quantifier or unexpected delimiter');
        if (unicode && pattern.codePointAt(begin) > 0xffff) cursor++;
      }
      const source = pattern.slice(begin, cursor);
      if (!predicateBySource.has(source)) {
        predicateBySource.set(source, predicates.length);
        predicates.push(new RegExp(source, `${flags}y`));
      }
      return {kind: source === '^' || source === '$' || source === '\\b' || source === '\\B' ? 'assert' : 'char', predicate: predicateBySource.get(source)};
    }
    function sequence() {
      const children = [];
      while (cursor < pattern.length && !')|'.includes(pattern[cursor])) {
        let child = atom();
        const quantifier = pattern[cursor];
        if (quantifier && '*+?'.includes(quantifier)) {
          cursor++;
          if (pattern[cursor] === '?') cursor++; // Greediness cannot change a boolean match.
          child = {kind: 'repeat', quantifier, child};
        }
        children.push(child);
      }
      return {kind: 'sequence', children};
    }
    function expression() {
      const children = [sequence()];
      while (pattern[cursor] === '|') { cursor++; children.push(sequence()); }
      return children.length === 1 ? children[0] : {kind: 'alternative', children};
    }
    function compile(node, next) {
      if (node.kind === 'sequence') {
        for (let i = node.children.length - 1; i >= 0; i--) next = compile(node.children[i], next);
        return next;
      }
      if (node.kind === 'alternative') {
        let start = compile(node.children[0], next);
        for (let i = 1; i < node.children.length; i++) start = emit({kind: 'split', left: start, right: compile(node.children[i], next)});
        return start;
      }
      if (node.kind === 'repeat') {
        if (node.quantifier === '?') return emit({kind: 'split', left: compile(node.child, next), right: next});
        const split = emit({kind: 'split', right: next});
        const start = compile(node.child, split);
        states[split].left = start;
        return node.quantifier === '*' ? split : start;
      }
      return emit({...node, next});
    }
    const tree = expression();
    if (cursor !== pattern.length) throw new SyntaxError('Unexpected delimiter');
    const start = compile(tree, emit({kind: 'match'}));
    return {test(value) {
      const input = String(value).slice(0, MAX_INPUT_LENGTH);
      const seen = new Uint32Array(states.length);
      const tested = new Uint32Array(predicates.length);
      const matched = new Uint8Array(predicates.length);
      let pending = [];
      let following = [];
      const active = [];
      let generation = 0;
      let position = 0;
      function accepts(index) {
        if (tested[index] !== generation) {
          tested[index] = generation;
          predicates[index].lastIndex = position;
          matched[index] = predicates[index].test(input);
        }
        return matched[index];
      }
      while (true) {
        generation++;
        pending.push(start); // Unanchored search shares states across every start position.
        while (pending.length) {
          const index = pending.pop();
          if (seen[index] === generation) continue;
          seen[index] = generation;
          const state = states[index];
          if (state.kind === 'match') return true;
          if (state.kind === 'split') pending.push(state.left, state.right);
          else if (state.kind === 'assert') {
            if (accepts(state.predicate)) pending.push(state.next);
          } else active.push(index);
        }
        if (position === input.length) return false;
        for (const index of active) {
          const state = states[index];
          if (accepts(state.predicate)) following.push(state.next);
        }
        active.length = 0;
        const empty = pending;
        pending = following;
        following = empty;
        position += unicode && input.codePointAt(position) > 0xffff ? 2 : 1;
      }
    }};
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
    let escaped = false;
    let inClass = false;
    let optional = 0;
    let simple = true;
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
      if ('()*+{}|'.includes(character)) simple = false;
      if (character === '?' && ++optional > 4) simple = false;
    }
    if (escaped || inClass) return null;
    try {
      const native = new RegExp(pattern, flags); // Syntax validation never executes the pattern.
      // Keep the existing fast path: at most four optional atoms and no other
      // repetition or alternatives, so backtracking is bounded by a constant.
      return simple ? native : boundedRegex(pattern, flags);
    } catch { return null; }
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
