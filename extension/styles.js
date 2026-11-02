/* Compile only opted-in appearance changes for the active page. */
(() => {
  'use strict';
  const images = ':is(ytd-thumbnail,yt-thumbnail-view-model,ytm-shorts-lockup-view-model) img';
  const titles = ':is(ytd-rich-item-renderer,ytd-video-renderer,ytd-compact-video-renderer) #video-title,yt-lockup-view-model .yt-lockup-metadata-view-model__title';
  function pageCategory(path) {
    if (path.startsWith('/embed/')) return 'embed';
    if (path === '/' || path === '/home') return 'homePage';
    if (path === '/watch') return 'videoPage';
    if (path === '/results') return 'searchPage';
    if (path.startsWith('/shorts/')) return 'shortsPage';
    if (path.startsWith('/feed/subscriptions')) return 'subscriptionsPage';
    if (/^\/(?:@[^/]+|(?:channel|c|user)\/[^/]+)(?:\/|$)/.test(path)) return 'channelPage';
    if (path === '/feed/you' || path === '/feed/library') return 'youPage';
    return '';
  }
  function rule(selector, declarations) { return `${selector}{${declarations}}`; }
  function compileCSS(raw, path, automaticColumns = 4) {
    const settings = YTV.normalizeSettings(raw);
    if (!settings.enabled) return '';
    const page = pageCategory(path);
    const categories = new Set(page === 'embed' ? ['embed'] : ['appearance', 'navigationSidebar', 'header', 'videoCard', page]);
    const values = settings.values;
    const css = [];
    for (const option of YTV_CATALOG.options) {
      if (!categories.has(option.category) || option.implementation !== 'css' || values[option.id] === option.default) continue;
      if (option.type === 'boolean' && values[option.id] === true) css.push(...option.css);
    }
    if (page === 'embed') return css.join('\n');
    const blur = Number(values.video_card_blur_thumbnail);
    const gray = Number(values.video_card_grayscale_thumbnail);
    const transparent = Number(values.video_card_opacity_thumbnail);
    if (blur || gray || transparent) {
      css.push(rule(images, `filter:blur(${blur * 2.5}px) grayscale(${gray / 10})!important;opacity:${1 - transparent / 10}!important;`));
    }
    const casing = {lowerCase: 'lowercase', upperCase: 'uppercase', capitalize: 'capitalize'}[values.video_card_title_case];
    if (casing) css.push(rule(titles, `text-transform:${casing}!important;`));
    const logo = 'ytd-topbar-logo-renderer';
    if (values.header_logo_color === 'grayscale') css.push(rule(logo, 'filter:grayscale(1)!important;'));
    if (values.header_logo_color === 'monochrome') {
      css.push(rule(logo, 'filter:grayscale(1) brightness(0)!important;'));
      css.push(rule(`html[dark] ${logo}`, 'filter:grayscale(1) brightness(0) invert(1)!important;'));
    }
    const accent = values.appearance_color;
    if (accent !== 'default') {
      css.push(rule('html,html[dark]', `--yt-spec-call-to-action:${accent}!important;--yt-spec-static-brand-red:${accent}!important;`));
      css.push(rule('.ytp-play-progress,.ytp-scrubber-button,.ytp-swatch-background-color', `background-color:${accent}!important;`));
      css.push(rule('ytd-topbar-logo-renderer svg :is([fill="#FF0000"],[fill="#FF0033"],[fill="#F00"])', `fill:${accent}!important;`));
    }
    const background = values.appearance_primary_bg_color;
    if (background !== 'default') {
      css.push(rule('html,html[dark],ytd-app', `--yt-spec-base-background:${background}!important;--yt-spec-frosted-glass-desktop:${background}!important;`));
      css.push(rule('ytd-app,ytd-masthead,#guide-content', `background-color:${background}!important;`));
    }
    const font = values.appearance_font;
    if (font !== 'default') {
      css.push(rule('ytd-app,ytd-app :is(yt-formatted-string,yt-attributed-string,input,textarea,button)', `font-family:${JSON.stringify(font)},system-ui,sans-serif!important;`));
    }
    if (page === 'homePage' && values.redirect_home_to === 'search') {
      css.push(rule('ytd-browse[page-subtype="home"] ytd-rich-grid-renderer', 'display:none!important;'));
    }
    const columns = values.home_suggestions_columns_count;
    if (page === 'homePage' && columns !== 'default') {
      css.push(rule('ytd-browse[page-subtype="home"] ytd-rich-grid-renderer', `--ytd-rich-grid-items-per-row:${columns}!important;--ytd-rich-grid-posts-per-row:${columns}!important;`));
    }
    return css.join('\n');
  }
  globalThis.YTVStyles = Object.freeze({compileCSS, pageCategory});
})();
