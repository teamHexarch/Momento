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

    // Decorative QR pattern (not a real, scannable code)
    (() => {
      const N = 25; let cells = '', seed = 7;
      const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
      const finder = (x, y) => `<path d="M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5z" fill-rule="evenodd"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3"/>`;
      const inFinder = (x, y) => (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!inFinder(x, y) && rand() > 0.52) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
      const art = `<g fill="#2E2C3A">${finder(0, 0)}${finder(N - 7, 0)}${finder(0, N - 7)}${cells}</g>`;
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
        renderFluid = (dt) => {
          const k = (rate) => 1 - Math.exp(-dt * rate);
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
