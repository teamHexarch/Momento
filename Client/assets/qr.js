// Album QR codes: showing one (hosts) and scanning one (guests). Shared by every page.
// - Momento.qr.show(album, from)  a glass slab with the QR for { name, code }, grown out of `from`; the screen stays awake
// - Momento.qr.scan()       camera scanner; a Momento QR (or a bare code) joins that album
// - Momento.qr.mount(el, album)  a small QR tile inside el (the "Album created" screen uses it)
// The QR holds the album's invite link (events.html?join=CODE), so a phone's own camera app works too.
// Libraries are loaded only when needed: qrcode-generator to draw, jsQR to read where the browser
// has no built-in BarcodeDetector (Firefox, Safari, desktop Chrome on some systems).
(() => {
  const Momento = (window.Momento = window.Momento || {});
  const BASE = new URL('.', document.currentScript?.src || location.href).href;
  const loaded = {};
  const load = (file, global) => loaded[file] ||= new Promise((resolve, reject) => {
    if (window[global]) return resolve(window[global]);
    const s = document.createElement('script');
    s.src = BASE + 'vendor/' + file;
    s.onload = () => (window[global] ? resolve(window[global]) : reject(new Error(file + ' did not load')));
    s.onerror = () => { delete loaded[file]; reject(new Error('Could not load ' + file)); };
    document.head.append(s);
  });

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const linkFor = (code) => (Momento.inviteLink ? Momento.inviteLink(code) : new URL('events.html?join=' + encodeURIComponent(code), location.href).href);
  const toast = (t, b) => (Momento.toast ? Momento.toast(t, b) : null);
  const isPhone = () => (navigator.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) && matchMedia('(pointer: coarse)').matches;
  const svgIcon = (inner, size = 20) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const ICON = {
    close: svgIcon('<path d="M6 6l12 12M18 6L6 18"/>'),
    expand: svgIcon('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', 16),
    scan: svgIcon('<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"/>', 18),
    flip: svgIcon('<path d="M4 7h11a5 5 0 0 1 0 10H9M7 4 4 7l3 3M17 20l3-3-3-3"/>', 18),
    photo: svgIcon('<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-8 8"/>', 18),
    keys: svgIcon('<rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>', 18),
    camera: svgIcon('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.5"/>', 22),
    copy: svgIcon('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>', 16),
  };

  // ---- Styles (scoped to .mq-*) ----
  const css = document.createElement('style');
  css.textContent = `
    .mq-dlg { position: fixed; inset: 0; width: 100vw; height: 100dvh; max-width: none; max-height: none; margin: 0; padding: 0; border: none; overflow: hidden; font-family: var(--font-main, -apple-system, BlinkMacSystemFont, 'Inter', sans-serif); }
    .mq-dlg::backdrop { background: rgba(10, 9, 14, .6); }
    .mq-dlg[open] { animation: mq-in .4s var(--out, cubic-bezier(.16, 1, .3, 1)); }
    @keyframes mq-in { from { opacity: 0; transform: scale(.97); } }
    .mq-btn { display: inline-flex; align-items: center; justify-content: center; gap: .5rem; min-height: 2.9rem; padding: 0 1.25rem; border: none; border-radius: 100px; font-family: inherit; font-size: .92rem; font-weight: 650; line-height: 1; cursor: pointer; text-decoration: none; transition: transform .35s var(--spring, cubic-bezier(.34, 1.4, .64, 1)), opacity .2s ease, background-color .2s ease; }
    .mq-btn:hover { transform: translateY(-1px); }
    .mq-btn:active { transform: scale(.96); }
    .mq-btn:focus-visible, .mq-x:focus-visible, .mq-tile:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
    .mq-btn[disabled] { opacity: .5; cursor: default; transform: none; }
    .mq-x { position: absolute; top: max(1rem, env(safe-area-inset-top)); right: 1rem; z-index: 3; display: grid; place-items: center; width: 2.75rem; height: 2.75rem; border: none; border-radius: 50%; cursor: pointer; transition: transform .35s var(--spring, cubic-bezier(.34, 1.4, .64, 1)), background-color .2s ease; }
    .mq-x:hover { transform: rotate(90deg); }
    .mq-x:active { transform: scale(.9); }

    /* Showing a code: a small slab of the site's popup glass that grows out of the button pressed.
       The QR itself sits on a pure white tile, so it scans in dark mode too. */
    .mq-pop .mq-slab { width: min(340px, calc(100vw - 32px)); padding: 1.6rem 1.4rem 1.3rem; text-align: center; display: grid; justify-items: center; gap: .55rem; }
    .mq-slab .acct-x { top: .8rem; right: .8rem; }
    .mq-slab-kick { margin: 0; font-size: .74rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--slate, #5c596b); }
    .mq-slab-name { margin: 0 2rem; font-size: 1.35rem; font-weight: 700; letter-spacing: -.03em; line-height: 1.15; color: var(--dusk, #2e2c3a); }
    .mq-slab-qr { width: min(232px, 64vw); aspect-ratio: 1; margin: .4rem 0 .2rem; padding: .65rem; box-sizing: border-box; border-radius: 22px; background: #fff;
      box-shadow: 0 0 0 1px rgba(255, 255, 255, .75), 0 0 0 5px rgba(255, 255, 255, .18), 0 16px 34px -18px rgba(20, 18, 30, .55); }
    .mq-slab-qr svg, .mq-tile svg { display: block; width: 100%; height: 100%; }
    .mq-slab-qr .mq-slab-err { margin: 0; display: grid; place-items: center; height: 100%; color: #5c596b; font-size: .88rem; line-height: 1.5; }
    .mq-slab-code { margin: 0; font: 750 1.5rem/1 ui-monospace, 'SF Mono', Menlo, Consolas, monospace; letter-spacing: .12em; color: var(--dusk, #2e2c3a); }
    .mq-slab .acct-actions { width: 100%; margin-top: .5rem; }
    .mq-row { display: flex; flex-wrap: wrap; justify-content: center; gap: .6rem; }

    /* The small tile on the "Album created" screen */
    .mq-mount { display: grid; justify-items: center; gap: .55rem; margin: .2rem 0 1rem; }
    .mq-tile { box-sizing: border-box; width: 11.5rem; aspect-ratio: 1; padding: .6rem; border: none; border-radius: 22px; background: #fff; cursor: zoom-in;
      box-shadow: 0 0 0 1px rgba(46, 44, 58, .08), 0 14px 30px -18px rgba(46, 44, 58, .45), 0 3px 8px -4px rgba(46, 44, 58, .2);
      transition: transform .45s var(--spring, cubic-bezier(.34, 1.4, .64, 1)), box-shadow .3s ease; }
    .mq-tile:hover { transform: translateY(-2px) scale(1.02); }
    .mq-tile:active { transform: scale(.97); }
    .mq-tile-btn { display: inline-flex; align-items: center; gap: .4rem; padding: .35rem .7rem; border: none; border-radius: 100px; background: none; color: var(--slate, #5c596b); font-family: inherit; font-size: .85rem; font-weight: 600; cursor: pointer; transition: background-color .2s ease, color .2s ease; }
    .mq-tile-btn:hover { background: rgba(127, 120, 150, .12); color: var(--dusk, #2e2c3a); }
    .mq-tile-btn:active { background: rgba(127, 120, 150, .2); }
    .mq-tile-btn:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }

    /* Scanning */
    .mq-scan { background: #0b0a10; color: #fff; }
    .mq-scan .mq-x { background: rgba(255, 255, 255, .14); color: #fff; backdrop-filter: blur(10px); }
    .mq-scan .mq-x:hover { background: rgba(255, 255, 255, .24); }
    .mq-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .mq-shade { position: absolute; inset: 0; pointer-events: none; display: grid; place-items: center; }
    .mq-win { position: relative; width: min(72vw, 46dvh, 340px); aspect-ratio: 1; border-radius: 28px; box-shadow: 0 0 0 200vmax rgba(8, 7, 12, .58); transition: transform .5s var(--spring, cubic-bezier(.34, 1.4, .64, 1)); }
    .mq-win i { position: absolute; width: 18%; aspect-ratio: 1; border: 4px solid #fff; }
    .mq-win i:nth-child(1) { top: 0; left: 0; border-right: 0; border-bottom: 0; border-radius: 28px 0 0 0; }
    .mq-win i:nth-child(2) { top: 0; right: 0; border-left: 0; border-bottom: 0; border-radius: 0 28px 0 0; }
    .mq-win i:nth-child(3) { bottom: 0; left: 0; border-right: 0; border-top: 0; border-radius: 0 0 0 28px; }
    .mq-win i:nth-child(4) { bottom: 0; right: 0; border-left: 0; border-top: 0; border-radius: 0 0 28px 0; }
    .mq-beam { position: absolute; left: 8%; right: 8%; top: 8%; height: 2px; border-radius: 2px; background: #9fd2cd; box-shadow: 0 0 16px 4px rgba(143, 210, 204, .55); animation: mq-beam 2.2s ease-in-out infinite alternate; }
    @keyframes mq-beam { to { transform: translateY(calc(min(72vw, 46dvh, 340px) * .84)); } }
    .mq-scan.is-found .mq-win { transform: scale(.94); }
    .mq-scan.is-found .mq-win i { border-color: #9fd2cd; }
    .mq-scan.is-found .mq-beam, .mq-scan.is-off .mq-beam { opacity: 0; }
    .mq-scan.is-off .mq-shade { opacity: 0; }
    .mq-top { position: absolute; top: max(1rem, env(safe-area-inset-top)); left: 16px; right: 4.5rem; z-index: 2; }
    .mq-top h2 { margin: .35rem 0 0; font-size: 1.35rem; font-weight: 750; letter-spacing: -.03em; }
    .mq-status { margin: .3rem 0 0; color: rgba(255, 255, 255, .78); font-size: .92rem; line-height: 1.5; min-height: 1.4em; }
    .mq-status.is-error { color: #ffb4a8; }
    .mq-bar { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; display: flex; flex-wrap: wrap; justify-content: center; gap: .6rem; padding: 1.4rem 16px max(1.4rem, env(safe-area-inset-bottom)); background: linear-gradient(to top, rgba(8, 7, 12, .8), rgba(8, 7, 12, 0)); }
    .mq-scan .mq-btn { background: rgba(255, 255, 255, .16); color: #fff; backdrop-filter: blur(12px); }
    .mq-scan .mq-btn:hover { background: rgba(255, 255, 255, .26); }
    .mq-scan .mq-btn.is-main { background: #fff; color: #17161d; }
    .mq-off { position: absolute; inset: 0; z-index: 1; display: grid; place-content: center; justify-items: center; gap: .9rem; padding: 0 16px; text-align: center; }
    .mq-off[hidden] { display: none; }
    .mq-off .mq-ic { display: grid; place-items: center; width: 4rem; height: 4rem; border-radius: 50%; background: rgba(255, 255, 255, .12); }
    .mq-off p { margin: 0; max-width: 24rem; color: rgba(255, 255, 255, .78); line-height: 1.6; }

    /* Asking a phone for its camera, once */
    .mq-ask { position: fixed; left: 16px; right: 16px; bottom: max(16px, env(safe-area-inset-bottom)); z-index: 60; box-sizing: border-box; max-width: 26rem; margin: 0 auto; padding: 1.1rem 1.1rem 1rem; border-radius: 24px;
      background: var(--surface, #fff); color: var(--dusk, #2e2c3a); font-family: var(--font-main, -apple-system, BlinkMacSystemFont, 'Inter', sans-serif);
      box-shadow: 0 0 0 1px rgba(46, 44, 58, .08), 0 24px 48px -24px rgba(46, 44, 58, .5), 0 6px 14px -8px rgba(46, 44, 58, .25);
      animation: mq-up .55s var(--spring, cubic-bezier(.34, 1.4, .64, 1)); }
    @keyframes mq-up { from { opacity: 0; transform: translateY(24px); } }
    .mq-ask.is-going { opacity: 0; transform: translateY(24px); transition: opacity .25s ease, transform .3s ease; }
    .mq-ask-head { display: flex; gap: .8rem; align-items: center; }
    .mq-ask-head .mq-ic { flex: none; display: grid; place-items: center; width: 2.6rem; height: 2.6rem; border-radius: 50%; background: var(--dusk, #2e2c3a); color: var(--paper, #fff); }
    .mq-ask b { display: block; font-size: 1rem; letter-spacing: -.01em; }
    .mq-ask p { margin: .15rem 0 0; color: var(--slate, #5c596b); font-size: .86rem; line-height: 1.5; }
    .mq-ask .mq-row { justify-content: flex-end; margin-top: .9rem; }
    .mq-ask .mq-btn { min-height: 2.6rem; background: var(--dusk, #2e2c3a); color: var(--paper, #fff); }
    .mq-ask .mq-btn.is-light { background: rgba(127, 120, 150, .14); color: var(--dusk, #2e2c3a); }

    @media (prefers-reduced-motion: reduce) {
      .mq-dlg[open], .mq-ask { animation: none; }
      .mq-beam { animation: none; top: 50%; }
    }`;
  document.head.append(css);

  // ---- Drawing a QR code as SVG ----
  async function qrSvg(text, label) {
    const qrcode = await load('qrcode.js', 'qrcode');
    const q = qrcode(0, 'M');
    q.addData(text, 'Byte');
    q.make();
    const n = q.getModuleCount(), pad = 4;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + pad} ${r + pad}h1v1h-1z`;
    return `<svg viewBox="0 0 ${n + 2 * pad} ${n + 2 * pad}" shape-rendering="crispEdges" role="img" aria-label="${esc(label)}"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#17161d"/></svg>`;
  }

  // ---- Keeping the screen awake (and as bright as a page can make it) while a code is shown ----
  let wake = null;
  async function holdWake() {
    try { wake = await navigator.wakeLock?.request('screen'); } catch (e) { wake = null; }
  }
  const dropWake = () => { try { wake?.release(); } catch (e) {} wake = null; };

  function overlay(cls, html) {
    const d = document.createElement('dialog');
    d.className = 'mq-dlg ' + cls;
    d.innerHTML = html;
    document.body.append(d);
    d.addEventListener('close', () => d.remove());
    return d;
  }

  // ---- Showing an album's code ----
  // The shape of the button, as a transform of the card: used to grow the card out of it and back
  const shapeOf = (from, card) => {
    const f = from?.isConnected && from.getBoundingClientRect(), c = card.getBoundingClientRect();
    if (!f || !f.width || !c.width) return null;
    const dx = f.left + f.width / 2 - (c.left + c.width / 2), dy = f.top + f.height / 2 - (c.top + c.height / 2);
    return `translate(${dx}px, ${dy}px) scale(${Math.max(.08, f.width / c.width)}, ${Math.max(.05, f.height / c.height)})`;
  };
  const stillMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  async function show(album, from) {
    if (!album?.code) return;
    const url = linkFor(album.code);
    // Built from the site's popup glass (.acct-dialog / .acct-card), so it matches every other popup
    const d = document.createElement('dialog');
    d.className = 'acct-dialog mq-pop';
    d.setAttribute('aria-labelledby', 'mqPopName');
    d.innerHTML = `
      <div class="acct-card mq-slab">
        <button class="acct-x" type="button" aria-label="Close" data-close>${ICON.close}</button>
        <p class="mq-slab-kick">Scan to join</p>
        <h2 class="mq-slab-name" id="mqPopName">${esc(album.name || 'Momento album')}</h2>
        <div class="mq-slab-qr"></div>
        <p class="mq-slab-code">${esc(album.code)}</p>
        <div class="acct-actions">
          <button class="acct-ghost" type="button" data-copy>Copy link</button>
          <button class="acct-primary" type="button" data-close autofocus>Done</button>
        </div>
      </div>`;
    document.body.append(d);
    const card = d.querySelector('.mq-slab');
    const rewake = () => { if (document.visibilityState === 'visible' && d.open) holdWake(); };
    let closing = false;
    // Closing shrinks the slab back into the button it came from
    const dismiss = async () => {
      if (closing || !d.open) return;
      closing = true;
      const shape = shapeOf(from, card);
      if (!stillMotion()) {
        const out = shape ? [{ transform: 'none', opacity: 1 }, { transform: shape, opacity: 0 }] : [{ opacity: 1 }, { opacity: 0, transform: 'scale(.96)' }];
        try { await card.animate(out, { duration: shape ? 340 : 200, easing: 'cubic-bezier(.5, 0, .75, 0)', fill: 'forwards' }).finished; } catch (e) {}
      }
      d.close();
    };
    d.addEventListener('close', () => {
      dropWake();
      document.removeEventListener('visibilitychange', rewake);
      d.remove();
      from?.focus?.();
    });
    d.addEventListener('cancel', (e) => { e.preventDefault(); dismiss(); });
    d.addEventListener('pointerdown', (e) => { d._downOutside = e.target === d; });
    d.addEventListener('click', (e) => { if (e.target === d && d._downOutside) dismiss(); });
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', dismiss));
    d.querySelector('[data-copy]').addEventListener('click', async (e) => {
      const b = e.currentTarget;
      try { await navigator.clipboard.writeText(url); b.textContent = 'Link copied'; } catch (err) { b.textContent = 'Copy failed'; }
      setTimeout(() => { b.textContent = 'Copy link'; }, 1800);
    });
    document.addEventListener('visibilitychange', rewake);
    d.showModal();
    holdWake();
    // Opening: the slab grows out of the button, overshoots a touch and settles; its contents rise in after it
    if (!stillMotion()) {
      const shape = shapeOf(from, card);
      card.animate(shape
        ? [{ transform: shape, opacity: 0 }, { opacity: 1, offset: .2 }, { transform: 'none', opacity: 1 }]
        : [{ opacity: 0, transform: 'translateY(12px) scale(.96)' }, { opacity: 1, transform: 'none' }],
      { duration: shape ? 560 : 380, easing: 'cubic-bezier(.34, 1.25, .64, 1)' });
      [...card.children].filter((el) => !el.matches('.acct-x')).forEach((el, i) => el.animate(
        [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
        { duration: 420, delay: 160 + i * 40, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'backwards' }));
      try { d.animate({ opacity: [0, 1] }, { duration: 300, pseudoElement: '::backdrop' }); } catch (e) {}
    }
    try { card.querySelector('.mq-slab-qr').innerHTML = await qrSvg(url, `QR code to join ${album.name || 'the album'}`); }
    catch (err) { card.querySelector('.mq-slab-qr').innerHTML = `<p class="mq-slab-err">The QR code could not be drawn. Share the code ${esc(album.code)} instead.</p>`; }
  }

  // ---- A small tile, e.g. on the "Album created" screen ----
  async function mount(el, album) {
    if (!el || !album?.code) return;
    el.classList.add('mq-mount');
    el.innerHTML = `<button class="mq-tile" type="button" aria-label="Show the QR code"></button>
      <button class="mq-tile-btn" type="button">${ICON.expand}Show QR code</button>`;
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => show(album, b)));
    try { el.querySelector('.mq-tile').innerHTML = await qrSvg(linkFor(album.code), `QR code to join ${album.name || 'the album'}`); }
    catch (err) { el.hidden = true; }
  }

  // ---- Reading a code ----
  // A Momento invite link (any address with ?join=) or a bare 7-character code
  function codeFrom(text) {
    const t = String(text || '').trim();
    try {
      const u = new URL(t);
      const j = u.searchParams.get('join');
      if (j) return j.toUpperCase();
    } catch (e) {}
    const bare = t.toUpperCase().replace(/[\s-]/g, '');
    return /^[A-Z0-9]{7}$/.test(bare) ? bare.slice(0, 3) + '-' + bare.slice(3) : '';
  }

  let detector;
  async function reader() {
    if (detector !== undefined) return detector;
    try {
      if ('BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats()).includes('qr_code')) {
        const bd = new BarcodeDetector({ formats: ['qr_code'] });
        return (detector = async (src) => (await bd.detect(src))[0]?.rawValue || '');
      }
    } catch (e) {}
    const jsQR = await load('jsQR.js', 'jsQR');
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
    return (detector = async (src) => {
      const w = src.videoWidth || src.naturalWidth || src.width, h = src.videoHeight || src.naturalHeight || src.height;
      if (!w || !h) return '';
      const s = Math.min(1, 800 / Math.max(w, h));
      canvas.width = Math.round(w * s); canvas.height = Math.round(h * s);
      ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })?.data || '';
    });
  }

  const cameraError = (err) => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return 'This browser can’t use the camera here. Open Momento over https, or scan from a photo.';
    if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') return 'Camera access is off for Momento. Allow it in your browser’s site settings, then try again.';
    if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') return 'No camera was found on this device. You can scan from a photo or type the code.';
    if (err?.name === 'NotReadableError') return 'Another app is using the camera. Close it and try again.';
    return 'The camera didn’t start. ' + (err?.message || '');
  };

  function scan(from) {
    const d = overlay('mq-scan', `
      <video class="mq-video" playsinline muted autoplay></video>
      <div class="mq-shade" aria-hidden="true"><div class="mq-win"><i></i><i></i><i></i><i></i><span class="mq-beam"></span></div></div>
      <div class="mq-top"><h2>Scan a QR code</h2><p class="mq-status" role="status" aria-live="polite">Starting the camera…</p></div>
      <button class="mq-x" type="button" aria-label="Close the scanner" data-close>${ICON.close}</button>
      <div class="mq-off" hidden>
        <span class="mq-ic">${ICON.camera}</span>
        <p class="mq-off-msg"></p>
        <button class="mq-btn is-main" type="button" data-retry>${ICON.camera}Allow camera</button>
      </div>
      <div class="mq-bar">
        <button class="mq-btn" type="button" data-flip hidden>${ICON.flip}Switch camera</button>
        <button class="mq-btn" type="button" data-photo>${ICON.photo}Scan from a photo</button>
        <button class="mq-btn" type="button" data-type>${ICON.keys}Type the code</button>
        <input type="file" accept="image/*" hidden>
      </div>`);
    const video = d.querySelector('video'), status = d.querySelector('.mq-status');
    const off = d.querySelector('.mq-off'), flip = d.querySelector('[data-flip]'), file = d.querySelector('input[type="file"]');
    let stream = null, timer = 0, facing = 'environment', done = false, lastBad = '';
    const say = (msg, bad) => { status.textContent = msg; status.classList.toggle('is-error', !!bad); };
    const stop = () => { clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); stream = null; video.srcObject = null; };

    async function start() {
      stop();
      off.hidden = true; d.classList.remove('is-off');
      say('Starting the camera…');
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('insecure');
        if (window.Momento?.permission && !(await Momento.permission.ensure('camera'))) throw Object.assign(new Error('Camera not allowed'), { name: 'NotAllowedError' });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (done || !d.open) return stop();
        video.srcObject = stream;
        await video.play().catch(() => {});
        say('Point the camera at the album’s QR code.');
        const cams = (await navigator.mediaDevices.enumerateDevices()).filter((x) => x.kind === 'videoinput');
        flip.hidden = cams.length < 2;
        tick();
      } catch (err) {
        d.classList.add('is-off');
        off.hidden = false;
        d.querySelector('.mq-off-msg').textContent = cameraError(err);
        say('');
      }
    }
    async function tick() {
      if (done || !stream) return;
      try {
        if (video.readyState >= 2) {
          const text = await (await reader())(video);
          if (text) found(text);
        }
      } catch (e) {}
      if (!done && stream) timer = setTimeout(tick, 140);
    }
    function found(text) {
      const code = codeFrom(text);
      if (!code) {
        if (text !== lastBad) { lastBad = text; say('That QR code isn’t a Momento album. Try the host’s code.', true); }
        return;
      }
      done = true;
      d.classList.add('is-found');
      say(`Album found: ${code}. Joining…`);
      navigator.vibrate?.(40);
      stop();
      setTimeout(() => {
        d.close();
        if (Momento.joinFromQr) Momento.joinFromQr(code);
        else location.href = linkFor(code);
      }, 550);
    }

    d.addEventListener('close', () => { done = true; stop(); from?.focus?.(); });
    d.addEventListener('cancel', () => { done = true; stop(); });
    d.querySelector('[data-close]').addEventListener('click', () => d.close());
    d.querySelector('[data-retry]').addEventListener('click', start);
    flip.addEventListener('click', () => { facing = facing === 'environment' ? 'user' : 'environment'; start(); });
    d.querySelector('[data-type]').addEventListener('click', () => {
      d.close();
      if (Momento.openJoin) Momento.openJoin();
      else location.href = new URL('events.html#join', location.href).href;
    });
    d.querySelector('[data-photo]').addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      file.value = '';
      if (!f) return;
      say('Reading the photo…');
      const img = new Image(), src = URL.createObjectURL(f);
      try {
        img.src = src;
        await img.decode();
        const text = await (await reader())(img);
        if (text) found(text);
        else say('No QR code found in that photo. Try a sharper, closer one.', true);
      } catch (err) { say('That photo couldn’t be read.', true); }
      finally { URL.revokeObjectURL(src); }
    });

    d.showModal();
    start();
    return d;
  }

  // ---- Phones: ask for the camera once, so scanning starts straight away later ----
  const ASKED = 'momento-camera-asked';
  async function askCamera() {
    if (!isPhone() || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return;
    try { if (localStorage.getItem(ASKED)) return; } catch (e) {}
    try {
      const p = await navigator.permissions?.query({ name: 'camera' });
      if (p && p.state !== 'prompt') return;
    } catch (e) {}
    const card = document.createElement('div');
    card.className = 'mq-ask';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Allow the camera');
    card.innerHTML = `<div class="mq-ask-head"><span class="mq-ic">${ICON.camera}</span><div><b>Scan album QR codes</b><p>Momento uses your camera only to read QR codes. Nothing is recorded or uploaded.</p></div></div>
      <div class="mq-row"><button class="mq-btn is-light" type="button" data-later>Not now</button><button class="mq-btn" type="button" data-allow>Allow camera</button></div>`;
    const remember = () => { try { localStorage.setItem(ASKED, String(Date.now())); } catch (e) {} };
    const go = () => { card.classList.add('is-going'); setTimeout(() => card.remove(), 320); };
    card.querySelector('[data-later]').addEventListener('click', () => { remember(); go(); });
    card.querySelector('[data-allow]').addEventListener('click', async () => {
      remember(); go();
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        s.getTracks().forEach((t) => t.stop());
        toast('Camera ready', 'Tap “Scan a QR code” whenever a host shows you one.');
      } catch (err) { toast('Camera not allowed', 'You can turn it on later in your browser’s site settings.'); }
    });
    document.body.append(card);
  }

  Momento.qr = { show, scan, mount, codeFrom, askCamera };

  // Any control on any page: <button data-qr-scan>
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-qr-scan]');
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    scan(t);
  }, true);

  // A newly created album: its QR code goes on the "Album created" screen
  document.addEventListener('momento:albums', (e) => {
    const { type, album } = e.detail || {};
    const dlg = document.getElementById('mCreate');
    if (type !== 'add' || !album?.code || album.role === 'guest' || !dlg?.open) return;
    const doneView = dlg.querySelector('.m-done');
    if (!doneView) return;
    let slot = doneView.querySelector('.mq-slot');
    if (!slot) {
      slot = document.createElement('div');
      slot.className = 'mq-slot';
      doneView.querySelector('.m-code')?.before(slot);
    }
    mount(slot, album);
  });

  // The albums page is where a signed-in phone user lands, so that's where the camera is asked for
  if (document.documentElement.dataset.page === 'albums') {
    const later = () => setTimeout(askCamera, 1800);
    if (document.documentElement.classList.contains('intro-on')) document.addEventListener('momento:intro-end', later, { once: true });
    else addEventListener('load', later, { once: true });
  }
})();
