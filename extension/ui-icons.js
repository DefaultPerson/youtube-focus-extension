/* Original, local SVG line icons shared by the settings interface. */
(() => {
  'use strict';
  const paths = {
    menu: 'M4 6h16M4 12h16M4 18h16', close: 'm6 6 12 12M18 6 6 18',
    search: 'M16 16l5 5M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15',
    focus: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M9 8l7 4-7 4Z',
    clock: 'M12 8v5l3 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20',
    shield: 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7ZM8 12l3 3 5-6',
    filter: 'M3 5h18l-7 8v6l-4 2v-8Z', player: 'M3 4h18v16H3ZM10 8l6 4-6 4Z',
    grid: 'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z',
    home: 'm3 11 9-8 9 8M5 9v12h5v-7h4v7h5V9',
    list: 'M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1',
    channel: 'M4 5h16v15H4ZM8 9h8M8 13h8M8 17h4',
    card: 'M3 4h18v12H3ZM3 20h12',
    header: 'M3 4h18v16H3ZM3 9h18M7 6h1',
    sidebar: 'M3 4h18v16H3ZM9 4v16M5 8h2M5 12h2',
    colors: 'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4 2 2 0 0 1 0-4h3a4 4 0 0 0 4-4c0-4-5-6-9-6ZM7 8h.01M11 6h.01M7 14h.01M16 7h.01',
    presets: 'M3 6h18M3 18h18M7 3v6m10 6v6M3 12h18m-6-3v6',
    settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M10 2h4l1 4 3 1 3 3v4l-3 1-1 3-3 3h-4l-1-3-3-1-3-3v-4l3-1 1-3Z',
    external: 'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',
    panel: 'M3 4h18v16H3ZM14 4v16m3-10 2 2-2 2',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
  };
  globalThis.YFEIcons = name => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false'})) svg.setAttribute(key, value);
    const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', paths[name] || paths.list); svg.append(path); return svg;
  };
})();
