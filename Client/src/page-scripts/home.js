/* Home: the page's own behaviour (moved from public/legacy/home-1.js, home-2.js, home-3.js, home-4.js).
   The code is the original, unchanged: it still drives the server-rendered markup by id and class. It is started by
   <HomeScripts> (through LegacyScripts) at the point the first old script used to run, so its DOMContentLoaded and load
   listeners still run in their original order. Converting it into React components is the next step for this page. */
/* eslint-disable */

export default function start() {
  // ======== from home-1.js ========
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Phones and low-power devices (touch screens, 4 or fewer cores, Data Saver): the scroll lean/stretch
    // is skipped and the silk background is drawn about 30 times a second instead of 60-75
    const LOW_POWER = matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4 || !!navigator.connection?.saveData;
    const finePointer = matchMedia('(pointer: fine)').matches;
    const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
    const lerp = (a, b, t) => a + (b - a) * t;
    const ease = (v) => (v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2);
    const easeOut = (v) => 1 - Math.pow(1 - v, 3);

    // ---- Photos ----
    // Stand-ins for the photos/ folder of the second page (01 to 13). Swap these
    // for real files, e.g. PHOTO_SRC[1] = 'photos/01.jpg'.
    const PICSUM = [0, 91, 1027, 64, 1011, 1040, 1035, 1005, 1015, 1012, 177, 1047, 1062, 1025];
    const PHOTO_SRC = {};
    // The demo photos are kept in assets/photos (no third-party request on a visit): square WebP copies at a few
    // sizes, and the nearest one at least as big as asked for is used (the 36px one is the 'chat app' copy)
    const photo = (n, w = 400, h = w) => {
      if (PHOTO_SRC[n]) return PHOTO_SRC[n];
      const id = PICSUM[n], m = Math.max(w, h);
      const size = m <= 40 && id === 1015 ? 36 : m <= 96 ? 96 : m <= 480 || id !== 1015 ? 480 : 1200;
      return `assets/photos/${id}-${size}.webp`;
    };
    for (const img of document.querySelectorAll('img[data-p]')) {
      img.src = photo(+img.dataset.p, +(img.dataset.w || 200), +(img.dataset.h || img.dataset.w || 200));
      img.loading = 'lazy';
    }

    // The QR card holds a real, scannable code for https://hexarch.org/?book (25 modules, error correction M, drawn
    // once from assets/vendor/qrcode.js). Scanning it with a phone opens the home page with the photobook already open
    (() => {
      const art = `<g fill="#2E2C3A"><path d="M0 0h7v1h-7zM11 0h1v1h-1zM13 0h1v1h-1zM18 0h7v1h-7zM0 1h1v1h-1zM6 1h1v1h-1zM8 1h3v1h-3zM13 1h1v1h-1zM16 1h1v1h-1zM18 1h1v1h-1zM24 1h1v1h-1zM0 2h1v1h-1zM2 2h3v1h-3zM6 2h1v1h-1zM8 2h1v1h-1zM10 2h1v1h-1zM12 2h1v1h-1zM16 2h1v1h-1zM18 2h1v1h-1zM20 2h3v1h-3zM24 2h1v1h-1zM0 3h1v1h-1zM2 3h3v1h-3zM6 3h1v1h-1zM8 3h1v1h-1zM12 3h2v1h-2zM15 3h2v1h-2zM18 3h1v1h-1zM20 3h3v1h-3zM24 3h1v1h-1zM0 4h1v1h-1zM2 4h3v1h-3zM6 4h1v1h-1zM9 4h2v1h-2zM12 4h1v1h-1zM16 4h1v1h-1zM18 4h1v1h-1zM20 4h3v1h-3zM24 4h1v1h-1zM0 5h1v1h-1zM6 5h1v1h-1zM10 5h2v1h-2zM13 5h2v1h-2zM18 5h1v1h-1zM24 5h1v1h-1zM0 6h7v1h-7zM8 6h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM16 6h1v1h-1zM18 6h7v1h-7zM8 7h1v1h-1zM10 7h3v1h-3zM14 7h3v1h-3zM0 8h1v1h-1zM6 8h1v1h-1zM8 8h4v1h-4zM13 8h1v1h-1zM17 8h2v1h-2zM21 8h3v1h-3zM4 9h2v1h-2zM8 9h1v1h-1zM10 9h2v1h-2zM13 9h4v1h-4zM19 9h5v1h-5zM1 10h1v1h-1zM6 10h1v1h-1zM8 10h1v1h-1zM10 10h1v1h-1zM12 10h4v1h-4zM17 10h2v1h-2zM21 10h1v1h-1zM23 10h2v1h-2zM0 11h2v1h-2zM3 11h2v1h-2zM7 11h1v1h-1zM9 11h2v1h-2zM12 11h1v1h-1zM14 11h1v1h-1zM17 11h2v1h-2zM20 11h2v1h-2zM24 11h1v1h-1zM0 12h1v1h-1zM2 12h3v1h-3zM6 12h2v1h-2zM9 12h2v1h-2zM12 12h1v1h-1zM14 12h1v1h-1zM16 12h1v1h-1zM18 12h2v1h-2zM24 12h1v1h-1zM0 13h1v1h-1zM4 13h1v1h-1zM7 13h1v1h-1zM10 13h1v1h-1zM13 13h5v1h-5zM19 13h1v1h-1zM23 13h1v1h-1zM0 14h1v1h-1zM2 14h1v1h-1zM4 14h1v1h-1zM6 14h1v1h-1zM8 14h1v1h-1zM11 14h6v1h-6zM19 14h3v1h-3zM23 14h2v1h-2zM0 15h1v1h-1zM7 15h5v1h-5zM15 15h2v1h-2zM18 15h2v1h-2zM21 15h2v1h-2zM24 15h1v1h-1zM0 16h1v1h-1zM2 16h1v1h-1zM5 16h3v1h-3zM9 16h1v1h-1zM11 16h10v1h-10zM22 16h1v1h-1zM8 17h1v1h-1zM10 17h1v1h-1zM12 17h1v1h-1zM16 17h1v1h-1zM20 17h1v1h-1zM0 18h7v1h-7zM9 18h1v1h-1zM11 18h1v1h-1zM14 18h1v1h-1zM16 18h1v1h-1zM18 18h1v1h-1zM20 18h1v1h-1zM24 18h1v1h-1zM0 19h1v1h-1zM6 19h1v1h-1zM9 19h4v1h-4zM15 19h2v1h-2zM20 19h1v1h-1zM23 19h2v1h-2zM0 20h1v1h-1zM2 20h3v1h-3zM6 20h1v1h-1zM9 20h12v1h-12zM22 20h1v1h-1zM0 21h1v1h-1zM2 21h3v1h-3zM6 21h1v1h-1zM9 21h3v1h-3zM13 21h2v1h-2zM17 21h2v1h-2zM23 21h2v1h-2zM0 22h1v1h-1zM2 22h3v1h-3zM6 22h1v1h-1zM9 22h1v1h-1zM13 22h3v1h-3zM21 22h2v1h-2zM24 22h1v1h-1zM0 23h1v1h-1zM6 23h1v1h-1zM9 23h3v1h-3zM14 23h3v1h-3zM18 23h3v1h-3zM24 23h1v1h-1zM0 24h7v1h-7zM8 24h3v1h-3zM12 24h1v1h-1zM16 24h1v1h-1zM18 24h1v1h-1zM21 24h1v1h-1zM24 24h1v1h-1z"/></g>`;
      document.getElementById('qrHero').innerHTML = art;
      const qrStep = document.getElementById('qrStep');   // the QR in How it works
      if (qrStep) qrStep.innerHTML = art;
    })();

    // ---- Shared pointer state ----
    const pointer = { x: innerWidth / 2, y: innerHeight / 2, active: false, nx: 0, ny: 0, ix: 0, iy: 0 };
    let vw = innerWidth, vh = innerHeight;
    addEventListener('resize', () => { vw = innerWidth; vh = innerHeight; });

    // ---- Living background: flowing silk, drawn by a small shader at a third of screen size ----
    // It drifts slowly on its own and stays fixed to the screen while the page scrolls.
    // Without WebGL the page keeps its plain fog gradient.
    const canvas = document.getElementById('bg');
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, powerPreference: 'low-power' });
    // The silk is soft, so it is drawn into a modest buffer (about 300k pixels on any screen, at most half
    // the screen size) that the browser scales up smoothly. The drift is slow, so redrawing about 30 times
    // a second looks fluid. The background never moves with the scroll: it is fixed to the screen.
    const LOW_POWER_SILK = matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4 || !!navigator.connection?.saveData;
    const SILK_PIXELS = LOW_POWER_SILK ? 90000 : 300000;
    const flow = { t: 0, dirty: true, acc: 0 };
    let renderFluid = () => {};
    if (gl) {
      const vert = 'attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }';
      const frag = `
        #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
        #else
        precision mediump float;
        #endif
        uniform vec2 res;
        uniform float t;
        uniform vec3 c0, c1, c2, c3;   // the palette: fog, folds, sea glass, glints (eased between light and dark)
        // Stable hash (no sin), so the noise doesn't break into blocks at lower precision
        float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float fbm(vec2 p) {
          float s = 0.0, a = 0.5;
          for (int i = 0; i < 3; i++) { s += a * noise(p); p = p * 2.02 + vec2(1.7, 9.2); a *= 0.5; }
          return s;
        }
        void main() {
          vec2 uv = gl_FragCoord.xy / res;
          float asp = res.x / res.y;
          vec2 p = vec2(uv.x * asp, 1.0 - uv.y);
          p *= 1.25;
          // Domain warping folds the noise into large soft ridges, like draped silk
          vec2 q = vec2(fbm(p + vec2(0.0, t * 0.05)), fbm(p + vec2(5.2, 1.3) - t * 0.04));
          vec2 r = vec2(fbm(p + 3.4 * q + vec2(1.7, 9.2) + t * 0.06), fbm(p + 3.4 * q + vec2(8.3, 2.8) - t * 0.05));
          float f = fbm(p + 3.2 * r);
          vec3 col = mix(c0, c1, smoothstep(0.46, 0.74, f));
          col = mix(col, c2, smoothstep(0.62, 0.95, q.y) * 0.3);
          // Soft cream light where the folds turn over
          float edge = exp(-pow((f - 0.44) * 9.0, 2.0)) + 0.7 * exp(-pow((r.x - 0.6) * 8.0, 2.0)) + 0.5 * exp(-pow((f - 0.6) * 10.0, 2.0));
          col = mix(col, c3, clamp(edge * 0.4 + smoothstep(0.36, 0.2, f) * 0.4, 0.0, 1.0));
          // A whisper of noise (about one colour step) stops the smooth fog from banding
          col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
          gl_FragColor = vec4(col, 1.0);
        }`;
      const prog = gl.createProgram();
      for (const [type, src] of [[gl.VERTEX_SHADER, vert], [gl.FRAGMENT_SHADER, frag]]) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        gl.attachShader(prog, s);
      }
      gl.bindAttribLocation(prog, 0, 'a');
      gl.linkProgram(prog);
      if (gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        const u = {};
        for (const name of ['res', 't', 'c0', 'c1', 'c2', 'c3']) u[name] = gl.getUniformLocation(prog, name);
        // Pale blue fog, lavender-blue folds, sea glass and cream edges by day; by night the same
        // silk goes near-black, with the glints turning to moonlit lavender
        const PAL = {
          light: [[.905, .918, .955], [.740, .775, .880], [.790, .865, .870], [1, .975, .925]],
          dark:  [[.046, .042, .072], [.020, .018, .034], [.052, .062, .108], [.175, .152, .280]],
        };
        // The folds and fog darken first; the glints warm up a beat later, like lamps coming on
        const THEME = window.__theme || (window.__theme = { target: 0, a: 0, b: 0 });
        const mixPal = (i, m) => PAL.light[i].map((v, c) => v + (PAL.dark[i][c] - v) * m);
        const sizeCanvas = () => {
          const s = Math.min(.5, Math.sqrt(SILK_PIXELS / Math.max(1, innerWidth * innerHeight)));
          canvas.width = Math.max(1, Math.round(innerWidth * s));
          canvas.height = Math.max(1, Math.round(innerHeight * s));
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.uniform2f(u.res, canvas.width, canvas.height);
          flow.dirty = true;
        };
        sizeCanvas();
        // Resizing reallocates the buffer, so it waits until the window has settled. A small height-only
        // change (a phone's address bar sliding away as you scroll) is ignored: the canvas just stretches
        let sizedW = innerWidth, sizedH = innerHeight, resizeTimer = 0;
        addEventListener('resize', () => {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            if (innerWidth === sizedW && Math.abs(innerHeight - sizedH) < sizedH * .25) return;
            sizedW = innerWidth; sizedH = innerHeight;
            sizeCanvas();
          }, 150);
        });
        // While the page scrolls, the silk holds still (it's behind everything, so nobody sees it pause): the frame goes
        // to the scrolling instead, and it carries on from the same place ~150 ms after scrolling stops
        let scrolling = false, scrollTimer = 0, drawn = false;
        addEventListener('scroll', () => {
          scrolling = true; clearTimeout(scrollTimer);
          scrollTimer = setTimeout(() => { scrolling = false; }, 150);
        }, { passive: true });
        renderFluid = (dt) => {
          const k = (rate) => 1 - Math.exp(-dt * rate);
          if (scrolling && drawn && !flow.dirty && Math.abs(THEME.target - THEME.a) <= .002 && Math.abs(THEME.target - THEME.b) <= .002) return;
          if (!still) flow.t += dt * 0.6;
          // Ease toward the chosen theme (instantly with reduced motion)
          const fade = still ? 1 : k(3.2), glow = still ? 1 : k(1.5);
          const settling = Math.abs(THEME.target - THEME.a) > .002 || Math.abs(THEME.target - THEME.b) > .002;
          if (settling) {
            THEME.a += (THEME.target - THEME.a) * fade; THEME.b += (THEME.target - THEME.b) * glow;
            if (Math.abs(THEME.target - THEME.a) <= .002) THEME.a = THEME.target;
            if (Math.abs(THEME.target - THEME.b) <= .002) THEME.b = THEME.target;
            flow.dirty = true;
          }
          if (still && !flow.dirty) return;
          // The drift is slow, so about 30 draws a second look fluid (fewer on low-power devices)
          flow.acc += dt;
          if (!flow.dirty && flow.acc < 1 / (LOW_POWER_SILK ? 24 : 30)) return;
          flow.acc = 0; flow.dirty = false;
          gl.uniform1f(u.t, flow.t);
          gl.uniform3fv(u.c0, mixPal(0, THEME.a)); gl.uniform3fv(u.c1, mixPal(1, THEME.a));
          gl.uniform3fv(u.c2, mixPal(2, THEME.a)); gl.uniform3fv(u.c3, mixPal(3, THEME.b));
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          // Shown once there is something drawn: before that an opaque canvas is blank (glass.css, canvas.bg)
          if (!drawn) { drawn = true; canvas.classList.add('is-drawn'); }
        };
      }
    }

    // ---- Cursor ----
    const cursorEl = document.getElementById('cursor');
    const useCursor = finePointer && !still;
    // The dot starts where the mouse was on the last page (clicking a link doesn't move the mouse),
    // not in the middle of the screen. Until the mouse has been seen, the dot stays hidden and the
    // normal pointer shows
    try {
      const at = JSON.parse(sessionStorage.getItem('momento-pointer') || 'null');
      if (at && Date.now() - at.t < 15000 && at.x <= innerWidth && at.y <= innerHeight) {
        pointer.x = at.x; pointer.y = at.y;
        document.documentElement.classList.add('cursor-seen');
      }
    } catch (e) {}
    addEventListener('pagehide', () => {
      try { if (document.documentElement.classList.contains('cursor-seen')) sessionStorage.setItem('momento-pointer', JSON.stringify({ x: pointer.x, y: pointer.y, t: Date.now() })); } catch (e) {}
    });
    let rx = pointer.x, ry = pointer.y;
    if (useCursor) document.documentElement.classList.add('has-cursor');
    // Touch, a pen, or Chrome's mobile preview (switched on without a reload) send no mouse moves
    // between taps, so the bead would sit stuck beside the real touch point. Hide it and give the
    // normal pointer back until a mouse moves again.
    {
      const fineMq = matchMedia('(pointer: fine)'), rootCl = document.documentElement.classList;
      const sync = (e) => {
        rootCl.toggle('cursor-off', !fineMq.matches || (!!e && e.pointerType !== 'mouse'));
        if (e && e.pointerType === 'mouse') rootCl.add('cursor-seen');
      };
      addEventListener('pointermove', sync, { passive: true, capture: true });
      addEventListener('pointerdown', sync, { passive: true, capture: true });
      fineMq.addEventListener('change', () => sync());
    }
    addEventListener('pointermove', (e) => {
      // Movement since the last event drags the silk; the first event only places the cursor
      if (pointer.active) { pointer.ix += e.clientX - pointer.x; pointer.iy += e.clientY - pointer.y; }
      else { rx = e.clientX; ry = e.clientY; }
      pointer.x = e.clientX; pointer.y = e.clientY;
      pointer.nx = e.clientX / vw - .5; pointer.ny = e.clientY / vh - .5;
      pointer.active = true;
      if (useCursor) {
        const el = e.target instanceof Element ? e.target : null;
        const root = document.documentElement.classList;
        const drag = !!el?.closest('input[type="range"]');
        root.toggle('cursor-drag', drag);
        root.toggle('cursor-hover', !drag && !!el?.closest('a, button, .qa button'));
      }
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { pointer.active = false; });
    addEventListener('pointerdown', () => document.documentElement.classList.add('cursor-down'));
    addEventListener('pointerup', () => document.documentElement.classList.remove('cursor-down'));

    // ---- Glass rim light follows the pointer ----
    function lightUp(glass) {
      glass.dataset.lit = '1';
      glass.addEventListener('pointerenter', () => glass.style.setProperty('--shine', 1));
      glass.addEventListener('pointerleave', () => glass.style.setProperty('--shine', 0));
      // One rect read and one write per frame, however many pointer events arrive
      let gx = 0, gy = 0, gq = false;
      glass.addEventListener('pointermove', (e) => {
        gx = e.clientX; gy = e.clientY;
        if (gq) return;
        gq = true;
        requestAnimationFrame(() => {
          gq = false;
          const r = glass.getBoundingClientRect();
          glass.style.setProperty('--mx', `${gx - r.left}px`);
          glass.style.setProperty('--my', `${gy - r.top}px`);
        });
      });
    }
    document.querySelectorAll('.glass, .panel, .qr-card').forEach(lightUp);
    // Glass a script makes later (the account chip and menu, toasts) lights up the first time the pointer reaches it
    document.addEventListener('pointerover', (e) => {
      const g = e.target.closest?.('.glass, .panel');
      if (!g || g.dataset.lit) return;
      lightUp(g); g.style.setProperty('--shine', 1);
    }, { passive: true });

    // ---- Buttons: fill floods in from where the cursor enters, label rolls, slight pull ----
    for (const btn of document.querySelectorAll('.btn')) {
      const inner = btn.innerHTML.trim();
      btn.innerHTML = `<span class="btn-fill" aria-hidden="true"></span><span class="btn-label"><span class="roll"><span>${inner}</span><span aria-hidden="true">${inner}</span></span></span>`;
      const origin = (e) => {
        const r = btn.getBoundingClientRect();
        btn.style.setProperty('--fx', `${e.clientX - r.left}px`);
        btn.style.setProperty('--fy', `${e.clientY - r.top}px`);
      };
      btn.addEventListener('pointerenter', origin);
      btn.addEventListener('pointerleave', (e) => { origin(e); btn.style.setProperty('--bx', '0px'); btn.style.setProperty('--by', '0px'); });
      let bx = 0, by = 0, bq = false;
      if (useCursor) btn.addEventListener('pointermove', (e) => {
        bx = e.clientX; by = e.clientY;
        if (bq) return;
        bq = true;
        requestAnimationFrame(() => {
          bq = false;
          if (!btn.matches(':hover')) return;   // pointer already left; keep the reset
          const r = btn.getBoundingClientRect();
          btn.style.setProperty('--bx', `${(bx - r.left - r.width / 2) * .18}px`);
          btn.style.setProperty('--by', `${(by - r.top - r.height / 2) * .3}px`);
        });
      });
    }

  // ======== from home-2.js ========
    // ---- Album: built from ALBUM, opened and paged by scroll ----
    // Each photo is placed by hand: x/y = top-left as % of the page, w = % of page width,
    // r = ratio, rot = degrees, mount = corners | tape | polaroid.
    // by / at / note are written on the back of each print (click one to turn it over).
    // arrive: prints that drop onto the page one by one while it's open.
    // stack: prints to sort into keep / hide. slot: an empty space waiting for a photo.
    const ALBUM = [
      {
        left: { type: 'text', no: '01', title: 'A shared album for every moment',
                body: 'Momento gathers the photos everyone takes into one album, so nothing stays stuck on a single phone.',
                hint: 'psst, tap a photo to turn it over',
                photos: [{ p: 4, x: 16, y: 56, w: 64, r: '4/3', rot: -3, mount: 'tape', caption: 'Golden hour on the lake', by: 'Maya', at: '7:48pm', note: 'had to stop the boat for this one' }] },
        right: { type: 'photos', photos: [
                { p: 8, x: 7, y: 7, w: 62, r: '4/3', rot: 2, mount: 'corners', caption: 'The view from the top', by: 'Theo', at: '2:15pm', note: '600 steps. worth it.' },
                { p: 13, x: 10, y: 59, w: 38, r: '1/1', rot: 3, mount: 'tape', caption: 'Who let the dog in?', by: 'Sam', at: '8:02pm', note: 'he was not invited', arrive: true },
                { p: 2, x: 57, y: 47, w: 36, r: '3/4', rot: -4, mount: 'polaroid', caption: 'The first look', by: 'Priya', at: '8:10pm', note: 'nobody breathe', arrive: true },
                { p: 9, x: 66, y: 13, w: 28, r: '1/1', rot: 7, mount: 'polaroid', caption: 'cheers!', by: 'Jonah', at: '8:14pm', note: 'blurry but iconic', arrive: true }] },
      },
      {
        left: { type: 'text', no: '02', title: 'Your people, your groups',
                body: 'Make a group of the people you see most, and share an album with all of them at once.',
                photos: [{ p: 1, x: 50, y: 52, w: 34, r: '3/4', rot: 4, mount: 'polaroid', caption: 'One more shot', by: 'Ellie', at: '11:31pm', note: 'it was not one more shot' }] },
        right: { type: 'photos', photos: [
                { p: 7, x: 6, y: 5, w: 58, r: '4/3', rot: -2, mount: 'corners', caption: 'Waiting for the toast', by: 'Priya', at: '6:40pm', note: 'speeches ran long' },
                { p: 3, x: 60, y: 9, w: 34, r: '3/4', rot: 3, mount: 'tape', caption: 'Daisies from the aisle', by: 'Nan', at: '3:05pm', note: 'pressed one in my book' },
                { p: 9, x: 10, y: 47, w: 50, r: '4/3', rot: 2, mount: 'polaroid', caption: 'Escaping the speeches', by: 'Jonah', at: '7:12pm', note: 'shh' },
                { p: 11, x: 58, y: 55, w: 34, r: '1/1', rot: -5, mount: 'corners', caption: 'The walk home', by: 'Sam', at: '1:20am', note: 'shoes in hand' }] },
      },
      {
        left: { type: 'text', no: '03', title: 'Events near you',
                body: 'See public events around you, and get a heads-up when you walk into one’s sharing zone.',
                photos: [{ p: 6, x: 14, y: 55, w: 62, r: '4/3', rot: -2, mount: 'corners', caption: 'The walk to the falls', by: 'Theo', at: '10:26am', note: 'found it on the map' }] },
        right: { type: 'photos', photos: [
                { p: 10, x: 6, y: 6, w: 46, r: '3/4', rot: -3, mount: 'polaroid', caption: 'Made it to the top', by: 'Maya', at: '12:50pm', note: 'joined from the trailhead' },
                { p: 12, x: 48, y: 38, w: 46, r: '3/4', rot: 4, mount: 'polaroid', caption: 'Wrapped up for later', by: 'Ellie', at: '4:44pm', note: 'cold. so cold.' }] },
      },
      {
        left: { type: 'text', no: '04', title: 'Keep only the best',
                body: 'Swipe through everyone’s photos. Keep the good ones and hide the rest from your own view.',
                stack: { x: 8, y: 49, w: 50, kept: { x: 67, y: 55, w: 21 },
                         photos: [{ p: 5, r: '4/3', mount: 'corners' }, { p: 0, r: '4/3', mount: 'corners' }, { p: 10, r: '4/3', mount: 'corners' }, { p: 3, r: '4/3', mount: 'corners' }] } },
        right: { type: 'cta', title: 'Want to see how it works?',
                 body: 'Create an event, put the code out, and the album builds itself. Here’s the whole thing, step by step.',
                 button: 'See how it works', href: '#how-it-works',
                 photos: [{ p: 2, x: 50, y: 56, w: 34, r: '3/4', rot: -4, mount: 'polaroid', caption: 'Your shot is next', by: 'You?', at: 'soon', note: 'this could be yours' }] },
      },
      {
        // Signed out: asks the visitor to sign in (the sign-in window also opens by itself, see askToSignIn). Signed in,
        // fillYourSpread() swaps in your own album (see the end of this script)
        left: { type: 'text', no: '05', title: 'Sign in to add your photos',
                body: 'Everyone at the event can see this album. Sign in to add yours, or create an account if you’re new.',
                button: 'Sign in', href: 'auth:login',
                button2: 'New here? Create an account', href2: 'auth:signup',
                photos: [{ slot: true, x: 20, y: 71, w: 40, r: '4/3', rot: -3, mount: 'tape', caption: 'your first photo' }] },
        right: { type: 'photos', photos: [
                { slot: true, x: 8, y: 6, w: 54, r: '4/3', rot: -2, mount: 'corners', caption: 'your shot is next' },
                { slot: true, x: 62, y: 11, w: 31, r: '3/4', rot: 3, mount: 'tape', caption: 'the toast?' },
                { slot: true, x: 10, y: 50, w: 44, r: '1/1', rot: 2, mount: 'polaroid', caption: 'the crew?' },
                { slot: true, x: 58, y: 54, w: 34, r: '3/4', rot: -4, mount: 'corners', caption: 'late night?' }] },
      },
    ];

    // Scroll timeline, in screen heights
    const T = { hero: 0.3, intro: 1.0, turn: 0.9, hold: 0.45, tail: 0.5 };
    const STEP = 2;   // px between stacked leaves

    const story = document.querySelector('.story');
    const stage = document.getElementById('stage');
    const album = document.querySelector('.album');
    const heroLeft = document.getElementById('heroLeft');
    const pageCount = document.querySelector('.pa-count');
    const n = ALBUM.length;
    const PIXELS = { '4/3': [800, 600], '3/4': [600, 800], '1/1': [700, 700] };

    // (your own album's name and photos end up in here, so text is escaped)
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

    function photoHTML(ph, extra = '') {
      const [w, h] = PIXELS[ph.r];
      const place = ph.x == null ? '' : `left:${ph.x}%; top:${ph.y}%; width:${ph.w}%; `;
      const style = `${place}--rot:${ph.rot || 0}deg; --ratio:${ph.r}`;
      if (ph.slot) {
        return `<figure class="photo slot mount-${ph.mount}" style="${style}"><div class="photo-card"><div class="photo-frame"><div class="slot-in">${esc(ph.caption)}</div></div></div></figure>`;
      }
      const caption = ph.caption ? `<figcaption>${esc(ph.caption)}</figcaption>` : '';
      const polaroid = ph.mount === 'polaroid';
      // Prints with a name on the back can be turned over
      const back = ph.by ? `
            <div class="photo-back" aria-hidden="true"><span>${esc(ph.by)}${ph.at ? ` · ${esc(ph.at)}` : ''}</span>${ph.note ? `<span class="pb-note">${esc(ph.note)}</span>` : ''}<span class="pb-mark">Momento</span></div>` : '';
      const flip = ph.by ? ` data-flip role="button" tabindex="-1" aria-pressed="false" aria-label="Turn over: ${esc(ph.caption || 'photo')}"` : '';
      const arrive = ph.arrive && !still ? ' arrive is-pending' : '';
      return `
        <figure class="photo mount-${ph.mount}${arrive} ${extra}" style="${style}"${flip}${ph.arrive ? ` data-by="${esc(ph.by)}"` : ''}>
          <div class="photo-card"><div class="photo-frame">
            <img src="${esc(ph.src || photo(ph.p, w / 2, h / 2))}" alt="" loading="lazy" decoding="async">
            ${polaroid ? caption : ''}${back}
          </div></div>
          ${polaroid ? '' : caption}
        </figure>`;
    }

    // Keep only the best: the pile to sort (top card last, so it's drawn on top) and where the kept ones go
    const KEEP_ICONS = {
      hide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
      keep: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/></svg>',
    };
    function stackHTML(s) {
      const tilts = [-2, 3, -4, 2];
      return `
        <div class="keep" style="left:${s.x}%; top:${s.y}%; width:${s.w}%">
          <div class="ks-pile">${s.photos.map((ph, i) => photoHTML({ ...ph, rot: tilts[i % tilts.length] }, 'ks-card')).join('')}</div>
          <div class="ks-btns">
            <button class="kb kb-hide" type="button" tabindex="-1" data-act="hide" aria-label="Hide this photo">${KEEP_ICONS.hide}</button>
            <span class="ks-left" aria-live="polite"></span>
            <button class="kb kb-keep" type="button" tabindex="-1" data-act="keep" aria-label="Keep this photo">${KEEP_ICONS.keep}</button>
          </div>
          <p class="ks-done"><span class="ks-sum"></span><small>the hidden ones only leave your view</small><button class="kb" type="button" tabindex="-1" data-act="again">Sort again</button></p>
        </div>
        <div class="ks-kept" style="left:${s.kept.x}%; top:${s.kept.y}%; width:${s.kept.w}%"><span class="ks-kept-label">kept</span></div>`;
    }

    function pageHTML(p) {
      const collage = `<div class="collage">${(p.photos || []).map((ph) => photoHTML(ph)).join('')}${p.stack ? stackHTML(p.stack) : ''}</div>`;
      if (p.type === 'photos') return collage;
      return `${collage}
        <div class="page ${p.type}">
          ${p.no ? `<span class="page-no reveal" style="--i:0">${p.no}</span>` : ''}
          <h2 class="reveal" style="--i:1">${esc(p.title)}</h2>
          <p class="reveal" style="--i:2">${esc(p.body)}</p>
          ${p.hint ? `<span class="flip-hint reveal" style="--i:3">${esc(p.hint)}</span>` : ''}
          ${p.button ? `<button class="page-cta reveal" type="button" tabindex="-1" style="--i:3" data-href="${esc(p.href)}">${esc(p.button)}</button>` : ''}
          ${p.button2 ? `<button class="page-cta is-quiet reveal" type="button" tabindex="-1" style="--i:4" data-href="${esc(p.href2)}">${esc(p.button2)}</button>` : ''}
        </div>`;
    }

    const el = (cls, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; return d; };

    // Leaf 0 is the cover; leaf i's front is spread i-1's right page and its back is
    // spread i's left page. The last right page sits on the back board.
    const leaves = [];
    const spreadFaces = ALBUM.map(() => []);
    const cover = el('leaf cover');
    const coverFront = el('face front cover-front', `
      <div class="cover-art">
        <div class="cover-plate"><svg aria-hidden="true"><use href="#glyph-album" /></svg></div>
        <svg class="cover-wordmark" role="img" aria-label="Momento"><use href="#wordmark" /></svg>
      </div>`);
    const coverBack = el('face back cover-back');
    const insidePaper = el('paper', pageHTML(ALBUM[0].left));
    coverBack.append(insidePaper);
    cover.append(coverFront, coverBack);
    leaves.push(cover);
    spreadFaces[0].push(insidePaper);
    for (let i = 1; i < n; i++) {
      const leaf = el('leaf');
      const front = el('face front paper', pageHTML(ALBUM[i - 1].right));
      const back = el('face back paper', pageHTML(ALBUM[i].left));
      leaf.append(front, back);
      leaves.push(leaf);
      spreadFaces[i - 1].push(front);
      spreadFaces[i].push(back);
    }
    const lastPage = el('page-static face front paper', pageHTML(ALBUM[n - 1].right));
    spreadFaces[n - 1].push(lastPage);

    const holes = (side) => `<div class="holes ${side}">${'<span></span>'.repeat(12)}</div>`;
    insidePaper.insertAdjacentHTML('beforeend', holes('right'));
    lastPage.insertAdjacentHTML('beforeend', holes('left'));
    for (const leaf of leaves.slice(1)) {
      leaf.querySelector('.front').insertAdjacentHTML('beforeend', holes('left'));
      leaf.querySelector('.back').insertAdjacentHTML('beforeend', holes('right'));
    }
    const board = el('board');
    const edge = el('edge');
    const thick = el('thick');
    const rings = el('rings', '<span class="ring"></span>'.repeat(12));
    album.style.setProperty('--leaves', n);
    cover.append(thick);
    board.style.transform = `translateZ(${-(n + 1) * STEP}px)`;
    lastPage.style.transform = `translateZ(${-n * STEP}px)`;
    rings.style.transform = `translateZ(${(n + 3) * STEP}px)`;
    album.append(board, lastPage, edge, ...leaves, rings);

    // Floating photos around the QR card: mirrored pairs, so there are always as many on the left as on the
    // right, kept clear of the headline, the card, the header and the edges of the screen (with room for
    // their bob and tilt, so none is ever cut off). They dodge the pointer and scatter as the album opens.
    // Signed in, they become photos from your own albums (see the end of this script); otherwise samples.
    // Your own photos from earlier in this tab (saved at the end of this script) show straight away, so a
    // signed-in person never sees the stock ones first. Kept in sessionStorage, the same as the account.
    const HERO_KEY = 'momento-hero-prints';
    let HERO_MINE = [];
    try {
      if (sessionStorage.getItem('momento-account')) {
        HERO_MINE = JSON.parse(sessionStorage.getItem(HERO_KEY) || '[]').filter((u) => typeof u === 'string' && /^https?:\/\//.test(u) && !/["<>\s]/.test(u));
      }
    } catch (e) {}
    const FLOAT_COUNT = vw > 900 ? 10 : 6;
    const PAIR_SIZES = [112, 98, 118, 92, 106], ROTS = [-7, 6, -4, 8, -9];
    const floaters = Array.from({ length: FLOAT_COUNT }, (_, i) => {
      const pair = i >> 1, right = i % 2 === 0;
      // The two in a pair are close in size and tilt the opposite way, so the sides balance without looking stamped
      const size = PAIR_SIZES[pair % PAIR_SIZES.length] + (right ? 0 : (pair % 2 ? 6 : -6));
      const rot = right ? ROTS[pair % ROTS.length] : -ROTS[pair % ROTS.length] * .8;
      const f = { p: i % PICSUM.length, x: 50, y: 50, size, depth: .5 + (i % 4) * .23, rot, front: (pair + (right ? 0 : 1)) % 2 === 0, right };
      const d = el('floater', `<img src="${HERO_MINE.length ? HERO_MINE[i % HERO_MINE.length] : photo(f.p, 240)}" alt="">`);
      d.style.setProperty('--size', f.size + 'px');
      // Each photo bobs at its own pace (the same rhythm the script used to draw every frame)
      d.style.setProperty('--bob-time', ((5 + f.depth * 3) / 2).toFixed(2) + 's');
      d.style.setProperty('--bob-delay', (-(i * 1.7) % (5 + f.depth * 3)).toFixed(2) + 's');
      document.querySelector(f.front ? '.floaters-front' : '.floaters-back').append(d);
      return { ...f, el: d, rx: 0, ry: 0, cx: 0, cy: 0, room: { l: 0, r: 0, t: 0, b: 0 } };
    });
    // Half a print's width and height, plus room for its bob (10px) and its tilt
    const halfW = (size) => (size + 12) / 2 + 14, halfH = (size) => (size + 28) / 2 + 18;
    // The headline's real ink: each line of text, each button and chip (not the whole column they sit in)
    function heroRects(so) {
      const out = [];
      // (the big headline's glow and its comma reach past its letters, so it gets more room)
      for (const node of heroLeft.querySelectorAll('.hero-title, .hero-copy')) {
        const range = document.createRange(); range.selectNodeContents(node);
        const pad = node.classList.contains('hero-title') ? 40 : 18;
        for (const r of range.getClientRects()) if (r.width) out.push({ r, pad });
      }
      heroLeft.querySelectorAll('.hero-cta .btn').forEach((e) => { if (e.offsetParent) out.push({ r: e.getBoundingClientRect(), pad: 18 }); });
      return out.map(({ r, pad }) => ({ l: r.left - so.left - pad, r: r.right - so.left + pad, t: r.top - so.top - 14, b: r.bottom - so.top + 14 }));
    }
    // Phones: the card leaves only ~70px each side, too little for prints to float free of it, so four small
    // ones (two mirrored pairs, an upper and a lower) peek out from behind the card's edges, about a third of
    // each tucked under it. They sit on the back layer (under the card, so never over the QR code), stay clear
    // of the buttons above, and keep the bob, the pointer dodge and the scatter as the album opens.
    function layoutPhoneFloaters(sw, sh, so) {
      const cr0 = document.getElementById('qrCard').getBoundingClientRect();
      const cl = cr0.left - so.left, cr = cr0.right - so.left, ct = cr0.top - so.top, cb = cr0.bottom - so.top;
      const gutter = Math.min(cl, sw - cr);
      const ctaBottom = Math.max(0, ...[...heroLeft.querySelectorAll('.hero-cta .btn')].map((e) => e.getBoundingClientRect().bottom - so.top));
      const edge = 16;                                                 // kept from the screen edge: a tilted, bobbing print is wider than it looks
      const size = Math.min(84, Math.max(56, Math.round((gutter - edge) / .7 - 12)));
      const W = size + 12, H = size + 28;                              // the print with its paper border
      const visible = Math.min(.7 * W, gutter - edge);                 // how much of it shows beside the card
      const upper = Math.max(ct + .3 * H, ctaBottom + 24 + H / 2);     // clear of the buttons, with room to bob
      const lower = Math.max(upper + H + 16, cb - .55 * H);
      const fitsUpper = gutter >= 40 && upper + H / 2 + 10 <= sh - 8, fitsLower = fitsUpper && lower + H / 2 + 10 <= sh - 8;
      const back = document.querySelector('.floaters-back');
      floaters.forEach((f, i) => {
        const pair = i >> 1;
        if (pair > 1 || (pair === 0 && !fitsUpper) || (pair === 1 && !fitsLower)) { f.el.style.display = 'none'; return; }
        const x = f.right ? cr + visible - W / 2 : cl - visible + W / 2;
        const y = (pair === 0 ? upper : lower) + (f.right ? 0 : 14);   // the left one a touch lower, so the sides don't look stamped
        if (f.el.parentElement !== back) back.append(f.el);
        f.el.style.display = '';
        f.el.style.setProperty('--size', size + 'px');
        f.x = (x / sw) * 100; f.y = (y / sh) * 100;
        f.el.style.left = `calc(${f.x}% - ${W / 2}px)`;
        f.el.style.top = `calc(${f.y}% - ${H / 2}px)`;
        // The pointer may nudge it a little outward (not off the screen) and further under the card
        f.room = f.right ? { l: 14, r: 6, t: 14, b: 14 } : { l: 6, r: 14, t: 14, b: 14 };
      });
    }
    function layoutFloaters() {
      const sw = stage.clientWidth, sh = stage.clientHeight;
      if (!sw || !floaters.length) return;
      const card = document.getElementById('qrCard');
      const cw = card.offsetWidth, ch = card.offsetHeight;
      const cx = sw / 2 + (vw > 900 ? Math.min(vw * .18, 360) : 0);
      const cy = (vw > 900 ? sh * .5 : sh * .62) + 35;
      const so = stage.getBoundingClientRect();
      if (innerWidth <= 600) { layoutPhoneFloaters(sw, sh, so); return; }
      const blocks = heroRects(so);
      // (the card bobs and leans a little, and its live pill pokes out of the top)
      blocks.push({ l: cx - cw / 2 - 26, r: cx + cw / 2 + 26, t: cy - ch / 2 - 36, b: cy + ch / 2 + 26 });
      const top = (document.getElementById('header')?.getBoundingClientRect().bottom || 80) - so.top + 6;
      const wantPairs = floaters.length >> 1;
      // Full-size prints if they fit, otherwise a little smaller, so short or narrow windows still get some
      let best = null;
      for (const scale of [1, .88, .77, .68]) {
        const big = Math.max(...floaters.map((f) => f.size)) * scale, hw = halfW(big), hh = halfH(big);
        const clear = (x, y) => x - hw >= 8 && x + hw <= sw - 8 && y - hh >= top && y + hh <= sh - 8
          && blocks.every((k) => x + hw <= k.l || x - hw >= k.r || y + hh <= k.t || y - hh >= k.b);
        const rx = cw / 2 + Math.min(200, sw * .15) * (.8 + scale * .2), ry = ch / 2 + Math.min(120, sh * .13);
        // A spot on the right half of an ellipse round the card, and a partner on the left: its mirror image
        // if that's clear, otherwise the nearest clear spot near the same height on the card's left
        const pairs = [];
        for (let k = 0; k <= 60; k++) {
          const ang = -Math.PI / 2 + (k / 60) * Math.PI;
          const dx = Math.cos(ang) * rx, y = cy + Math.sin(ang) * ry, xr = cx + dx;
          if (!clear(xr, y)) continue;
          let left = null;
          search: for (const dy of [0, 24, -24, 48, -48, 72, -72]) {
            for (let step = 0; step < 90; step++) {
              for (const sgn of step ? [1, -1] : [1]) {
                const x = cx - dx + sgn * step * 6;
                if (x < cx - cw / 2 && clear(x, y + dy)) { left = { x, y: y + dy }; break search; }
              }
            }
          }
          if (left) pairs.push({ r: { x: xr, y }, l: left });
        }
        // Pairs at least a print apart on both sides, then an even pick from those
        const gap = Math.max(2 * hw, 2 * hh) - 16, spread = [];
        for (const p of pairs) {
          if (spread.every((q) => Math.hypot(q.r.x - p.r.x, q.r.y - p.r.y) >= gap && Math.hypot(q.l.x - p.l.x, q.l.y - p.l.y) >= gap)) spread.push(p);
        }
        const n = Math.min(wantPairs, spread.length);
        if (!best || n > best.n) best = { n, scale, spread };
        if (n >= Math.min(wantPairs, 3)) break;
      }
      const chosen = Array.from({ length: best.n }, (_, i) => best.spread[Math.floor((i * best.spread.length) / best.n)]);
      floaters.forEach((f, i) => {
        const p = chosen[i >> 1];
        if (!p) { f.el.style.display = 'none'; return; }
        const at = f.right ? p.r : p.l, size = Math.round(f.size * best.scale);
        // (back on its own layer, if the phone layout had moved it under the card)
        const layer = document.querySelector(f.front ? '.floaters-front' : '.floaters-back');
        if (f.el.parentElement !== layer) layer.append(f.el);
        f.el.style.display = '';
        f.el.style.setProperty('--size', size + 'px');
        f.x = (at.x / sw) * 100; f.y = (at.y / sh) * 100;
        f.el.style.left = `calc(${f.x}% - ${(size + 12) / 2}px)`;
        f.el.style.top = `calc(${f.y}% - ${(size + 28) / 2}px)`;
        // How far the pointer may push it before it would leave the screen or slip under the header
        f.room = { l: at.x - halfW(size) - 8, r: sw - 8 - (at.x + halfW(size)), t: at.y - halfH(size) - top, b: sh - 8 - (at.y + halfH(size)) };
      });
    }

    // Sample photos that can't load (offline, or the photo service is slow) become small painted scenes:
    // a sky, a low sun or string lights, and hills, in the site's colours, instead of grey squares
    const SCENES = [
      ['#F6C9A8', '#E7A3B5', '#FFE9B8', '#8E7CC3', '#5E5296'], ['#BFD9F2', '#E9D5F2', '#FFF4D6', '#7FA9A3', '#4F7C76'],
      ['#2E2A4F', '#6B4E8F', '#FFD58A', '#3C3463', '#221F3A'], ['#FBD9C5', '#F2B5A0', '#FFF1DC', '#C77D8E', '#8E5468'],
      ['#CFE6E2', '#F4E3EC', '#FFFFFF', '#9CC5BC', '#6F9896'], ['#3B2F5C', '#C2668F', '#FFC38A', '#4B3A70', '#2A2142'],
    ];
    function scene(n) {
      const [s1, s2, sun, h1, h2] = SCENES[n % SCENES.length], night = n % SCENES.length === 2 || n % SCENES.length === 5;
      const sx = 60 + (n * 47) % 120, sy = 70 + (n * 29) % 50;
      const lights = night ? Array.from({ length: 9 }, (_, i) => `<circle cx="${14 + i * 27}" cy="${38 + Math.sin(i * .9 + n) * 10}" r="3.2" fill="#FFE3A0" opacity=".95"/>`).join('') + '<path d="M0 34 Q60 58 120 40 T240 40" stroke="#FFE3A0" stroke-opacity=".35" fill="none"/>' : '';
      const confetti = !night && n % 3 === 0 ? Array.from({ length: 14 }, (_, i) => `<rect x="${(i * 37 + n * 13) % 230}" y="${(i * 53 + n * 7) % 130}" width="5" height="9" rx="1.5" fill="${['#FFFFFF', '#E0476B', '#8E7CC3', '#FFD58A'][i % 4]}" opacity=".8" transform="rotate(${(i * 41) % 90} ${(i * 37 + n * 13) % 230} ${(i * 53 + n * 7) % 130})"/>`).join('') : '';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s1}"/><stop offset="1" stop-color="${s2}"/></linearGradient><radialGradient id="g"><stop offset="0" stop-color="${sun}"/><stop offset="1" stop-color="${sun}" stop-opacity="0"/></radialGradient></defs><rect width="240" height="240" fill="url(#s)"/><circle cx="${sx}" cy="${sy}" r="70" fill="url(#g)" opacity=".7"/><circle cx="${sx}" cy="${sy}" r="${night ? 16 : 24}" fill="${sun}"/>${lights}${confetti}<path d="M0 ${170 - n % 4 * 6} C60 ${140 + n % 3 * 8} 120 ${190 - n % 5 * 4} 240 ${150 + n % 4 * 6} V240 H0Z" fill="${h1}"/><path d="M0 ${205 - n % 3 * 5} C80 ${180 + n % 4 * 5} 150 ${220 - n % 3 * 6} 240 ${195} V240 H0Z" fill="${h2}"/></svg>`;
      return 'data:image/svg+xml,' + encodeURIComponent(svg);
    }
    document.addEventListener('error', (e) => {
      const img = e.target;
      if (img?.tagName !== 'IMG' || img.dataset.scene || !/picsum\.photos|assets\/photos\//.test(img.src)) return;
      img.dataset.scene = '1';
      img.src = scene([...img.src].reduce((t, c) => t + c.charCodeAt(0), 0));
    }, true);
    // (and if a print's photo still hasn't arrived after a few seconds, it gets its scene too)
    setTimeout(() => floaters.forEach((f) => { const img = f.el.querySelector('img'); if (!img.naturalWidth && !img.dataset.scene) { img.dataset.scene = '1'; img.src = scene(f.p + 3); } }), 4000);

    // The QR card's live count: photos keep arriving at the demo event, every few seconds
    (() => {
      const out = document.getElementById('qrLiveN');
      if (!out) return;
      let n = 248;
      const tick = () => {
        if (!document.hidden && !document.getElementById('qrCard').classList.contains('is-gone')) {
          n += 1 + Math.floor(Math.random() * 3);
          out.textContent = n;
          if (!still) out.animate?.([{ transform: 'translateY(4px)', opacity: .2 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.22, 1, .36, 1)' });
        }
        setTimeout(tick, 2600 + Math.random() * 2600);
      };
      setTimeout(tick, 2400);
    })();

    let W = 0;
    function measure() {
      W = album.offsetWidth;
      layoutFloaters();
      for (const f of floaters) { f.cx = f.el.offsetLeft + f.el.offsetWidth / 2; f.cy = f.el.offsetTop + f.el.offsetHeight / 2; }
    }
    // Phones: the headline and the QR card are stacked, so the pair is centred in the space under the header
    // (Also run before the first paint by FIT_HERO in src/components/home/Hero.tsx: keep the two in step)
    function fitHero() {
      if (innerWidth > 600) { ['--hero-top', '--qr-top', '--qr-ty'].forEach((p) => stage.style.removeProperty(p)); return; }
      const card = document.getElementById('qrCard');
      // The header's layout box, not where it is drawn: measured while the header was still easing in on its entrance, the
      // hero was placed by wherever the header happened to be at that moment (up to ~20px lower, then never put back)
      const header = document.getElementById('header'), head = header.offsetTop + header.offsetHeight + 8;
      const h1 = heroLeft.offsetHeight, h2 = card.offsetHeight, gap = 28;
      const avail = stage.clientHeight - head - 16;
      const start = head + Math.max(0, (avail - (h1 + gap + h2)) / 2);
      stage.style.setProperty('--hero-top', `${start}px`);
      if (h1 + gap + h2 <= avail) { stage.style.setProperty('--qr-top', `${start + h1 + gap}px`); stage.style.setProperty('--qr-ty', '0%'); }
      else { stage.style.removeProperty('--qr-top'); stage.style.removeProperty('--qr-ty'); }
    }
    const relayout = () => { fitHero(); measure(); };
    relayout();
    addEventListener('resize', relayout);
    document.fonts?.ready.then(relayout);
    addEventListener('load', relayout);

    // Signed in: the prints show photos from your own albums
    document.addEventListener('DOMContentLoaded', async () => {
      // Signing out (or never having signed in) forgets the saved photos
      const forget = () => { try { sessionStorage.removeItem(HERO_KEY); } catch (e) {} };
      window.Momento?.account?.onChange((u) => { if (!u) forget(); });
      try {
        const user = await window.Momento?.sessionReady;
        if (!user?.emailVerified) { forget(); return; }
        const { albums = [], recent = [] } = await momentoApi('/api/albums');
        const pics = [...new Set([...recent.map((r) => r.url), ...albums.flatMap((a) => a.pics || [])].filter(Boolean))];
        fillYourSpread({ albums, recent });
        if (!pics.length) return;
        try { sessionStorage.setItem(HERO_KEY, JSON.stringify(pics.slice(0, 12))); } catch (e) {}
        floaters.forEach((f, i) => {
          const img = f.el.querySelector('img'), next = new Image();
          if (img.getAttribute('src') === pics[i % pics.length]) return;   // already showing it, from earlier in this tab
          next.onload = () => {
            img.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).finished.then(() => {
              img.src = next.src;
              img.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 380, fill: 'forwards' });
            });
          };
          next.src = pics[i % pics.length];
        });
      } catch (err) { /* sample photos stay */ }
    });

    // Timeline
    const turnStart = (k) => T.hero + T.intro + k * (T.turn + T.hold);
    // The top section is always one screen tall, so scrolling goes straight on to How it
    // works. The book is not tied to scroll: it plays on its own playhead (in screen heights),
    // opens once after the code is scanned, then floats in place and turns pages on request
    story.style.height = '100vh';
    const rest = (i) => turnStart(i) + T.turn + 0.05;
    const book = { s: 0, goal: 0 };
    let bookTween = 0, spread = 0;
    function bookTo(s, ms = 1400) {
      cancelAnimationFrame(bookTween);
      book.goal = s;
      if (still) { book.s = s; return; }
      const from = book.s, start = performance.now();
      const step = (now) => {
        const p = clamp01((now - start) / ms);
        book.s = from + (s - from) * Math.sin((Math.PI / 2) * p);
        if (p < 1) bookTween = requestAnimationFrame(step);
      };
      bookTween = requestAnimationFrame(step);
    }

    // Scanning: the beam races, the corners close in, "Album found", then the card gives
    // way to the album, which pops out and (unless the visitor is already scrolling) the
    // page glides on so it flips open onto its first photos
    const qrCard = document.getElementById('qrCard');
    let scanState = 'idle', popAt = 0;
    // "Album found" is followed straight by the album. Signing in comes later, on its last page
    const wait = (ms) => (still ? 0 : ms);
    function scan() {
      if (scanState !== 'idle') return;
      scanState = 'scanning';
      qrCard.classList.add('is-scanning');
      setTimeout(() => {
        qrCard.classList.add('is-found');
        setTimeout(revealAlbum, wait(700));
      }, wait(1100));
    }
    function revealAlbum() {
      qrCard.classList.add('is-gone');
      album.style.visibility = 'visible';
      popAt = performance.now();
      scanState = 'done';
      // The code has done its job: from here a click on the closed book opens it again
      lastAction = popAt;
      spread = 0; syncArrows();
      setTimeout(() => bookTo(rest(0), 3000), wait(750));
    }
    // The book closes itself after a quiet spell, or as soon as the page is scrolled away from
    // it, and is then waiting in its first position. Opening it again skips the scan
    const IDLE_MS = 20000;
    let lastAction = 0;
    const touched = () => { lastAction = performance.now(); };
    for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) addEventListener(type, touched, { passive: true });
    // Closing plays the pages back and swings the cover shut. Leaving the page uses a quicker
    // version of the same motion, longer when the book is open further in
    function closeBook(instant, ms = 2400) {
      const from = spread;
      spread = 0; syncArrows();
      if (instant || still) { cancelAnimationFrame(bookTween); book.s = book.goal = 0; screens = 0; }
      else bookTo(0, ms + from * 180);
    }
    function reopenBook() {
      lastAction = performance.now();
      spread = 0; syncArrows();
      bookTo(rest(0), 3000);
    }
    // Back to the start (the logo): the book closes and the QR code returns, ready to scan again
    let resetting = false;
    window.resetHome = () => {
      if (scanState !== 'done' || resetting) return;
      resetting = true;
      closeBook(false, 900);
      const swap = () => {
        // Wait for the cover to shut, then the book goes and the card comes back in its place
        if (!still && (book.s > .02 || screens > .02)) { requestAnimationFrame(swap); return; }
        album.style.visibility = 'hidden';
        popAt = 0; scanState = 'idle'; syncArrows();
        stage.classList.remove('is-reading');
        qrCard.classList.remove('is-gone', 'is-found', 'is-scanning');
        resetting = false;
      };
      requestAnimationFrame(swap);
    };
    qrCard.addEventListener('click', scan);
    document.querySelector('.hero-cta [data-go]')?.addEventListener('click', (e) => {
      const item = document.querySelector(`.menu-item[href="${e.currentTarget.dataset.go}"]`);
      if (item) { e.preventDefault(); item.click(); }
    });

    // Arrows, arrow keys, a swipe or a click on a page turn between spreads; the page itself
    // keeps scrolling normally
    const arrowBtns = [...document.querySelectorAll('.page-arrows .pa')];
    function syncArrows() {
      for (const b of arrowBtns) b.disabled = scanState !== 'done' || spread + Number(b.dataset.dir) < 0 || spread + Number(b.dataset.dir) >= n;
    }
    function goSpread(i) {
      i = Math.min(Math.max(i, 0), n - 1);
      if (i === spread) return;
      spread = i; syncArrows();
      bookTo(rest(i), 1400);
    }
    syncArrows();
    // The code on the card is a real one for hexarch.org/?book: a phone that scans it lands here with the book
    // already open (once the intro has played, if it's playing). The address is tidied so a refresh is normal
    if (new URLSearchParams(location.search).has('book')) {
      const u = new URL(location.href);
      u.searchParams.delete('book');
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
      const open = () => { if (scanState === 'idle') revealAlbum(); };
      if (document.documentElement.classList.contains('intro-on')) document.addEventListener('momento:intro-end', open, { once: true });
      else open();
    }
    document.querySelector('.page-arrows').addEventListener('click', (e) => {
      const b = e.target.closest('.pa');
      if (b) goSpread(spread + Number(b.dataset.dir));
    });
    const bookOnScreen = () => scrollY < innerHeight * .8;
    addEventListener('keydown', (e) => {
      if (!stage.classList.contains('is-reading') || !bookOnScreen() || e.target.closest('input, textarea, dialog')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); goSpread(spread + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goSpread(spread - 1); }
    });
    // A sideways swipe across the open book turns the page
    let swipe = null;
    stage.addEventListener('pointerdown', (e) => {
      swipe = e.pointerType !== 'mouse' && stage.classList.contains('is-reading') && !e.target.closest('button, a') ? { x: e.clientX, y: e.clientY } : null;
    });
    stage.addEventListener('pointerup', (e) => {
      if (!swipe) return;
      const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
      swipe = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) goSpread(spread + (dx < 0 ? 1 : -1));
    });
    stage.addEventListener('pointercancel', () => { swipe = null; });

    // ---- Things to do inside the open book ----
    // Hit-testing in 3D is unreliable, so clicks and hovers are matched to boxes instead, and only on the two
    // pages on show (the hidden ones still have boxes). Buttons first, then prints; a click anywhere else on
    // the open book turns the page toward the side that was clicked.
    const shownFaces = () => (stage.classList.contains('is-reading') && activeSpread >= 0 ? spreadFaces[activeSpread] : []);
    const inBox = (el, x, y, m = 0) => { const r = el.getBoundingClientRect(); return r.width > 0 && x >= r.left - m && x <= r.right + m && y >= r.top - m && y <= r.bottom + m; };
    // `give`: extra room around the element that is already hovered, so a button that bobs or tilts under a steady
    // cursor (or rises when hovered) doesn't drop the hover at its edge
    function hitAt(x, y, sel, give = 0) {
      let hit = null;   // (the last match is the one drawn on top)
      for (const face of shownFaces()) for (const el of face.querySelectorAll(sel)) if (inBox(el, x, y, el === hoverEl ? give : 0)) hit = el;
      return hit;
    }
    const BTN = '.page-cta, .keep:not(.is-empty) .ks-btns .kb, .keep.is-empty .ks-done .kb';
    const PRINT = '[data-flip]:not(.is-pending)';
    const pick = (x, y, give = 0) => hitAt(x, y, BTN, give) || hitAt(x, y, PRINT, give);

    // Only what's on the open spread can be tabbed to
    function syncFocusable() {
      const on = new Set(shownFaces());
      for (const el of album.querySelectorAll('[data-flip], .kb, .page-cta')) el.tabIndex = on.has(el.closest('.paper')) ? 0 : -1;
    }

    // Hover (mouse only): the print lifts, the button rises, and the pointer becomes a hand
    let hoverEl = null, hoverQueued = false, hx = 0, hy = 0;
    function setHover(el) {
      if (el === hoverEl) return;
      hoverEl?.classList.remove('is-hover');
      hoverEl = el;
      el?.classList.add('is-hover');
      stage.style.cursor = el ? 'pointer' : '';
    }
    // The book drifts and tilts toward the pointer, so what is under a steady cursor keeps changing: look again a few
    // times a second while the mouse is over it. Only this matching drives the hover look (the buttons have no CSS
    // :hover of their own, which flickers at their edge as they move)
    const HOVER_GIVE = 8;
    let mouseOver = false;
    const lookUnderMouse = () => setHover(drag ? null : pick(hx, hy, HOVER_GIVE));
    stage.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      hx = e.clientX; hy = e.clientY; mouseOver = true;
      if (hoverQueued) return;
      hoverQueued = true;
      requestAnimationFrame(() => { hoverQueued = false; lookUnderMouse(); });
    });
    stage.addEventListener('pointerleave', () => { mouseOver = false; setHover(null); });
    setInterval(() => { if (mouseOver && !document.hidden && stage.classList.contains('is-reading')) lookUnderMouse(); }, 120);

    // Turning a print over: it squeezes to its edge, swaps to the other side and springs back
    function flipPhoto(fig, to = !fig.classList.contains('is-flipped')) {
      if (fig._flipping || fig.classList.contains('is-flipped') === to) return Promise.resolve();
      fig.setAttribute('aria-pressed', String(to));
      const card = fig.querySelector('.photo-card');
      if (still || !card.animate) { fig.classList.toggle('is-flipped', to); return Promise.resolve(); }
      fig._flipping = true;
      const mid = 'translateY(-4%) scaleX(0) scaleY(1.05)';
      const squeeze = card.animate([{ transform: 'none' }, { transform: mid }], { duration: 170, easing: 'cubic-bezier(.55, 0, .8, .2)', fill: 'forwards' });
      return squeeze.finished.then(() => {
        fig.classList.toggle('is-flipped', to);
        const open = card.animate([{ transform: mid }, { transform: 'none' }], { duration: 480, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)' });
        squeeze.cancel();
        return open.finished;
      }).finally(() => { fig._flipping = false; });
    }

    function pressButton(btn) {
      if (btn.classList.contains('kb')) return sortTop(btn.dataset.act);
      const href = btn.dataset.href;
      // The sign-in window, worded for someone who has come to add photos to this album
      if (href === 'auth' || href === 'auth:signup') return window.openAuth?.({ mode: 'signup', fromScan: true });
      if (href === 'auth:login') return window.openAuth?.({ mode: 'login', fromScan: true });
      if (href.startsWith('#')) {
        const target = document.querySelector(href);
        if (target) scrollTo({ top: target.getBoundingClientRect().top + scrollY, behavior: still ? 'auto' : 'smooth' });
        return;
      }
      location.href = href;
    }

    album.addEventListener('click', (e) => {
      if (!stage.classList.contains('is-reading')) {
        // The pages' buttons only answer while the book is open; the closed book opens on a click
        if (scanState === 'done' && book.goal === 0 && book.s < .05) reopenBook();
        return;
      }
      if (performance.now() - dragEnded < 300) return;   // the end of a drag on the stack, not a click
      // A key press on a focused button arrives with no position: use what has focus
      const keyed = e.detail === 0 && e.target !== album;
      const btn = keyed ? e.target.closest(BTN) : hitAt(e.clientX, e.clientY, BTN);
      if (btn) { pressButton(btn); return; }
      if (keyed) return;
      const fig = hitAt(e.clientX, e.clientY, PRINT);
      if (fig) { flipPhoto(fig); return; }
      if (hitAt(e.clientX, e.clientY, '.ks-pile')) return;
      goSpread(spread + (e.clientX < innerWidth / 2 ? -1 : 1));
    });
    album.addEventListener('keydown', (e) => {
      const fig = e.target.closest?.('[data-flip]');
      if (fig && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); flipPhoto(fig); }
    });

    // Photos arriving: while the first spread is open, its empty spots fill one by one, each with a
    // short "+1 from ..." tag, the way photos land in a live album
    const arrivals = spreadFaces[0].flatMap((f) => [...f.querySelectorAll('.photo.arrive')]);
    let arriveTimer = 0, hinted = false;
    function land(fig) {
      fig.classList.remove('is-pending');
      fig.classList.add('is-landing');
      const card = fig.querySelector('.photo-card');
      card.animate([
        { transform: 'translate(14%, -18%) rotate(14deg) scale(1.35)', opacity: 0 },
        { opacity: 1, offset: .3 },
        { transform: 'none', opacity: 1 },
      ], { duration: 820, easing: 'cubic-bezier(0.34, 1.25, 0.64, 1)' }).finished.then(() => fig.classList.remove('is-landing'));
      fig.querySelector(':scope > figcaption')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 500, fill: 'backwards' });
      const chip = document.createElement('span');
      chip.className = 'arrive-chip';
      chip.textContent = `+1 from ${fig.dataset.by}`;
      fig.append(chip);
      chip.animate([{ opacity: 0, transform: 'translateY(40%) scale(.7)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 420, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', fill: 'forwards' })
        .finished.then(() => chip.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-30%)' }], { duration: 400, delay: 1600, fill: 'forwards' }).finished)
        .then(() => chip.remove(), () => chip.remove());
    }
    function arriveNext() {
      const fig = arrivals.find((f) => f.classList.contains('is-pending'));
      if (!fig) return;
      // (waits while the tab is hidden or the page is turned away, so none land unseen)
      if (!document.hidden && activeSpread === 0 && stage.classList.contains('is-reading')) land(fig);
      arriveTimer = setTimeout(arriveNext, 3200 + Math.random() * 1500);
    }
    function enterFirstSpread() {
      if (still) return;
      clearTimeout(arriveTimer);
      // The first time, one print turns itself over and back, to show that they can
      const first = !hinted;
      hinted = true;
      const demo = spreadFaces[0][0].querySelector('[data-flip]');
      if (first && demo) {
        setTimeout(() => {
          if (activeSpread !== 0) return;
          flipPhoto(demo, true).then(() => setTimeout(() => activeSpread === 0 && flipPhoto(demo, false), 1700));
        }, 1000);
      }
      arriveTimer = setTimeout(arriveNext, first ? 4400 : 1200);
    }
    function resetArrivals() {
      clearTimeout(arriveTimer);
      if (still) return;
      for (const fig of arrivals) {
        fig.getAnimations({ subtree: true }).forEach((a) => a.cancel());
        fig.querySelectorAll('.arrive-chip').forEach((c) => c.remove());
        fig.classList.remove('is-landing');
        fig.classList.add('is-pending');
      }
    }

    // Keep only the best: hide sends the top print off the page, keep sends it to the kept pile.
    // Buttons for a mouse or keyboard; on touch (or with a mouse) the top print can be dragged either way.
    const keepSpread = ALBUM.findIndex((s) => s.left.stack || s.right.stack);
    const keepEl = album.querySelector('.keep'), keptEl = album.querySelector('.ks-kept');
    const pileEl = keepEl?.querySelector('.ks-pile');
    const pileHTML = pileEl?.innerHTML;
    const tally = { kept: 0, hidden: 0 };
    let sorting = false, drag = null, dragEnded = 0;
    const topCard = () => pileEl?.querySelector('.ks-card:last-child');
    function syncKeep() {
      if (!keepEl) return;
      const left = pileEl.querySelectorAll('.ks-card').length;
      keepEl.querySelector('.ks-left').textContent = `${left} left`;
      keepEl.querySelector('.ks-sum').textContent = `${tally.kept} kept · ${tally.hidden} hidden`;
      keepEl.classList.toggle('is-empty', !left);
      keptEl.classList.toggle('has-some', tally.kept > 0);
    }
    // Where an element sits on its page, ignoring the book's 3D transforms
    const pagePos = (el) => { let x = 0, y = 0; for (let node = el; node && !node.classList.contains('collage'); node = node.offsetParent) { x += node.offsetLeft; y += node.offsetTop; } return { x, y }; };
    function sortTop(act, dx = 0) {
      if (act === 'again') { resetKeep(true); return; }
      const card = topCard();
      if (!card || sorting) return;
      sorting = true;
      const done = () => { sorting = false; syncKeep(); syncFocusable(); };
      if (act === 'hide') {
        tally.hidden++;
        if (still) { card.remove(); done(); return; }
        card.style.transition = 'none';
        card.animate([
          { transform: `translateX(${dx}px) rotate(${dx * .06}deg)`, opacity: 1 },
          { transform: `translateX(${Math.min(dx, 0) - card.offsetWidth * 1.4}px) rotate(-26deg)`, opacity: 0 },
        ], { duration: 460, easing: 'cubic-bezier(.45, 0, .75, .4)', fill: 'forwards' }).finished.then(() => { card.remove(); done(); });
        return;
      }
      tally.kept++;
      const k = keptEl.querySelectorAll('.photo').length;
      const small = card.cloneNode(true);
      small.classList.remove('ks-card');
      small.style.cssText = `top:${k * 6}cqw; --rot:${[5, -4, 3, -6][k % 4]}deg; --ratio:4/3`;
      keptEl.append(small);
      if (!still) {
        // Flies from where it was on the pile to its place on the kept pile
        const a = pagePos(card), b = pagePos(small), s = card.offsetWidth / small.offsetWidth;
        small.style.transformOrigin = '0 0';
        small.animate([
          { transform: `translate(${a.x - b.x + dx}px, ${a.y - b.y}px) scale(${s}) rotate(${dx * .06}deg)` },
          { transform: 'none' },
        ], { duration: 640, easing: 'cubic-bezier(0.34, 1.25, 0.64, 1)' });
      }
      card.remove();
      done();
    }
    function resetKeep(animate) {
      if (!keepEl) return;
      drag = null; sorting = false;
      tally.kept = tally.hidden = 0;
      pileEl.innerHTML = pileHTML;
      keptEl.querySelectorAll('.photo').forEach((p) => p.remove());
      syncKeep(); syncFocusable();
      if (animate && !still) pileEl.animate([{ opacity: 0, transform: 'translateY(6%) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 520, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)' });
    }
    syncKeep();
    stage.addEventListener('pointerdown', (e) => {
      const card = topCard();
      if (!card || sorting || e.button > 0 || !hitAt(e.clientX, e.clientY, '.ks-pile')) return;
      drag = { id: e.pointerId, x: e.clientX, dx: 0, card };
      swipe = null;   // a drag on the pile is not a page swipe
      card.style.transition = 'none';
      setHover(null);
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag.dx = e.clientX - drag.x;
      drag.card.style.transform = `translateX(${drag.dx}px) rotate(${drag.dx * .06}deg)`;
    });
    const endDrag = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { card, dx } = drag;
      drag = null;
      if (Math.abs(dx) > 6) dragEnded = performance.now();
      card.style.transition = '';
      card.style.transform = '';
      if (e.type === 'pointerup' && Math.abs(dx) > 40) sortTop(dx > 0 ? 'keep' : 'hide', dx);
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    // Each spread starts fresh: once a spread is turned away (and out of sight), its prints turn
    // back over, the arrivals go back to waiting and the stack is put back together
    const leaveTimers = {};
    function resetSpread(i) {
      spreadFaces[i].forEach((f) => f.querySelectorAll('.is-flipped').forEach((x) => { x.classList.remove('is-flipped'); x.setAttribute('aria-pressed', 'false'); }));
      if (i === 0) resetArrivals();
      if (i === keepSpread) resetKeep(false);
    }
    // Reaching the last page signed out opens the sign-in window after a moment, once per visit. Turning away first cancels it
    let signInTimer = 0, signInAsked = false;
    async function askToSignIn() {
      const M = window.Momento;
      if (signInAsked || activeSpread !== n - 1) return;
      try { await M.sessionReady; } catch (err) { /* treated as signed out */ }
      if (signInAsked || activeSpread !== n - 1 || M.account?.get?.() || document.querySelector('dialog[open]')) return;
      signInAsked = true;
      window.openAuth?.({ mode: 'login', fromScan: true });
    }
    function spreadChanged(prev, s) {
      clearTimeout(signInTimer);
      if (s === n - 1 && !signInAsked) signInTimer = setTimeout(askToSignIn, wait(1000));
      setHover(null);
      syncFocusable();
      if (prev >= 0) {
        clearTimeout(leaveTimers[prev]);
        leaveTimers[prev] = setTimeout(() => { if (activeSpread !== prev) resetSpread(prev); }, 1500);
      }
      if (s >= 0) clearTimeout(leaveTimers[s]);
      if (s === 0) enterFirstSpread();
    }

    // Your album at the back: signed in, the last spread shows your newest album and its photos
    // (called with the albums the floating prints already fetch, at the end of this script)
    function fillYourSpread({ albums = [], recent = [] }) {
      const pick = albums.find((a) => a.id === recent[0]?.albumId) || albums.find((a) => a.pics?.length) || albums[0];
      if (!pick) return;
      const when = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, '').toLowerCase(); };
      let shots = recent.filter((r) => r.url && r.albumId === pick.id);
      if (!shots.length) shots = (pick.pics || []).filter(Boolean).map((url) => ({ url }));
      const fill = (ph) => {
        const r = shots.shift();
        if (!r) return ph;   // (fewer photos than spaces: the rest stay empty)
        return { ...ph, slot: false, src: r.url, by: r.by || 'someone', at: when(r.at), note: pick.name,
                 caption: ph.mount !== 'polaroid' || !r.by ? '' : r.by === 'You' ? 'one of yours' : `from ${r.by}` };
      };
      const last = ALBUM[n - 1];
      const count = Number.isFinite(pick.photos) ? pick.photos : shots.length;
      const left = { ...last.left, no: '05', title: pick.name || 'Your album',
                     body: `${count} photo${count === 1 ? '' : 's'} so far, from everyone who was there. Every new one lands right here.`,
                     button: 'Open album', href: `albums#album=${encodeURIComponent(pick.id)}`, button2: '', href2: '',
                     photos: last.left.photos.map(fill) };
      const right = { ...last.right, photos: last.right.photos.map(fill) };
      [left, right].forEach((page, i) => {
        const face = spreadFaces[n - 1][i];
        face.querySelectorAll(':scope > .collage, :scope > .page').forEach((el) => el.remove());
        face.insertAdjacentHTML('afterbegin', pageHTML(page));
      });
      syncFocusable();
    }

    // Per-frame album update, called from the shared loop below
    let screens = 0, activeSpread = -1;
    const tilt = { x: 0, y: 0 };
    // Writes a style only when its value really changed (a no-op write still costs a restyle)
    const setIf = (el, prop, v) => { const c = el._sv || (el._sv = {}); if (c[prop] !== v) { c[prop] = v; if (prop.startsWith('--')) el.style.setProperty(prop, v); else el.style[prop] = v; } };
    window.updateAlbum = (dt, now, sy = scrollY) => {
      const k = (rate) => (still ? 1 : 1 - Math.exp(-dt * rate));
      screens += (book.s - screens) * k(8);
      tilt.x += (pointer.nx - tilt.x) * k(4);
      tilt.y += (pointer.ny - tilt.y) * k(4);
      // Closed again once the page is scrolled away from it (quietly, while it's off screen),
      // or after a quiet spell (with the cover swinging shut)
      if (popAt) {
        // Starts closing the moment you begin to leave, so it shuts as it rides up with the page.
        // Only if it is still open once it is well off screen does it finish at once, unseen
        if (book.goal > 0 && sy > innerHeight * .15) closeBook(false, 1300);
        else if (book.s > .01 && sy > innerHeight * 1.1) closeBook(true);
        else if (book.goal > 0 && now - lastAction > IDLE_MS) closeBook(false);
      }
      // Scrolled off the top section: nothing to draw
      if (sy > innerHeight * 1.2) return;

      // The album only opens once it has been scanned
      const opened = popAt > 0;
      const intro = opened ? ease(clamp01((screens - T.hero) / T.intro)) : 0;
      const turns = ALBUM.map((_, i) => (opened ? ease(clamp01((screens - turnStart(i)) / T.turn)) : 0));
      const open = turns[0];
      const time = now / 1000;
      const motion = still ? 0 : 1;

      setIf(heroLeft, 'opacity', String(1 - intro));
      setIf(heroLeft, 'translate', `0 ${(-intro * 30).toFixed(1)}px`);
      setIf(heroLeft, 'pointerEvents', intro > .5 ? 'none' : '');

      // Tilted and floating right of centre in the hero; square and centred once open
      const hero = 1 - intro;
      // Once open the book keeps floating, just more quietly than the closed one
      const float = lerp(1, .25, intro);
      const bob = Math.sin(time * 2 * Math.PI / 6) * lerp(12, 6, intro) * motion;
      const rxA = lerp(lerp(12, 6, intro), 0, open) - tilt.y * 14 * float * motion;
      const ryA = lerp(-22, 0, intro) + tilt.x * 22 * float * motion;
      const rzA = lerp(-7, 0, intro);
      // Pops out of the scanned code with a little overshoot
      const pp = popAt ? (still ? 1 : clamp01((now - popAt) / 900)) : 0;
      const pop = 1 + 2.4 * Math.pow(pp - 1, 3) + 1.4 * Math.pow(pp - 1, 2);
      const sc = lerp(.86, 1, intro) * lerp(.3, 1, pop);
      const cx = (W / 2) * (1 - open);
      // (capped, so the card stays next to the headline on very wide screens)
      const shift = vw > 900 ? Math.min(vw * .18, 360) * hero : 0;
      if (opened) {
        album.style.transformOrigin = `${cx}px 50%`;
        album.style.transform = `translate3d(${shift - cx}px, ${bob + (1 - pop) * 40}px, 0) rotateX(${rxA}deg) rotateY(${ryA}deg) rotateZ(${rzA}deg) scale(${sc})`;
      }

      // The QR card sits where the album will appear, leaning gently toward the pointer
      if (scanState !== 'done' || pp < 1) {
        setIf(qrCard, '--shift', `${shift.toFixed(1)}px`);
        setIf(qrCard, '--bob', `${(bob * .6).toFixed(2)}px`);
        setIf(qrCard, '--trx', `${(-tilt.y * 10 * motion).toFixed(2)}deg`);
        setIf(qrCard, '--try', `${(tilt.x * 14 * motion).toFixed(2)}deg`);
      }

      if (opened) {
        // The page block and board edge only read while closed and tilted
        const side = Math.max(0, 1 - open * 1.4).toFixed(3);
        edge.style.opacity = side; thick.style.opacity = side;

        leaves.forEach((leaf, i) => {
          const a = turns[i] * 180;
          leaf.style.transform = `rotateY(${-a}deg) translateZ(${-i * STEP}px)`;
          leaf.style.setProperty('--shade-front', (Math.min(a, 90) / 90 * .9).toFixed(3));
          leaf.style.setProperty('--shade-back', (Math.min(180 - a, 90) / 90 * .9).toFixed(3));
        });

        let s = -1;
        for (let i = 0; i < n; i++) if (turns[i] > .8) s = i;
        if (s !== activeSpread) {
          spreadFaces.forEach((faces, i) => faces.forEach((f) => f.classList.toggle('is-read', i === s)));
          const prev = activeSpread;
          activeSpread = s;
          if (s >= 0) pageCount.textContent = `${s + 1} of ${n}`;
          spreadChanged(prev, s);
        }
        const reading = open > .95;
        if (reading !== stage.classList.contains('is-reading')) {
          stage.classList.toggle('is-reading', reading);
          if (!reading) setHover(null);
          syncFocusable();
        }
      }

      for (const f of floaters) {
        const dx = f.cx - pointer.x, dy = f.cy - pointer.y;
        const dist = Math.hypot(dx, dy) || 1;
        const force = Math.max(0, 1 - dist / 280) * 70 * motion;
        f.rx += ((dx / dist) * force - f.rx) * k(6);
        f.ry += ((dy / dist) * force - f.ry) * k(6);
        const scatterX = (f.x - 50) * .01 * vw * intro * .6;
        const scatterY = (f.y - 50) * .01 * vh * intro * .6;
        const px = tilt.x * 40 * f.depth * motion, py = tilt.y * 40 * f.depth * motion;
        // The gentle bob is a CSS animation (run by the graphics card); this only follows the pointer,
        // and is skipped while nothing has moved
        const mx = Math.min(Math.max(f.rx + px, -f.room.l), f.room.r), my = Math.min(Math.max(f.ry + py, -f.room.t), f.room.b);
        setIf(f.el, 'transform', `translate(${(mx + scatterX).toFixed(1)}px, ${(my + scatterY).toFixed(1)}px) rotate(${f.rot}deg)`);
        setIf(f.el, 'opacity', String(1 - intro));
      }
    };

  // ======== from home-3.js ========
    // ---- Nav: Home goes to the top; the arrow beside it (or hovering) opens this page's sections ----
    (() => {
      const header = document.getElementById('header');
      const wrap = document.getElementById('navWrap');
      const split = wrap.querySelector('.nav-split');
      const home = wrap.querySelector('.nav-home');
      const caret = wrap.querySelector('.nav-caret');
      const menu = document.getElementById('navMenu');
      const pill = menu.querySelector('.menu-pill');
      const items = [...menu.querySelectorAll('.menu-item')];
      let active = null, open = false, closeTimer;

      function place(item) {
        pill.style.opacity = 1;
        pill.style.height = `${item.offsetHeight}px`;
        pill.style.translate = `0 ${item.offsetTop}px`;
      }
      // null means the top of the page, where no section is marked
      function select(item) {
        if (item === active) return;
        active?.classList.remove('active');
        active = item;
        if (item) { item.classList.add('active'); place(item); }
        else pill.style.opacity = 0;
      }
      function setOpen(v) {
        clearTimeout(closeTimer);
        if (v === open) return;
        open = v;
        menu.classList.toggle('is-open', v);
        caret.setAttribute('aria-expanded', v);
        if (v && active) place(active);
      }
      const sectionOf = (item) => document.querySelector(item.getAttribute('href'));
      let lock = 0;
      window.updateNav = () => {
        header.classList.toggle('is-veiled', document.getElementById('how-it-works').getBoundingClientRect().top < 90 || (innerWidth <= 900 && scrollY > 40));
        if (performance.now() < lock) return;
        let current = null;
        for (const item of items) if (sectionOf(item).getBoundingClientRect().top <= innerHeight * .4) current = item;
        select(current);
      };
      const sectionTop = (item) => {
        const section = sectionOf(item);
        return section.getBoundingClientRect().top + scrollY - 90;
      };
      function go(item) {
        select(item);
        lock = performance.now() + 1500;
        scrollTo({ top: item ? sectionTop(item) : 0, behavior: still ? 'auto' : 'smooth' });
      }

      home.addEventListener('click', (e) => { e.preventDefault(); setOpen(false); go(null); });
      document.querySelector('.brand').addEventListener('click', (e) => { e.preventDefault(); go(null); window.resetHome?.(); });
      // A click just after hovering opened it keeps it open (instead of closing it straight away)
      caret.addEventListener('click', () => { if (open && performance.now() - (caret._hoverAt || 0) < 500) return; setOpen(!open); });
      // With a mouse, hovering Home or the list opens it; it waits a moment before closing
      if (finePointer) for (const zone of [split, menu]) {
        zone.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { if (!open) caret._hoverAt = performance.now(); setOpen(true); } });
        zone.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !drag?.on) closeTimer = setTimeout(() => setOpen(false), 260); });
      }
      document.addEventListener('pointerdown', (e) => { if (open && !wrap.contains(e.target)) setOpen(false); });
      addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { setOpen(false); caret.focus(); } });

      // ---- Hold and drag down the list: the pill follows and the page glides to each section.
      // A mouse drags straight away; a finger holds briefly first.
      const nearest = (y) => items.reduce((best, i) =>
        Math.abs(i.offsetTop + i.offsetHeight / 2 - y) < Math.abs(best.offsetTop + best.offsetHeight / 2 - y) ? i : best);
      let drag = null, swallowClick = false;
      function startDrag() {
        if (!drag || drag.on) return;
        drag.on = true;
        menu.classList.add('is-dragging');
        try { menu.setPointerCapture(drag.id); } catch {}
        lock = Infinity;
        followPointer(drag.lastY);
      }
      function followPointer(clientY) {
        const y = clientY - menu.getBoundingClientRect().top;
        const target = nearest(y);
        const first = items[0], last = items[items.length - 1], h = target.offsetHeight;
        pill.style.opacity = 1;
        pill.style.height = `${h}px`;
        pill.style.translate = `0 ${Math.min(Math.max(y - h / 2, first.offsetTop), last.offsetTop + last.offsetHeight - h)}px`;
        if (target !== drag.target) {
          drag.target = target;
          items.forEach((i) => i.classList.toggle('active', i === target));
          scrollTo({ top: sectionTop(target), behavior: still ? 'auto' : 'smooth' });
        }
      }
      menu.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || !e.target.closest('.menu-item')) return;
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, lastY: e.clientY, mouse: e.pointerType === 'mouse', on: false, target: active };
        if (!drag.mouse) drag.timer = setTimeout(startDrag, 260);
      });
      menu.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        drag.lastY = e.clientY;
        if (!drag.on) {
          const dx = Math.abs(e.clientX - drag.x), dy = Math.abs(e.clientY - drag.y);
          if (drag.mouse && dy > 5) startDrag();
          else if (!drag.mouse && (dx > 8 || dy > 8)) { clearTimeout(drag.timer); drag = null; }
          if (!drag?.on) return;
        }
        followPointer(e.clientY);
      });
      function endDrag() {
        if (!drag) return;
        clearTimeout(drag.timer);
        if (drag.on) {
          const target = drag.target;
          menu.classList.remove('is-dragging');
          // Only the click that ends this drag is ignored, never a later one
          swallowClick = true;
          setTimeout(() => { swallowClick = false; }, 0);
          active = null;
          select(target);
          lock = performance.now() + 1200;
          setTimeout(() => setOpen(false), 350);
        }
        drag = null;
      }
      menu.addEventListener('pointerup', endDrag);
      menu.addEventListener('pointercancel', endDrag);
      menu.addEventListener('dragstart', (e) => e.preventDefault());
      menu.addEventListener('touchmove', (e) => { if (drag?.on) e.preventDefault(); }, { passive: false });
      menu.addEventListener('contextmenu', (e) => { if (drag) e.preventDefault(); });

      menu.addEventListener('click', async (e) => {
        const item = e.target.closest('.menu-item');
        if (!item) return;
        e.preventDefault();
        if (swallowClick) { swallowClick = false; return; }
        go(item);
        setOpen(false);
      });
      const snap = () => { const a = active; active = undefined; select(a); };
      addEventListener('resize', snap);
      document.fonts.ready.then(snap);
      pill.style.opacity = 0;
      // Arriving from another page with a section in the address (e.g. #faq)
      const fromHash = items.find((i) => i.getAttribute('href') === location.hash);
      if (fromHash) addEventListener('load', () => setTimeout(() => go(fromHash), 60));
    })();

    // (Sign up / log in and the email-link popups: src/components/home/AuthDialog.tsx + authLogic.ts)

    // ---- Sections: rise-in, steps, zone slider, switches, FAQ, counters ----
    (() => {
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      }, { threshold: .12 });
      document.querySelectorAll('.rise-in').forEach((el) => io.observe(el));


      const qas = [...document.querySelectorAll('.qa')];
      for (const qa of qas) qa.querySelector('button').addEventListener('click', () => {
        const opening = !qa.classList.contains('is-open');
        for (const other of qas) {
          other.classList.toggle('is-open', other === qa && opening);
          other.querySelector('button').setAttribute('aria-expanded', other === qa && opening);
        }
      });

      // Full quality: the range sets --x (and the divider's position); on first view a gentle sweep shows it can be dragged
      const qc = document.getElementById('qc');
      const qcRange = document.getElementById('qcRange');
      const setQc = (v) => { qc.style.setProperty('--x', v + '%'); qc.style.setProperty('--qx', (qc.clientWidth * v / 100) + 'px'); };
      let qcTouched = false;
      qcRange.addEventListener('input', () => { qcTouched = true; setQc(+qcRange.value); });
      addEventListener('resize', () => setQc(+qcRange.value));
      setQc(50);
      new IntersectionObserver((entries, obs) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        obs.disconnect();
        if (still) return;
        const start = performance.now() + 400, stops = [50, 30, 70, 50];
        const tick = (now) => {
          if (qcTouched) return;
          const p = Math.min(Math.max((now - start) / 2400, 0), 1), seg = Math.min(Math.floor(p * 3), 2), t = ease(p * 3 - seg);
          const v = lerp(stops[seg], stops[seg + 1], t);
          qcRange.value = v; setQc(v);
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, { threshold: .5 }).observe(qc);

      // How it works: autoplay lights the five cards up one after another (CSS runs the timer bar, this only
      // listens for its end). Hovering or focusing the row holds it, and once the visitor clicks a card or uses
      // the arrow keys it stops and they're in charge. Nothing here listens to the wheel, touch or swipe,
      // so the page always scrolls normally.
      const hiw = document.querySelector('.hiw');
      const row = hiw.querySelector('.hiw-steps');
      const cards = [...hiw.querySelectorAll('.hiw-card')];
      let current = -1;
      function setStep(i) {
        if (i === current) return;
        current = i;
        cards.forEach((c, k) => {
          c.classList.toggle('is-on', k === i); c.classList.toggle('is-done', k < i);
          const b = c.querySelector('button');
          if (k === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
        });
      }
      window.updateSteps = () => {};
      setStep(0);

      const reducedHiw = matchMedia('(prefers-reduced-motion: reduce)');
      let auto = !reducedHiw.matches;
      hiw.classList.toggle('is-auto', auto);
      const stopAuto = () => { if (auto) { auto = false; hiw.classList.remove('is-auto'); } };
      hiw.addEventListener('animationend', (e) => {
        if (e.animationName !== 'step-time' || !auto) return;
        setStep((current + 1) % cards.length);
      });
      // Held (timer paused) while the row is off screen, hovered or has focus
      let seen = false, over = false, focused = false;
      const syncHeld = () => hiw.classList.toggle('is-held', !seen || over || focused);
      syncHeld();
      new IntersectionObserver(([en]) => { seen = en.isIntersecting; syncHeld(); }, { threshold: .2 }).observe(row);
      if (matchMedia('(hover: hover)').matches) {
        row.addEventListener('pointerenter', () => { over = true; syncHeld(); });
        row.addEventListener('pointerleave', () => { over = false; syncHeld(); });
      }
      row.addEventListener('focusin', () => { focused = true; syncHeld(); });
      row.addEventListener('focusout', () => { focused = false; syncHeld(); });

      const go = (i) => { stopAuto(); setStep(Math.max(0, Math.min(cards.length - 1, i))); };
      row.addEventListener('click', (e) => {
        const b = e.target.closest('.hiw-btn');
        if (b) go(Number(b.dataset.i));
      });
      // Left and right arrows move between the cards (up and down are left alone, so the page still scrolls)
      row.addEventListener('keydown', (e) => {
        const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (d === undefined || !e.target.closest('.hiw-btn')) return;
        e.preventDefault();
        go(current + d);
        cards[current].querySelector('button').focus({ preventScroll: true });
      });

      // Features: the sharing-zone slider. 25 m at the left end to 1 km at the right.
      const map = document.getElementById('zoneMap');
      const range = document.getElementById('zoneR');
      const out = document.getElementById('zoneOut');
      const countIn = document.getElementById('zoneIn');
      const metres = (v) => Math.round((25 * Math.pow(40, v / 100)) / 5) * 5;
      const label = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);
      const radius = (v) => .12 + (v / 100) * .72;
      const GUESTS = [
        { v: 10, a: 40, p: 2 }, { v: 22, a: 200, p: 12 }, { v: 31, a: 120, p: 13 }, { v: 38, a: 300, p: 7 },
        { v: 52, a: 15, p: 4 }, { v: 63, a: 160, p: 1 }, { v: 74, a: 250, p: 9 }, { v: 86, a: 95, p: 5 }, { v: 96, a: 330, p: 11 },
      ];
      document.getElementById('zoneAll').textContent = GUESTS.length;
      const guests = GUESTS.map((g) => {
        const d = document.createElement('span');
        d.className = 'guest';
        d.style.backgroundImage = `url(${photo(g.p, 80)})`;
        d.innerHTML = '<small></small>';
        map.querySelector('.zone-guests').append(d);
        return { ...g, el: d, tag: d.firstChild };
      });
      function update() {
        const v = Number(range.value);
        // On a small map the outer guests' "… out" tags would run off its edge, so everything is
        // drawn a little closer to the middle there (the zone and the guests together)
        const half = map.clientWidth / 2 * (map.clientWidth < 380 ? .84 : 1);
        map.style.setProperty('--r', `${radius(v) * half}px`);
        range.style.setProperty('--fill', `${v}%`);
        out.textContent = label(metres(v));
        let count = 0;
        for (const g of guests) {
          const r = radius(g.v) * half, a = (g.a * Math.PI) / 180;
          g.el.style.setProperty('--gx', `${Math.cos(a) * r}px`);
          g.el.style.setProperty('--gy', `${Math.sin(a) * r}px`);
          const inside = g.v <= v;
          g.el.classList.toggle('is-in', inside);
          if (inside) count++; else g.tag.textContent = `${label(metres(g.v) - metres(v))} out`;
        }
        countIn.textContent = count;
      }
      range.addEventListener('input', update);
      addEventListener('resize', update);
      update();
    })();

    // ---- Growing lines: the rules under titles draw themselves as they scroll into view ----
    (() => {
      const grows = [...document.querySelectorAll('.grow, .divider-line')];
      // Read phase, then write phase: the loop measures every element before changing any
      const tops = [];
      window.measureLines = () => { grows.forEach((g, i) => { tops[i] = g.getBoundingClientRect().top; }); };
      window.updateLines = () => {
        grows.forEach((g, i) => {
          // Only when it changes: most of the time a line is fully grown (or not started) and stays put
          const t = `scaleX(${easeOut(clamp01((innerHeight * .95 - tops[i]) / (innerHeight * .5))).toFixed(3)})`;
          if (g._t !== t) { g._t = t; g.style.transform = t; }
        });
      };
    })();

    // ---- Depth on scroll: pictures lean back as they rise, stand up mid-screen, and stretch
    // and bend with the speed of the scroll, while the photo inside drifts and zooms ----
    (() => {
      const targets = [...document.querySelectorAll('.qc, .zone-map')];
      const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
      let y = scrollY, v = 0, lastKey = '', pending = null;
      // Read phase: every rect is measured before anything is written this frame
      window.measureWarp = (dt) => {
        pending = null;
        if (still || LOW_POWER || !dt) return;
        v = lerp(v, (scrollY - y) / dt, 1 - Math.exp(-dt * 10));
        y = scrollY;
        const s = clamp(v / 2000, -1, 1);
        const key = `${scrollY}|${s.toFixed(3)}`;
        if (key === lastKey) return;   // nothing has moved since the last frame
        lastKey = key;
        const place = (el) => {
          const r = el.getBoundingClientRect();
          return r.bottom < -100 || r.top > innerHeight + 100 ? null : clamp((r.top + r.height / 2) / innerHeight * 2 - 1, -1, 1);
        };
        pending = { s, t: targets.map(place) };
      };
      // Write phase
      window.updateWarp = () => {
        if (!pending) return;
        const { s, t } = pending, a = Math.abs(s);
        pending = null;
        targets.forEach((el, k) => {
          if (t[k] === null) return;
          el.style.transform = `perspective(1200px) rotateX(${(t[k] * 7 + s * 12).toFixed(2)}deg) skewY(${(s * 2.5).toFixed(2)}deg) scale(${(1 - a * .04).toFixed(4)}, ${(1 + a * .06).toFixed(4)})`;
        });
      };
    })();

    // ---- Pause looping animations that are off screen ----
    (() => {
      const idle = new IntersectionObserver((entries) => {
        for (const e of entries) e.target.classList.toggle('is-idle', !e.isIntersecting);
      }, { rootMargin: '120px 0px' });
      document.querySelectorAll('.qr-card, .zone-map, .hiw-art').forEach((el) => idle.observe(el));
    })();

    // ---- One loop for the background, cursor, album and scroll effects ----
    (() => {
      let last = performance.now(), lastScroll = -1, lastW = 0;
      function frame(now) {
        const dt = Math.min(Math.max((now - last) / 1000, 0), .1);
        last = now;
        if (!document.hidden) {
          // Reads first (one layout), then every write, so nothing forces a second layout mid-frame
          const sy = scrollY;   // read once, before anything is written this frame
          const scrolled = sy !== lastScroll || vw !== lastW;
          if (scrolled) window.measureLines();
          window.measureWarp(dt);
          if (scrolled) { window.updateNav(); window.updateSteps(); }
          renderFluid(dt);
          if (useCursor) {
            // The bead trails the pointer just slightly; the gap becomes a stretch along the
            // direction of travel, so it reads like a droplet, and it rounds off when still
            rx = lerp(rx, pointer.x, .35); ry = lerp(ry, pointer.y, .35);
            if (Math.abs(pointer.x - rx) < .05 && Math.abs(pointer.y - ry) < .05) { rx = pointer.x; ry = pointer.y; }
            const lx = pointer.x - rx, ly = pointer.y - ry;
            const lens = document.documentElement.classList.contains('cursor-hover') || document.documentElement.classList.contains('cursor-drag');
            // The focus frame stays square and upright, so it doesn't stretch
            const s = lens ? 0 : Math.min(Math.hypot(lx, ly) / 50, .55);
            const tf = `translate3d(${rx}px, ${ry}px, 0) rotate(${lens ? 0 : Math.atan2(ly, lx)}rad) scale(${1 + s}, ${1 - s * .45})`;
            if (tf !== cursorEl._tf) cursorEl.style.transform = cursorEl._tf = tf;
          }
          if (scrolled) window.stringScrolled?.(sy);
          window.updateAlbum(dt, now, sy);
          if (scrolled) { lastScroll = sy; lastW = vw; window.updateLines(); }
          window.updateWarp();
          window.stringTick?.();
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    })();

  // ======== from home-4.js ========
    // ---- Intro (once per tab): the glyph appears, the sunset "o" rises and slides along, and the letters
    // of the name appear behind it. The logo then lands in the header, the QR code settles in on its own
    // (its code blooming out from the middle), and the headline rises ----
    // It starts as soon as this code runs (right after hydration), not on the replayed DOMContentLoaded, which only
    // comes once every shared script has downloaded: on a slow connection the veil sat there, blank, until then.
    // It only drives its own elements, so it needs nothing from those scripts.
    const runIntro = () => window.Momento.intro(async (I) => {
      const $ = (s, r = document) => r.querySelector(s);
      const lock = $('#introLock'), glyph = $('#ilGlyph'), word = $('#ilWord'), sun = $('#ilSun');
      const letters = [...word.querySelectorAll('.ltr')];
      const brand = $('.header .brand'), bGlyph = $('.glyph', brand), bWord = $('.brand-word', brand);
      const bg = $('#intro .intro-bg'), qr = $('#qrCard'), frame = $('.qr-frame', qr);
      const hero = [...$('#heroLeft').children];
      const ease = (p) => (p < .5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
      const OUT = 'cubic-bezier(.2, .8, .2, 1)', GLIDE = 'cubic-bezier(.65, 0, .25, 1)';
      // Letter centres along the word and the sun's start, in the wordmark's own units (the sun ends at x 8424.7)
      const CX = [950, 2400, 3850, 5300, 6450, 7400], SUN_X = 8424.7, START = 7900;

      [brand, qr, ...hero].forEach(I.hold);
      // The sun starts beside the glyph; the row is shifted so what is showing sits in the middle
      const wordW = word.getBoundingClientRect().width;
      const shift = (wordW - 1164 * wordW / 9217) / 2;
      sun.setAttribute('transform', `translate(${-START} 0)`);
      lock.style.transform = `translateX(${shift}px)`;
      lock.style.opacity = 1;
      I.play(glyph, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 480, easing: OUT });
      // Sky above the horizon rises, water below it drops in, each inside its own clip
      I.play($('#ilSky'), [{ transform: 'translate(0, -640px)' }, { transform: 'none' }], { duration: 680, delay: 120, easing: 'cubic-bezier(.2, .9, .3, 1)' });
      I.play($('#ilWater'), [{ transform: 'translate(0, 640px)' }, { transform: 'none' }], { duration: 680, delay: 120, easing: 'cubic-bezier(.2, .9, .3, 1)' });
      await I.wait(520);

      // The "o" slides to the end of the word; each letter appears as it passes
      const shown = new Set();
      await I.tween(920, (p) => {
        const e = ease(p), x = SUN_X - START * (1 - e);
        sun.setAttribute('transform', `translate(${(-START * (1 - e)).toFixed(1)} 0)`);
        lock.style.transform = `translateX(${(shift * (1 - e)).toFixed(1)}px)`;
        letters.forEach((l, i) => {
          if (shown.has(i) || x < CX[i]) return;
          shown.add(i);
          I.play(l, [{ opacity: 0, transform: 'translate(0, -260px)' }, { opacity: 1, transform: 'none' }], { duration: 520, easing: OUT });
        });
      });
      letters.forEach((l, i) => { if (!shown.has(i)) I.play(l, [{ opacity: 1 }, { opacity: 1 }], { duration: 1 }); });
      sun.setAttribute('transform', 'translate(0 0)');
      lock.style.transform = 'none';
      await I.wait(160);

      // The logo lands on the header's
      const gFrom = glyph.getBoundingClientRect(), gTo = bGlyph.getBoundingClientRect(), wTo = bWord.getBoundingClientRect();
      const flights = [
        I.play(bg, [{ opacity: 1 }, { opacity: 0 }], { duration: 700, delay: 160, easing: 'ease' }),
        I.play(glyph, [{ transform: 'none' }, { transform: I.flip(glyph, gTo) }], { duration: 780, easing: GLIDE }),
        wTo.width
          ? I.play(word, [{ transform: 'none' }, { transform: I.flip(word, wTo) }], { duration: 780, easing: GLIDE })
          : I.play(word, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 }),   // phone width: the header shows the glyph alone
      ];
      // The QR card comes in on its own: it settles onto the page like a print being set down, the headline's soft spring
      // (transform keeps the card's tilt vars so it lands exactly where the live tilt expects it)
      const tilt = 'perspective(900px) rotateX(var(--trx)) rotateY(var(--try))';
      flights.push(I.play(qr, [{ opacity: 0, scale: .94, transform: `${tilt} translateY(26px)` }, { opacity: 1, scale: 1, transform: `${tilt} translateY(0)` }], { duration: 860, delay: 520, easing: 'cubic-bezier(.16, 1, .3, 1)' }));
      const qrSvg = $('#qrHero'), qrArt = qrSvg.querySelector('g');
      qrSvg.insertAdjacentHTML('afterbegin', '<defs><mask id="qrBloom" maskUnits="userSpaceOnUse" x="0" y="0" width="25" height="25"><circle id="qrBloomDot" cx="12.5" cy="12.5" r="18" fill="#fff"/></mask></defs>');
      qrArt.setAttribute('mask', 'url(#qrBloom)');
      I.undo(() => { qrArt.removeAttribute('mask'); qrSvg.querySelector('defs')?.remove(); qr.classList.remove('is-scanning'); });
      const dot = $('#qrBloomDot');
      dot.style.transformBox = 'fill-box'; dot.style.transformOrigin = 'center';
      flights.push(I.play(dot, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 900, delay: 960, easing: 'cubic-bezier(.3, .7, .2, 1)' }));
      // ...and the headline rises as the veil clears
      hero.forEach((el, i) => flights.push(I.play(el, [{ opacity: 0, transform: 'translateY(34px)' }, { opacity: 1, transform: 'none' }], { duration: 900, delay: 440 + i * 130, easing: 'cubic-bezier(.16, 1, .3, 1)' })));

      await I.wait(780);
      I.play(brand, [{ opacity: 0 }, { opacity: 1 }], { duration: 1 });   // the real logo takes over where the copy landed
      lock.style.visibility = 'hidden';
      await I.wait(1000); qr.classList.add('is-scanning');   // once the code has drawn in, the viewfinder closes in, like a lock
      await I.wait(420); qr.classList.remove('is-scanning');
      await Promise.all(flights);
    });
    if (window.Momento?.intro) runIntro(); else document.addEventListener('DOMContentLoaded', runIntro);
}
