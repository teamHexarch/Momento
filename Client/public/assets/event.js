// Events: when and where an album's event is, and adding photos at it. Shared by every page.
// - Momento.event.mount(form)   adds start/end times, "uploads open before", the venue (Google Maps)
//                               and the 1 km / 2 km zone to the Create album form
// - Momento.event.activate(form) starts venue search when the event step becomes visible
// - Momento.event.read(form)    { error, focus } or { fields } to send with the new album
//                               mount() also adds an optional cover photo; it's uploaded once the album exists
//                               (PUT /api/albums/:id/cover, see COVER-API-NOTES.md)
// - Momento.event.prepareCover(file)  resolves to a resized cover image (Blob), or rejects with a plain message
// - Momento.event.camera(keep)  Momento's own camera; resolves to the photos taken (File[]). They
//                               go straight to the upload and are never saved to the device. keep: photos
//                               taken before (from a cancelled upload), shown again so they can be used
// - Momento.event.confirmUpload(album, files)  asks before uploading (and, for guests of an album
//                               with a zone, gets their location); resolves to { location, files } or null.
//                               { fromCamera: true }: Cancel reads "Back to camera"
// Uses the .mq-dlg / .mq-btn / .mq-x styles from assets/qr.js, which every page loads too.
(() => {
  const Momento = (window.Momento = window.Momento || {});
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svgIcon = (inner, size = 20) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const ICON = {
    close: svgIcon('<path d="M6 6l12 12M18 6L6 18"/>'),
    pin: svgIcon('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>', 16),
    locate: svgIcon('<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>', 16),
    flip: svgIcon('<path d="M4 7h11a5 5 0 0 1 0 10H9M7 4 4 7l3 3M17 20l3-3-3-3"/>', 18),
    out: svgIcon('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', 15),
    camera: svgIcon('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.5"/>', 22),
  };
  const pad = (n) => String(n).padStart(2, '0');
  // In the site's language (Western digits, so the translation table's number patterns still match); English keeps
  // the browser's own 12- or 24-hour choice
  const timeLocale = () => { const l = document.documentElement.lang; return l && !/^en\b/.test(l) ? l + '-u-nu-latn' : []; };
  const fmtTime = (d) => d.toLocaleTimeString(timeLocale(), { hour: 'numeric', minute: '2-digit' });
  const fmtWhen = (d) => d.toLocaleString(timeLocale(), { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const km = (m) => `${+(m / 1000).toFixed(1)} km`;
  function distanceM(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  const css = document.createElement('style');
  css.textContent = `
    .ev { display: grid; gap: .9rem; margin: .2rem 0 .4rem; }
    .ev .m-row2 { margin: 0; }
    .ev > [hidden] { display: none !important; }
    .ev-sec { display: grid; gap: .45rem; }
    .ev-label { font-size: .82rem; font-weight: 650; color: var(--slate, #5c596b); }
    .ev-hint { margin: 0; font-size: .82rem; line-height: 1.5; color: var(--slate, #5c596b); }
    .ev-lead { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; font-size: .9rem; }
    .ev-lead select { min-height: 2.6rem; padding: 0 .6rem; font: inherit; }   /* the well itself comes from assets/glass.css (GlassInput) */
    .ev-range-head { display: flex; align-items: baseline; justify-content: space-between; gap: .5rem; }
    .ev-range-val { font-size: 1.05rem; font-weight: 750; letter-spacing: -.02em; color: var(--dusk, #2e2c3a); font-variant-numeric: tabular-nums; }
    .ev-range { --fill: 0%; width: 100%; height: 2rem; margin: 0; background: none; cursor: pointer; -webkit-appearance: none; appearance: none; }
    /* The track, thumb, hover and focus are the shared GlassSlider (assets/glass.css) */
    .ev-range-ends { display: flex; justify-content: space-between; margin-top: -.2rem; font-size: .76rem; color: var(--slate, #5c596b); }
    .ev-venue-search gmp-place-autocomplete, .ev-venue-search input { width: 100%; box-sizing: border-box; }
    .ev-venue-search input { min-height: 2.9rem; padding: 0 .9rem; font: inherit; }
    .ev-map { height: 13rem; border-radius: 18px; overflow: hidden; background: rgba(127, 120, 150, .12); box-shadow: inset 0 0 0 1px rgba(46, 44, 58, .08); }
    .ev-map[hidden] { display: none; }
    .ev-picked { display: flex; gap: .4rem; align-items: flex-start; margin: 0; font-size: .86rem; line-height: 1.45; color: var(--dusk, #2e2c3a); }
    .ev-picked svg { flex: none; margin-top: .1rem; }
    .ev-picked.is-empty { color: var(--slate, #5c596b); }
    .ev-link { display: inline-flex; align-items: center; gap: .35rem; padding: .4rem .75rem; border-radius: 100px; font: inherit; font-size: .85rem; font-weight: 650; cursor: pointer; transition: background-color .2s ease, transform .3s var(--spring, cubic-bezier(.34, 1.4, .64, 1)); }
    a.ev-link { text-decoration: none; }

    .ev-venue-acts { display: flex; flex-wrap: wrap; gap: .5rem; }

    /* Create form: Album or Event (two cards; the chosen one is outlined in the accent) */
    dialog .m-kind { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; margin: .1rem 0 1rem; }
    dialog .m-kind[hidden] { display: none; }
    dialog .m-kind-title { grid-column: 1 / -1; font-size: .88rem; font-weight: 600; }
    dialog .m-kind label { position: relative; display: grid; align-content: start; gap: .15rem; padding: .75rem .85rem; cursor: pointer; }   /* fill, rim, hover, chosen and focus: the shared choice card (assets/glass.css) */
    dialog .m-kind input { position: absolute; opacity: 0; pointer-events: none; }
    dialog .m-kind b { font-size: .95rem; font-weight: 700; color: var(--dusk, #2e2c3a); }
    dialog .m-kind small { font-size: .78rem; line-height: 1.4; color: var(--slate, #5c596b); }
    dialog .m-kind label:active { transform: scale(.985); }
    /* Venue suggestions: a list that opens under the search box as you type */
    /* (Scoped to the dialog: the Social page has its own search list with the same class.) The pane is the
       GlassPopover in assets/glass.css */
    /* It floats just under the box (it doesn't push the rest of the form down) and scrolls on its own */
    dialog .ev-venue-search { position: relative; z-index: 5; }
    dialog .ev-suggest { position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 5; display: grid; gap: 2px; margin: 0; padding: .35rem; list-style: none;
      max-height: min(16rem, 45dvh); overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
    dialog .ev-suggest[hidden] { display: none; }
    dialog .ev-suggest li { display: grid; gap: 1px; padding: .6rem .75rem; border-radius: 13px; cursor: pointer; }
    dialog .ev-suggest li b { overflow: hidden; font-size: .9rem; font-weight: 650; white-space: nowrap; text-overflow: ellipsis; color: var(--dusk, #2e2c3a); }
    dialog .ev-suggest li small { overflow: hidden; font-size: .78rem; white-space: nowrap; text-overflow: ellipsis; color: var(--slate, #5c596b); }
    dialog .ev-suggest li.is-active { background: rgba(127, 120, 150, .14); }
    @media (hover: hover) { dialog .ev-suggest li:hover { background: rgba(127, 120, 150, .14); } }
    dialog .ev-suggest li:active { background: rgba(127, 120, 150, .22); }
    dialog .ev-suggest .ev-suggest-note { padding: .45rem .75rem .3rem; cursor: default; font-size: .78rem; color: var(--slate, #5c596b); }
    dialog .ev-suggest .ev-suggest-note:hover { background: none; }
    dialog .ev-suggest .ev-credit { padding: .2rem .75rem .25rem; cursor: default; font-size: .68rem; color: var(--slate, #5c596b); opacity: .8; }
    dialog .ev-suggest .ev-credit:hover { background: none; }

    /* Additional settings: when uploads open and how far away guests can be, folded away by default */
    /* details.ev-more, not a bare class: the Social page has a "Show all" button with the same class */
    details.ev-more { border-radius: var(--r-group, 16px); background: rgba(127, 120, 150, .08); box-shadow: inset 0 0 0 1px rgba(127, 120, 150, .16); }
    details.ev-more > summary { display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: .85rem 1rem; border-radius: var(--r-group, 16px); list-style: none; cursor: pointer; font-size: .9rem; font-weight: 650; color: var(--dusk, #2e2c3a);  }
    details.ev-more > summary::-webkit-details-marker { display: none; }
    details.ev-more > summary small { margin-left: auto; font-size: .8rem; font-weight: 550; color: var(--slate, #5c596b); text-align: right; }
    details.ev-more > summary svg { flex: none; color: var(--slate, #5c596b); transition: transform .4s var(--spring, cubic-bezier(.34, 1.4, .64, 1)); }
    details.ev-more[open] > summary svg { transform: rotate(180deg); }
    details.ev-more > summary:hover { background: rgba(127, 120, 150, .1); }
    details.ev-more > summary:active { background: rgba(127, 120, 150, .18); }
    details.ev-more > summary:focus-visible { outline: 2px solid var(--dusk, #2e2c3a); outline-offset: 2px; }
    .ev-more-body { display: grid; gap: 1.1rem; padding: .3rem 1rem 1rem; }
    /* Who can join: invite only, or public (listed on the Events map) */
    .ev-who { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
    .ev-who label { position: relative; display: grid; gap: .2rem; padding: .8rem .9rem .85rem 2.6rem; cursor: pointer; }   /* the card is a GlassInput choice card (assets/glass.css) */
    .ev-who input { position: absolute; left: .9rem; top: .95rem; width: 1.1rem; height: 1.1rem; margin: 0; accent-color: var(--dusk, #2e2c3a); cursor: pointer; }
    .ev-who input:focus-visible { outline: 2px solid var(--dusk, #2e2c3a); outline-offset: 2px; }
    .ev-who b { font-size: .92rem; font-weight: 700; color: var(--dusk, #2e2c3a); }
    .ev-who small { font-size: .8rem; line-height: 1.4; color: var(--slate, #5c596b); }
    :root[data-theme="dark"] .ev-who input { accent-color: #F2EFF8; }
    @media (max-width: 480px) { .ev-who { grid-template-columns: 1fr; } }
    /* Create album: "Who do you want to share this album with?" (friend groups, then just this event) */
    /* ---- Create album, kept simple: name, date, who it's for; times and venue for an event; the rest under More options ---- */
    .m-first { margin-top: 1.3rem; }
    .m-share[hidden] { display: none; }
    .m-share select {
      display: block; width: 100%; height: 2.9rem; box-sizing: border-box; padding: 0 2.6rem 0 1rem; font: 500 1rem var(--font-main, inherit);
      -webkit-appearance: none; appearance: none; cursor: pointer; text-overflow: ellipsis;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235C596B' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 1rem center; background-size: 16px;
    }
    :root[data-theme="dark"] .m-share select { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23C9C4D8' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E"); }
    .ev-venue-line { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .4rem .75rem; }
    .ev-venue-line .ev-picked { flex: 1 1 12rem; min-width: 0; }
    .ev-venue-line .ev-link { margin-left: auto; }
    .ev-picked[hidden] { display: none; }
    .ev-picked.is-error { color: #9A3D3D; }
    :root[data-theme="dark"] .ev-picked.is-error { color: #F0A3A3; }
    .ev-public .acct-field { margin-bottom: .35rem; }
    .ev-public select { width: 100%; min-width: 0; text-overflow: ellipsis; }   /* the glass well comes from assets/glass.css (.acct-field select) */
    .ev-public[hidden] { display: none; }
    .ev-when input { width: 100%; min-width: 0; box-sizing: border-box; }
    .ev-vis-hint { display: block; padding: 0 .2rem; font-size: .8rem; line-height: 1.45; color: var(--slate, #5c596b); }
    .ev-check { display: flex; align-items: flex-start; gap: .7rem; cursor: pointer; }
    .ev-check[hidden] { display: none; }
    .ev-check input { flex: none; width: 1.15rem; height: 1.15rem; margin: .15rem 0 0; accent-color: var(--dusk, #2e2c3a); cursor: pointer; }
    .ev-check input:focus-visible { outline: 2px solid var(--dusk, #2e2c3a); outline-offset: 2px; }
    .ev-check b { display: block; font-size: .92rem; font-weight: 650; color: var(--dusk, #2e2c3a); }
    .ev-check small { display: block; margin-top: .1rem; font-size: .8rem; line-height: 1.4; color: var(--slate, #5c596b); }
    :root[data-theme="dark"] .ev-check input { accent-color: #F2EFF8; }
    .ev-more-body .ev-cover { margin: 0; }
    .ev-more-body .ev-cover-box:not(.has-pic) .ev-cover-pick { aspect-ratio: auto; min-height: 4.2rem; }
    .ev-more-body .ev-cover-empty { grid-auto-flow: column; align-items: center; gap: .55rem; padding: .8rem 1rem; }
    .ev-more-body .ev-cover-empty svg { margin: 0; }
    .ev-cover .ev-hint:empty { display: none; }
    details.ev-more { margin-bottom: .2rem; }
    /* More options spans the whole form, and so does everything inside it (cover photo, Uploads open, the distance) */
    details.ev-more { display: block; width: 100%; max-width: none; box-sizing: border-box; justify-self: stretch; align-self: stretch; }
    .ev-more-body > *, .ev-more-body :is(.ev-cover, .ev-cover-box, .ev-cover-pick, .ev-lead, .ev-lead select, .ev-range) { width: 100%; max-width: none; box-sizing: border-box; }
    /* No empty line saved for a message that isn't there */
    #mCreate .acct-status:empty { min-height: 0; margin: 0; }
    .ev-sec[hidden] { display: none; }
    .ev-loccheck { display: grid; grid-template-columns: auto 1fr; align-items: start; gap: .6rem; cursor: pointer; }
    .ev-loccheck[hidden] { display: none; }
    .ev-loccheck input { width: 1.1rem; height: 1.1rem; margin: .15rem 0 0; accent-color: var(--dusk, #2e2c3a); cursor: pointer; }
    .ev-loccheck input:focus-visible { outline: 2px solid var(--dusk, #2e2c3a); outline-offset: 2px; }
    .ev-loccheck b { display: block; font-size: .9rem; font-weight: 650; color: var(--dusk, #2e2c3a); }
    .ev-loccheck small { display: block; margin-top: .1rem; font-size: .8rem; line-height: 1.45; color: var(--slate, #5c596b); }
    :root[data-theme="dark"] .ev-loccheck input { accent-color: #F2EFF8; }
    details.ev-more > summary, details.ev-more > summary small { white-space: nowrap; }
    @media (max-width: 480px) { details.ev-more > summary small { display: none; } }
    @media (prefers-reduced-motion: reduce) { details.ev-more > summary svg, .ev-range::-webkit-slider-thumb { transition: none; } .ev-range:is(:hover, :active)::-webkit-slider-thumb { transform: none; } }


    /* A short first screen, then event details. Group albums use only the first screen. */
    #mCreate .m-progress { margin: .45rem 0 0; color: var(--slate); font-size: .82rem; line-height: 1.4; }
    #mCreate [data-create-step] { margin-top: 1.15rem; }
    #mCreate .m-first { margin-top: 0; }
    #mCreate [data-create-step="details"] > .acct-field { margin-bottom: 1rem; }
    #mCreate [data-create-step] > .ev { margin: 0; }
    /* Starts and Ends each hold a date and a time, so they sit one above the other at full width */
    #mCreate .ev-when { grid-template-columns: minmax(0, 1fr); gap: .85rem; }
    #mCreate .ev-when .acct-field { margin-bottom: 0; }
    #mCreate .ev-lead select { width: 100%; min-width: 0; font-size: 1rem; }
    #mCreate [data-view="form"] > .acct-actions { margin-top: 1.25rem; }
    #mCreate .m-field-error { display: block; margin: .35rem 0 0; color: #9A3D3D; font-size: .8rem; line-height: 1.4; }
    #mCreate [aria-invalid="true"] { outline: 2px solid #9A3D3D; outline-offset: 2px; }
    #mCreateTitle:focus { outline: none; }
    :root[data-theme="dark"] #mCreate .m-field-error { color: #F0A3A3; }
    :root[data-theme="dark"] #mCreate [aria-invalid="true"] { outline-color: #F0A3A3; }
    @media (max-width: 360px) {
      #mCreate .ev-when input.mp-on { padding-inline: .6rem !important; background-image: none !important; }
      #mCreate [data-view="form"] > .acct-actions button { padding-inline: .65rem; white-space: nowrap; }
      #mCreate [data-view="form"] > .acct-actions .acct-primary { flex: 1.25; }
      #mCreate [data-view="form"] > .acct-actions [data-create-back] { flex: .75; }
    }

    /* Create album: the optional cover photo (shown while the event is upcoming) */
    .ev-cover { display: grid; gap: .45rem; margin: 0 0 1rem; }
    .ev-cover-label { display: flex; align-items: baseline; gap: .35rem; }
    .ev-cover-label i { font-style: normal; font-weight: 500; color: var(--stone, #8A8697); }
    .ev-cover-box { position: relative; isolation: isolate; border-radius: 18px; overflow: hidden;
      box-shadow: 0 1px 2px rgba(46, 44, 58, .06), 0 10px 24px -16px rgba(74, 62, 120, .45); }
    .ev-cover-pick { position: relative; display: grid; place-items: center; width: 100%; aspect-ratio: 16 / 6; padding: 0; border: 0; border-radius: inherit; cursor: pointer; font: inherit; color: var(--dusk, #2e2c3a);
      background: radial-gradient(90% 140% at 0% 0%, rgba(201, 192, 226, .55), transparent 62%), radial-gradient(90% 140% at 100% 100%, rgba(169, 204, 200, .5), transparent 62%), radial-gradient(60% 90% at 70% 10%, rgba(230, 205, 214, .55), transparent 70%), var(--surface, #fff);
      transition: transform .45s var(--spring, cubic-bezier(.34, 1.4, .64, 1)); }
    .ev-cover-pick::before { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 1.5px rgba(127, 120, 150, .32); pointer-events: none; }
    .ev-cover-pick::after { content: ''; position: absolute; inset: 0; border-radius: inherit; background: rgba(127, 120, 150, .1); opacity: 0; transition: opacity .2s ease; pointer-events: none; }
    .ev-cover-pick:hover::after { opacity: 1; }
    .ev-cover-pick:active { transform: scale(.985); }
    .ev-cover-pick:focus-visible { outline: 2px solid var(--dusk, #2e2c3a); outline-offset: 3px; }
    .ev-cover-pick[aria-busy="true"] { cursor: progress; }
    .ev-cover-empty { display: grid; justify-items: center; gap: .25rem; padding: 1rem; text-align: center; }
    .ev-cover-empty svg { margin-bottom: .15rem; transition: transform .45s var(--spring, cubic-bezier(.34, 1.4, .64, 1)); }
    .ev-cover-pick:hover .ev-cover-empty svg { transform: translateY(-2px) scale(1.06); }
    .ev-cover-empty b { font-size: .94rem; font-weight: 700; letter-spacing: -.01em; }
    .ev-cover-empty small { font-size: .8rem; color: var(--slate, #5c596b); }
    .ev-cover-box.has-pic .ev-cover-pick { aspect-ratio: 16 / 9; }
    .ev-cover-box.has-pic .ev-cover-empty { display: none; }
    .ev-cover-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .ev-cover-img[hidden], .ev-cover-shade[hidden], .ev-cover-acts[hidden] { display: none; }
    /* Over the photo: a soft darkening at the foot (so the buttons read) and a faint brand tint */
    .ev-cover-shade { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(to top, rgba(0, 0, 0, .6), rgba(0, 0, 0, 0) 55%); }
    .ev-cover-shade::before { content: ''; position: absolute; inset: 0; background: #D9D0EA; mix-blend-mode: multiply; opacity: .18; }
    .ev-cover-acts { position: absolute; left: .7rem; right: .7rem; bottom: .7rem; z-index: 2; display: flex; align-items: center; gap: .45rem; }
    .ev-cover-acts span { margin-right: auto; font-size: .8rem; font-weight: 650; color: #fff; text-shadow: 0 1px 8px rgba(0, 0, 0, .4); }
    /* Change / Remove over the photo: HUD glass from assets/glass.css (no blur: the dialog behind already blurs) */
    .ev-cover-btn { min-height: 2.2rem; padding: 0 .95rem; border-radius: 100px; font: inherit; font-size: .82rem; font-weight: 650; cursor: pointer; }
    .ev-cover-file { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
    .ev-cover .ev-hint.is-error { color: #9A3D3D; }
    :root[data-theme="dark"] .ev-cover .ev-hint.is-error { color: #F0A3A3; }
    :root[data-theme="dark"] .ev-cover-pick { background: radial-gradient(90% 140% at 0% 0%, rgba(120, 104, 176, .4), transparent 62%), radial-gradient(90% 140% at 100% 100%, rgba(80, 130, 126, .38), transparent 62%), var(--surface, #24222F); }
    :root[data-theme="dark"] .ev-cover-pick::before { box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, .14); }
    /* The cover on the "Album created" screen */
    .ev-made { position: relative; isolation: isolate; margin: 0 0 1rem; border-radius: 18px; overflow: hidden; aspect-ratio: 16 / 7;
      box-shadow: 0 1px 2px rgba(46, 44, 58, .06), 0 14px 30px -18px rgba(74, 62, 120, .55); }
    .ev-made img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .ev-made span { position: absolute; left: .8rem; bottom: .65rem; z-index: 2; font-size: .8rem; font-weight: 650; color: #fff; text-shadow: 0 1px 8px rgba(0, 0, 0, .45); }
    .ev-made::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to top, rgba(0, 0, 0, .6), rgba(0, 0, 0, 0) 60%); }
    @media (prefers-reduced-motion: reduce) { .ev-cover-pick, .ev-cover-empty svg, .ev-cover-btn { transition: none; } }

    /* Momento's camera: the picture fills the screen and every control floats over it as liquid glass (a clear,
       blurred and brightened pane with a light edge along the top and a soft glow inside). No words on screen:
       the camera's state is read out to screen readers, and only a problem is shown, in a glass card. */
    .ev-cam { --lg-fill: linear-gradient(180deg, rgba(255, 255, 255, .26), rgba(255, 255, 255, .08) 55%, rgba(255, 255, 255, .14));
      --lg-blur: blur(20px) saturate(185%) brightness(1.08);
      --lg-edge: inset 0 1px 0 rgba(255, 255, 255, .7), inset 0 -1px 1px rgba(255, 255, 255, .18), inset 0 0 0 1px rgba(255, 255, 255, .2), inset 0 0 18px rgba(255, 255, 255, .08), 0 10px 30px -12px rgba(0, 0, 0, .55);
      background: #0b0a10; color: #fff; touch-action: none; }   /* (pinch to zoom is the camera's, not the page's) */
    .ev-cam video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: transform .18s ease-out; }
    .ev-cam.is-front video { transform: scaleX(-1); }
    .ev-cam:focus { outline: none; }
    .ev-lg { position: relative; isolation: isolate; border: 0; background: var(--lg-fill); box-shadow: var(--lg-edge); -webkit-backdrop-filter: var(--lg-blur); backdrop-filter: var(--lg-blur); }
    /* the curved highlight a glass edge catches */
    .ev-lg::before { content: ""; position: absolute; inset: 1px; z-index: -1; border-radius: inherit; pointer-events: none;
      background: radial-gradient(120% 70% at 30% 0%, rgba(255, 255, 255, .32), rgba(255, 255, 255, 0) 60%); }
    .ev-cam-status:not(.is-error) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .ev-cam-status.is-error { position: absolute; left: 50%; top: 50%; z-index: 3; width: min(20rem, calc(100% - 3rem)); margin: 0; padding: 1rem 1.2rem; border-radius: 22px;
      translate: -50% -50%; font-size: .92rem; font-weight: 600; line-height: 1.45; text-align: center; }

    /* Round glass buttons */
    .ev-cbtn { display: grid; place-items: center; width: 2.9rem; height: 2.9rem; padding: 0; border: 0; border-radius: 50%; color: #fff; cursor: pointer;
      transition: transform .3s var(--spring, cubic-bezier(.34, 1.4, .64, 1)), opacity .2s ease; }
    .ev-cbtn svg { display: block; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, .35)); }
    .ev-cbtn:hover { opacity: .88; }
    .ev-cbtn:active { transform: scale(.88); }
    .ev-cbtn:focus-visible, .ev-zchip:focus-visible, .ev-shutter:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
    .ev-cbtn[hidden] { display: none; }
    .ev-cam-x { position: absolute; top: max(1rem, env(safe-area-inset-top)); right: max(16px, env(safe-area-inset-right)); z-index: 2; }

    /* Flash, timer, grid and brightness: one glass column; a tool that's on turns white */
    .ev-cam-tools { position: absolute; right: max(14px, env(safe-area-inset-right)); top: 50%; z-index: 2; display: grid; gap: .2rem; padding: .3rem; border-radius: 100px; translate: 0 -50%; }
    .ev-cam-tools .ev-cbtn { width: 2.6rem; height: 2.6rem; background: transparent; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; }
    .ev-cam-tools .ev-cbtn::before { content: none; }
    .ev-cam-tools .ev-cbtn[aria-pressed="true"] { background: #fff; color: #1d1b26; }
    .ev-cam-tools .ev-cbtn[aria-pressed="true"] svg { filter: none; }
    .ev-badge { position: absolute; right: -.15rem; bottom: -.15rem; min-width: 1.1rem; padding: .05rem .25rem; border-radius: 100px; background: #fff; color: #1d1b26;
      box-shadow: 0 1px 4px rgba(0, 0, 0, .3); font-size: .62rem; font-weight: 800; line-height: 1.3; text-align: center; }
    .ev-badge:empty { display: none; }
    /* The timer and brightness keep their icon; their setting (3s, 10s, +1) sits right beside it, to the left, in a
       small glass label of one fixed size that never moves */
    .ev-cam-tools .ev-cbtn { position: relative; }
    .ev-tval { position: absolute; right: calc(100% + .75rem); top: 50%; display: grid; place-items: center; width: 2.9rem; height: 1.85rem; margin-top: -.925rem;
      border-radius: 100px; background: var(--lg-fill); box-shadow: var(--lg-edge); -webkit-backdrop-filter: var(--lg-blur); backdrop-filter: var(--lg-blur);
      color: #fff; font-size: .8rem; font-weight: 800; letter-spacing: -.02em; line-height: 1; font-variant-numeric: tabular-nums; text-shadow: 0 1px 2px rgba(0, 0, 0, .35); pointer-events: none; }
    .ev-tval:empty { display: none; }

    /* Zoom: glass chips above the shutter; the chosen one shows the exact zoom while pinching */
    .ev-camzoom { position: absolute; left: 50%; bottom: calc(max(1.4rem, env(safe-area-inset-bottom)) + 6.4rem); z-index: 2; display: flex; gap: .25rem; padding: .25rem; border-radius: 100px; translate: -50% 0; }
    .ev-camzoom[hidden] { display: none; }
    .ev-zchip { min-width: 2.35rem; height: 2.35rem; padding: 0 .45rem; border: 0; border-radius: 100px; background: transparent; color: #fff; font: inherit; font-size: .76rem; font-weight: 750;
      font-variant-numeric: tabular-nums; text-shadow: 0 1px 2px rgba(0, 0, 0, .35); cursor: pointer; transition: transform .3s var(--spring, cubic-bezier(.34, 1.4, .64, 1)); }
    .ev-zchip:hover { background: rgba(255, 255, 255, .14); }
    .ev-zchip:active { transform: scale(.88); }
    .ev-zchip[aria-pressed="true"] { min-width: 2.9rem; background: rgba(255, 255, 255, .92); color: #1d1b26; text-shadow: none; }

    /* The bottom row: the last photo taken, the shutter, then switch camera and use the photos */
    .ev-cam-bar { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 1rem;
      padding: 1.2rem max(20px, env(safe-area-inset-right)) max(1.6rem, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left)); }
    .ev-shutter { display: grid; place-items: center; width: 4.9rem; height: 4.9rem; padding: .32rem; border: 0; border-radius: 50%; cursor: pointer; }
    .ev-shutter i { width: 100%; height: 100%; border-radius: 50%; background: #fff; box-shadow: inset 0 -3px 6px rgba(0, 0, 0, .12), 0 2px 8px rgba(0, 0, 0, .25);
      transition: transform .3s var(--spring, cubic-bezier(.34, 1.4, .64, 1)), background-color .2s ease; }
    .ev-shutter:hover i { transform: scale(.95); }
    .ev-shutter:active i { transform: scale(.82); }
    .ev-shutter[disabled] { cursor: default; }
    .ev-shutter[disabled] i { opacity: .35; transform: none; }
    .ev-cam.is-counting .ev-shutter i { background: #ff6b5e; transform: scale(.6); border-radius: 30%; }
    /* The last photo taken, bottom left: press it to look through, crop or delete what you've taken */
    .ev-shots { position: relative; justify-self: start; width: 3.1rem; height: 3.1rem; padding: .2rem; border: 0; border-radius: 16px; cursor: pointer;
      transition: transform .3s var(--spring, cubic-bezier(.34, 1.4, .64, 1)), opacity .2s ease; }
    .ev-shots[hidden] { display: none; }
    .ev-shots:hover { opacity: .88; }
    .ev-shots:active { transform: scale(.9); }
    .ev-shots:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
    .ev-shots img { display: block; width: 100%; height: 100%; border-radius: 12px; object-fit: cover; }
    .ev-shots img.is-new { animation: ev-pop .35s var(--spring, cubic-bezier(.34, 1.4, .64, 1)); }
    .ev-danger { color: #FFB4B4; }

    /* Looking through the photos taken: full screen over the camera */
    .ev-rev { position: absolute; inset: 0; z-index: 5; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; background: #0b0a10; }
    .ev-rev[hidden] { display: none; }
    .ev-rev-top { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 1rem;
      padding: max(1rem, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) .6rem max(16px, env(safe-area-inset-left)); }
    .ev-rev-count { padding: .5rem .85rem; border-radius: 100px; font-size: .84rem; font-weight: 750; font-variant-numeric: tabular-nums; text-shadow: 0 1px 2px rgba(0, 0, 0, .35); }
    .ev-rev-count:empty { visibility: hidden; }
    .ev-rev-top > :first-child { justify-self: start; }
    .ev-rev-top > :last-child { justify-self: end; }
    .ev-rev-stage { position: relative; min-height: 0; overflow: hidden; }
    .ev-rev-stage > img { position: absolute; inset: 18px; width: calc(100% - 36px); height: calc(100% - 36px); object-fit: contain; user-select: none; -webkit-user-drag: none; }
    .ev-rev-bottom { display: grid; justify-items: center; gap: .85rem; padding: .7rem 16px max(1.4rem, env(safe-area-inset-bottom)); }
    .ev-rev-strip { display: flex; gap: .35rem; max-width: 100%; padding: .3rem; overflow-x: auto; border-radius: 18px; scrollbar-width: none; }
    .ev-rev-strip::-webkit-scrollbar { display: none; }
    .ev-rev-strip[hidden], .ev-crop-shapes[hidden] { display: none; }
    .ev-rev-strip button { flex: none; width: 2.9rem; height: 2.9rem; padding: 0; border: 0; border-radius: 12px; overflow: hidden; background: none; opacity: .5; cursor: pointer;
      transition: opacity .2s ease, transform .3s var(--spring, cubic-bezier(.34, 1.4, .64, 1)); }
    .ev-rev-strip button img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .ev-rev-strip button:hover { opacity: .85; }
    .ev-rev-strip button:active { transform: scale(.9); }
    .ev-rev-strip button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
    .ev-rev-strip button[aria-current="true"] { opacity: 1; box-shadow: inset 0 0 0 2px #fff; }
    .ev-rev-strip button[aria-current="true"] img { border-radius: 12px; outline: 2px solid #fff; outline-offset: -2px; }
    .ev-rev-actions { display: flex; align-items: center; justify-content: center; gap: .8rem; min-height: 3.4rem; }
    .ev-rev-actions .ev-cbtn { width: 3.4rem; height: 3.4rem; }
    .ev-rev-actions .ev-cbtn[hidden] { display: none; }
    .ev-crop-shapes { display: flex; gap: .25rem; padding: .25rem; border-radius: 100px; }

    /* Cropping: drag the frame to move it, a corner (or a side, in Free) to resize it */
    .ev-crop { position: absolute; box-sizing: border-box; border: 1.5px solid rgba(255, 255, 255, .95); box-shadow: 0 0 0 100vmax rgba(8, 7, 12, .62); cursor: move; touch-action: none; }
    .ev-crop[hidden] { display: none; }
    .ev-crop-grid { position: absolute; inset: 0; opacity: 0; pointer-events: none; transition: opacity .2s ease;
      background: linear-gradient(to right, transparent calc(33.333% - .5px), rgba(255, 255, 255, .5) calc(33.333% - .5px) calc(33.333% + .5px), transparent calc(33.333% + .5px) calc(66.666% - .5px), rgba(255, 255, 255, .5) calc(66.666% - .5px) calc(66.666% + .5px), transparent calc(66.666% + .5px)),
        linear-gradient(to bottom, transparent calc(33.333% - .5px), rgba(255, 255, 255, .5) calc(33.333% - .5px) calc(33.333% + .5px), transparent calc(33.333% + .5px) calc(66.666% - .5px), rgba(255, 255, 255, .5) calc(66.666% - .5px) calc(66.666% + .5px), transparent calc(66.666% + .5px)); }
    .ev-crop.is-dragging .ev-crop-grid { opacity: 1; }
    .ev-crop i { position: absolute; width: 44px; height: 44px; touch-action: none; }
    .ev-crop i::before { content: ""; position: absolute; width: 20px; height: 20px; border: 0 solid #fff; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, .45)); }
    .ev-crop [data-h="nw"] { left: -22px; top: -22px; cursor: nwse-resize; }
    .ev-crop [data-h="nw"]::before { left: 19px; top: 19px; border-width: 3.5px 0 0 3.5px; }
    .ev-crop [data-h="ne"] { right: -22px; top: -22px; cursor: nesw-resize; }
    .ev-crop [data-h="ne"]::before { right: 19px; top: 19px; border-width: 3.5px 3.5px 0 0; }
    .ev-crop [data-h="sw"] { left: -22px; bottom: -22px; cursor: nesw-resize; }
    .ev-crop [data-h="sw"]::before { left: 19px; bottom: 19px; border-width: 0 0 3.5px 3.5px; }
    .ev-crop [data-h="se"] { right: -22px; bottom: -22px; cursor: nwse-resize; }
    .ev-crop [data-h="se"]::before { right: 19px; bottom: 19px; border-width: 0 3.5px 3.5px 0; }
    .ev-crop :is([data-h="n"], [data-h="s"]) { left: 22px; right: 22px; width: auto; cursor: ns-resize; }
    .ev-crop [data-h="n"] { top: -22px; }
    .ev-crop [data-h="s"] { bottom: -22px; }
    .ev-crop :is([data-h="n"], [data-h="s"])::before { left: 50%; width: 22px; height: 0; margin-left: -11px; }
    .ev-crop [data-h="n"]::before { top: 19px; border-top-width: 3.5px; }
    .ev-crop [data-h="s"]::before { bottom: 19px; border-bottom-width: 3.5px; }
    .ev-crop :is([data-h="e"], [data-h="w"]) { top: 22px; bottom: 22px; height: auto; cursor: ew-resize; }
    .ev-crop [data-h="e"] { right: -22px; }
    .ev-crop [data-h="w"] { left: -22px; }
    .ev-crop :is([data-h="e"], [data-h="w"])::before { top: 50%; width: 0; height: 22px; margin-top: -11px; }
    .ev-crop [data-h="e"]::before { right: 19px; border-right-width: 3.5px; }
    .ev-crop [data-h="w"]::before { left: 19px; border-left-width: 3.5px; }
    .ev-crop.is-locked :is([data-h="n"], [data-h="s"], [data-h="e"], [data-h="w"]) { display: none; }
    @media (prefers-reduced-motion: reduce) { .ev-shots, .ev-rev-strip button, .ev-crop-grid { transition: none; } }

    @keyframes ev-pop { from { transform: scale(.4); opacity: 0; } }
    .ev-cam-right { display: flex; justify-content: flex-end; align-items: center; gap: .6rem; }
    .ev-use { position: relative; background: #fff; color: #1d1b26; box-shadow: 0 6px 20px -6px rgba(0, 0, 0, .5); }
    .ev-use::before { content: none; }
    .ev-use svg { filter: none; }
    .ev-use .ev-badge { right: -.2rem; top: -.2rem; bottom: auto; background: #1d1b26; color: #fff; box-shadow: 0 0 0 2px #fff; }

    .ev-flash { position: absolute; inset: 0; z-index: 1; background: #fff; opacity: 0; pointer-events: none; }
    .ev-flash.is-on { animation: ev-flash .35s ease-out; }
    @keyframes ev-flash { from { opacity: .85; } to { opacity: 0; } }
    /* Grid lines: the rule of thirds */
    .ev-grid { position: absolute; inset: 0; z-index: 1; pointer-events: none; opacity: 0; transition: opacity .25s ease;
      background: linear-gradient(to right, transparent calc(33.333% - .5px), rgba(255, 255, 255, .45) calc(33.333% - .5px) calc(33.333% + .5px), transparent calc(33.333% + .5px) calc(66.666% - .5px), rgba(255, 255, 255, .45) calc(66.666% - .5px) calc(66.666% + .5px), transparent calc(66.666% + .5px)),
        linear-gradient(to bottom, transparent calc(33.333% - .5px), rgba(255, 255, 255, .45) calc(33.333% - .5px) calc(33.333% + .5px), transparent calc(33.333% + .5px) calc(66.666% - .5px), rgba(255, 255, 255, .45) calc(66.666% - .5px) calc(66.666% + .5px), transparent calc(66.666% + .5px)); }
    .ev-cam.has-grid .ev-grid { opacity: 1; }
    /* The self-timer's countdown */
    .ev-count { position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; pointer-events: none; opacity: 0; transition: opacity .25s ease; }
    .ev-cam.is-counting .ev-count { opacity: 1; }
    .ev-count b { display: grid; place-items: center; width: clamp(7.5rem, 30vw, 9.5rem); aspect-ratio: 1; border-radius: 50%; }
    .ev-count span { display: block; color: #fff; font-size: clamp(3.4rem, 13vw, 4.4rem); font-weight: 750; letter-spacing: -.04em; line-height: 1; font-variant-numeric: tabular-nums; text-shadow: 0 2px 12px rgba(0, 0, 0, .3); }
    @media (pointer: coarse) { .ev-cam-tools .ev-cbtn { width: 2.75rem; height: 2.75rem; } .ev-zchip { min-height: 2.75rem; } }
    /* No blur available, or less transparency asked for: the same shapes in a near-solid dark glass */
    @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { .ev-cam { --lg-fill: linear-gradient(180deg, rgba(60, 58, 72, .82), rgba(30, 28, 40, .78)); } }
    @media (prefers-reduced-transparency: reduce) { .ev-cam { --lg-fill: linear-gradient(rgba(30, 28, 40, .94), rgba(30, 28, 40, .94)); --lg-blur: none; } }
    @media (prefers-reduced-motion: reduce) { .ev-cam video, .ev-grid, .ev-zchip, .ev-cbtn, .ev-shutter i, .ev-count { transition: none; } }

    /* Asking before an upload */
    .ev-ask { position: fixed; inset: 0; margin: auto; width: min(26rem, calc(100vw - 32px)); height: fit-content; max-height: calc(100dvh - 32px); box-sizing: border-box; padding: 1.4rem; border-radius: var(--r-card, 28px); overflow: auto;
      color: var(--dusk, #2e2c3a); font-family: var(--font-main, -apple-system, BlinkMacSystemFont, 'Inter', sans-serif); }
    /* The pane is the GlassSheet in assets/glass.css (strong fill, the one blur, the shared dim) */
    .ev-ask[open] { animation: ev-in .4s var(--spring, cubic-bezier(.34, 1.4, .64, 1)); }
    @keyframes ev-in { from { opacity: 0; transform: translateY(14px) scale(.97); } }
    .ev-ask h2 { margin: 0; font-size: 1.4rem; letter-spacing: -.03em; line-height: 1.2; }
    .ev-ask p { margin: .5rem 0 0; color: var(--slate, #5c596b); line-height: 1.55; font-size: .93rem; }
    .ev-ask p.ev-limit { font-size: .8rem; margin-top: .35rem; opacity: .85; }
    /* The agreement, asked the first time someone uploads to an album */
    .ev-ask .ev-consent { display: grid; grid-template-columns: auto 1fr; align-items: start; gap: .6rem; margin-top: .9rem; padding: .75rem .85rem; border-radius: 16px; cursor: pointer;
      background: rgba(127, 120, 150, .1); box-shadow: inset 0 0 0 1px rgba(127, 120, 150, .22); color: var(--dusk, #2e2c3a); font-size: .86rem; line-height: 1.5; }
    .ev-ask .ev-consent:has(input:checked) { box-shadow: inset 0 0 0 1.5px var(--dusk, #2e2c3a); }
    .ev-ask .ev-consent[hidden], .ev-ask .ev-consent-note[hidden] { display: none; }
    .ev-ask .ev-consent input { width: 1.15rem; height: 1.15rem; margin: .12rem 0 0; accent-color: var(--dusk, #2e2c3a); cursor: pointer; }
    .ev-ask .ev-consent input:focus-visible { outline: 2px solid var(--dusk, #2e2c3a); outline-offset: 2px; }
    .ev-ask .ev-consent a { color: inherit; font-weight: 650; text-decoration: underline; text-underline-offset: 2px; }
    .ev-ask p.ev-consent-note { margin-top: .4rem; font-size: .78rem; }
    :root[data-theme="dark"] .ev-ask .ev-consent input { accent-color: #F2EFF8; }
    /* Every photo about to go up, each with a cross to leave it out */
    .ev-ask .ev-thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(4.4rem, 1fr)); gap: .45rem; max-height: min(15.5rem, 34dvh); margin: 1rem 0 .2rem; padding: 0; overflow-y: auto; list-style: none; overscroll-behavior: contain; }
    .ev-thumb { position: relative; aspect-ratio: 1; border-radius: 12px; overflow: hidden; background: rgba(127, 120, 150, .14); }
    .ev-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .ev-thumb-ext { display: grid; place-items: center; width: 100%; height: 100%; color: var(--slate, #5c596b); font-size: .74rem; font-weight: 800; letter-spacing: .02em; }
    .ev-thumb-x { position: absolute; top: .25rem; right: .25rem; display: grid; place-items: center; width: 1.75rem; height: 1.75rem; padding: 0; border: 0; border-radius: 50%; cursor: pointer;
      color: #fff; background: rgba(24, 22, 32, .62); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .25), 0 0 0 .5px rgba(0, 0, 0, .3); -webkit-backdrop-filter: blur(8px) saturate(160%); backdrop-filter: blur(8px) saturate(160%);
      transition: transform .3s var(--spring, cubic-bezier(.34, 1.4, .64, 1)), background-color .2s ease; }
    .ev-thumb-x svg { width: 14px; height: 14px; }
    .ev-thumb-x:hover { background: rgba(24, 22, 32, .82); }
    .ev-thumb-x:active { transform: scale(.86); }
    .ev-thumb-x:focus-visible { outline: 2px solid var(--focus-ring, #2E2C3A); outline-offset: 2px; }
    @media (pointer: coarse) { .ev-thumb-x { width: 2rem; height: 2rem; } }
    /* the ✕ is always shown (touch screens have no hover); on touch its tap area reaches 44px past the visible circle */
    .ev-thumb-x::after { content: ""; position: absolute; inset: -.375rem; border-radius: 50%; }
    .ev-thumb img { transition: transform .35s var(--spring, cubic-bezier(.34, 1.4, .64, 1)); }
    @media (hover: hover) { .ev-thumb:hover img { transform: scale(1.04); } }
    /* Tablets: bigger previews and more room for them */
    @media (min-width: 600px) {
      .ev-ask:has(.ev-thumbs) { width: min(34rem, calc(100vw - 48px)); }
      .ev-ask .ev-thumbs { grid-template-columns: repeat(auto-fill, minmax(6rem, 1fr)); gap: .55rem; max-height: min(32rem, 45dvh); }
    }
    /* Laptops and desktops: a wider window, bigger previews */
    @media (min-width: 1024px) {
      .ev-ask:has(.ev-thumbs) { width: min(40rem, calc(100vw - 64px)); padding: 1.7rem; }
      .ev-ask .ev-thumbs { grid-template-columns: repeat(auto-fill, minmax(6.75rem, 1fr)); gap: .6rem; max-height: min(26rem, 48dvh); }
    }
    .ev-ask .ev-none { margin-top: 1rem; padding: .9rem 1rem; border-radius: 16px; background: rgba(127, 120, 150, .1); text-align: center; }
    @media (prefers-reduced-motion: reduce) { .ev-thumb-x, .ev-thumb img { transition: none; } }
    .ev-ask .ev-loc { display: flex; gap: .55rem; margin-top: .9rem; padding: .75rem .85rem; border-radius: 16px; background: rgba(111, 152, 150, .14); color: var(--dusk, #2e2c3a); font-size: .88rem; line-height: 1.5; }
    .ev-ask .ev-loc svg { flex: none; margin-top: .15rem; }
    .ev-ask .ev-err { color: #a33a2c; font-weight: 600; }
    .ev-ask .mq-row { justify-content: flex-end; margin-top: 1.2rem; }
    :root[data-theme="dark"] .ev-ask .ev-err { color: #ffb4a8; }
    /* An event that has already happened: the note offering to save it as an album (pastOffer). The form's
       error line lands inside it and leads it */
    .ev-past { display: flex; flex-direction: column; align-items: flex-start; gap: .55rem; margin: .1rem 0 1rem; padding: .85rem 1rem 1rem; border-radius: var(--r-group, 16px);
      background: rgba(154, 96, 61, .1); box-shadow: inset 0 0 0 1px rgba(154, 96, 61, .22); }
    #mCreate .ev-past .m-field-error { order: -1; margin: 0; font-size: .9rem; font-weight: 700; }
    .ev-past p { margin: 0; font-size: .86rem; line-height: 1.5; color: var(--slate, #5c596b); }
    .ev-past .ev-past-btn[aria-invalid] { outline-offset: 2px; }
    :root[data-theme="dark"] .ev-past { background: rgba(232, 196, 138, .08); box-shadow: inset 0 0 0 1px rgba(232, 196, 138, .2); }
    /* Report a photo (albums.html): the same recessed fields and glass dropdown as Create album */
    .ev-ask .rp-field { margin: 0; }
    .ev-ask .rp-field textarea { min-height: 6rem; }
    .ev-ask .rp-field :is(select, textarea), .ev-ask .rp-field .ms-select { font-size: 16px; }   /* 16px: iOS doesn't zoom in */
    .ev-ask .rp-err { min-height: 1.2em; margin: 0; color: #a33a2c; font-size: .85rem; font-weight: 600; }
    .ev-ask .rp-err:empty { min-height: 0; }
    :root[data-theme="dark"] .ev-ask .rp-err { color: #ffb4a8; }
    /* Phones: the window is simply there when it opens */
    @media (max-width: 600px) { .ev-ask[open] { animation: none; } }
    @media (prefers-reduced-motion: reduce) { .ev-ask[open], .ev-shots img, .ev-flash.is-on { animation: none; } }`;
  document.head.append(css);

  // ---- Where the device is (asks the browser, which asks the person the first time) ----
  // Precise (GPS) first, for up to 10 seconds. iPads without mobile data have no GPS, and phones indoors
  // often can't get a fix in time, so if that fails (anything but "not allowed") the phone's normal
  // Wi-Fi/mobile location is used instead, which works indoors.
  const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function locate() {
    if (!navigator.geolocation) return Promise.reject(new Error('This browser can’t share your location.'));
    const once = (opts) => new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: p.timestamp }), reject, opts));
    return once({ enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 })
      .catch((err) => { if (err.code === 1) throw err; return once({ enableHighAccuracy: false, timeout: 15000, maximumAge: 120000 }); })
      .catch(async (err) => {
        if (err.code !== 1) {
          throw new Error(err.code === 3 ? 'Finding your location took too long. Try again, or type the venue instead.'
            : 'Your location couldn’t be found. Check your device’s location setting is on, then try again, or type the venue instead.');
        }
        if (apple) {
          throw new Error('Location is off for Momento. On iPhone or iPad: Settings → Privacy & Security → Location Services: turn it on, open Safari Websites and choose While Using the App. Then in Safari tap “aA” → Website Settings → Location → Allow, and try again.');
        }
        // "Not allowed", but the browser says this site IS allowed: the computer's own location setting is
        // blocking every site (Windows and Mac report it the same way)
        let site = 'prompt';
        try { site = (await navigator.permissions.query({ name: 'geolocation' })).state; } catch (e) { /* older browsers */ }
        const mac = /Mac/.test(navigator.platform || navigator.userAgent);
        const computer = mac
          ? 'On a Mac: System Settings → Privacy & Security → Location Services: turn it on, and switch on your browser in the list.'
          : 'On Windows: Settings → Privacy & security → Location: turn on Location services and “Let desktop apps access your location”.';
        throw new Error(site === 'granted'
          ? `Your browser allows Momento, but your computer’s location is turned off. ${computer} Then close and reopen the browser and try again, or type the venue instead.`
          : `Location is blocked for Momento. Click the icon left of the address bar, set Location to Allow and reload. If it still doesn’t work: ${computer} Or type the venue instead.`);
      });
  }

  // ---- Google Maps (only when the server has a key) ----
  let configP = null, mapsP = null;
  const getConfig = () => (configP ||= (window.momentoApi ? window.momentoApi('/api/config') : Promise.resolve({})).catch(() => ({})));
  function loadMaps(key) {
    return (mapsP ||= new Promise((resolve, reject) => {
      if (window.google?.maps?.importLibrary) return resolve(window.google.maps);
      window.__momentoMapsReady = () => resolve(window.google.maps);
      window.gm_authFailure = () => { document.dispatchEvent(new Event('momento:maps-failed')); };
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__momentoMapsReady`;
      s.async = true;
      s.onerror = () => { mapsP = null; reject(new Error('Google Maps didn’t load.')); };
      document.head.append(s);
    }));
  }

  // ---- Venue suggestions without a Maps key ----
  // Photon (photon.komoot.io): a free place search built on OpenStreetMap, made for search-as-you-type.
  // Returns up to 5 { name, address, lat, lng }. 'near' (optional { lat, lng }) puts nearby places first.
  async function suggestPlaces(q, signal, near) {
    const u = new URL('https://photon.komoot.io/api/');
    u.searchParams.set('q', q); u.searchParams.set('limit', '6');
    const lang = (navigator.language || 'en').slice(0, 2);
    if (['en', 'de', 'fr'].includes(lang)) u.searchParams.set('lang', lang);
    if (near) { u.searchParams.set('lat', near.lat.toFixed(3)); u.searchParams.set('lon', near.lng.toFixed(3)); }
    const r = await fetch(u, { signal });
    if (!r.ok) throw new Error('Place search is unavailable right now.');
    const { features = [] } = await r.json();
    const seen = new Set();
    return features.map(({ properties: p, geometry: g }) => {
      const street = [p.housenumber, p.street].filter(Boolean).join(' ');
      const name = p.name || street || p.city || '';
      const address = [p.name ? street : '', p.district || p.locality, p.city, p.country].filter((v) => v && v !== name)
        .filter((v, i, all) => all.indexOf(v) === i).join(', ');
      return { name, address, lat: g.coordinates[1], lng: g.coordinates[0] };
    }).filter((s) => s.name && !seen.has(s.name + s.address) && seen.add(s.name + s.address)).slice(0, 5);
  }

  // ---- The Create album form ----
  const LEADS = [0, 15, 30, 60, 120, 180, 360, 720, 1440];
  function mount(form, { fromGroup = false } = {}) {
    const view = form.querySelector('[data-view="form"]') || form;
    let box = view.querySelector('.ev');
    const placeField = form.place?.closest('label');
    if (placeField) placeField.hidden = true;   // the venue below sets the place
    if (!box) {
      box = document.createElement('div');
      box.className = 'ev';
      box.innerHTML = `
        <div class="m-row2 ev-when">
          <label class="acct-field"><span>Starts</span><input name="evStart" type="datetime-local" placeholder="Enter a start date and time" required></label>
          <label class="acct-field"><span>Ends</span><input name="evEnd" type="datetime-local" placeholder="Enter an end date and time" required></label>
        </div>
        <div class="ev-sec ev-venue">
          <span class="ev-label" id="evVenueLabel">Venue</span>
          <div class="ev-venue-search"></div>
          <div class="ev-map" hidden></div>
          <div class="ev-venue-line">
            <p class="ev-picked" data-picked hidden>${ICON.pin}<span></span></p>
            <button class="ev-link" type="button" data-here>${ICON.locate}Use my location</button>
          </div>
        </div>
        <div class="ev-public">
          <label class="acct-field"><span>Who can join?</span>
            <select name="evVis" aria-describedby="evVisHint">
              <option value="invite">Invite only: code, link or QR</option>
              <option value="public">Public: on the map, no approval</option>
            </select>
          </label>
          <small class="ev-vis-hint" id="evVisHint"></small>
        </div>
        <!-- Everything optional, folded away: the cover (mountCover puts it first), public or not, and when and
             how far away guests can add photos -->
        <details class="ev-more">
          <summary>More options${svgIcon('<path d="m6 9 6 6 6-6"/>', 16)}</summary>
          <div class="ev-more-body">
            <div class="ev-sec ev-lead-sec">
              <label class="ev-label" for="evLead">Uploads open</label>
              <div class="ev-lead">
                <select name="evLead" id="evLead">${LEADS.map((m) => `<option value="${m}">${m === 0 ? 'At the start' : m < 60 ? `${m} minutes before` : `${m / 60} hour${m === 60 ? '' : 's'} before`}</option>`).join('')}</select>
              </div>
            </div>
            <!-- Off unless the host turns it on: guests with the code or link get straight in, and nobody is asked for
                 their location (the host can change it later in Album settings, "Check location on entry") -->
            <label class="ev-loccheck"><input type="checkbox" name="evLocCheck"><span><b>Check guests are at the venue</b><small>Guests further away wait for you to let them in. When off, anyone with the code or link gets straight in.</small></span></label>
            <div class="ev-sec ev-radius-sec" hidden>
              <div class="ev-range-head"><label class="ev-label" for="evRadius">Guests must be within</label><output class="ev-range-val" for="evRadius" data-radius-out>1 km</output></div>
              <input class="ev-range" id="evRadius" name="evRadius" type="range" min="1" max="10" step="0.5" value="1" aria-valuetext="1 kilometre">
            </div>
          </div>
        </details>`;
      const eventStep = view.querySelector('[data-create-step="event"]');
      if (eventStep) eventStep.append(box); else view.querySelector('.acct-status')?.before(box);
      wire(form, box);
    }
    box._reset();
    // (a form opened from a group has that group ticked already; the choices may only arrive a moment later)
    box._syncWho();
    setTimeout(() => box._syncWho());
    mountCover(form, view);
  }

  // ---- The cover photo: chosen on the form, uploaded once the album has been made ----
  const COVER_MAX = 1600, COVER_BYTES = 25 * 1024 * 1024;
  // Resized here so a phone photo doesn't upload at full size; the server still checks and re-encodes it
  // iPhone HEIC/HEIF: most browsers (Chrome, Edge, Firefox) can't open them, and on Windows they often have no type
  const HEIC_BYTES = 15 * 1024 * 1024;   // the server's cover limit
  const isHeic = (f) => /^image\/hei[cf]/.test(f.type || '') || /\.(heic|heif)$/i.test(f.name || '');
  async function prepareCover(file) {
    if (!file || !(/^image\//.test(file.type || '') || isHeic(file))) throw new Error('Choose a photo (a JPG, PNG, WebP or HEIC image).');
    if (file.size > COVER_BYTES) throw new Error('That photo is over 25 MB. Choose a smaller one.');
    const img = await new Promise((resolve, reject) => {
      const el = new Image(), u = URL.createObjectURL(file);
      el.onload = () => { URL.revokeObjectURL(u); resolve(el); };
      el.onerror = () => { URL.revokeObjectURL(u); reject(new Error('That file isn’t a photo Momento can read. Try a JPG or PNG.')); };
      el.src = u;
    }).catch((err) => {
      // A HEIC this browser can't open goes to the server as it is (it converts it); there's just no preview here
      if (!isHeic(file)) throw err;
      if (file.size > HEIC_BYTES) throw new Error('That HEIC photo is over 15 MB. Choose a smaller one, or a JPG.');
      return null;
    });
    if (!img) return file;
    const k = Math.min(1, COVER_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const as = (type, q) => new Promise((r) => c.toBlob(r, type, q));
    let blob = await as('image/webp', .85);
    if (!blob || blob.type !== 'image/webp') blob = await as('image/jpeg', .86);   // Safari can't make WebP
    if (!blob) throw new Error('That photo couldn’t be prepared. Try another one.');
    return blob;
  }
  const COVER_HINT = '';   // (no standing explanation: the line under the cover only says what's happening, or what went wrong)
  function mountCover(form, view) {
    let wrap = view.querySelector('.ev-cover');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'ev-cover';
      wrap.innerHTML = `
        <span class="ev-label ev-cover-label" id="evCoverLabel">Cover photo</span>
        <div class="ev-cover-box">
          <button class="ev-cover-pick" type="button" aria-describedby="evCoverHint" aria-label="Add a cover photo">
            <img class="ev-cover-img" alt="" hidden>
            <span class="ev-cover-shade" hidden></span>
            <span class="ev-cover-empty">${svgIcon('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>', 24)}<b>Add a cover photo</b></span>
          </button>
          <div class="ev-cover-acts" hidden><span>Cover photo</span><button class="ev-cover-btn" type="button" data-cover-change>Change</button><button class="ev-cover-btn is-quiet" type="button" data-cover-remove>Remove</button></div>
        </div>
        <input class="ev-cover-file" type="file" accept="image/*,.heic,.heif" tabindex="-1" aria-hidden="true">
        <p class="ev-hint" id="evCoverHint">${COVER_HINT}</p>`;
      // First thing under More options (or, without it, just above the message line)
      const more = view.querySelector('.ev-more-body');
      if (more) more.prepend(wrap); else view.querySelector('.acct-status')?.before(wrap);
      const box = wrap.querySelector('.ev-cover-box'), pick = wrap.querySelector('.ev-cover-pick'), file = wrap.querySelector('.ev-cover-file');
      const img = wrap.querySelector('.ev-cover-img'), shade = wrap.querySelector('.ev-cover-shade'), acts = wrap.querySelector('.ev-cover-acts'), hint = wrap.querySelector('.ev-hint');
      const show = (cover) => {
        if (form._cover?.url && form._cover !== cover) URL.revokeObjectURL(form._cover.url);
        form._cover = cover;
        box.classList.toggle('has-pic', !!cover?.url);
        img.hidden = shade.hidden = !cover?.url;
        acts.hidden = !cover;
        if (cover?.url) img.src = cover.url; else img.removeAttribute('src');
        pick.setAttribute('aria-label', cover ? 'Change the cover photo' : 'Add a cover photo');
      };
      const say = (text, bad) => { hint.textContent = text || COVER_HINT; hint.classList.toggle('is-error', !!bad); };
      const choose = () => { if (pick.getAttribute('aria-busy') !== 'true') file.click(); };
      pick.addEventListener('click', choose);
      wrap.querySelector('[data-cover-change]').addEventListener('click', choose);
      wrap.querySelector('[data-cover-remove]').addEventListener('click', () => { show(null); say(); pick.focus(); });
      file.addEventListener('change', async () => {
        const f = file.files?.[0];
        file.value = '';
        if (!f) return;
        pick.setAttribute('aria-busy', 'true'); say('Getting the photo ready…');
        try {
          const blob = await prepareCover(f);
          const opens = blob !== f || !isHeic(f);
          show({ blob, url: opens ? URL.createObjectURL(blob) : '' });
          say(opens ? '' : `${f.name} chosen. This browser can’t preview HEIC photos, but it will be the cover.`);
          if (!matchMedia('(prefers-reduced-motion: reduce)').matches) img.animate([{ opacity: 0, transform: 'scale(1.04)' }, { opacity: 1, transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.16, 1, .3, 1)' });
        } catch (err) { say(err.message, true); }
        finally { pick.removeAttribute('aria-busy'); }
      });
      wrap._reset = () => { show(null); say(); form.querySelector('.ev-made')?.remove(); };
    }
    wrap._reset();
  }

  // The album is made (assets/album-settings.js listens the same way): send the cover the host picked
  document.addEventListener('momento:albums', async (e) => {
    const { type, album } = e.detail || {};
    const dlg = document.getElementById('mCreate'), form = dlg?.querySelector('form');
    const cover = form?._cover;
    if (type !== 'add' || !album?.id || !dlg?.open || !cover?.blob) return;
    const done = dlg.querySelector('.m-done');
    done?.querySelector('.ev-made')?.remove();
    const made = document.createElement('div');
    made.className = 'ev-made';
    made.innerHTML = `${cover.url ? `<img src="${esc(cover.url)}" alt="">` : ''}<span>Adding the cover…</span>`;
    // Right under "Album created" and its sentence, above the QR code and guest code
    const sub = done?.querySelector(':scope > .acct-sub');
    if (sub) sub.after(made); else done?.prepend(made);
    const label = made.querySelector('span');
    const fd = new FormData();
    fd.append('cover', cover.blob, cover.blob.name || (cover.blob.type === 'image/webp' ? 'cover.webp' : 'cover.jpg'));
    try {
      const r = await momentoApi('/api/albums/' + encodeURIComponent(album.id) + '/cover', { method: 'PUT', body: fd });
      label.textContent = 'Cover photo';
      document.dispatchEvent(new CustomEvent('momento:albums', { detail: { type: 'update', album: r.album || album } }));
    } catch (err) {
      made.remove();
      Momento.toast?.('Album made, but the cover didn’t upload', 'Add it from Album settings. ' + (err.message || ''));
    }
  });

  function wire(form, box) {
    const state = { venue: null, radiusM: 1000, map: null, marker: null, circle: null };
    box._state = state;
    const picked = box.querySelector('[data-picked]'), mapEl = box.querySelector('.ev-map'), search = box.querySelector('.ev-venue-search');

    // The chosen venue, under the search box (nothing there until one is chosen)
    const showPicked = () => {
      picked.classList.remove('is-error');
      picked.hidden = !state.venue;
      picked.lastChild.textContent = state.venue ? [isPlaceholder(state.venue.name) ? 'Your location' : state.venue.name, state.venue.address].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ') : '';
    };
    const drawZone = () => {
      if (!state.map || !state.venue) return;
      const pos = { lat: state.venue.lat, lng: state.venue.lng };
      if (state.marker) state.marker.position = pos;
      if (state.circle) { state.circle.setCenter(pos); state.circle.setRadius(state.radiusM); state.map.fitBounds(state.circle.getBounds(), 8); }
    };
    const setVenue = (v) => {
      state.venue = v;
      if (form.place) form.place.value = ((isPlaceholder(v?.name) ? '' : v?.name) || v?.address || '').slice(0, 60);
      showPicked(); drawZone();
      state.onVenue?.(v);
    };

    // (the form keeps to the essentials: no running summaries of the folded-away options)
    const syncSum = () => {};
    const syncLead = () => {};

    // The zone: 1 to 10 km in half-kilometre steps; the circle on the map follows the slider
    const range = form.evRadius, rangeOut = box.querySelector('[data-radius-out]');
    const syncRadius = () => {
      const k = Number(range.value);
      state.radiusM = Math.round(k * 1000);
      rangeOut.textContent = `${k} km`;
      range.setAttribute('aria-valuetext', `${k} kilometre${k === 1 ? '' : 's'}`);
      range.style.setProperty('--fill', `${((k - 1) / 9) * 100}%`);
      syncSum();
      drawZone();
    };
    range.addEventListener('input', syncRadius);
    box._syncRadius = syncRadius;

    // Who can join: the line under the dropdown says what the choice means
    const visHint = box.querySelector('.ev-vis-hint');
    const syncVis = () => {
      visHint.textContent = form.evVis.value === 'public'
        ? 'Shown on the Events map. Anyone can join while joining is open, without waiting for your approval.'
        : 'Only people you give the code, link or QR code to can join.';
    };
    form.evVis.addEventListener('change', syncVis);
    box._syncVis = syncVis;
    // Moving the start moves the end with it (same length), so the end is never before the start
    let lastStart = '';
    const localValue = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    form.evStart.addEventListener('focus', () => { lastStart = form.evStart.value; });
    form.evStart.addEventListener('change', () => {
      const st = Date.parse(form.evStart.value), was = Date.parse(lastStart), en = Date.parse(form.evEnd.value);
      if (Number.isFinite(st) && Number.isFinite(was) && Number.isFinite(en) && en > was) form.evEnd.value = localValue(new Date(st + (en - was)));
      // No end yet: four hours after the start, to change if needed
      else if (Number.isFinite(st) && !form.evEnd.value) form.evEnd.value = localValue(new Date(st + 4 * 3600000));
      lastStart = form.evStart.value;
    });

    // An album for a friend group is shared with the group, not held at a place and time: no start and
    // end, no venue, no "Who can join?" and no upload window
    // (More options stays: the cover is there)
    const eventOnly = ['.ev-public', '.ev-when', '.ev-venue', '.ev-lead-sec', '.ev-loccheck'].map((s) => box.querySelector(s));
    // The distance only matters when the location check is on
    const radiusSec = box.querySelector('.ev-radius-sec');
    const syncLocCheck = () => { radiusSec.hidden = !!box.dataset.grouped || !form.evLocCheck.checked; };
    form.evLocCheck.addEventListener('change', syncLocCheck);
    const syncWho = () => {
      const grouped = !!form.group?.value;
      box.dataset.grouped = grouped ? 'true' : '';
      // Keep the optional cover on the group's single screen; event settings live on step two.
      const panel = form.querySelector(`[data-create-step="${grouped ? 'details' : 'event'}"]`);
      if (panel && box.parentElement !== panel) panel.append(box);
      eventOnly.forEach((el) => { if (el) el.hidden = grouped; });
      syncLocCheck();
      if (grouped && form.evVis) { form.evVis.value = 'invite'; syncVis(); }
      if (form.place) form.place.value = grouped ? '' : ((isPlaceholder(state.venue?.name) ? '' : state.venue?.name) || state.venue?.address || '').slice(0, 60);
    };
    form.addEventListener('change', (e) => { if (e.target.name === 'group') syncWho(); });
    form.addEventListener('reset', () => setTimeout(syncWho));
    syncWho();
    box._syncWho = syncWho;
    const here = box.querySelector('[data-here]');
    here.addEventListener('click', async () => {
      // Says why first, the first time
      if (window.Momento?.permission && !(await Momento.permission.ensure('location', { from: here }))) return;
      const label = here.lastChild.textContent;
      here.lastChild.textContent = 'Finding you…';
      try {
        const p = await locate();
        const typed = search.querySelector('input')?.value.trim();
        setVenue({ lat: p.lat, lng: p.lng, name: typed || 'Where you are now', address: '', placeId: '' });
        if (state.map) state.map.setCenter(p);
      } catch (err) { picked.hidden = false; picked.classList.add('is-error'); picked.lastChild.textContent = err.message; }
      finally { here.lastChild.textContent = label; }
    });

    // "Search in Google Maps" opens Google Maps on whatever venue has been typed or picked
    const gmaps = box.querySelector('[data-gmaps]');   // (no longer shown: the form keeps to search and "Use my location")
    const syncGmaps = (typed) => {
      if (!gmaps) return;
      const q = (typed ?? '').trim() || (state.venue ? [state.venue.name, state.venue.address].filter(Boolean).join(', ') : '');
      gmaps.href = state.venue && !typed
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q || `${state.venue.lat},${state.venue.lng}`)}`
        : q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : 'https://www.google.com/maps';
    };
    state.onVenue = () => syncGmaps();

    // Without a Maps key: type the venue and pick it from the suggestions that open underneath
    const plain = (why) => {
      search.innerHTML = `
        <input type="text" maxlength="60" placeholder="Search venues" autocomplete="off" spellcheck="false"
          role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="evSuggest" aria-labelledby="evVenueLabel">
        <ul class="ev-suggest" id="evSuggest" role="listbox" aria-label="Places" hidden></ul>`;
      const input = search.querySelector('input'), list = search.querySelector('ul');
      let results = [], active = -1, timer = 0, ctrl = null, near = null;
      // Places near the host come first, if they have already allowed location (no new prompt)
      navigator.permissions?.query({ name: 'geolocation' }).then((p) => { if (p.state === 'granted') locate().then((l) => { near = l; }, () => {}); }, () => {});
      const open = (v) => {
        const was = list.hidden;
        list.hidden = !v; input.setAttribute('aria-expanded', v);
        if (!v) { active = -1; input.removeAttribute('aria-activedescendant'); return; }
        // Just opened: bring the places into view right under the box (on a phone the keyboard can hide them)
        if (was) requestAnimationFrame(() => list.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
      };
      const note = (text) => { list.innerHTML = `<li class="ev-suggest-note" role="presentation">${esc(text)}</li>`; open(true); };
      const paint = () => {
        list.innerHTML = results.map((s, i) => `<li role="option" id="evSug${i}" data-i="${i}" aria-selected="${i === active}" class="${i === active ? 'is-active' : ''}"><b>${esc(s.name)}</b>${s.address ? `<small>${esc(s.address)}</small>` : ''}</li>`).join('')
          + '<li class="ev-credit" role="presentation">Places from OpenStreetMap</li>';
        if (active >= 0) input.setAttribute('aria-activedescendant', 'evSug' + active); else input.removeAttribute('aria-activedescendant');
        open(true);
      };
      const choose = (s) => {
        input.value = s.name.slice(0, 60);
        setVenue({ lat: s.lat, lng: s.lng, name: s.name, address: s.address, placeId: '' });
        open(false);
      };
      input.addEventListener('input', () => {
        const q = input.value.trim();
        if (form.place) form.place.value = q;
        // Typing again means the earlier pick no longer matches
        if (state.venue && q !== state.venue.name) setVenue(null);
        syncGmaps(q);
        clearTimeout(timer); ctrl?.abort();
        if (q.length < 2) { results = []; open(false); return; }
        timer = setTimeout(async () => {
          ctrl = new AbortController();
          try {
            results = await suggestPlaces(q, ctrl.signal, near);
            active = results.length ? 0 : -1;
            if (results.length) paint(); else note('No places found. Try the town too, or search in Google Maps.');
          } catch (err) { if (err.name !== 'AbortError') note('Place search isn’t working right now. Use where you are, or search in Google Maps.'); }
        }, 250);
      });
      input.addEventListener('keydown', (e) => {
        if (list.hidden || !results.length) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length; paint(); }
        else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(results[active]); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); open(false); }
      });
      // pointerdown, not click, so the pick lands before the input loses focus and the list closes
      list.addEventListener('pointerdown', (e) => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); choose(results[+li.dataset.i]); } });
      // The list stays open while there's text and nothing picked yet, also when the box loses focus: on
      // iPhone and iPad closing the keyboard does that, and the places must still be there to tap.
      // It closes when a place is picked, the text is cleared, Escape, or a tap outside the venue search.
      input.addEventListener('focus', () => { if (results.length && !state.venue) paint(); });
      const outside = (e) => { if (!list.hidden && !search.contains(e.target)) open(false); };
      document.addEventListener('pointerdown', outside, true);
      form.closest('dialog')?.addEventListener('close', () => open(false));
      mapEl.hidden = true;
      if (why) box.querySelector('.ev-venue-line').insertAdjacentHTML('afterend', `<p class="ev-hint">${esc(why)}</p>`);
    };

    box._reset = () => {
      // Both start empty ("Enter a start date and time"); their calendars open on today
      form.evStart.value = ''; form.evEnd.value = '';
      box.querySelector('.ev-past')?.remove();
      lastStart = '';
      form.evLead.value = '30';
      form.evRadius.value = '1';
      form.evLocCheck.checked = false;
      if (form.evVis) { form.evVis.value = 'invite'; syncVis(); }
      box._syncRadius();
      setVenue(null);
      const input = search.querySelector('input'); if (input) input.value = '';
      const list = search.querySelector('.ev-suggest'); if (list) list.hidden = true;
      box.querySelector('.ev-more').open = false;
      syncGmaps('');
      syncLead();
    };

    // Start venue search only once the event step is visible, so Maps gets a usable size.
    let venueReady = false;
    box._activate = () => {
      if (venueReady) return;
      venueReady = true;
      getConfig().then(async ({ mapsApiKey }) => {
        // No Maps key: the venue comes from the suggestions list (see plain)
        if (!mapsApiKey) return plain('');
        try {
          await loadMaps(mapsApiKey);
          const [{ Map, Circle }, { PlaceAutocompleteElement }, { AdvancedMarkerElement }] = await Promise.all(
            ['maps', 'places', 'marker'].map((l) => google.maps.importLibrary(l)));
          const ac = new PlaceAutocompleteElement({});
          ac.setAttribute('placeholder', 'Search venues');
          search.append(ac);
          const usePlace = async (place) => {
            if (!place) return;
            await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'id'] });
            if (!place.location) return;
            setVenue({ lat: place.location.lat(), lng: place.location.lng(), name: place.displayName || '', address: place.formattedAddress || '', placeId: place.id || '' });
          };
          ac.addEventListener('gmp-select', (e) => usePlace(e.placePrediction?.toPlace()));
          ac.addEventListener('gmp-placeselect', (e) => usePlace(e.place));   // older versions of the element
          mapEl.hidden = false;
          const start = state.venue || { lat: -33.8688, lng: 151.2093 };
          state.map = new Map(mapEl, { center: start, zoom: 13, mapId: 'DEMO_MAP_ID', disableDefaultUI: true, zoomControl: true, gestureHandling: 'cooperative', clickableIcons: false });
          state.marker = new AdvancedMarkerElement({ map: state.map, position: start, gmpDraggable: true, title: 'Venue' });
          state.circle = new Circle({ map: state.map, center: start, radius: state.radiusM, strokeColor: '#6F9896', strokeOpacity: .9, strokeWeight: 2, fillColor: '#6F9896', fillOpacity: .14, clickable: false });
          const moved = (ll) => setVenue({ ...(state.venue || {}), lat: ll.lat, lng: ll.lng, name: state.venue?.name || 'Pinned on the map', address: state.venue?.address || '', placeId: '' });
          state.marker.addListener('dragend', () => { const p = state.marker.position; moved({ lat: typeof p.lat === 'function' ? p.lat() : p.lat, lng: typeof p.lng === 'function' ? p.lng() : p.lng }); });
          state.map.addListener('click', (e) => moved({ lat: e.latLng.lat(), lng: e.latLng.lng() }));
          if (!state.venue && navigator.permissions) {
            // Centre the map on the host if they've already allowed location (no new prompt here)
            navigator.permissions.query({ name: 'geolocation' }).then((p) => { if (p.state === 'granted') locate().then((l) => { if (!state.venue) state.map.setCenter(l); }, () => {}); }, () => {});
          }
          drawZone();
          document.addEventListener('momento:maps-failed', () => { search.innerHTML = ''; plain('Google Maps couldn’t be used (check the API key). Type the venue’s name or tap “Use my location”.'); }, { once: true });
        } catch (err) {
          search.innerHTML = '';
          plain('Google Maps couldn’t load, so type the venue’s name or tap “Use my location”.');
        }
      });
    };
    // Older callers without steps can still show their venue search immediately.
    if (!form.querySelector('[data-create-step]')) box._activate();
  }

  function activate(form) {
    form.querySelector('.ev')?._activate?.();
  }

  const PLACEHOLDER_NAMES = ['where you are now', 'pinned on the map'];
  const isPlaceholder = (s) => PLACEHOLDER_NAMES.includes(String(s || '').trim().toLowerCase());

  // The event's times from the form, or null
  function times(form) {
    // Start and end are each a date and a time (an event can run past midnight or over several days)
    const s = form.evStart?.value, e = form.evEnd?.value;
    if (!s || !e) return null;
    const startsAt = new Date(s), endsAt = new Date(e);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return null;
    const leadMin = Number(form.evLead?.value || 0);
    return { startsAt, endsAt, leadMin };
  }

  // ---- An event that has already happened: save it as an album instead ----
  // A note under Starts and Ends with one button. The button switches the form to Album (the create form
  // shows that on its first step), keeps the name, dates it the day the event started, and creates it.
  const PAST_GRACE_MS = 12 * 3600000;
  function pastOffer(form, box) {
    let note = box.querySelector('.ev-past');
    if (!note) {
      note = document.createElement('div');
      note.className = 'ev-past';
      note.innerHTML = `<p></p><button class="ev-link ev-past-btn" type="button">Save as an album</button>`;
      box.querySelector('.ev-when').after(note);
      note.querySelector('button').addEventListener('click', () => {
        const day = form.evStart.value.slice(0, 10);
        note.remove();
        const album = form.querySelector('input[name="kind"][value="album"]');
        if (!album || !form.date) return;
        album.checked = true;
        album.dispatchEvent(new Event('change', { bubbles: true }));   // the form goes back to step one, as an album
        form.date.value = day;
        form.date.dispatchEvent(new Event('input', { bubbles: true }));
        form.date.dispatchEvent(new Event('change', { bubbles: true }));
        form.requestSubmit();
      });
      // Changing the times means the note may no longer apply: it's checked again on Create event
      const drop = () => note.remove();
      form.evStart.addEventListener('change', drop, { once: true });
      form.evEnd.addEventListener('change', drop, { once: true });
    }
    const day = new Date(form.evStart.value.slice(0, 10) + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    note.querySelector('p').textContent = `Events are for sharing photos while they happen. To keep the photos from this one, save it as an album dated ${day}. You can add photos to it any time.`;
    return note.querySelector('button');
  }

  function read(form) {
    const box = form.querySelector('.ev');
    if (!box) return { fields: {} };
    const st = box._state, t = times(form);
    // A friend group album: just its name and date (see syncWho)
    if (box.dataset.grouped) { if (form.place) form.place.value = ''; return { fields: { place: '', eventUploadWindow: false, visibility: 'invite' } }; }
    if (!form.evStart.value) return { error: 'Pick the date and time the event starts.', focus: form.evStart };
    if (!form.evEnd.value) return { error: 'Pick the date and time the event ends.', focus: form.evEnd };
    if (!t) return { error: 'Pick the date and time the event starts.', focus: form.evStart };
    if (t.endsAt <= t.startsAt) return { error: 'The event has to end after it starts.', focus: form.evEnd };
    if (t.endsAt - t.startsAt > 7 * 86400000) return { error: 'Keep the event under a week long.', focus: form.evEnd };
    // Already happened (started more than 12 hours ago, or over): a live event's zone and upload window
    // would never open, so it's offered as an album (a memory) instead. Up to 12 hours late is fine, for
    // hosts who make the event once it's under way
    if (t.startsAt < Date.now() - PAST_GRACE_MS || t.endsAt < new Date()) return { error: 'That event has already happened, so it can’t be a live event.', focus: pastOffer(form, box) };
    box.querySelector('.ev-past')?.remove();
    if (!Number.isFinite(t.leadMin) || t.leadMin < 0 || t.leadMin > 1440) { form.evLead.closest('details')?.setAttribute('open', ''); return { error: 'Choose when uploads open, up to 24 hours before the event.', focus: form.evLead }; }
    if (!st.venue) return { error: 'Select a venue or use your location.', focus: box.querySelector('gmp-place-autocomplete, .ev-venue-search input, [data-here]') };
    // "Where you are now" and "Pinned on the map" only label the pin while choosing: they aren't the venue's name
    const typed = (box.querySelector('.ev-venue-search input')?.value || '').trim();
    const name = typed || (isPlaceholder(st.venue.name) ? '' : (st.venue.name || '').trim());
    return {
      fields: {
        place: name.slice(0, 60),
        // The album's date is the day it starts
        date: form.evStart.value.slice(0, 10),
        startsAt: t.startsAt.toISOString(),
        endsAt: t.endsAt.toISOString(),
        uploadLeadMin: t.leadMin,
        eventUploadWindow: true,
        zone: { lat: st.venue.lat, lng: st.venue.lng, radiusM: st.radiusM },
        // Checking guests' location when they join: off unless ticked (saved on the event once it's made, CreateDialog)
        locationRequired: !!form.evLocCheck?.checked,
        venue: { address: st.venue.address || '', placeId: st.venue.placeId || '' },
        visibility: !form.group?.value && form.evVis?.value === 'public' ? 'public' : 'invite',
        // "Would you like games at your event?" (step 1, CreateDialog.tsx): yes unless they chose No games
        games: form.querySelector('input[name="games"]:checked')?.value !== 'no',
      },
    };
  }

  // ---- Momento's camera: photos go into the upload, never into the device's gallery ----
  // Zoom (the lens's own zoom where the browser offers it, otherwise a digital zoom that crops the photo to match what
  // you see): the slider, the 1× 2× 3× chips (0.5× on phones with a wide lens), a pinch, the mouse wheel or + and -.
  // Also: switch camera, flash (where the camera has a light), a 3 or 10 second timer, grid lines, and brightness
  // (where the camera lets the page set it). The timer and grid choices are remembered on this device.
  const CAM_ICON = {
    torch: svgIcon('<path d="M13 2 5 13h6l-1 9 8-11h-6l1-9Z"/>', 18),
    timer: svgIcon('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2h5"/>', 18),
    grid: svgIcon('<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>', 18),
    bright: svgIcon('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>', 18),
    use: svgIcon('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 22),
    back: svgIcon('<path d="m15 5-7 7 7 7"/>', 20),
    trash: svgIcon('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>', 19),
    crop: svgIcon('<path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/>', 21),
    undo: svgIcon('<path d="M4 9h11a5 5 0 0 1 0 10H8M8 5 4 9l4 4"/>', 19),
  };
  const CAM_KEY = 'momento-camera';
  function camera(keep = []) {
    return new Promise((resolve) => {
      let prefs = { timer: 0, grid: false };
      try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(CAM_KEY) || '{}') }; } catch (e) {}
      const savePrefs = () => { try { localStorage.setItem(CAM_KEY, JSON.stringify(prefs)); } catch (e) {} };
      const d = document.createElement('dialog');
      d.className = 'mq-dlg ev-cam';
      d.setAttribute('aria-label', 'Camera');
      d.tabIndex = -1;
      d.innerHTML = `
        <video playsinline muted autoplay></video>
        <span class="ev-grid" aria-hidden="true"></span>
        <span class="ev-flash" aria-hidden="true"></span>
        <span class="ev-count" aria-hidden="true"><b class="ev-lg"><span></span></b></span>
        <p class="ev-cam-status ev-lg" role="status" aria-live="polite">Starting the camera…</p>
        <button class="ev-cbtn ev-lg ev-cam-x" type="button" aria-label="Close the camera" title="Close" data-close>${ICON.close}</button>
        <div class="ev-cam-tools ev-lg" role="group" aria-label="Camera settings">
          <button class="ev-cbtn" type="button" data-torch hidden aria-pressed="false" aria-label="Flash" title="Flash">${CAM_ICON.torch}</button>
          <button class="ev-cbtn" type="button" data-timer title="Self-timer">${CAM_ICON.timer}<span class="ev-tval"></span></button>
          <button class="ev-cbtn" type="button" data-grid aria-pressed="false" aria-label="Grid lines" title="Grid lines">${CAM_ICON.grid}</button>
          <button class="ev-cbtn" type="button" data-bright hidden aria-pressed="false" title="Brightness">${CAM_ICON.bright}<span class="ev-tval"></span></button>
        </div>
        <div class="ev-camzoom ev-lg" role="group" aria-label="Zoom" hidden></div>
        <div class="ev-cam-bar">
          <button class="ev-shots ev-lg" type="button" hidden></button>
          <button class="ev-shutter ev-lg" type="button" aria-label="Take photo" disabled><i></i></button>
          <div class="ev-cam-right">
            <button class="ev-cbtn ev-lg" type="button" data-flip hidden aria-label="Switch camera" title="Switch camera">${ICON.flip}</button>
            <button class="ev-cbtn ev-use" type="button" data-use hidden title="Use the photos">${CAM_ICON.use}<span class="ev-badge"></span></button>
          </div>
        </div>
        <div class="ev-rev" hidden role="group" aria-label="Photos taken">
          <div class="ev-rev-top">
            <button class="ev-cbtn ev-lg" type="button" data-rev-back aria-label="Back to the camera" title="Back to the camera">${CAM_ICON.back}</button>
            <span class="ev-rev-count ev-lg" aria-hidden="true"></span>
            <button class="ev-cbtn ev-lg ev-danger" type="button" data-rev-del aria-label="Delete this photo" title="Delete">${CAM_ICON.trash}</button>
          </div>
          <div class="ev-rev-stage">
            <img alt="">
            <div class="ev-crop" hidden tabindex="0" role="group" aria-label="Crop frame. Drag it or its corners; arrow keys move it."><span class="ev-crop-grid"></span><i data-h="nw"></i><i data-h="n"></i><i data-h="ne"></i><i data-h="e"></i><i data-h="se"></i><i data-h="s"></i><i data-h="sw"></i><i data-h="w"></i></div>
          </div>
          <div class="ev-rev-bottom">
            <div class="ev-rev-strip ev-lg" role="group" aria-label="Choose a photo" hidden></div>
            <div class="ev-crop-shapes ev-lg" role="group" aria-label="Crop shape" hidden>
              <button type="button" class="ev-zchip" data-shape="free" aria-pressed="true">Free</button><button type="button" class="ev-zchip" data-shape="1:1" aria-pressed="false" aria-label="Square">1:1</button><button type="button" class="ev-zchip" data-shape="4:3" aria-pressed="false">4:3</button><button type="button" class="ev-zchip" data-shape="16:9" aria-pressed="false">16:9</button>
            </div>
            <div class="ev-rev-actions">
              <button class="ev-cbtn ev-lg" type="button" data-rev-crop aria-label="Crop this photo" title="Crop">${CAM_ICON.crop}</button>
              <button class="ev-cbtn ev-lg" type="button" data-crop-cancel hidden aria-label="Cancel cropping" title="Cancel">${ICON.close}</button>
              <button class="ev-cbtn ev-lg" type="button" data-crop-reset hidden aria-label="Back to the original photo" title="Original photo">${CAM_ICON.undo}</button>
              <button class="ev-cbtn ev-use" type="button" data-crop-done hidden aria-label="Crop" title="Crop">${CAM_ICON.use}</button>
            </div>
          </div>
        </div>`;
      document.body.append(d);
      const $ = (s) => d.querySelector(s);
      const video = $('video'), status = $('.ev-cam-status'), shutter = $('.ev-shutter');
      const shotsEl = $('.ev-shots'), use = $('[data-use]'), flip = $('[data-flip]');
      const torchBtn = $('[data-torch]'), timerBtn = $('[data-timer]'), gridBtn = $('[data-grid]');
      const zoomBox = $('.ev-camzoom'), chips = zoomBox;
      const brightBtn = $('[data-bright]'), countEl = $('.ev-count span');
      let brightLevels = [0], bright = 0;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      // { file (as it will upload), orig (as taken), url (to show it) }; photos kept from a cancelled upload come back first
      const shots = keep.map((f) => ({ file: f, orig: f, url: URL.createObjectURL(f) }));
      let stream = null, track = null, facing = 'environment', settled = false, front = false;
      // zoom: lens = the camera does it; otherwise digital (the preview scales and the photo is cropped to match)
      let zoom = 1, zMin = 1, zMax = 1, lens = false, torch = false;
      let countdown = null; // { timer, left }
      const say = (m, bad) => { status.textContent = m; status.classList.toggle('is-error', !!bad); };
      const stop = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; track = null; video.srcObject = null; };
      const finish = (files) => {
        if (settled) return; settled = true;
        cancelCountdown(); stop(); shots.forEach((x) => URL.revokeObjectURL(x.url)); resized.disconnect();
        removeEventListener('keydown', onKey);
        if (d.open) d.close();
        d.remove();
        resolve(files);
      };
      const ready = () => say(shots.length ? `${shots.length} taken. Take more, or use them.` : 'Photos taken here go straight to the album, not to your gallery.');

      // ---- zoom ----
      const fmt = (z) => (Math.round(z * 10) / 10).toString().replace(/\.0$/, '') + '×';
      function paintZoom() {
        // the chip at or just below the zoom is the chosen one and shows the exact zoom (2.4×), the others their own
        const list = [...chips.querySelectorAll('button')];
        const on = list.filter((b) => +b.dataset.z <= zoom + 0.05).pop() || list[0];
        list.forEach((b) => {
          b.setAttribute('aria-pressed', String(b === on));
          b.textContent = b === on ? fmt(zoom) : fmt(+b.dataset.z);
        });
        video.style.transform = `${front ? 'scaleX(-1) ' : ''}${!lens && zoom > 1 ? `scale(${zoom})` : ''}`.trim();
      }
      function setZoom(z) {
        zoom = Math.min(zMax, Math.max(zMin, Math.round(z * 10) / 10));
        if (lens && track) track.applyConstraints({ advanced: [{ zoom }] }).catch(() => {});
        paintZoom();
      }
      function setUpControls() {
        const caps = track?.getCapabilities?.() || {}, settings = track?.getSettings?.() || {};
        lens = !!(caps.zoom && caps.zoom.max > caps.zoom.min);
        zMin = lens ? caps.zoom.min : 1;
        zMax = lens ? Math.min(caps.zoom.max, 10) : 5;
        zoom = lens ? Math.min(zMax, Math.max(zMin, settings.zoom || 1)) : 1;
        const presets = [zMin < 0.95 ? Math.round(zMin * 10) / 10 : null, 1, 2, 3].filter((z) => z !== null && z >= zMin - 0.01 && z <= zMax + 0.01);
        chips.innerHTML = presets.map((z) => `<button type="button" class="ev-zchip" data-z="${z}" aria-pressed="false" aria-label="Zoom ${fmt(z)}">${fmt(z)}</button>`).join('');
        zoomBox.hidden = zMax <= 1;
        // Flash: only cameras with a light (most phones' back cameras)
        torch = false;
        torchBtn.hidden = !caps.torch;
        torchBtn.setAttribute('aria-pressed', 'false');
        // Brightness: where the camera lets the page set its exposure, a tap goes brighter, darker, then back
        const ex = caps.exposureCompensation;
        brightBtn.hidden = !(ex && ex.max > ex.min);
        brightLevels = brightBtn.hidden ? [0] : [...new Set([0, Math.min(1, ex.max), Math.max(-1, ex.min)])];
        bright = 0; paintBright();
        paintZoom();
      }
      chips.addEventListener('click', (e) => { const b = e.target.closest('[data-z]'); if (b) setZoom(+b.dataset.z); });
      function paintBright() {
        const t = bright > 0 ? '+' + bright : bright < 0 ? '−' + -bright : '';
        brightBtn.querySelector('.ev-tval').textContent = t;
        brightBtn.setAttribute('aria-pressed', String(!!bright));
        brightBtn.setAttribute('aria-label', bright ? `Brightness: ${bright > 0 ? 'brighter' : 'darker'}` : 'Brightness: normal');
      }
      brightBtn.addEventListener('click', () => {
        bright = brightLevels[(brightLevels.indexOf(bright) + 1) % brightLevels.length];
        track?.applyConstraints({ advanced: [{ exposureCompensation: bright }] }).catch(() => {});
        paintBright();
      });
      // Two fingers anywhere on the camera (not starting on a button or slider) pinch to zoom in and out, like a
      // phone's own camera app. The page itself never zooms or scrolls while the camera is open (touch-action, and
      // Safari's own gesture events)
      const fingers = new Map();
      let pinch = null, pinchRaf = 0, pinchTo = 0;
      // (one finger on a button or slider still uses it; a second finger makes it a pinch, wherever either landed, and
      // both are then held by the camera so lifting them presses nothing underneath)
      d.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' || reviewing()) return;
        if (e.isPrimary) fingers.clear();   // a new touch: forget any lift that was missed
        fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (fingers.size === 2) {
          for (const id of fingers.keys()) { try { d.setPointerCapture(id); } catch (err) {} }
          const [a, b] = [...fingers.values()];
          pinch = { d0: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), z0: zoom };
        }
      });
      d.addEventListener('pointermove', (e) => {
        if (!fingers.has(e.pointerId)) return;
        fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (!pinch || fingers.size < 2) return;
        e.preventDefault();
        const [a, b] = [...fingers.values()];
        pinchTo = pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0;
        // at most once a frame (the camera's own zoom is a request to the camera)
        if (!pinchRaf) pinchRaf = requestAnimationFrame(() => { pinchRaf = 0; if (pinch) setZoom(pinchTo); });
      });
      const lift = (e) => {
        fingers.delete(e.pointerId);
        if (fingers.size < 2 && pinch) { pinch = null; cancelAnimationFrame(pinchRaf); pinchRaf = 0; setZoom(pinchTo || zoom); }
      };
      d.addEventListener('pointerup', lift); d.addEventListener('pointercancel', lift);
      for (const t of ['gesturestart', 'gesturechange', 'gestureend']) d.addEventListener(t, (e) => e.preventDefault());
      // The mouse wheel (or a trackpad pinch)
      d.addEventListener('wheel', (e) => { if (zoomBox.hidden || reviewing() || e.target.closest('.ev-cam-bar, .ev-cam-tools')) return; e.preventDefault(); setZoom(zoom * Math.exp(-e.deltaY * 0.0025)); }, { passive: false });
      function onKey(e) {
        if (!d.open || e.target.matches?.('input') || reviewing()) return;
        if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(zoom + 0.5); }
        else if (e.key === '-' || e.key === '_') { e.preventDefault(); setZoom(zoom - 0.5); }
      }
      addEventListener('keydown', onKey);

      // ---- flash, timer, grid ----
      torchBtn.addEventListener('click', () => {
        torch = !torch;
        track?.applyConstraints({ advanced: [{ torch }] }).catch(() => { torch = false; torchBtn.setAttribute('aria-pressed', 'false'); });
        torchBtn.setAttribute('aria-pressed', String(torch));
      });
      const TIMERS = [0, 3, 5, 10];
      const paintTimer = () => {
        timerBtn.querySelector('.ev-tval').textContent = prefs.timer ? `${prefs.timer}s` : '';
        timerBtn.setAttribute('aria-label', prefs.timer ? `Self-timer: ${prefs.timer} seconds` : 'Self-timer: off');
        timerBtn.setAttribute('aria-pressed', String(!!prefs.timer));
      };
      timerBtn.addEventListener('click', () => { prefs.timer = TIMERS[(TIMERS.indexOf(prefs.timer) + 1) % TIMERS.length]; savePrefs(); paintTimer(); });
      const paintGrid = () => { d.classList.toggle('has-grid', !!prefs.grid); gridBtn.setAttribute('aria-pressed', String(!!prefs.grid)); };
      gridBtn.addEventListener('click', () => { prefs.grid = !prefs.grid; savePrefs(); paintGrid(); });
      paintTimer(); paintGrid();

      async function start() {
        cancelCountdown(); stop(); shutter.disabled = true;
        say('Starting the camera…');
        try {
          if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error(), { name: 'Insecure' });
          if (window.Momento?.permission && !(await Momento.permission.ensure('camera'))) throw Object.assign(new Error(), { name: 'NotAllowedError' });
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
          if (settled) return stop();
          track = stream.getVideoTracks()[0] || null;
          video.srcObject = stream;
          await video.play().catch(() => {});
          const s = track?.getSettings?.() || {};
          front = (s.facingMode || facing) === 'user';
          d.classList.toggle('is-front', front);
          setUpControls();
          shutter.disabled = false;
          ready();
          const cams = (await navigator.mediaDevices.enumerateDevices()).filter((x) => x.kind === 'videoinput');
          flip.hidden = cams.length < 2;
        } catch (err) {
          say(err.name === 'NotAllowedError' ? 'Camera access is off for Momento. Allow it in your browser’s site settings, then reopen the camera.'
            : err.name === 'NotFoundError' ? 'No camera was found on this device.'
            : err.name === 'Insecure' ? 'The camera only works when Momento is opened over https.'
            : 'The camera didn’t start. Close other apps using it and try again.', true);
        }
      }

      // ---- taking the photo ----
      function capture() {
        const w = video.videoWidth, h = video.videoHeight;
        if (!w || !h || shots.length >= 30) return;
        // Digital zoom: keep the middle of the frame, as the preview shows it (full resolution of that part)
        const z = lens ? 1 : zoom, cw = Math.round(w / z), ch = Math.round(h / z);
        const c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        c.getContext('2d').drawImage(video, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, cw, ch);
        const fl = $('.ev-flash');
        fl.classList.remove('is-on'); void d.offsetWidth; fl.classList.add('is-on');
        navigator.vibrate?.(20);
        c.toBlob((blob) => {
          if (!blob) return;
          const file = new File([blob], `momento-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
          shots.push({ file, orig: file, url: URL.createObjectURL(blob) });
          paintShots(true);
          say(`${shots.length} taken. Take more, look at them, or use ${shots.length === 1 ? 'it' : 'them'}.`);
        }, 'image/jpeg', .92);
      }
      // ---- the photos taken: the last one bottom left; pressed, they open full screen to look through, crop or delete ----
      function paintShots(isNew) {
        const last = shots[shots.length - 1];
        shotsEl.hidden = !last;
        shotsEl.replaceChildren();
        if (last) {
          const img = new Image(); img.src = last.url; img.alt = '';
          if (isNew) img.className = 'is-new';
          shotsEl.append(img);
          shotsEl.setAttribute('aria-label', shots.length === 1 ? 'Look at the photo taken' : `Look at the ${shots.length} photos taken`);
        }
        use.hidden = !shots.length;
        use.querySelector('.ev-badge').textContent = shots.length > 1 ? String(shots.length) : '';
        use.setAttribute('aria-label', shots.length === 1 ? 'Use photo' : `Use ${shots.length} photos`);
      }
      const rev = $('.ev-rev'), stage = $('.ev-rev-stage'), revImg = $('.ev-rev-stage > img'), revStrip = $('.ev-rev-strip');
      const revCount = $('.ev-rev-count'), cropBox = $('.ev-crop'), shapes = $('.ev-crop-shapes');
      const cropBtn = $('[data-rev-crop]'), cropCancel = $('[data-crop-cancel]'), cropReset = $('[data-crop-reset]'), cropDone = $('[data-crop-done]');
      const reviewing = () => !rev.hidden;
      let ri = 0, cropping = null;   // cropping: { r: { x, y, w, h } as parts of the photo, aspect: width/height or 0 }
      function openReview(i) {
        if (!shots.length) return;
        cancelCountdown();
        ri = i; rev.hidden = false;
        paintReview();
        $('[data-rev-back]').focus({ focusVisible: false });
      }
      function closeReview() {
        if (cropping) endCrop();
        rev.hidden = true;
        paintShots(false); ready();
        (shots.length ? shotsEl : shutter).focus({ focusVisible: false });
      }
      function paintReview() {
        if (!shots.length) { closeReview(); return; }
        ri = Math.max(0, Math.min(shots.length - 1, ri));
        revImg.src = shots[ri].url;
        revImg.alt = shots.length === 1 ? 'The photo taken' : `Photo ${ri + 1} of ${shots.length}`;
        revCount.textContent = shots.length > 1 ? `${ri + 1} / ${shots.length}` : '';
        revStrip.hidden = shots.length < 2 || !!cropping;
        revStrip.replaceChildren(...shots.map((s, i) => {
          const b = document.createElement('button');
          b.type = 'button'; b.dataset.i = String(i);
          b.setAttribute('aria-label', `Photo ${i + 1}`);
          b.setAttribute('aria-current', String(i === ri));
          const img = new Image(); img.src = s.url; img.alt = '';
          b.append(img);
          return b;
        }));
        revStrip.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      const step = (by) => { if (cropping || shots.length < 2) return; ri = (ri + by + shots.length) % shots.length; paintReview(); };
      shotsEl.addEventListener('click', () => openReview(shots.length - 1));
      $('[data-rev-back]').addEventListener('click', closeReview);
      revStrip.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { ri = +b.dataset.i; paintReview(); } });
      $('[data-rev-del]').addEventListener('click', async (e) => {
        const from = e.currentTarget;
        if (window.Momento?.confirm && !await Momento.confirm({ from, title: 'Delete this photo?', body: 'It hasn’t been uploaded, so it can’t be brought back.', ok: 'Delete' })) return;
        if (cropping) endCrop();
        const [gone] = shots.splice(ri, 1);
        URL.revokeObjectURL(gone.url);
        say('Photo deleted.');
        if (!shots.length) { closeReview(); return; }
        paintReview();
      });
      // a swipe across the photo goes to the next or previous one
      let swipe = null;
      stage.addEventListener('pointerdown', (e) => { if (!cropping && e.isPrimary) swipe = { x: e.clientX, y: e.clientY }; });
      stage.addEventListener('pointerup', (e) => {
        if (!swipe) return;
        const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y; swipe = null;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) step(dx < 0 ? 1 : -1);
      });
      stage.addEventListener('pointercancel', () => { swipe = null; });

      // ---- cropping ----
      const MIN = 0.08;
      function photoBox() {   // where the photo is drawn inside the stage, in pixels
        const W = revImg.naturalWidth || 1, H = revImg.naturalHeight || 1;
        const aw = stage.clientWidth - 36, ah = stage.clientHeight - 36, s = Math.min(aw / W, ah / H);
        const w = W * s, h = H * s;
        return { x: 18 + (aw - w) / 2, y: 18 + (ah - h) / 2, w, h, W, H };
      }
      function paintCrop() {
        if (!cropping) return;
        const b = photoBox(), r = cropping.r;
        Object.assign(cropBox.style, { left: `${b.x + r.x * b.w}px`, top: `${b.y + r.y * b.h}px`, width: `${r.w * b.w}px`, height: `${r.h * b.h}px` });
        cropBox.classList.toggle('is-locked', !!cropping.aspect);
        shapes.querySelectorAll('[data-shape]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.shape === cropping.shape)));
        cropReset.hidden = shots[ri].file === shots[ri].orig;
      }
      const resized = new ResizeObserver(() => paintCrop());
      function setShape(shape) {
        const b = photoBox(), portrait = b.H > b.W;
        const ratio = { free: 0, '1:1': 1, '4:3': 4 / 3, '16:9': 16 / 9 }[shape];
        cropping.shape = shape;
        cropping.aspect = ratio && portrait && ratio !== 1 ? 1 / ratio : ratio;
        if (cropping.aspect) {
          // the biggest frame of that shape, in the middle of the photo
          let w = b.W, h = b.W / cropping.aspect;
          if (h > b.H) { h = b.H; w = b.H * cropping.aspect; }
          cropping.r = { w: w / b.W, h: h / b.H, x: (1 - w / b.W) / 2, y: (1 - h / b.H) / 2 };
        }
        paintCrop();
      }
      async function startCrop() {
        try { await revImg.decode(); } catch (e) {}
        cropping = { r: { x: 0, y: 0, w: 1, h: 1 }, aspect: 0, shape: 'free' };
        rev.classList.add('is-cropping');
        cropBox.hidden = false; shapes.hidden = false; revStrip.hidden = true;
        cropBtn.hidden = true; $('[data-rev-del]').hidden = true;
        cropCancel.hidden = false; cropDone.hidden = false;
        resized.observe(stage);
        paintCrop();
        cropDone.focus({ focusVisible: false });
      }
      function endCrop() {
        cropping = null;
        rev.classList.remove('is-cropping');
        resized.disconnect();
        cropBox.hidden = true; shapes.hidden = true; cropCancel.hidden = true; cropDone.hidden = true; cropReset.hidden = true;
        cropBtn.hidden = false; $('[data-rev-del]').hidden = false;
        paintReview();
      }
      async function replaceShot(s, file) {
        URL.revokeObjectURL(s.url);
        s.file = file; s.url = URL.createObjectURL(file);
        revImg.src = s.url;
        try { await revImg.decode(); } catch (e) {}
      }
      async function applyCrop() {
        const s = shots[ri], r = cropping.r;
        if (r.x < 0.002 && r.y < 0.002 && r.w > 0.996 && r.h > 0.996) { endCrop(); return; }   // nothing cut off
        const W = revImg.naturalWidth, H = revImg.naturalHeight;
        const sx = Math.round(r.x * W), sy = Math.round(r.y * H), sw = Math.max(1, Math.round(r.w * W)), sh = Math.max(1, Math.round(r.h * H));
        const c = document.createElement('canvas');
        c.width = sw; c.height = sh;
        c.getContext('2d').drawImage(revImg, sx, sy, sw, sh, 0, 0, sw, sh);
        const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', .92));
        if (!blob) { endCrop(); return; }
        await replaceShot(s, new File([blob], s.orig.name, { type: 'image/jpeg', lastModified: Date.now() }));
        say('Photo cropped.');
        endCrop();
      }
      cropBtn.addEventListener('click', startCrop);
      cropCancel.addEventListener('click', endCrop);
      cropDone.addEventListener('click', applyCrop);
      cropReset.addEventListener('click', async () => {   // back to the photo as it was taken
        const s = shots[ri];
        await replaceShot(s, s.orig);
        cropping.r = { x: 0, y: 0, w: 1, h: 1 };
        setShape(cropping.shape);
        say('Back to the original photo.');
      });
      shapes.addEventListener('click', (e) => { const c = e.target.closest('[data-shape]'); if (c && cropping) setShape(c.dataset.shape); });
      let drag = null;
      cropBox.addEventListener('pointerdown', (e) => {
        if (!cropping || (e.pointerType === 'mouse' && e.button !== 0)) return;
        e.preventDefault(); e.stopPropagation();
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, r: { ...cropping.r }, h: e.target.dataset.h || 'move' };
        try { cropBox.setPointerCapture(e.pointerId); } catch (err) {}
        cropBox.classList.add('is-dragging');
      });
      cropBox.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const b = photoBox(), dx = (e.clientX - drag.x) / b.w, dy = (e.clientY - drag.y) / b.h, h = drag.h;
        const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
        let { x, y, w, h: hh } = drag.r;
        if (h === 'move') { x = clamp(x + dx, 0, 1 - w); y = clamp(y + dy, 0, 1 - hh); }
        else {
          let L = x, T = y, R = x + w, B = y + hh;
          if (h.includes('w')) L = clamp(L + dx, 0, R - MIN);
          if (h.includes('e')) R = clamp(R + dx, L + MIN, 1);
          if (h.includes('n')) T = clamp(T + dy, 0, B - MIN);
          if (h.includes('s')) B = clamp(B + dy, T + MIN, 1);
          if (cropping.aspect) {
            // keep the shape: shrink whichever side is too long, from the corner being dragged
            const k = cropping.aspect * b.H / b.W;
            let nw = R - L, nh = B - T;
            if (nw / nh > k) nw = nh * k; else nh = nw / k;
            if (h.includes('w')) L = R - nw; else R = L + nw;
            if (h.includes('n')) T = B - nh; else B = T + nh;
          }
          x = L; y = T; w = R - L; hh = B - T;
        }
        cropping.r = { x, y, w, h: hh };
        paintCrop();
      });
      const dragEnd = (e) => { if (drag && e.pointerId === drag.id) { drag = null; cropBox.classList.remove('is-dragging'); } };
      cropBox.addEventListener('pointerup', dragEnd); cropBox.addEventListener('pointercancel', dragEnd);
      // keys: arrows step through the photos (or nudge the frame while cropping)
      rev.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' && !cropping && e.target.closest?.('.ev-rev')) { e.preventDefault(); $('[data-rev-del]').click(); return; }
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        if (!cropping) { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1); } return; }
        if (e.target !== cropBox) return;
        e.preventDefault();
        const r = cropping.r, by = 0.01;
        if (e.key === 'ArrowLeft') r.x = Math.max(0, r.x - by);
        if (e.key === 'ArrowRight') r.x = Math.min(1 - r.w, r.x + by);
        if (e.key === 'ArrowUp') r.y = Math.max(0, r.y - by);
        if (e.key === 'ArrowDown') r.y = Math.min(1 - r.h, r.y + by);
        paintCrop();
      });

      function cancelCountdown() {
        if (!countdown) return;
        clearInterval(countdown.timer); countdown = null;
        countEl.textContent = ''; d.classList.remove('is-counting');
        shutter.setAttribute('aria-label', 'Take photo');
      }
      const tickCount = () => {
        countEl.textContent = String(countdown.left);
        if (!reduced) countEl.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none', offset: .35 }, { opacity: 1, transform: 'none' }], { duration: 950, easing: 'cubic-bezier(.16, 1, .3, 1)' });
      };
      shutter.addEventListener('click', () => {
        if (countdown) { cancelCountdown(); ready(); return; }   // pressing again while it counts down cancels
        if (!prefs.timer) { capture(); return; }
        countdown = { left: prefs.timer, timer: 0 };
        d.classList.add('is-counting');
        shutter.setAttribute('aria-label', 'Cancel the timer');
        say(`Taking a photo in ${prefs.timer} seconds. Press the shutter again to cancel.`);
        tickCount();
        countdown.timer = setInterval(() => {
          countdown.left -= 1;
          if (countdown.left > 0) { tickCount(); return; }
          cancelCountdown(); capture();
        }, 1000);
      });
      flip.addEventListener('click', () => { facing = facing === 'environment' ? 'user' : 'environment'; start(); });
      use.addEventListener('click', () => finish(shots.map((x) => x.file)));
      // Closing throws away the photos taken (they were never saved anywhere), so it asks first when there are any
      let asking = false;
      async function closeCamera(from) {
        if (asking) return;
        const n = shots.length;
        if (n && window.Momento?.confirm) {
          asking = true;
          const sure = await Momento.confirm({ from, title: n === 1 ? 'Discard this photo?' : `Discard ${n} photos?`, body: `${n === 1 ? 'It hasn’t' : 'They haven’t'} been uploaded or saved to your device, so ${n === 1 ? 'it' : 'they'} can’t be brought back.`, ok: 'Discard' });
          asking = false;
          if (!sure) { d.focus({ focusVisible: false }); return; }
        }
        finish([]);
      }
      $('[data-close]').addEventListener('click', (e) => closeCamera(e.currentTarget));
      d.addEventListener('cancel', (e) => { e.preventDefault(); if (cropping) { endCrop(); return; } if (reviewing()) { closeReview(); return; } if (countdown) { cancelCountdown(); ready(); return; } closeCamera($('[data-close]')); });
      if (shots.length) { paintShots(false); ready(); }
      d.showModal();
      d.focus({ focusVisible: false });   // (the camera itself has focus, not a ring on the close button; Tab reaches the buttons)
      start();
    });
  }

  // ---- Agreeing to upload to an album: asked once per album, then remembered on this device for this account and this
  // version of the Terms (a new account, new Terms, or the server saying it has no record asks again) ----
  const CONSENT_KEY = 'momento-upload-consent';
  const consentId = (album) => `${Momento.account?.get?.()?.id || 'signed-out'}:${album?.id}`;
  const consents = () => { try { return JSON.parse(localStorage.getItem(CONSENT_KEY) || '{}') || {}; } catch (e) { return {}; } };
  const saveConsents = (all) => { try { localStorage.setItem(CONSENT_KEY, JSON.stringify(Object.fromEntries(Object.entries(all).slice(-300)))); } catch (e) {} };
  // The Terms version to agree to: the server's, when the album's details carry it (GET /api/albums/:id)
  const termsOf = (album) => album?.termsVersion || window.MOMENTO_TERMS_VERSION;
  // The server keeps the record (album.uploadConsent, on any device); this device's copy covers a server without it
  const serverKeeps = (album) => !!album && 'uploadConsent' in album;
  const hasConsent = (album) => !!album?.id && (album.uploadConsent?.termsVersion === termsOf(album) || consents()[consentId(album)] === termsOf(album));
  function rememberConsent(album) { if (!album?.id) return; const all = consents(); delete all[consentId(album)]; all[consentId(album)] = termsOf(album); saveConsents(all); }
  function forgetConsent(album) { const all = consents(); delete all[consentId(album)]; saveConsents(all); if (album) album.uploadConsent = null; }
  // Records the agreement on the server (POST /api/albums/:id/consent). 'outdated' when the Terms changed since the
  // page loaded (the box is shown again, against the new version); false when it couldn't be recorded: the upload
  // still goes ahead, and a server that needs the record says so (consent-required), which asks again.
  async function recordConsent(album) {
    if (!album?.id) return false;
    try {
      const r = await momentoApi(`/api/albums/${encodeURIComponent(album.id)}/consent`, momentoJson('POST', { termsVersion: termsOf(album) }));
      album.uploadConsent = { termsVersion: r.termsVersion, at: r.at };
      return true;
    } catch (e) {
      if (e.status === 409 && e.data?.termsVersion) { album.termsVersion = e.data.termsVersion; forgetConsent(album); return 'outdated'; }
      return false;
    }
  }

  // ---- Asking before an upload (and the guest's location, when the album has a zone) ----
  // Resolves to { location, files } (files: the ones still in the list; each has a cross to leave it out), or null.
  // The first upload to an album asks for the agreement (a box to tick); after that, uploads to it go straight up.
  async function confirmUpload(album, files, { fromCamera = false } = {}) {
    if (hasConsent(album)) {
      // Agreed on this device before the server kept a record: record it now (it's the same agreement, same Terms)
      if (serverKeeps(album) && !album.uploadConsent && (await recordConsent(album)) === 'outdated') return confirmUpload(album, files, { fromCamera });
      return { location: '', files: [...files] };
    }
    return new Promise((resolve) => {
      const d = document.createElement('dialog');
      d.className = 'ev-ask';
      d.setAttribute('aria-labelledby', 'evAskTitle');
      const limits = Momento.uploadLimits?.() || { maxPhotoMB: 50 };
      // (camera RAW files, and HEIC on most browsers, can't be shown, so their tile shows the file type instead)
      const items = files.map((f) => ({ f, url: Momento.isRawFile?.(f) ? null : URL.createObjectURL(f) }));
      const ext = (f) => (f.name.split('.').pop() || 'photo').slice(0, 5).toUpperCase();
      d.innerHTML = `
        <h2 id="evAskTitle"></h2>
        <p data-what></p>
        <p class="ev-limit">Up to ${Number(limits.maxPhotoMB) || 50} MB a photo. Camera RAW files (CR3, NEF, ARW, RAF, DNG and more) can be bigger.</p>
        <p class="ev-limit">Works with JPEG, PNG, HEIC and HEIF (iPhone), WebP, AVIF, GIF, TIFF, JPEG XL and camera RAW, including iPhone ProRAW (DNG).</p>
        <label class="ev-consent" data-terms><input type="checkbox" data-consent autofocus><span>I took these photos or have permission to share them, and the people in them are happy for them to be shared with this album. I let Momento store, check and show them to the album’s members, as set out in the <a href="terms" target="_blank" rel="noopener">Terms</a>.</span></label>
        <p class="ev-consent-note">You’ll only be asked once for this album.</p>
        <ul class="ev-thumbs" aria-label="Photos to upload"></ul>
        <p class="ev-none" data-none hidden>${fromCamera ? 'All the photos were taken out. Go back to the camera to take more.' : 'All the photos were taken out. Cancel and choose again.'}</p>
        <div class="mq-row"><button class="mq-btn is-light" type="button" data-no>${fromCamera ? 'Back to camera' : 'Cancel'}</button><button class="mq-btn" type="button" data-yes>Upload</button></div>`;
      document.body.append(d);
      const list = d.querySelector('.ev-thumbs'), yes = d.querySelector('[data-yes]'), agree = d.querySelector('[data-consent]');
      agree.addEventListener('change', () => paint());
      for (const it of items) {
        const li = document.createElement('li');
        li.className = 'ev-thumb';
        const showExt = () => { const t = document.createElement('span'); t.className = 'ev-thumb-ext'; t.textContent = ext(it.f); li.prepend(t); };
        if (it.url) {
          const img = new Image(); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.src = it.url;
          img.addEventListener('error', () => { img.remove(); showExt(); }, { once: true });
          li.append(img);
        } else showExt();
        const x = document.createElement('button');
        x.type = 'button'; x.className = 'ev-thumb-x'; x.title = 'Leave this photo out';
        x.setAttribute('aria-label', 'Leave out ' + it.f.name);
        x.innerHTML = ICON.close;
        x.addEventListener('click', () => {
          const at = items.indexOf(it);
          items.splice(at, 1);
          if (it.url) URL.revokeObjectURL(it.url);
          li.remove();
          paint();
          // focus moves to the next cross (or the one before, or Cancel when none are left)
          const xs = list.querySelectorAll('.ev-thumb-x');
          (xs[Math.min(at, xs.length - 1)] || d.querySelector('[data-no]')).focus();
        });
        li.append(x);
        it.li = li;
        list.append(li);
      }
      function paint() {
        const n = items.length, what = n === 1 ? 'this photo' : `these ${n} photos`;
        d.querySelector('#evAskTitle').textContent = n ? `Upload ${n === 1 ? '1 photo' : `${n} photos`}?` : 'No photos to upload';
        const p = d.querySelector('[data-what]');
        p.innerHTML = `Momento would like to add ${what} to <b>${esc(album?.name || 'the album')}</b>. Everyone in the album will be able to see and download ${n === 1 ? 'it' : 'them'}.`;
        for (const el of [p, d.querySelector('[data-terms]'), d.querySelector('.ev-consent-note'), list]) el.hidden = !n;
        d.querySelector('[data-none]').hidden = !!n;
        // Upload only once the box is ticked
        yes.disabled = !n || !agree.checked;
        yes.textContent = n > 1 ? `Upload ${n}` : 'Upload';
      }
      paint();
      let settled = false;
      const done = (v) => { if (settled) return; settled = true; items.forEach((it) => it.url && URL.revokeObjectURL(it.url)); if (d.open) d.close(); d.remove(); resolve(v); };
      // (from the camera, the photos still in the list go back with it, so nothing taken is lost)
      const no = () => done(fromCamera ? { cancelled: true, files: items.map((it) => it.f) } : null);
      d.querySelector('[data-no]').addEventListener('click', no);
      d.addEventListener('cancel', (e) => { e.preventDefault(); no(); });
      const said = d.querySelector('.ev-consent-note');
      yes.addEventListener('click', async () => {
        if (!items.length || !agree.checked || yes.getAttribute('aria-busy')) return;
        yes.setAttribute('aria-busy', 'true');
        const recorded = await recordConsent(album);
        yes.removeAttribute('aria-busy');
        if (recorded === 'outdated') {
          // The Terms changed while the page was open: tick again, against the new version
          agree.checked = false; paint();
          said.textContent = Momento.i18n?.t ? Momento.i18n.t('The Terms have been updated. Read them, then tick the box again.') : 'The Terms have been updated. Read them, then tick the box again.';
          said.setAttribute('role', 'alert');
          agree.focus();
          return;
        }
        rememberConsent(album);
        done({ location: '', files: items.map((it) => it.f) });
      });
      d.showModal();
    });
  }

  // When an album with event times opens for photos, in words: "Photos can be added from Sat 8 Nov, 6:30 pm"
  function windowText(a) {
    if (a?.anytimeUploads) return '';
    if (!a?.startsAt || !a?.endsAt) return '';
    const s = new Date(a.startsAt), e = new Date(a.endsAt), opens = new Date(a.opensAt || s);
    // (a dash between the times in other languages, which reads the same in all of them)
    const when = `${fmtWhen(s)}${Array.isArray(timeLocale()) ? ' to ' : ' – '}${fmtTime(e)}`;
    if (a.status === 'upcoming') return `Event ${when}. Photos can be added from ${fmtWhen(opens)}.`;
    if (a.status === 'live') return `Event ${when}. Photos can be added until ${fmtTime(e)}.`;
    return `Event ${when}. This album has closed to new photos.`;
  }

  Momento.event = { mount, activate, read, camera, confirmUpload, forgetConsent, hasConsent, recordConsent, locate, windowText, distanceM, prepareCover, isPlaceholder };

  // ---- Your friend groups, for the Create form's "Share with" ----
  // The form used to ask the server each time it opened and only then show the field, so it popped in a
  // moment after everything else. The list is remembered for the tab (per account) and fetched in the
  // background once the page has loaded, so the field is there as the form opens; each opening still
  // refreshes it quietly. cached(): [{ id, name }] or null if not known yet. refresh(): the fresh list.
  const groupsKey = () => 'momento-groups:' + (Momento.account?.get?.()?.id || 'me');
  let groupsAsking = null;
  Momento.myGroups = {
    cached() {
      try { const v = JSON.parse(sessionStorage.getItem(groupsKey()) || 'null'); return Array.isArray(v) ? v : null; } catch (e) { return null; }
    },
    refresh() {
      return (groupsAsking ||= window.momentoApi('/api/groups').then(({ groups }) => {
        const list = (Array.isArray(groups) ? groups : []).map((g) => ({ id: String(g.id), name: String(g.name || '') }));
        try { sessionStorage.setItem(groupsKey(), JSON.stringify(list)); } catch (e) {}
        return list;
      }).finally(() => { groupsAsking = null; }));
    },
  };
  Momento.sessionReady?.then((user) => { if (user && !Momento.myGroups.cached()) Momento.myGroups.refresh().catch(() => {}); }, () => {});
})();
