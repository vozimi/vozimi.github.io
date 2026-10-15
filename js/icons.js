/* icons.js — Vozimi's own line-icon set. No emoji anywhere in the UI.
 * Consistent 24x24, stroke=currentColor, round joins. Size via CSS (width/height). */
(function () {
  var P = {
    dashboard: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="4.5" rx="2"/><rect x="13.5" y="10.5" width="7.5" height="10.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/>',
    ledger: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/>',
    bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    more: '<rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6"/>',
    settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.3"/><circle cx="8" cy="17" r="2.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    chevronRight: '<path d="M9 6l6 6-6 6"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    repeat: '<path d="M4 9a5 5 0 0 1 5-5h8l-2.5-2.5M20 15a5 5 0 0 1-5 5H7l2.5 2.5"/>',
    download: '<path d="M12 4v11M8 11l4 4 4-4"/><path d="M5 19h14"/>',
    upload: '<path d="M12 20V9M8 13l4-4 4 4"/><path d="M5 5h14"/>',
    trash: '<path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    cube: '<path d="M12 2.5l8 4.5v9l-8 4.5-8-4.5v-9l8-4.5z"/><path d="M4 7l8 4.5L20 7M12 11.5V21"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/>',
    home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-6h4v6"/>',
    box: '<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M4 11h16M9 7V4h6v3"/>',
    land: '<path d="M3 18l5-7 4 5 3-4 6 6"/><path d="M3 20h18"/>',
    doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    folder: '<path d="M3.5 6.5h6l2 2.5h9v10.5H3.5z"/>',
    building: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>',
    logout: '<path d="M15 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9"/><path d="M11 12h10M18 9l3 3-3 3"/>',
    mail: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M4 7l8 6 8-6"/>',
    trendUp: '<path d="M4 16l5-5 3 3 7-7"/><path d="M15 7h4v4"/>',
    pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M12 3v9h9A9 9 0 0 0 12 3z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
    filter: '<path d="M4 6h16l-6 7v5l-4 2v-7z"/>',
    play: '<path d="M7 5l12 7-12 7z"/>',
    rupee: '<path d="M7 5h10M7 9h10M16 5c0 4-3.5 5-7 5l6 9"/>',
    refresh: '<path d="M4 11a8 8 0 0 1 14-5l2 2M20 13a8 8 0 0 1-14 5l-2-2"/><path d="M18 3v5h-5M6 21v-5h5"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    wallet: '<rect x="3.5" y="6" width="17" height="13" rx="2.5"/><path d="M3.5 10h17M16 14h1.5"/>',
    arrowUp: '<path d="M12 19V6M6 12l6-6 6 6"/>',
    arrowDown: '<path d="M12 5v13M6 12l6 6 6-6"/>',
    hardhat: '<path d="M4 16a8 8 0 0 1 16 0"/><path d="M12 5a3 3 0 0 1 3 3v2M12 5a3 3 0 0 0-3 3v2M3 16h18v2H3z"/>',
    // custom Vozimi assistant mark: a chat bubble holding a voice waveform
    agent: '<path d="M20 11.3a7.3 7.3 0 0 1-7.3 7.3c-1.15 0-2.23-.26-3.2-.72L4 19.3l1.45-4.1A7.3 7.3 0 1 1 20 11.3z"/><path d="M9.3 10v2.6M12.5 8.5v5.6M15.7 10v2.6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M10.6 6.2A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3 3.6M6.5 7.5A16 16 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.1-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/>',
    moon: '<path d="M21 12.5A8.5 8.5 0 1 1 11.5 3a6.5 6.5 0 0 0 9.5 9.5z"/>',
    leaf: '<path d="M11 20A7 7 0 0 1 4 13c0-5 4.5-9 16-9 0 10-5 13-9 13z"/><path d="M4 20c3-6 7-8 11-9"/>',
    store: '<path d="M4 9l1-5h14l1 5M4 9v10h16V9M4 9h16M9 19v-5h6v5"/><path d="M4 9a2.5 2.5 0 0 0 4 0 2.5 2.5 0 0 0 4 0 2.5 2.5 0 0 0 4 0 2.5 2.5 0 0 0 4 0"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    shield: '<path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.3a2.8 2.8 0 0 1 5.3 1.1c0 1.8-2.6 2.3-2.6 2.6"/><path d="M12 17h.01"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    phone: '<path d="M6.6 3h3l1.5 4.5L9 9.5a12 12 0 0 0 5.5 5.5l2-2L21 14.5v3a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 4.9 4.6 1.5 1.5 0 0 1 6.6 3z"/>',
    whatsapp: '<path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z"/><path d="M8.8 8.2c.2-.5.4-.5.6-.5h.5c.2 0 .4 0 .6.5l.6 1.5c0 .2 0 .4-.1.5l-.5.6c-.1.2-.2.3 0 .6a6 6 0 0 0 2.6 2.3c.3.1.4.1.6-.1l.6-.7c.2-.2.3-.2.5-.1l1.4.7c.2.1.3.2.3.3.1.5-.3 1.4-.6 1.6-.5.4-1.2.6-2 .3a8 8 0 0 1-4.7-4.4c-.3-.8-.2-1.6.1-2z"/>'
  };

  BK.icon = function (name, opts) {
    opts = opts || {};
    var inner = P[name] || P.box;
    var sw = opts.sw || 1.8;
    var cls = 'ic' + (opts.cls ? ' ' + opts.cls : '');
    var style = opts.size ? ' style="width:' + opts.size + 'px;height:' + opts.size + 'px"' : '';
    return '<svg class="' + cls + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + sw +
      '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + style + '>' + inner + '</svg>';
  };
  // category -> icon name (used across the app)
  BK.catIcon = { BOOKING: 'home', VENDOR: 'cube', SALARY: 'hardhat', MISC: 'box', LAND: 'land', CHALLAN: 'doc' };
})();
