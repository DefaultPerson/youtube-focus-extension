/* Local language preference; canonical UI copy stays English. No user values are edited. */
(() => {
  'use strict';
  const messages = globalThis.YFE_LOCALES?.ru || {};
  const reverse = new Map(Object.entries(messages).map(([en, ru]) => [ru, en]));
  const sources = new WeakMap();
  const renderedSources = new Map();
  const observed = new Map();
  const attributes = ['placeholder', 'title', 'aria-label', 'label'];
  let language = 'en', revision = 0;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const patterns = [
    [/^(Session remaining|Session elapsed|Break remaining|Inactivity timeout in): (\d+) min (\d+) s$/, m => `${({'Session remaining': 'Осталось в сеансе', 'Session elapsed': 'Прошло в сеансе', 'Break remaining': 'Осталось до конца перерыва', 'Inactivity timeout in': 'До тайм-аута бездействия'})[m[1]]}: ${m[2]} мин ${m[3]} с`],
    [/^(\d+) matching settings\.?$/, m => `Подходящих настроек: ${m[1]}`],
    [/^Reset: (.+)$/s, m => `Сбросить: ${russian(m[1])}`],
    [/^Apply preset: (.+)$/s, m => `Применить набор: ${m[1]}`],
    [/^Delete preset: (.+)$/s, m => `Удалить набор: ${m[1]}`],
    [/^Active preset: (.+)$/s, m => `Активный набор: ${m[1]}`],
    [/^The preset “(.*)” will be deleted\. Your current settings will be kept\.$/s, m => `Набор «${m[1]}» будет удалён. Текущие настройки сохранятся.`],
    [/^Could not save or load settings\. (.+)$/s, m => `Не удалось сохранить или загрузить настройки. ${russian(m[1])}`],
    [/^Unknown setting: (.*)$/s, m => `Неизвестная настройка: ${m[1]}`],
    [/^Invalid value: (.*)$/s, m => `Некорректное значение: ${russian(m[1])}`],
    [/^Invalid rule: (.*)$/s, m => `Некорректное правило: ${m[1]}`],
    [/^Value must be an integer from (\d+) to (\d+)\.$/, m => `Значение должно быть целым числом от ${m[1]} до ${m[2]}.`],
    [/^Text must be no longer than (\d+) characters\.$/, m => `Текст должен быть не длиннее ${m[1]} символов.`],
    [/^(\d+) of (\d+)$/, m => `${m[1]} из ${m[2]}`],
    [/^(\d+) s remaining$/, m => `Осталось ${m[1]} с`],
    [/^Pause: (\d+) s$/, m => `Пауза: ${m[1]} с`],
    [/^(\d+) min (\d+) s remaining$/, m => `Осталось ${m[1]} мин ${m[2]} с`],
    [/^Available after (.+)$/, m => `Доступно после ${m[1]}`],
    [/^Enter the phrase: (.*)$/s, m => `Введите фразу: ${m[1]}`],
    [/^Type: (.*)$/s, m => `Введите: ${m[1]}`],
    [/^(.+) — (\d+) min left$/, m => `${russian(m[1])} — осталось ${m[2]} мин`],
    [/^(.+) until (.+)$/, m => own(messages, m[1]) ? `${messages[m[1]]} до ${m[2]}` : m[0]],
    [/^YFE — (.+)$/, m => `YFE — ${russian(m[1])}`],
    [/^(.+) \/ (.+)$/, m => own(messages, m[1]) && own(messages, m[2]) ? `${messages[m[1]]} / ${messages[m[2]]}` : m[0]],
    [/^(Hide video|Hide channel|Hide comment|Hide post): (.+)$/s, m => `${russian(m[1])}: ${russian(m[2])}`],
    [/^This file contains (\d+) appearance changes and (\d+) custom presets\. The extension will be (on|off)\. (Usage limits, filters and player settings will (?:also be replaced|be kept)\.) Settings protection will be kept\. Export your current data first if you need a backup\.$/, m => `Файл содержит ${m[1]} изменений оформления и ${m[2]} пользовательских наборов. Расширение будет ${m[3] === 'on' ? 'включено' : 'выключено'}. ${m[4].includes('replaced') ? 'Ограничения, фильтры и настройки плеера также будут заменены.' : 'Ограничения, фильтры и настройки плеера сохранятся.'} Защита настроек сохранится. Если нужна резервная копия, сначала экспортируйте текущие данные.`],
  ];
  function russian(source) {
    if (own(messages, source)) return messages[source];
    for (const [pattern, render] of patterns) {
      const match = source.match(pattern);
      if (match) return render(match);
    }
    return source;
  }
  function source(value) {
    return renderedSources.get(value) || reverse.get(value) || value;
  }
  function t(value, target = language) {
    if (typeof value !== 'string') return value;
    const canonical = source(value);
    const result = target === 'ru' ? russian(canonical) : canonical;
    if (result !== canonical) {
      renderedSources.set(result, canonical);
      if (renderedSources.size > 2000) renderedSources.delete(renderedSources.keys().next().value);
    }
    return result;
  }
  function ignored(node) {
    const element = node.nodeType === 1 ? node : node.parentElement;
    if (!element || element.closest('script,style,textarea,[contenteditable]:not([contenteditable="false"]),[data-i18n-ignore]')) return true;
    // These labels belong to user presets, even if a name happens to equal a UI message.
    if (element.closest('#custom-presets .preset-item > span,#focus-defaults legend')) return true;
    const option = element.closest('option');
    if (option?.closest('#focus-active-preset,#focus-open-preset,[data-focus-preset],#session-preset')) {
      if (option.value && source(option.textContent) !== 'Preset deleted — choose another' && !(globalThis.YTV_CATALOG?.presets || []).some(preset => preset.id === option.value)) return true;
    }
    return false;
  }
  function update(node, key, value, write) {
    let record = sources.get(node);
    if (!record) { record = new Map(); sources.set(node, record); }
    const previous = record.get(key);
    const canonical = previous?.rendered === value ? previous.source : source(value);
    const match = canonical.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const translated = match[1] + t(match[2]) + match[3];
    record.set(key, {source: canonical, rendered: translated});
    if (value !== translated) write(translated);
  }
  function translate(root = globalThis.document?.body) {
    if (!root) return;
    function visit(node) {
      if (ignored(node)) return;
      if (node.nodeType === 3) {
        update(node, 'text', node.nodeValue, text => { node.nodeValue = text; });
      } else if (node.nodeType === 1) {
        for (const attribute of attributes) {
          if (attribute === 'label' && node.tagName !== 'OPTGROUP') continue;
          if (node.hasAttribute(attribute)) update(node, attribute, node.getAttribute(attribute), value => node.setAttribute(attribute, value));
        }
        for (const child of node.childNodes) visit(child);
      } else if (node.nodeType === 9 || node.nodeType === 11) {
        for (const child of node.childNodes) visit(child);
      }
    }
    // A ShadowRoot has no parentElement; its children are visited normally.
    if (root.nodeType === 9 || root.nodeType === 11) for (const child of root.childNodes) visit(child);
    else visit(root);
    return root;
  }
  function observe(root = globalThis.document?.body) {
    if (!root) return () => {};
    if (observed.has(root)) return observed.get(root).disconnect;
    const observer = new MutationObserver(records => {
      const pending = new Set();
      for (const record of records) {
        if (record.type === 'childList') for (const node of record.addedNodes) pending.add(node);
        else pending.add(record.target);
      }
      for (const node of pending) translate(node);
    });
    const disconnect = () => { observer.disconnect(); observed.delete(root); };
    observed.set(root, {observer, disconnect});
    translate(root);
    observer.observe(root, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes});
    return disconnect;
  }
  function apply(next) {
    next = next === 'ru' ? 'ru' : 'en';
    if (language === next) return;
    language = next;
    if (extensionPage && document.documentElement) document.documentElement.lang = language;
    for (const root of observed.keys()) translate(root);
    globalThis.dispatchEvent?.(new CustomEvent('yfe:languagechange', {detail: {language}}));
  }
  const extensionPage = ['chrome-extension:', 'moz-extension:'].includes(globalThis.location?.protocol);
  const storage = extensionPage ? globalThis.chrome?.storage : null;
  storage?.onChanged?.addListener((changes, area) => {
    if (area === 'local' && own(changes, 'yfeLanguage')) { revision++; apply(changes.yfeLanguage.newValue); }
  });
  const ready = (async () => {
    const initialRevision = revision;
    try {
      const result = await storage?.local?.get('yfeLanguage');
      if (revision === initialRevision) apply(result?.yfeLanguage);
    } catch { /* A detached preview still has a usable English UI. */ }
    if (extensionPage) {
      if (document.documentElement) { document.documentElement.lang = language; observe(document.documentElement); }
      else document.addEventListener('DOMContentLoaded', () => observe(document.documentElement), {once: true});
    }
    return language;
  })();
  async function setLanguage(next) {
    if (!['en', 'ru'].includes(next)) throw new Error('Unsupported language.');
    await ready;
    if (storage?.local) await storage.local.set({yfeLanguage: next});
    revision++;
    apply(next);
    return language;
  }
  function setContentLanguage(next) { revision++; apply(next); return language; }
  globalThis.YFEI18n = Object.freeze({ready, get language() { return language; }, setLanguage, setContentLanguage, source, t, translate, observe});
})();
