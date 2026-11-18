// Events: when and where an album's event is, and adding photos at it. Shared by every page.
// - Momento.event.mount(form)   adds start/end times, "uploads open before", the venue (Google Maps)
//                               and the 1 km / 2 km zone to the Create album form
// - Momento.event.read(form)    { error, focus } or { fields } to send with the new album
//                               mount() also adds an optional cover photo; it's uploaded once the album exists
//                               (PUT /api/albums/:id/cover, see COVER-API-NOTES.md)
// - Momento.event.prepareCover(file)  resolves to a resized cover image (Blob), or rejects with a plain message
// - Momento.event.camera()      Momento's own camera; resolves to the photos taken (File[]). They
//                               go straight to the upload and are never saved to the device
// - Momento.event.confirmUpload(album, files)  asks before uploading (and, for guests of an album
//                               with a zone, gets their location); resolves to { location } or null
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
  const fmtTime = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const fmtWhen = (d) => d.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
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
    .ev-sec { display: grid; gap: .45rem; }
    .ev-label { font-size: .82rem; font-weight: 650; color: var(--slate, #5c596b); }
    .ev-hint { margin: 0; font-size: .82rem; line-height: 1.5; color: var(--slate, #5c596b); }
    .ev-lead { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; font-size: .9rem; }
    .ev-lead select { min-height: 2.6rem; padding: 0 .6rem; font: inherit; }   /* the well itself comes from assets/glass.css (GlassInput) */
    .ev-range-head { display: flex; align-items: baseline; justify-content: space-between; gap: .5rem; }
    .ev-range-val { font-size: 1.05rem; font-weight: 750; letter-spacing: -.02em; color: var(--dusk, #2e2c3a); font-variant-numeric: tabular-nums; }
    .ev-range { --fill: 0%; width: 100%; height: 2rem; margin: 0; background: none; cursor: pointer; -webkit-appearance: none; appearance: none; }
    .ev-range::-webkit-slider-runnable-track { height: .45rem; border-radius: 100px; background: linear-gradient(to right, var(--tide, #6f9896) var(--fill), rgba(127, 120, 150, .22) var(--fill)); }
    .ev-range::-moz-range-track { height: .45rem; border-radius: 100px; background: rgba(127, 120, 150, .22); }
    .ev-range::-moz-range-progress { height: .45rem; border-radius: 100px; background: var(--tide, #6f9896); }
    .ev-range::-webkit-slider-thumb { -webkit-appearance: none; width: 1.5rem; height: 1.5rem; margin-top: -.53rem; border: 3px solid var(--surface, #fff); border-radius: 50%; background: var(--dusk, #2e2c3a); box-shadow: 0 2px 8px -2px rgba(46, 44, 58, .5); transition: transform .25s var(--spring, cubic-bezier(.34, 1.4, .64, 1)); }
    .ev-range::-moz-range-thumb { width: 1.2rem; height: 1.2rem; border: 3px solid var(--surface, #fff); border-radius: 50%; background: var(--dusk, #2e2c3a); box-shadow: 0 2px 8px -2px rgba(46, 44, 58, .5); }
    .ev-range:hover::-webkit-slider-thumb { transform: scale(1.1); }
    .ev-range:active::-webkit-slider-thumb { transform: scale(.95); }
    .ev-range:focus-visible { outline: 2px solid var(--dusk, #2e2c3a); outline-offset: 4px; border-radius: 8px; }
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

    /* Venue suggestions: a list that opens under the search box as you type */
    /* (Scoped to the dialog: the Social page has its own search list with the same class.) The pane is the
       GlassPopover in assets/glass.css */
    dialog .ev-suggest { display: grid; gap: 2px; margin: 0; padding: .35rem; list-style: none; }
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
    .m-share { border: 0; padding: 0; margin: 0 0 1rem; min-width: 0; }
    .m-share[hidden] { display: none; }
    .m-share legend { padding: 0; margin-bottom: .5rem; }
    .m-share .ev-who { grid-template-columns: 1fr; }
    .ev-sec[hidden] { display: none; }
    details.ev-more > summary, details.ev-more > summary small { white-space: nowrap; }
    @media (max-width: 480px) { details.ev-more > summary small { display: none; } }
    @media (prefers-reduced-motion: reduce) { details.ev-more > summary svg, .ev-range::-webkit-slider-thumb { transition: none; } .ev-range:is(:hover, :active)::-webkit-slider-thumb { transform: none; } }

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

    /* Momento's camera */
    .ev-cam { background: #0b0a10; color: #fff; }
    .ev-cam video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .ev-cam.is-front video { transform: scaleX(-1); }
    .ev-cam-top { position: absolute; top: max(1rem, env(safe-area-inset-top)); left: 16px; right: 4.5rem; z-index: 2; }
    .ev-cam-top h2 { margin: .35rem 0 0; font-size: 1.25rem; font-weight: 750; letter-spacing: -.03em; }
    .ev-cam-top p { margin: .25rem 0 0; color: rgba(255, 255, 255, .78); font-size: .88rem; line-height: 1.45; }
    .ev-cam-top p.is-error { color: #ffb4a8; }
    .ev-cam-bar { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 1rem; padding: 1.2rem 16px max(1.4rem, env(safe-area-inset-bottom)); background: linear-gradient(to top, rgba(8, 7, 12, .85), rgba(8, 7, 12, 0)); }
    .ev-shutter { width: 4.6rem; height: 4.6rem; border: 4px solid #fff; border-radius: 50%; background: rgba(255, 255, 255, .25); cursor: pointer; transition: transform .25s var(--spring, cubic-bezier(.34, 1.4, .64, 1)); }
    .ev-shutter:hover { background: rgba(255, 255, 255, .4); }
    .ev-shutter:active { transform: scale(.88); }
    .ev-shutter:focus-visible { outline: 3px solid #9fd2cd; outline-offset: 4px; }
    .ev-shutter[disabled] { opacity: .4; cursor: default; }
    .ev-shots { display: flex; align-items: center; gap: .35rem; min-width: 0; overflow: hidden; }
    .ev-shots img { width: 2.6rem; height: 2.6rem; flex: none; border-radius: 10px; object-fit: cover; box-shadow: 0 0 0 2px rgba(255, 255, 255, .7); animation: ev-pop .35s var(--spring, cubic-bezier(.34, 1.4, .64, 1)); }
    @keyframes ev-pop { from { transform: scale(.4); opacity: 0; } }
    .ev-cam-right { display: flex; justify-content: flex-end; gap: .5rem; flex-wrap: wrap; }
    /* The camera's buttons are HUD glass, the main one a white disc (assets/glass.css) */
    .ev-flash { position: absolute; inset: 0; z-index: 1; background: #fff; opacity: 0; pointer-events: none; }
    .ev-flash.is-on { animation: ev-flash .35s ease-out; }
    @keyframes ev-flash { from { opacity: .85; } to { opacity: 0; } }

    /* Asking before an upload */
    .ev-ask { position: fixed; inset: 0; margin: auto; width: min(26rem, calc(100vw - 32px)); height: fit-content; max-height: calc(100dvh - 32px); box-sizing: border-box; padding: 1.4rem; border-radius: var(--r-card, 28px); overflow: auto;
      color: var(--dusk, #2e2c3a); font-family: var(--font-main, -apple-system, BlinkMacSystemFont, 'Inter', sans-serif); }
    /* The pane is the GlassSheet in assets/glass.css (strong fill, the one blur, the shared dim) */
    .ev-ask[open] { animation: ev-in .4s var(--spring, cubic-bezier(.34, 1.4, .64, 1)); }
    @keyframes ev-in { from { opacity: 0; transform: translateY(14px) scale(.97); } }
    .ev-ask h2 { margin: 0; font-size: 1.4rem; letter-spacing: -.03em; line-height: 1.2; }
    .ev-ask p { margin: .5rem 0 0; color: var(--slate, #5c596b); line-height: 1.55; font-size: .93rem; }
    .ev-ask .ev-thumbs { display: flex; gap: .4rem; margin: 1rem 0 .2rem; overflow: hidden; }
    .ev-ask .ev-thumbs img { width: 3.6rem; height: 3.6rem; flex: none; border-radius: 12px; object-fit: cover; }
    .ev-ask .ev-thumbs span { display: grid; place-items: center; width: 3.6rem; height: 3.6rem; flex: none; border-radius: 12px; background: rgba(127, 120, 150, .14); font-weight: 700; }
    .ev-ask .ev-loc { display: flex; gap: .55rem; margin-top: .9rem; padding: .75rem .85rem; border-radius: 16px; background: rgba(111, 152, 150, .14); color: var(--dusk, #2e2c3a); font-size: .88rem; line-height: 1.5; }
    .ev-ask .ev-loc svg { flex: none; margin-top: .15rem; }
    .ev-ask .ev-err { color: #a33a2c; font-weight: 600; }
    .ev-ask .mq-row { justify-content: flex-end; margin-top: 1.2rem; }
    :root[data-theme="dark"] .ev-ask .ev-err { color: #ffb4a8; }
    @media (prefers-reduced-motion: reduce) { .ev-ask[open], .ev-shots img, .ev-flash.is-on { animation: none; } }`;
  document.head.append(css);

  // ---- Where the device is (asks the browser, which asks the person the first time) ----
  function locate() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('This browser can’t share your location.'));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: p.timestamp }),
        (err) => reject(new Error(err.code === 1
          ? 'Location access is off for Momento. Allow it in your browser’s site settings, then try again.'
          : err.code === 3 ? 'Finding your location took too long. Try again, ideally near a window or outside.'
          : 'Your location couldn’t be found. Try again.')),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
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
  const LEADS_H = Array.from({ length: 25 }, (_, h) => h);
  const LEADS_M = [0, 15, 30, 45];
  function mount(form, { fromGroup = false } = {}) {
    const view = form.querySelector('[data-view="form"]') || form;
    let box = view.querySelector('.ev');
    const placeField = form.place?.closest('label');
    if (placeField) placeField.hidden = true;   // the venue below sets the place
    if (!box) {
      box = document.createElement('div');
      box.className = 'ev';
      box.innerHTML = `
        <div class="m-row2">
          <label class="acct-field"><span>Starts</span><input name="evStart" type="time" required></label>
          <label class="acct-field"><span>Ends</span><input name="evEnd" type="time" required></label>
        </div>
        <div class="ev-sec">
          <span class="ev-label" id="evVenueLabel">Venue</span>
          <div class="ev-venue-search"></div>
          <div class="ev-map" hidden></div>
          <p class="ev-picked is-empty" data-picked>${ICON.pin}<span>No venue chosen yet</span></p>
          <div class="ev-venue-acts">
            <a class="ev-link" data-gmaps href="https://www.google.com/maps" target="_blank" rel="noopener">${ICON.out}Search in Google Maps</a>
            <button class="ev-link" type="button" data-here>${ICON.locate}Use where I am</button>
          </div>
        </div>
        <div class="ev-sec">
          <span class="ev-label" id="evWhoLabel">Who can join?</span>
          <div class="ev-who" role="radiogroup" aria-labelledby="evWhoLabel">
            <label><input type="radio" name="evVisibility" value="invite" checked><b>Invite only</b><small>People with the QR code, link or code</small></label>
            <label><input type="radio" name="evVisibility" value="public"><b>Public</b><small>Shown on the Events map. Anyone inside the zone can join</small></label>
          </div>
        </div>
        <details class="ev-more">
          <summary>Additional settings<small data-more-sum></small>${svgIcon('<path d="m6 9 6 6 6-6"/>', 16)}</summary>
          <div class="ev-more-body">
            <div class="ev-sec">
              <span class="ev-label" id="evLeadLabel">Guests can add photos from</span>
              <div class="ev-lead" role="group" aria-labelledby="evLeadLabel">
                <select name="evLeadH" aria-label="Hours before the start">${LEADS_H.map((h) => `<option value="${h}">${h} h</option>`).join('')}</select>
                <select name="evLeadM" aria-label="Minutes before the start">${LEADS_M.map((m) => `<option value="${m}">${m} min</option>`).join('')}</select>
                <span>before it starts</span>
              </div>
              <p class="ev-hint" data-lead-hint></p>
            </div>
            <div class="ev-sec">
              <div class="ev-range-head"><label class="ev-label" for="evRadius">Guests can add photos within</label><output class="ev-range-val" for="evRadius" data-radius-out>1 km</output></div>
              <input class="ev-range" id="evRadius" name="evRadius" type="range" min="1" max="10" step="0.5" value="1" aria-valuetext="1 kilometre">
              <div class="ev-range-ends" aria-hidden="true"><span>1 km</span><span>10 km</span></div>
              <p class="ev-hint">of the venue. Momento checks a guest’s location when they join.</p>
            </div>
          </div>
        </details>`;
      view.querySelector('.acct-status')?.before(box);
      wire(form, box);
    }
    box._reset();
    box.querySelector('details.ev-more').hidden = fromGroup;
    mountCover(form, view);
  }

  // ---- The cover photo: chosen on the form, uploaded once the album has been made ----
  const COVER_MAX = 1600, COVER_BYTES = 25 * 1024 * 1024;
  // Resized here so a phone photo doesn't upload at full size; the server still checks and re-encodes it
  async function prepareCover(file) {
    if (!file || !/^image\//.test(file.type || '')) throw new Error('Choose a photo (a JPG, PNG, WebP or HEIC image).');
    if (file.size > COVER_BYTES) throw new Error('That photo is over 25 MB. Choose a smaller one.');
    const img = await new Promise((resolve, reject) => {
      const el = new Image(), u = URL.createObjectURL(file);
      el.onload = () => { URL.revokeObjectURL(u); resolve(el); };
      el.onerror = () => { URL.revokeObjectURL(u); reject(new Error('That file isn’t a photo Momento can read. Try a JPG or PNG.')); };
      el.src = u;
    });
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
  const COVER_HINT = 'Guests see it while the event is upcoming. Once it’s live, the most loved photo takes over.';
  function mountCover(form, view) {
    let wrap = view.querySelector('.ev-cover');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'ev-cover';
      wrap.innerHTML = `
        <span class="ev-label ev-cover-label" id="evCoverLabel">Cover photo <i>(optional)</i></span>
        <div class="ev-cover-box">
          <button class="ev-cover-pick" type="button" aria-describedby="evCoverHint" aria-label="Add a cover photo">
            <img class="ev-cover-img" alt="" hidden>
            <span class="ev-cover-shade" hidden></span>
            <span class="ev-cover-empty">${svgIcon('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>', 24)}<b>Add a cover photo</b><small>A poster, the venue, or the guest of honour</small></span>
          </button>
          <div class="ev-cover-acts" hidden><span>Cover photo</span><button class="ev-cover-btn" type="button" data-cover-change>Change</button><button class="ev-cover-btn is-quiet" type="button" data-cover-remove>Remove</button></div>
        </div>
        <input class="ev-cover-file" type="file" accept="image/*" tabindex="-1" aria-hidden="true">
        <p class="ev-hint" id="evCoverHint">${COVER_HINT}</p>`;
      const row = view.querySelector(':scope > .m-row2');   // under the date and place
      if (row) row.after(wrap); else view.querySelector('.acct-status')?.before(wrap);
      const box = wrap.querySelector('.ev-cover-box'), pick = wrap.querySelector('.ev-cover-pick'), file = wrap.querySelector('.ev-cover-file');
      const img = wrap.querySelector('.ev-cover-img'), shade = wrap.querySelector('.ev-cover-shade'), acts = wrap.querySelector('.ev-cover-acts'), hint = wrap.querySelector('.ev-hint');
      const show = (cover) => {
        if (form._cover?.url && form._cover !== cover) URL.revokeObjectURL(form._cover.url);
        form._cover = cover;
        box.classList.toggle('has-pic', !!cover);
        img.hidden = shade.hidden = acts.hidden = !cover;
        if (cover) img.src = cover.url; else img.removeAttribute('src');
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
          show({ blob, url: URL.createObjectURL(blob) });
          say();
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
    made.innerHTML = `<img src="${esc(cover.url)}" alt=""><span>Adding the cover…</span>`;
    // Right under "Album created" and its sentence, above the QR code and guest code
    const sub = done?.querySelector(':scope > .acct-sub');
    if (sub) sub.after(made); else done?.prepend(made);
    const label = made.querySelector('span');
    const fd = new FormData();
    fd.append('cover', cover.blob, cover.blob.type === 'image/webp' ? 'cover.webp' : 'cover.jpg');
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
    const leadHint = box.querySelector('[data-lead-hint]');

    const showPicked = () => {
      picked.classList.toggle('is-empty', !state.venue);
      picked.lastChild.textContent = state.venue ? [state.venue.name, state.venue.address].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ') : 'No venue chosen yet';
    };
    const drawZone = () => {
      if (!state.map || !state.venue) return;
      const pos = { lat: state.venue.lat, lng: state.venue.lng };
      if (state.marker) state.marker.position = pos;
      if (state.circle) { state.circle.setCenter(pos); state.circle.setRadius(state.radiusM); state.map.fitBounds(state.circle.getBounds(), 8); }
    };
    const setVenue = (v) => {
      state.venue = v;
      if (form.place) form.place.value = (v?.name || v?.address || '').slice(0, 60);
      showPicked(); drawZone();
      state.onVenue?.(v);
    };

    // Uploads-open hint, e.g. "Uploads open at 6:30 pm, close at 11:00 pm"
    const moreSum = box.querySelector('[data-more-sum]');
    const syncSum = () => {
      const m = Number(form.evLeadH.value) * 60 + Number(form.evLeadM.value);
      const lead = m ? `${Math.floor(m / 60) ? `${Math.floor(m / 60)} h ` : ''}${m % 60 ? `${m % 60} min` : ''}`.trim() + ' early' : 'At the start';
      moreSum.textContent = `${lead}, ${Number(form.evRadius.value)} km`;
    };
    const syncLead = () => {
      syncSum();
      const t = times(form);
      leadHint.textContent = t ? `Uploads open ${fmtWhen(new Date(t.startsAt.getTime() - t.leadMin * 60000))} and close ${fmtTime(t.endsAt)}${t.endsAt.getDate() !== t.startsAt.getDate() ? ' the next day' : ''}.` : '';
    };
    ['evStart', 'evEnd', 'evLeadH', 'evLeadM', 'date'].forEach((n) => form[n]?.addEventListener('input', syncLead));
    ['evLeadH', 'evLeadM'].forEach((n) => form[n].addEventListener('change', syncLead));

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

    const who = box.querySelector('.ev-who')?.closest('.ev-sec');
    const syncWho = () => {
      const picked = form.querySelector('input[name="group"]:checked');
      const grouped = !!picked?.value;
      if (who) who.hidden = grouped;
      if (grouped) { const inv = form.querySelector('input[name="evVisibility"][value="invite"]'); if (inv) inv.checked = true; }
    };
    form.addEventListener('change', (e) => { if (e.target.name === 'group') syncWho(); });
    form.addEventListener('reset', () => setTimeout(syncWho));
    syncWho();
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
      } catch (err) { picked.classList.add('is-empty'); picked.lastChild.textContent = err.message; }
      finally { here.lastChild.textContent = label; }
    });

    // "Search in Google Maps" opens Google Maps on whatever venue has been typed or picked
    const gmaps = box.querySelector('[data-gmaps]');
    const syncGmaps = (typed) => {
      const q = (typed ?? '').trim() || (state.venue ? [state.venue.name, state.venue.address].filter(Boolean).join(', ') : '');
      gmaps.href = state.venue && !typed
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q || `${state.venue.lat},${state.venue.lng}`)}`
        : q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : 'https://www.google.com/maps';
    };
    state.onVenue = () => syncGmaps();

    // Without a Maps key: type the venue and pick it from the suggestions that open underneath
    const plain = (why) => {
      search.innerHTML = `
        <input type="text" maxlength="60" placeholder="Search for the venue, e.g. The Grand Hall" autocomplete="off" spellcheck="false"
          role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="evSuggest" aria-labelledby="evVenueLabel">
        <ul class="ev-suggest" id="evSuggest" role="listbox" aria-label="Places" hidden></ul>`;
      const input = search.querySelector('input'), list = search.querySelector('ul');
      let results = [], active = -1, timer = 0, ctrl = null, near = null;
      // Places near the host come first, if they have already allowed location (no new prompt)
      navigator.permissions?.query({ name: 'geolocation' }).then((p) => { if (p.state === 'granted') locate().then((l) => { near = l; }, () => {}); }, () => {});
      const open = (v) => { list.hidden = !v; input.setAttribute('aria-expanded', v); if (!v) { active = -1; input.removeAttribute('aria-activedescendant'); } };
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
      input.addEventListener('blur', () => setTimeout(() => open(false), 120));
      input.addEventListener('focus', () => { if (results.length && !state.venue) paint(); });
      mapEl.hidden = true;
      if (why) box.querySelector('.ev-venue-acts').insertAdjacentHTML('afterend', `<p class="ev-hint">${esc(why)}</p>`);
    };

    box._reset = () => {
      form.evStart.value = '19:00'; form.evEnd.value = '23:00';
      form.evLeadH.value = '0'; form.evLeadM.value = '30';
      form.evRadius.value = '1';
      const inv = form.querySelector('input[name="evVisibility"][value="invite"]'); if (inv) inv.checked = true;
      box._syncRadius();
      setVenue(null);
      const input = search.querySelector('input'); if (input) input.value = '';
      const list = search.querySelector('.ev-suggest'); if (list) list.hidden = true;
      box.querySelector('.ev-more').open = false;
      syncGmaps('');
      syncLead();
    };

    // Google Maps: search for the venue, then fine-tune by dragging the pin or tapping the map
    getConfig().then(async ({ mapsApiKey }) => {
      // No Maps key: the venue comes from the suggestions list (see plain)
      if (!mapsApiKey) return plain('');
      try {
        await loadMaps(mapsApiKey);
        const [{ Map, Circle }, { PlaceAutocompleteElement }, { AdvancedMarkerElement }] = await Promise.all(
          ['maps', 'places', 'marker'].map((l) => google.maps.importLibrary(l)));
        const ac = new PlaceAutocompleteElement({});
        ac.setAttribute('placeholder', 'Search for the venue');
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
        document.addEventListener('momento:maps-failed', () => { search.innerHTML = ''; plain('Google Maps couldn’t be used (check the API key). Type the venue’s name and use “Use where I am” instead.'); }, { once: true });
      } catch (err) {
        search.innerHTML = '';
        plain('Google Maps couldn’t load, so type the venue’s name and use “Use where I am” instead.');
      }
    });
  }

  // The event's times from the form, or null
  function times(form) {
    const date = form.date?.value, s = form.evStart?.value, e = form.evEnd?.value;
    if (!date || !s || !e) return null;
    const startsAt = new Date(`${date}T${s}`);
    let endsAt = new Date(`${date}T${e}`);
    if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 86400000);   // runs past midnight
    const leadMin = Number(form.evLeadH?.value || 0) * 60 + Number(form.evLeadM?.value || 0);
    return { startsAt, endsAt, leadMin };
  }

  function read(form) {
    const box = form.querySelector('.ev');
    if (!box) return { fields: {} };
    const st = box._state, t = times(form);
    if (!form.evStart.value) return { error: 'Pick the time the event starts.', focus: form.evStart };
    if (!form.evEnd.value) return { error: 'Pick the time the event ends.', focus: form.evEnd };
    if (!t) return { error: 'Pick the date of the event.', focus: form.date };
    if (t.endsAt < new Date()) return { error: 'That event has already finished. Check the date and times.', focus: form.evEnd };
    if (t.leadMin > 1440) { form.evLeadH.closest('details')?.setAttribute('open', ''); return { error: 'Uploads can open up to 24 hours before the event.', focus: form.evLeadH }; }
    if (!st.venue) return { error: 'Choose the venue: start typing its name and pick it from the list, or use where you are.', focus: box.querySelector('gmp-place-autocomplete, .ev-venue-search input, [data-here]') };
    const name = (box.querySelector('.ev-venue-search input')?.value || st.venue.name || '').trim();
    return {
      fields: {
        place: name.slice(0, 60),
        startsAt: t.startsAt.toISOString(),
        endsAt: t.endsAt.toISOString(),
        uploadLeadMin: t.leadMin,
        eventUploadWindow: !box.querySelector('details.ev-more').hidden,
        zone: { lat: st.venue.lat, lng: st.venue.lng, radiusM: st.radiusM },
        venue: { address: st.venue.address || '', placeId: st.venue.placeId || '' },
        visibility: !form.group?.value && form.evVisibility?.value === 'public' ? 'public' : 'invite',
      },
    };
  }

  // ---- Momento's camera: photos go into the upload, never into the device's gallery ----
  function camera() {
    return new Promise((resolve) => {
      const d = document.createElement('dialog');
      d.className = 'mq-dlg ev-cam';
      d.innerHTML = `
        <video playsinline muted autoplay></video>
        <span class="ev-flash" aria-hidden="true"></span>
        <div class="ev-cam-top"><h2>Take a photo</h2><p role="status" aria-live="polite">Starting the camera…</p></div>
        <button class="mq-x" type="button" aria-label="Close the camera" data-close>${ICON.close}</button>
        <div class="ev-cam-bar">
          <div class="ev-shots" aria-live="polite"></div>
          <button class="ev-shutter" type="button" aria-label="Take photo" disabled></button>
          <div class="ev-cam-right">
            <button class="mq-btn" type="button" data-flip hidden aria-label="Switch camera">${ICON.flip}</button>
            <button class="mq-btn is-main" type="button" data-use hidden>Use photos</button>
          </div>
        </div>`;
      document.body.append(d);
      const video = d.querySelector('video'), status = d.querySelector('.ev-cam-top p'), shutter = d.querySelector('.ev-shutter');
      const shotsEl = d.querySelector('.ev-shots'), use = d.querySelector('[data-use]'), flip = d.querySelector('[data-flip]');
      const shots = [], urls = [];
      let stream = null, facing = 'environment', settled = false;
      const say = (m, bad) => { status.textContent = m; status.classList.toggle('is-error', !!bad); };
      const stop = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; video.srcObject = null; };
      const finish = (files) => {
        if (settled) return; settled = true;
        stop(); urls.forEach(URL.revokeObjectURL);
        if (d.open) d.close();
        d.remove();
        resolve(files);
      };
      async function start() {
        stop(); shutter.disabled = true;
        say('Starting the camera…');
        try {
          if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error(), { name: 'Insecure' });
          if (window.Momento?.permission && !(await Momento.permission.ensure('camera'))) throw Object.assign(new Error(), { name: 'NotAllowedError' });
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
          if (settled) return stop();
          video.srcObject = stream;
          await video.play().catch(() => {});
          const s = stream.getVideoTracks()[0]?.getSettings?.() || {};
          d.classList.toggle('is-front', (s.facingMode || facing) === 'user');
          shutter.disabled = false;
          say(shots.length ? `${shots.length} taken. Take more, or use them.` : 'Photos taken here go straight to the album, not to your gallery.');
          const cams = (await navigator.mediaDevices.enumerateDevices()).filter((x) => x.kind === 'videoinput');
          flip.hidden = cams.length < 2;
        } catch (err) {
          say(err.name === 'NotAllowedError' ? 'Camera access is off for Momento. Allow it in your browser’s site settings, then reopen the camera.'
            : err.name === 'NotFoundError' ? 'No camera was found on this device.'
            : err.name === 'Insecure' ? 'The camera only works when Momento is opened over https.'
            : 'The camera didn’t start. Close other apps using it and try again.', true);
        }
      }
      shutter.addEventListener('click', () => {
        const w = video.videoWidth, h = video.videoHeight;
        if (!w || !h || shots.length >= 30) return;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(video, 0, 0, w, h);
        d.querySelector('.ev-flash').classList.remove('is-on'); void d.offsetWidth; d.querySelector('.ev-flash').classList.add('is-on');
        navigator.vibrate?.(20);
        c.toBlob((blob) => {
          if (!blob) return;
          const file = new File([blob], `momento-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
          shots.push(file);
          const url = URL.createObjectURL(blob); urls.push(url);
          const img = new Image(); img.src = url; img.alt = '';
          shotsEl.append(img);
          while (shotsEl.children.length > 4) shotsEl.firstChild.remove();
          use.hidden = false;
          use.textContent = shots.length === 1 ? 'Use photo' : `Use ${shots.length} photos`;
          say(`${shots.length} taken. Take more, or use ${shots.length === 1 ? 'it' : 'them'}.`);
        }, 'image/jpeg', .92);
      });
      flip.addEventListener('click', () => { facing = facing === 'environment' ? 'user' : 'environment'; start(); });
      use.addEventListener('click', () => finish(shots.slice()));
      d.querySelector('[data-close]').addEventListener('click', () => finish([]));
      d.addEventListener('cancel', (e) => { e.preventDefault(); finish([]); });
      d.showModal();
      start();
    });
  }

  // ---- Asking before an upload (and the guest's location, when the album has a zone) ----
  function confirmUpload(album, files) {
    return new Promise((resolve) => {
      const n = files.length, what = n === 1 ? 'this photo' : `these ${n} photos`;
      const d = document.createElement('dialog');
      d.className = 'ev-ask';
      d.setAttribute('aria-labelledby', 'evAskTitle');
      const urls = files.slice(0, 5).map((f) => URL.createObjectURL(f));
      d.innerHTML = `
        <h2 id="evAskTitle">Upload ${n === 1 ? '1 photo' : `${n} photos`}?</h2>
        <p>Momento would like to add ${what} to <b>${esc(album?.name || 'the album')}</b>. Everyone in the album will be able to see and download ${n === 1 ? 'it' : 'them'}.</p>
        <div class="ev-thumbs">${urls.map((u) => `<img src="${u}" alt="">`).join('')}${n > 5 ? `<span>+${n - 5}</span>` : ''}</div>
        <div class="mq-row"><button class="mq-btn is-light" type="button" data-no>Cancel</button><button class="mq-btn" type="button" data-yes autofocus>Upload</button></div>`;
      document.body.append(d);
      const yes = d.querySelector('[data-yes]');
      let settled = false;
      const done = (v) => { if (settled) return; settled = true; urls.forEach(URL.revokeObjectURL); if (d.open) d.close(); d.remove(); resolve(v); };
      d.querySelector('[data-no]').addEventListener('click', () => done(null));
      d.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
      yes.addEventListener('click', () => done({ location: '' }));
      d.showModal();
    });
  }

  // When an album with event times opens for photos, in words: "Photos can be added from Sat 8 Nov, 6:30 pm"
  function windowText(a) {
    if (a?.anytimeUploads) return '';
    if (!a?.startsAt || !a?.endsAt) return '';
    const s = new Date(a.startsAt), e = new Date(a.endsAt), opens = new Date(a.opensAt || s);
    const when = `${fmtWhen(s)} to ${fmtTime(e)}`;
    if (a.status === 'upcoming') return `Event ${when}. Photos can be added from ${fmtWhen(opens)}.`;
    if (a.status === 'live') return `Event ${when}. Photos can be added until ${fmtTime(e)}.`;
    return `Event ${when}. This album has closed to new photos.`;
  }

  Momento.event = { mount, read, camera, confirmUpload, locate, windowText, distanceM, prepareCover };
})();
