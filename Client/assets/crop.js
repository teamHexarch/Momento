/* Momento: crop a profile photo before it's uploaded.
   Momento.cropAvatar(file) opens a window with the photo under a round frame: drag to move it, zoom with the
   slider, the mouse wheel, two fingers or the + and - keys, and arrow keys to nudge. "Use photo" resolves with a
   512×512 JPEG; Cancel (or Esc) resolves with null. A photo the browser can't open (e.g. HEIC outside Safari) is
   passed on unchanged, so the server can still read it. */
(() => {
  const M = (window.Momento = window.Momento || {});
  const OUT = 512;
  const css = document.createElement('style');
  css.textContent = `
    /* The window itself is the shared upload-question sheet (.ev-ask in assets/event.js, glass from glass.css) */
    dialog.cr-dlg { width: min(24rem, calc(100vw - 32px)); }
    .cr-stage { position: relative; width: 100%; aspect-ratio: 1; margin: 1rem 0 .9rem; overflow: hidden; border-radius: 20px;
      background: #1d1b26; box-shadow: inset 0 0 0 1px rgba(127, 120, 150, .2); touch-action: none; cursor: grab; user-select: none; -webkit-user-select: none; }
    .cr-stage:active { cursor: grabbing; }
    .cr-stage:focus-visible { outline: 3px solid var(--focus-ring, #6c5fc7); outline-offset: 3px; }
    .cr-stage img { position: absolute; left: 0; top: 0; max-width: none; transform-origin: 0 0; pointer-events: none; }
    .cr-ring { position: absolute; inset: 0; pointer-events: none; border-radius: 20px;
      background: radial-gradient(circle closest-side at center, transparent calc(100% - 1px), rgba(10, 9, 16, .6) 100%); }
    .cr-ring::after { content: ""; position: absolute; inset: 0; border-radius: 50%; box-shadow: inset 0 0 0 2px rgba(255, 255, 255, .9), 0 0 0 1px rgba(0, 0, 0, .15); }
    .cr-zoom { display: flex; align-items: center; gap: .75rem; min-height: 44px; font-size: .85rem; font-weight: 600; color: var(--slate, #5c596b); }
    .cr-zoom svg { flex: none; }
    .cr-zoom input { flex: 1; min-width: 0; accent-color: var(--dusk, #2e2c3a); cursor: pointer; }
    :root[data-theme="dark"] .cr-zoom input { accent-color: #e8e4f4; }`;
  document.head.append(css);

  const icon = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">${d}</svg>`;
  function load(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
      img.src = url;
    });
  }

  M.cropAvatar = async function cropAvatar(file) {
    if (!file) return null;
    let loaded;
    try { loaded = await load(file); } catch { return file; }   // the server can still read it
    const { img, url } = loaded;
    const d = document.createElement('dialog');
    d.className = 'ev-ask cr-dlg';
    d.setAttribute('aria-labelledby', 'crTitle');
    d.innerHTML = `
      <h2 id="crTitle">Crop your photo</h2>
      <p>Drag to move it and zoom to fit your face in the circle.</p>
      <div class="cr-stage" tabindex="0" role="img" aria-label="Your photo. Drag, or use the arrow keys to move it and + or - to zoom"><span class="cr-ring"></span></div>
      <label class="cr-zoom">${icon('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8.5 11h5"/>')}<input type="range" min="1" max="4" step="0.01" value="1" aria-label="Zoom">${icon('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8.5 11h5M11 8.5v5"/>')}</label>
      <div class="mq-row"><button class="mq-btn is-light" type="button" data-cancel>Cancel</button><button class="mq-btn" type="button" data-use>Use photo</button></div>`;
    const stage = d.querySelector('.cr-stage'), zoomEl = d.querySelector('input[type=range]');
    stage.prepend(img);
    document.body.append(d);
    d.showModal();

    const W = img.naturalWidth, H = img.naturalHeight;
    // view: the stage's size in pixels; base: the scale at which the photo just covers the stage
    let view = stage.clientWidth || 320, base = view / Math.min(W, H), zoom = 1, x = 0, y = 0;
    const clamp = () => {
      const s = base * zoom;
      x = Math.min(0, Math.max(view - W * s, x));
      y = Math.min(0, Math.max(view - H * s, y));
    };
    const draw = () => { clamp(); img.style.transform = `translate(${x}px, ${y}px) scale(${base * zoom})`; };
    const zoomTo = (z, cx = view / 2, cy = view / 2) => {
      z = Math.min(4, Math.max(1, z));
      const k = z / zoom;
      x = cx - (cx - x) * k; y = cy - (cy - y) * k;
      zoom = z; zoomEl.value = z; draw();
    };
    // Start centred
    x = (view - W * base) / 2; y = (view - H * base) / 2; draw();
    const ro = new ResizeObserver(() => {
      const nv = stage.clientWidth; if (!nv || nv === view) return;
      const k = nv / view; x *= k; y *= k; view = nv; base = view / Math.min(W, H); draw();
    });
    ro.observe(stage);

    // Drag with one pointer, pinch with two
    const pts = new Map();
    let pinch = null;
    stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom }; } });
    stage.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      if (pts.size === 1) { x += e.clientX - p.x; y += e.clientY - p.y; draw(); }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()], r = stage.getBoundingClientRect();
        zoomTo(pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      }
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', (e) => { e.preventDefault(); const r = stage.getBoundingClientRect(); zoomTo(zoom * Math.exp(-e.deltaY / 400), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    zoomEl.addEventListener('input', () => zoomTo(Number(zoomEl.value)));
    stage.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 40 : 10;
      const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      if (moves[e.key]) { e.preventDefault(); x += moves[e.key][0]; y += moves[e.key][1]; draw(); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomTo(zoom + .1); }
      else if (e.key === '-') { e.preventDefault(); zoomTo(zoom - .1); }
    });

    const result = await new Promise((resolve) => {
      d.querySelector('[data-cancel]').addEventListener('click', () => resolve(null));
      d.addEventListener('cancel', (e) => { e.preventDefault(); resolve(null); });
      d.querySelector('[data-use]').addEventListener('click', () => {
        const s = base * zoom, c = document.createElement('canvas');
        c.width = c.height = OUT;
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, -x / s, -y / s, view / s, view / s, 0, 0, OUT, OUT);
        c.toBlob((blob) => resolve(blob || file), 'image/jpeg', .9);
      });
      setTimeout(() => stage.focus({ preventScroll: true }));
    });
    ro.disconnect();
    d.close(); d.remove();
    URL.revokeObjectURL(url);
    return result;
  };
})();
