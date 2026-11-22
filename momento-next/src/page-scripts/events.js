/* Social: the page's own behaviour (moved from public/legacy/events-1.js).
   The code is the original, unchanged: it still drives the server-rendered markup by id and class. It is started by
   <EventsScripts> (through LegacyScripts) at the point the first old script used to run, so its DOMContentLoaded and load
   listeners still run in their original order. Converting it into React components is the next step for this page. */
/* eslint-disable */

export default function start() {
  // ======== from events-1.js ========
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = matchMedia('(pointer: fine)').matches;
    const root = document.documentElement;
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const easeOut = (v) => 1 - Math.pow(1 - v, 3);
    const OUT = 'cubic-bezier(.16, 1, .3, 1)';

    // ---- Shared pointer state and cursor ----
    const pointer = { x: innerWidth / 2, y: innerHeight / 2, active: false, ix: 0, iy: 0 };
    let vw = innerWidth, vh = innerHeight;
    addEventListener('resize', () => { vw = innerWidth; vh = innerHeight; });
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
    if (useCursor) root.classList.add('has-cursor');
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
      if (pointer.active) { pointer.ix += e.clientX - pointer.x; pointer.iy += e.clientY - pointer.y; }
      else { rx = e.clientX; ry = e.clientY; }
      pointer.x = e.clientX; pointer.y = e.clientY;
      pointer.active = true;
      if (useCursor) {
        const el = e.target instanceof Element ? e.target : null;
        root.classList.toggle('cursor-hover', !!el?.closest('a, button, input, .live-media'));
      }
    }, { passive: true });
    root.addEventListener('pointerleave', () => { pointer.active = false; });
    addEventListener('pointerdown', () => root.classList.add('cursor-down'));
    addEventListener('pointerup', () => root.classList.remove('cursor-down'));

    // ---- Living background: the same silk shader as the landing page ----
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

    // ---- Glass rim light follows the pointer ----
    function lightUp(glass) {
      glass.dataset.lit = '1';
      glass.addEventListener('pointerenter', () => glass.style.setProperty('--shine', 1));
      glass.addEventListener('pointerleave', () => glass.style.setProperty('--shine', 0));
      glass.addEventListener('pointermove', (e) => {
        const r = glass.getBoundingClientRect();
        glass.style.setProperty('--mx', `${e.clientX - r.left}px`);
        glass.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    }
    document.querySelectorAll('.glass, .panel').forEach((g) => { if (!g.closest('.album')) lightUp(g); });

    // Glass a script makes later (the account chip and menu, toasts, new cards) lights up the first time the pointer reaches it
    document.addEventListener('pointerover', (e) => {
      const g = e.target.closest?.('.glass, .panel');
      if (!g || g.dataset.lit || g.closest('.album')) return;
      lightUp(g); g.style.setProperty('--shine', 1);
    }, { passive: true });

    // ---- Buttons: fill floods in from where the cursor enters, label rolls, slight pull ----
    function rollButton(btn) {
      if (btn.querySelector('.btn-fill')) return;
      const inner = btn.innerHTML.trim();
      btn.innerHTML = `<span class="btn-fill" aria-hidden="true"></span><span class="btn-label"><span class="roll"><span>${inner}</span><span aria-hidden="true">${inner}</span></span></span>`;
      const origin = (e) => {
        const r = btn.getBoundingClientRect();
        btn.style.setProperty('--fx', `${e.clientX - r.left}px`);
        btn.style.setProperty('--fy', `${e.clientY - r.top}px`);
      };
      btn.addEventListener('pointerenter', origin);
      btn.addEventListener('pointerleave', (e) => { origin(e); btn.style.setProperty('--bx', '0px'); btn.style.setProperty('--by', '0px'); });
      if (useCursor) btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        btn.style.setProperty('--bx', `${(e.clientX - r.left - r.width / 2) * .18}px`);
        btn.style.setProperty('--by', `${(e.clientY - r.top - r.height / 2) * .3}px`);
      });
    }
    document.querySelectorAll('.btn').forEach(rollButton);

    // ---- Events near you ----
    // Public albums (the host picked "Public") around a point: your location, or a place you searched.
    // They show on the map as round prints with a ring for their zone, and in the list beside it. Joining
    // checks your real location against the zone, on the server.
    (() => {
      const $ = (id) => document.getElementById(id);
      const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      // An album's cover: the host's own image while it's upcoming, then its most loved photo (the server decides)
      const evCover = (a) => a.cover?.thumbUrl || a.pics?.[0] || null;
      const plural = (n, one, many) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
      const dist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`);
      const statusEl = $('evStatus'), listEl = $('evList'), note = $('evMapNote'), mapScan = $('evMapScan'), sheet = $('evSheet'), card = $('evCard');
      const say = (t, bad) => { statusEl.textContent = t; statusEl.classList.toggle('is-error', !!bad); };
      const NOTIFY = 'momento-notify-nearby';

      function when(e) {
        if (e.live) return { live: true, text: 'Live now' };
        const d = new Date(e.opensAt || e.startsAt), today = new Date();
        const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const sameDay = d.toDateString() === today.toDateString();
        const tomorrow = d.toDateString() === new Date(today.getTime() + 864e5).toDateString();
        return { live: false, text: `Opens ${sameDay ? t : tomorrow ? 'tomorrow ' + t : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + t}` };
      }
      const whereChip = (e) => e.joined
        ? '<span class="evc-in is-joined">You’re in</span>'
        : e.inside ? '<span class="evc-in is-in">You’re inside the zone</span>'
        : `<span class="evc-in is-out">${dist(e.distanceM - e.zone.radiusM)} outside the zone</span>`;

      // ---- The globe: the real Earth in 3D (MapLibre GL, globe projection), floating on the page ----
      // Far out it's a planet lit by the real sun: the night side is dark, with NASA's city lights and a soft
      // twilight edge that moves through the day. Close in it's satellite imagery with roads and place names,
      // dimmed when it's night at that place. Scans, zones and your position are drawn to true size on it.
      // No key needed: Esri's imagery and reference tiles, and NASA's Earth at night (assets/globe)
      let map = null, mapOk = false, me = null, rangeTag = null, stack = null;
      const markers = new Map();   // event id → its print on the globe
      const box = document.querySelector('.ev-mapbox');
      const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
      const NIGHT_IMG = 'assets/globe/earth-night.webp';   // 216 KB (the .jpg beside it, 715 KB, is the fallback)
      const rad = Math.PI / 180;
      const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
      const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

      // Where the sun is overhead right now (accurate to a fraction of a degree: plenty for a terminator).
      // In local preview, ?sun=+6 moves the clock six hours on, to check night and day
      const sunShift = (() => {
        if (!/^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname)) return 0;
        const h = Number(new URLSearchParams(location.search).get('sun'));
        return Number.isFinite(h) ? h * 36e5 : 0;
      })();
      function sunNow() {
        const d = (Date.now() + sunShift) / 864e5 - 10957.5;   // days since 1 Jan 2000, 12:00 UTC
        const g = (357.529 + 0.98560028 * d) * rad, q = 280.459 + 0.98564736 * d;
        const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad, e = (23.439 - 0.00000036 * d) * rad;
        const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / rad, dec = Math.asin(Math.sin(e) * Math.sin(L));
        const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
        const lng = ((ra - gmst * 15) % 360 + 540) % 360 - 180;
        return { lat: dec / rad, lng, sinDec: Math.sin(dec), cosDec: Math.cos(dec) };
      }
      // How high the sun is (degrees) at a place: below 0 it has set, below −12 it's properly dark
      const sunAlt = (s, lat, lng) => Math.asin(clamp(Math.sin(lat * rad) * s.sinDec + Math.cos(lat * rad) * s.cosDec * Math.cos((lng - s.lng) * rad), -1, 1)) / rad;
      // How much night shows: none in daylight, all of it once the sun is 10° down, a twilight band between
      const nightness = (alt) => smooth(4, -10, alt);

      // The night side as map tiles, drawn here in the browser: NASA's city lights over deep navy, see-through
      // where the sun is up. Remade every five minutes as the terminator moves
      let nightImg = null;
      const loadNight = () => (nightImg ||= new Promise((ok, no) => {
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => ok(im);
        im.onerror = () => { if (im.src.endsWith('.jpg')) no(); else im.src = NIGHT_IMG.replace(/\.webp$/, '.jpg'); };
        im.src = NIGHT_IMG;
      }));
      function nightTiles() {
        if (maplibregl.__momentoNight) return;
        maplibregl.__momentoNight = true;
        maplibregl.addProtocol('momento-night', async (params) => {
          const [z, x, y] = params.url.replace('momento-night://', '').split(/[/?]/).map(Number);
          const img = await loadNight();
          const S = 256, n = 2 ** z, IW = img.naturalWidth, IH = img.naturalHeight;
          const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S });
          const ctx = c.getContext('2d', { willReadFrequently: true });
          const lng0 = x / n * 360 - 180, lng1 = (x + 1) / n * 360 - 180;
          const sx = (lng0 + 180) / 360 * IW, sw = (lng1 - lng0) / 360 * IW;
          const lats = new Float64Array(S);
          // The picture is plain latitude/longitude; tiles are Mercator, so it's laid in one row at a time
          for (let py = 0; py < S; py++) {
            const t = Math.PI * (1 - 2 * (y + (py + 0.5) / S) / n);
            const lat = lats[py] = Math.atan(Math.sinh(t)) / rad;
            ctx.drawImage(img, sx, clamp((90 - lat) / 180 * IH, 0, IH - 1), sw, 1, 0, py, S, 1);
          }
          // The picture's teal sea is dropped: what's kept is its light (the red channel is near zero everywhere
          // but the towns), laid warm over a near-black navy, with a trace of the land so coasts still read
          const px = ctx.getImageData(0, 0, S, S), d = px.data, sun = sunNow();
          // Kept cheap (it runs for every tile): the sun's height is worked with as its sine (no asin per pixel;
          // over the twilight band the two are near enough proportional), with each column's cosine worked out once
          const cosCol = new Float64Array(S);
          for (let qx = 0; qx < S; qx++) cosCol[qx] = Math.cos((lng0 + (qx + 0.5) / S * (lng1 - lng0) - sun.lng) * rad);
          const DAY = Math.sin(4 * rad), DARK = Math.sin(-10 * rad);
          for (let py = 0; py < S; py++) {
            const sl = Math.sin(lats[py] * rad) * sun.sinDec, cl = Math.cos(lats[py] * rad) * sun.cosDec;
            for (let qx = 0, i = py * S * 4; qx < S; qx++, i += 4) {
              const t = clamp((sl + cl * cosCol[qx] - DAY) / (DARK - DAY), 0, 1);
              const glow = Math.max(0, d[i] - 4), land = Math.max(0, d[i + 1] - 20);
              d[i] = 5 + glow * 2.2;
              d[i + 1] = 7 + glow * 1.7 + land * 0.14;
              d[i + 2] = 17 + glow * 0.75 + land * 0.12;
              d[i + 3] = 240 * t * t * (3 - 2 * t);
            }
          }
          ctx.putImageData(px, 0, 0);
          const blob = c.convertToBlob ? await c.convertToBlob({ type: 'image/png' }) : await new Promise((ok) => c.toBlob(ok, 'image/png'));
          return { data: await blob.arrayBuffer() };
        });
      }
      const nightUrl = () => `momento-night://{z}/{x}/{y}?t=${Math.floor((Date.now() + sunShift) / 3e5)}`;

      // Close in, the whole view is one place, so its own sun decides: bright by day, dimmed and cooler at night
      function lightUp() {
        if (!mapOk) return;
        const c = map.getCenter(), sun = sunNow(), n = nightness(sunAlt(sun, c.lat, c.lng));
        // The atmosphere's glow is lit from the real sun too (MapLibre lights it from the style's light)
        const P = [-Math.cos(sun.lat * rad) * Math.sin(sun.lng * rad), -Math.sin(sun.lat * rad), -Math.cos(sun.lat * rad) * Math.cos(sun.lng * rad)];
        map.setLight({ anchor: 'map', position: [1.5, Math.atan2(P[1], P[0]) / rad - 90, Math.acos(clamp(P[2], -1, 1)) / rad] });
        const zoomed = (far, near) => ['interpolate', ['linear'], ['zoom'], 5, far, 7.5, near];
        map.setPaintProperty('sat', 'raster-brightness-max', zoomed(1, 1 - 0.58 * n));
        map.setPaintProperty('sat', 'raster-saturation', zoomed(0, -0.35 * n));
        map.setPaintProperty('roads', 'raster-brightness-max', zoomed(1, 1 - 0.25 * n));
        box.classList.toggle('is-night', n > 0.5 && map.getZoom() > 6);
      }

      // A true circle on the Earth (not a flat one), as a ring of points
      const EARTH = 6371008.8;
      function ring(lat, lng, m, steps = 128) {
        const d = m / EARTH, p1 = lat * rad, l1 = lng * rad, out = [];
        for (let i = 0; i <= steps; i++) {
          const b = i / steps * 2 * Math.PI;
          const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
          const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
          out.push([l2 / rad, p2 / rad]);
        }
        return out;
      }
      const area = (kind, lat, lng, m) => ({ type: 'Feature', properties: { kind }, geometry: { type: 'Polygon', coordinates: [ring(lat, lng, m)] } });
      const bounds = (lat, lng, m) => {
        const dy = m / 111320, dx = m / (111320 * Math.max(0.05, Math.cos(lat * rad)));
        return [[lng - dx, lat - dy], [lng + dx, lat + dy]];
      };
      // Everything drawn on the surface: the scan, each event's zone, how exact your position is
      const areas = { scan: null, scanning: false, zones: [], acc: null, approx: null };
      function paintAreas() {
        const src = mapOk && map.getSource('areas');
        if (!src) return;
        const f = [...areas.zones];
        if (areas.approx) f.push(areas.approx);
        if (areas.acc) f.push(areas.acc);
        if (areas.scan) f.push({ ...areas.scan, properties: { kind: areas.scanning ? 'scanning' : 'scan' } });
        src.setData({ type: 'FeatureCollection', features: f });
      }

      // Size things to the zoom: album prints grow as you come in; far out, the glow and shadow the globe
      // floats in follow its size, and fade once the surface fills the view
      function sizeToZoom() {
        if (!mapOk) return;
        const z = map.getZoom();
        box.style.setProperty('--pin-k', clamp(0.42 + (z - 3) * 0.58 / 12, 0.42, 1).toFixed(3));
        const globe = 512 * 2 ** z / Math.PI;   // the globe's width on screen, in pixels
        box.style.setProperty('--globe-k', (globe / 100).toFixed(3));
        box.classList.toggle('is-close', globe > Math.min(box.clientWidth, box.clientHeight) * 1.15);
        // The prints gather into the stack once they'd crowd each other on screen
        let crowded = false;
        if (markers.size > 1) {
          const pts = [...markers.values()].map((mk) => map.project(mk.getLngLat()));
          const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
          crowded = z < 9 || Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < 64 * clamp(0.42 + (z - 3) * 0.58 / 12, 0.42, 1);
        }
        box.classList.toggle('is-far', crowded);
      }

      // ---- The camera: one move at a time ----
      // Every flight goes through fly() and resolves once the globe has landed (or a hand took over). The idle
      // turn is the only move anything else may stop: scrolling the page or a timer never cuts a flight short
      const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
      const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
      let flightId = 0, flying = 0, onScreen = false, turning = false, idleTimer = 0;
      function fly(opts, how = 'fly') {
        if (!mapOk) return Promise.resolve();
        stopTurning();
        if (still || !opts.duration) { map.jumpTo(opts); return Promise.resolve(); }
        const id = ++flightId;
        flying++;
        return new Promise((done) => {
          let timer = 0;
          const end = (ev) => {
            if (ev && ev.momento !== id) return;   // the end of an earlier move, not this one
            map.off('moveend', end); clearTimeout(timer);
            flying = Math.max(0, flying - 1);
            done();
          };
          map.on('moveend', end);
          (how === 'ease' ? map.easeTo : map.flyTo).call(map, { essential: true, maxDuration: 6000, ...opts }, { momento: id });
          timer = setTimeout(end, opts.duration + 900);   // a safety net: it always lands
        });
      }
      // Room for the soft edge, so what's framed sits in the clear middle of the view
      const pad = () => ({ top: box.clientHeight * 0.14, bottom: box.clientHeight * 0.14, left: box.clientWidth * 0.12, right: box.clientWidth * 0.12 });
      const onView = (lng, lat) => {
        const p = map.project([lng, lat]);
        return p.x > 0 && p.y > 0 && p.x < box.clientWidth && p.y < box.clientHeight;
      };
      // Bring the globe on screen before a flight, so it isn't missed (it waits for the scroll, briefly)
      const whenSeen = () => new Promise((ok) => {
        const r = box.getBoundingClientRect();
        if (r.top > -r.height * 0.25 && r.bottom < innerHeight + r.height * 0.25) return ok();
        box.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
        if (still) return ok();
        const io = new IntersectionObserver(([en]) => { if (en.intersectionRatio >= 0.6) { io.disconnect(); clearTimeout(t); ok(); } }, { threshold: [0.6] });
        io.observe(box);
        const t = setTimeout(() => { io.disconnect(); ok(); }, 900);
      });
      // A ping where you're headed: rings rippling out from the spot while the globe turns and dives
      function pingAt(lat, lng) {
        if (still) return;
        const el = document.createElement('div');
        el.className = 'ev-mark';
        el.innerHTML = '<span class="ev-ping"><b></b><i></i><i></i><i></i></span>';
        const mk = new maplibregl.Marker({ element: el, anchor: 'center', opacityWhenCovered: '0' }).setLngLat([lng, lat]).addTo(map);
        setTimeout(() => mk.remove(), 3600);
      }
      // The flight itself. From space: turn the globe to face the place (a ping marks it), then dive in with a
      // little tilt so the landing feels three-dimensional. Nearby: one smooth move across
      async function flyTo3D(lat, lng, b, { ping = true, pitch = 38, bearing = -12 } = {}) {
        if (!mapOk) return;
        const cam = map.cameraForBounds(b, { padding: pad(), maxZoom: 16.5 });
        if (!cam) return;
        const zoom = cam.zoom - (still ? 0 : 0.3);   // a tilted view needs a touch more room
        const planet = map.getZoom() < 5;
        if (ping) pingAt(lat, lng);
        if (planet && !still) {
          await fly({ center: [lng, lat], pitch: 0, bearing: 0, duration: 1100, easing: easeInOut }, 'ease');
        }
        const far = planet || !onView(lng, lat);
        await fly({ center: cam.center, zoom, pitch: still ? 0 : pitch, bearing: still ? 0 : bearing, duration: far ? 2600 : 1400, curve: far ? 1.6 : 1.3, easing: easeInOut });
        home = { zoom, at: { lat, lng } };
        paintTools();
      }
      let home = null;   // where the last flight landed, for "Back to you"

      // The globe at rest turns slowly. It stops for a hand on it, a flight, or when it's out of sight,
      // and starts again 8 s after the last touch, but only when it's a whole planet in view
      const canTurn = () => !still && mapOk && onScreen && !document.hidden && !flying && !sheet.open && map.getZoom() <= 3.2;
      function turn() {
        clearTimeout(idleTimer);
        if (turning || !canTurn()) return;
        turning = true;
        const c = map.getCenter();
        map.easeTo({ center: [c.lng + 20, c.lat], duration: 20000, easing: (t) => t }, { momentoTurn: true });
      }
      function stopTurning() {
        clearTimeout(idleTimer);
        if (!turning) return;
        turning = false;
        map.stop();
      }
      const turnLater = (ms = 8000) => { clearTimeout(idleTimer); if (!still) idleTimer = setTimeout(turn, ms); };

      // Glass controls over the globe: zoom, back to your scan, north-up (both only when they'd do something),
      // and the live / follow pill (paintFollow)
      let backBtn = null, northBtn = null;
      function controls() {
        const zoom = document.createElement('div');
        zoom.className = 'ev-zoom';
        zoom.innerHTML = `<button type="button" aria-label="Zoom in" title="Zoom in">+</button><button type="button" aria-label="Zoom out" title="Zoom out">−</button>
          <button type="button" data-back aria-label="Back to the scan" title="Back to the scan" hidden><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/></svg></button>
          <button type="button" data-north aria-label="Face north, looking straight down" title="Face north" hidden><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3.5 15.5 12h-7z" fill="#E0476B"/><path d="M12 20.5 8.5 12h7z" fill="currentColor" opacity=".55"/></svg></button>`;
        const [zin, zout] = zoom.querySelectorAll('button');
        backBtn = zoom.querySelector('[data-back]');
        northBtn = zoom.querySelector('[data-north]');
        zin.addEventListener('click', () => { stopTurning(); map.zoomIn({ duration: still ? 0 : 450 }); });
        zout.addEventListener('click', () => { stopTurning(); map.zoomOut({ duration: still ? 0 : 450 }); });
        backBtn.addEventListener('click', () => flyHome());
        northBtn.addEventListener('click', () => fly({ bearing: 0, pitch: 0, duration: 700, easing: easeInOut }, 'ease'));
        const credit = document.createElement('p');
        credit.className = 'ev-credit';
        credit.innerHTML = 'Imagery © <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics · Earth at night: <a href="https://earthobservatory.nasa.gov" target="_blank" rel="noopener">NASA</a>';
        box.append(zoom, credit);
      }

      function ensureMap() {
        if (map) return mapOk ? map : null;
        const fail = () => { mapOk = false; note.textContent = 'The globe couldn’t load. The list still works.'; note.hidden = false; mapScan.hidden = true; return null; };
        if (!window.maplibregl) return fail();
        nightTiles();
        loadNight().catch(() => {});
        const roomy = Math.min(box.clientWidth || 600, box.clientHeight || 560);
        // Start facing your own side of the world (from your time zone), sized to sit inside the space
        const startLng = clamp(-new Date().getTimezoneOffset() / 4, -180, 180);
        const startZoom = Math.log2((roomy * 0.74 * Math.PI) / 512);
        const fade = (stops) => ['interpolate', ['linear'], ['zoom'], ...stops];
        try {
          map = new maplibregl.Map({
            container: 'evMap',
            style: {
              version: 8,
              projection: { type: 'globe' },
              sky: { 'atmosphere-blend': fade([0, 0.5, 4, 0.42, 7, 0]) },
              sources: {
                sat: { type: 'raster', tiles: [ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19,
                  attribution: 'Imagery © <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics' },
                night: { type: 'raster', tiles: [nightUrl()], tileSize: 256, maxzoom: 6, attribution: 'Earth at night: <a href="https://earthobservatory.nasa.gov">NASA</a>' },
                places: { type: 'raster', tiles: [ESRI + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19 },
                roads: { type: 'raster', tiles: [ESRI + 'Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19 },
                areas: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
              },
              layers: [
                { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-fade-duration': 200 } },
                { id: 'night', type: 'raster', source: 'night', paint: { 'raster-opacity': fade([5, 1, 7.5, 0]), 'raster-fade-duration': 600 } },
                { id: 'roads', type: 'raster', source: 'roads', minzoom: 9, paint: { 'raster-opacity': fade([9, 0, 11, 0.7, 15, 0.85]) } },
                { id: 'places', type: 'raster', source: 'places', paint: { 'raster-opacity': fade([1, 0.4, 4, 0.75, 12, 1]) } },
                // Zones: a pane of frosted colour (green when you're inside), with a dark under-edge so the
                // bright line reads on any imagery
                { id: 'area-fill', type: 'fill', source: 'areas', paint: {
                  'fill-color': ['match', ['get', 'kind'], 'zone-in', '#7FDCBE', 'scan', '#9DB8FF', 'scanning', '#9DB8FF', 'acc', '#6F98F0', 'approx', '#9DB8FF', '#C8BEF5'],
                  'fill-opacity': ['match', ['get', 'kind'], 'scan', 0.09, 'scanning', 0.16, 'acc', 0.2, 'approx', 0.14, 0.2] } },
                { id: 'area-casing', type: 'line', source: 'areas', filter: ['in', ['get', 'kind'], ['literal', ['zone', 'zone-in', 'scan', 'scanning']]],
                  paint: { 'line-color': 'rgba(14, 12, 32, .5)', 'line-width': 5, 'line-blur': 2 } },
                { id: 'zone-line', type: 'line', source: 'areas', filter: ['in', ['get', 'kind'], ['literal', ['zone', 'zone-in']]],
                  paint: { 'line-color': ['match', ['get', 'kind'], 'zone-in', '#93E2C9', '#D6CEFF'], 'line-width': 2 } },
                { id: 'acc-line', type: 'line', source: 'areas', filter: ['==', ['get', 'kind'], 'acc'], paint: { 'line-color': 'rgba(160, 190, 255, .75)', 'line-width': 1 } },
                { id: 'approx-line', type: 'line', source: 'areas', filter: ['==', ['get', 'kind'], 'approx'], paint: { 'line-color': '#B9CCFF', 'line-width': 1.6, 'line-dasharray': [1, 2.5] } },
                { id: 'scan-line', type: 'line', source: 'areas', filter: ['in', ['get', 'kind'], ['literal', ['scan', 'scanning']]],
                  layout: { 'line-cap': 'round' }, paint: { 'line-color': '#C6D5FF', 'line-width': 2.8, 'line-dasharray': [2.4, 1.8] } },
              ],
            },
            center: [startLng, 16], zoom: startZoom, minZoom: Math.max(0, startZoom - 0.8), maxZoom: 18.5,
            renderWorldCopies: false,
            attributionControl: false,   // the credits sit outside the faded edge instead (controls())
            // Yours to play with: drag spins it (with momentum), the wheel and pinch zoom, right-drag or
            // two fingers tilt and turn it. On a phone one finger still scrolls the page; two move the globe
            cooperativeGestures: matchMedia('(pointer: coarse)').matches,
            maxPitch: 60,
          });
        } catch (err) { map = {}; return fail(); }
        mapOk = true;
        controls();
        map.on('load', () => {
          paintAreas();
          lightUp();
          sizeToZoom();
          turn();
        });
        map.on('zoom', sizeToZoom);
        map.on('move', liftStack);
        map.on('rotate', paintTools);
        map.on('pitch', paintTools);
        map.on('moveend', (ev) => {
          lightUp();
          paintTools();
          if (ev.momentoTurn) { if (turning) { turning = false; turn(); } return; }   // the next stretch of the idle turn
          if (flying) return;
          // Zoomed back out to the whole planet: it levels itself, so the globe sits upright in its glow
          if (map.getZoom() < 4 && (map.getPitch() > 2 || Math.abs(map.getBearing()) > 2) && !ev.momentoLevel) {
            map.easeTo({ pitch: 0, bearing: 0, duration: still ? 0 : 800, easing: easeInOut }, { momentoLevel: true });
            return;
          }
          turnLater();
        });
        // A hand on the globe stops it turning
        for (const ev of ['mousedown', 'touchstart', 'wheel', 'dragstart']) map.on(ev, stopTurning);
        map.on('error', () => {});   // a missing imagery tile far out at sea is normal: the rest still draws
        // The night side moves on: new night tiles every five minutes, and the close-in light with them
        setInterval(() => { if (document.hidden) return; map.getSource('night')?.setTiles([nightUrl()]); lightUp(); }, 3e5);
        // Only turns while it's on screen and the page is open (a flight is never stopped by this)
        new IntersectionObserver(([en]) => { onScreen = en.isIntersecting; if (onScreen) turnLater(1200); else stopTurning(); }).observe(box);
        document.addEventListener('visibilitychange', () => { if (document.hidden) stopTurning(); else turnLater(1200); });
        new ResizeObserver(() => { map.resize(); sizeToZoom(); }).observe(box);
        return map;
      }

      // "Back to the scan" shows once you've wandered off it; the north button once the view is turned or tilted
      function paintTools() {
        if (!mapOk || !backBtn) return;
        const c = map.getCenter();
        const away = !!center && (!home || metres({ lat: c.lat, lng: c.lng }, center) > Math.max(600, scanM * 0.6) || map.getZoom() < home.zoom - 1.5);
        backBtn.hidden = !away || flying > 0;   // not mid-flight: they'd flicker in and out on the way
        northBtn.hidden = flying > 0 || Math.abs(map.getBearing()) < 1 && map.getPitch() < 1;
        northBtn.firstChild.style.transform = `rotate(${-map.getBearing()}deg)`;
      }
      const flyHome = () => { if (center) flyTo3D(center.lat, center.lng, scanBounds(events.map((e) => [e.zone.lng, e.zone.lat]))); };
      // Far out, a stack near the globe's rim is drawn in a little, so it never hangs off the edge
      function liftStack() {
        const el = stack?.getElement()?.firstChild;
        if (!el) return;
        const z = map.getZoom(), r = 256 * 2 ** z / Math.PI;
        if (!box.classList.contains('is-far') || r * 2 > Math.max(box.clientWidth, box.clientHeight)) { el.style.removeProperty('--sx'); el.style.removeProperty('--sy'); return; }
        const p = map.project(stack.getLngLat()), o = map.project(map.getCenter());
        const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy), lim = r * 0.62;
        const k = d > lim ? (d - lim) / d : 0;
        el.style.setProperty('--sx', `${(-dx * k).toFixed(1)}px`);
        el.style.setProperty('--sy', `${(-dy * k).toFixed(1)}px`);
      }

      // A print on the globe for each album: its cover, or a blank print with a picture mark until it has one.
      // Root is a 0×0 anchor (MapLibre moves it); the print is scaled to the zoom inside it
      const PIC = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.7"/><path d="m4.5 17 4.6-4.4a1.5 1.5 0 0 1 2 0l2.4 2.2 2-1.8a1.5 1.5 0 0 1 2 0L20 15.4"/></svg>';
      function printFor(e) {
        const root = document.createElement('div');
        root.className = 'ev-mark';
        const cover = evCover(e);
        root.innerHTML = `<span class="ev-pin-s"><button type="button" class="ev-pin${e.live ? ' is-live' : ''}${cover ? '' : ' is-blank'}">${cover ? '' : PIC}</button></span><span class="ev-pin-tag"></span>`;
        const btn = root.querySelector('.ev-pin');
        if (cover) btn.style.backgroundImage = `url(${JSON.stringify(cover)})`;
        btn.setAttribute('aria-label', `${e.name}, ${dist(e.distanceM)} away${e.live ? ', live now' : ''}`);
        root.querySelector('.ev-pin-tag').textContent = `${e.name} · ${dist(e.distanceM)}`;
        btn.addEventListener('click', (k) => { k.stopPropagation(); pick(e, true); selectEvent(e); });
        btn.addEventListener('pointerenter', () => pick(e, false));
        btn.addEventListener('focus', () => pick(e, false));
        return new maplibregl.Marker({ element: root, anchor: 'center', opacityWhenCovered: '0' }).setLngLat([e.zone.lng, e.zone.lat]).addTo(map);
      }
      // Far out, the albums of one scan sit in a single stack: a few covers and how many there are
      function stackFor(list, at) {
        const root = document.createElement('div');
        root.className = 'ev-mark ev-stack-mark';
        const faces = list.slice(0, 3).map((e) => {
          const c = evCover(e);
          return c ? `<i style="background-image:url(${esc(JSON.stringify(c))})"></i>` : `<i class="is-blank">${PIC}</i>`;
        }).join('');
        root.innerHTML = `<button type="button" class="ev-stack"><span class="ev-stack-faces">${faces}</span><b></b></button>`;
        root.querySelector('b').textContent = plural(list.length, 'album', 'albums');
        const btn = root.querySelector('button');
        btn.setAttribute('aria-label', `${plural(list.length, 'album', 'albums')} here. Zoom in to see them`);
        btn.addEventListener('click', () => { if (center) flyTo3D(center.lat, center.lng, scanBounds(list.map((e) => [e.zone.lng, e.zone.lat])), { ping: false }); });
        return new maplibregl.Marker({ element: root, anchor: 'center', opacityWhenCovered: '0' }).setLngLat([at.lng, at.lat]).addTo(map);
      }
      function meAt(at) {
        if (!me) {
          const el = document.createElement('div');
          el.className = 'ev-mark';
          el.innerHTML = '<span class="ev-me"></span>';
          me = new maplibregl.Marker({ element: el, anchor: 'center', opacityWhenCovered: '0' });
        }
        me.setLngLat([at.lng, at.lat]).addTo(map);
      }
      // The scan's size, written on its edge
      function tagRange(at, m) {
        if (!rangeTag) {
          const el = document.createElement('div');
          el.className = 'ev-mark';
          el.innerHTML = '<span class="ev-range-tag"></span>';
          rangeTag = new maplibregl.Marker({ element: el, anchor: 'center', opacityWhenCovered: '0' });
        }
        rangeTag.getElement().firstChild.textContent = fmtRange(m);
        rangeTag.setLngLat([at.lng, at.lat + m / 111320]).addTo(map);
      }
      function clearMarks() {
        markers.forEach((mk) => mk.remove()); markers.clear();
        stack?.remove(); stack = null;
        box.classList.remove('is-far');
      }
      // The scanned circle, stretched to take in any extra points (events whose zone sits past its edge)
      function scanBounds(extra = []) {
        const [[w, s], [e, n]] = bounds(center.lat, center.lng, scanM);
        let W = w, S = s, E = e, N = n;
        for (const [lng, lat] of extra) { W = Math.min(W, lng); E = Math.max(E, lng); S = Math.min(S, lat); N = Math.max(N, lat); }
        return [[W, S], [E, N]];
      }
      // Once landed, the range ring grows out from the centre to its true size (0.7 s)
      function ringIn(at, radius) {
        if (still) { areas.scan = area('scan', at.lat, at.lng, radius); paintAreas(); return; }
        const t0 = performance.now();
        const step = (now) => {
          const t = Math.min(1, (now - t0) / 700), k = 1 - (1 - t) ** 3;
          areas.scan = area('scan', at.lat, at.lng, Math.max(1, radius * k));
          paintAreas();
          if (t < 1 && center === at) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
      // A print that's just been flown to gives a little bounce and a ring of light
      function pulse(e) {
        const el = markers.get(e.id)?.getElement();
        if (!el || still) return;
        el.classList.remove('is-pulse');
        void el.offsetWidth;   // restart the animation if it's already played
        el.classList.add('is-pulse');
        setTimeout(() => el.classList.remove('is-pulse'), 1100);
      }
      // Choosing an event (in the list, or its print on the globe): the globe flies to it, its print pulses,
      // then its sheet opens. Already there? The sheet opens straight away
      let selectReq = 0;
      async function selectEvent(e) {
        const req = ++selectReq;
        pick(e, false);
        if (!mapOk) { openSheet(e); return; }
        const z = e.zone, c = map.getCenter();
        const there = metres({ lat: c.lat, lng: c.lng }, z) < Math.max(60, z.radiusM * 0.25) && map.getZoom() > 11 && onView(z.lng, z.lat);
        if (!there) {
          if (matchMedia('(max-width: 900px)').matches) await whenSeen();   // phones: the list sits above the globe
          // Framed close on the event itself (a big zone's edge can run off the view), so its print stands clear
          await flyTo3D(z.lat, z.lng, bounds(z.lat, z.lng, clamp(z.radiusM * 1.1, 250, 700)), { ping: false, pitch: 42, bearing: -10 });
          if (req !== selectReq) return;   // they chose another one on the way
          pulse(e);
          await wait(still ? 0 : 450);
        }
        if (req === selectReq) openSheet(e);
      }

      // ---- What's around a point ----
      let center = null, real = null, events = [], picked = null, lookReq = 0, scannedAt = null;
      // The list's own messages: scanning, or why nothing could be shown (with a way to try again)
      const SHOWN = 3, moreBtn = $('evMore');
      listEl.querySelector('[data-rescan]')?.addEventListener('click', () => useMyLocation());   // the button in the page's own first markup
      mapScan.addEventListener('click', () => useMyLocation());   // the scan button under the globe (only there before the first scan)
      moreBtn.addEventListener('click', () => {
        const all = listEl.classList.toggle('is-all');
        moreBtn.textContent = all ? 'Show fewer' : `Show all ${events.length} events`;
      });
      function listMsg(title, text, { scanning = false, retry = false, cta = false } = {}) {
        moreBtn.hidden = true;
        const pin = '<span class="ev-radar-pin"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg></span>';
        listEl.innerHTML = `<div class="ev-empty ev-scan panel${cta ? ' ev-scan--cta' : ''}${scanning ? '' : ' is-idle'}">${scanning || cta ? `<span class="ev-radar" aria-hidden="true"><i></i><i></i><i></i>${cta ? pin : ''}</span>` : ''}<h2></h2><p></p>${retry || cta ? `<button class="btn btn-dark${cta ? ' ev-scan-go' : ''}" type="button" data-rescan></button>` : ''}</div>`;
        listEl.querySelector('h2').textContent = title;
        listEl.querySelector('p').textContent = text;
        const again = listEl.querySelector('[data-rescan]');
        if (again) again.textContent = cta ? 'Scan nearby' : typeof retry === 'string' ? retry : 'Scan again';
        if (again) { again.addEventListener('click', () => useMyLocation()); rollButton?.(again); }
      }
      // How far a scan looks: you pick one of these (the chips in the scan bar), and it's remembered.
      // rangeM is the choice; scanM is the size of the scan that's on the map right now.
      const RANGES = [500, 1000, 2000, 5000, 10000], RANGE_KEY = 'momento-scan-range';
      const fmtRange = (m) => (m >= 1000 ? `${m / 1000} km` : `${m} m`);
      let rangeM = 1000;
      try { const saved = Number(localStorage.getItem(RANGE_KEY)); if (RANGES.includes(saved)) rangeM = saved; } catch (err) {}
      let scanM = rangeM;
      const scanLabel = () => fmtRange(scanM);
      let lookLabel = 'you';
      // The scan, in three beats: the page brings the globe into view, the globe turns to face the place (a
      // ping marks it) and dives in with a slight tilt, then the range ring grows out to its true size and a
      // radar beam sweeps it until the results arrive. `landed` resolves once the globe has arrived, so the
      // results never land mid-flight
      let sweep = null;
      function scanFx(at, radius) {
        const m = ensureMap();
        if (!m) return { stop() {}, landed: Promise.resolve() };
        // A fresh scan: the last results go, and come back when it finishes
        clearMarks();
        rangeTag?.remove();
        sweep?.remove(); sweep = null;
        areas.zones = []; areas.acc = null; areas.approx = null; areas.scan = null; areas.scanning = true;
        paintAreas();
        if (at.approx) me?.remove(); else meAt(at);
        let stopped = false, el = null, size = null;
        const landed = (async () => {
          await whenSeen();
          if (stopped || center !== at) return;
          await flyTo3D(at.lat, at.lng, bounds(at.lat, at.lng, radius));
          if (stopped || center !== at) return;
          ringIn(at, radius);
          // The beam is 200 px across, scaled to the circle's size on screen as you move about
          el = document.createElement('div');
          el.className = 'ev-mark';
          el.innerHTML = '<span class="ev-sweep"><b></b><i></i><i></i><i></i></span>';
          const beam = el.firstChild;
          sweep = new maplibregl.Marker({ element: el, anchor: 'center', opacityWhenCovered: '0' }).setLngLat([at.lng, at.lat]).addTo(m);
          size = () => {
            const c = m.project([at.lng, at.lat]), edge = m.project([at.lng, at.lat + radius / 111320]);
            beam.style.setProperty('--k', (Math.max(14, Math.hypot(c.x - edge.x, c.y - edge.y)) / 100).toFixed(3));
          };
          size();
          m.on('move', size);
          await wait(still ? 0 : 700);   // let the ring finish growing before the results come in
        })();
        return {
          landed,
          stop() {
            if (stopped) return;
            stopped = true;
            if (size) m.off('move', size);
            el?.remove();
            if (sweep?.getElement() === el) sweep = null;
            areas.scanning = false;
            paintAreas();
          },
        };
      }
      let scanning = false, locating = false, busyLooks = 0;
      // The Scan button shows a scan is running (a sweep of light, rings pulsing out) instead of going flat and
      // dashed like a disabled button. It stays pressable-looking but a second press is ignored while busy
      function scanBusy(on) {
        const b = document.getElementById('evLocate');
        if (!b) return;
        busyLooks = Math.max(0, busyLooks + (on ? 1 : -1));
        const busy = busyLooks > 0;
        if (busy && !b.querySelector('.ev-go-dot')) { const dot = document.createElement('i'); dot.className = 'ev-go-dot'; dot.setAttribute('aria-hidden', 'true'); b.prepend(dot); }
        b.classList.toggle('is-scanning', busy);
        b.parentElement?.classList.toggle('is-scanning', busy);
        if (busy) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy');
      }
      async function look(at, label, radius = rangeM, { quiet = false } = {}) {
        document.querySelector('.ev-scanbar')?.classList.remove('is-fresh');   // the first scan has happened: stop nudging
        mapScan.hidden = true;
        center = at;
        scanM = radius;
        const req = ++lookReq;
        scanning = true;
        if (!quiet) {
          say(`Scanning ${scanLabel()} around ${label}…`);
          listMsg(`Scanning ${scanLabel()} around ${label}…`, 'Looking for public events happening nearby.', { scanning: true });
        }
        const fx = quiet ? null : scanFx(at, radius);
        if (!quiet) scanBusy(true);
        let unbusy = !quiet;
        const stopFx = () => { fx?.stop(); if (unbusy) { unbusy = false; scanBusy(false); } };
        let r;
        try {
          [r] = await Promise.all([
            momentoApi(`/api/events/nearby?lat=${at.lat.toFixed(5)}&lng=${at.lng.toFixed(5)}&radius=${radius}`),
            new Promise((ok) => setTimeout(ok, quiet ? 0 : still ? 300 : 1600)),
            fx?.landed,   // the results wait for the globe to arrive
          ]);
        }
        catch (err) { stopFx(); scanning = false; if (req === lookReq && !quiet) { say(''); listMsg('Couldn’t look for events', err.message, { retry: true }); } return; }
        scanning = false;
        scannedAt = { lat: at.lat, lng: at.lng, t: Date.now() };
        stopFx();
        if (req !== lookReq) return;
        events = [...r.events].sort((a, b) => a.distanceM - b.distanceM);   // the closest first
        const live = events.filter((e) => e.live).length;
        lookLabel = label;
        const exact = at.approx ? ' This is your approximate area, from your internet connection.' : at.accuracy ? ` Your position is accurate to about ${dist(at.accuracy)}.` : '';
        if (following && label === 'you') { liveSay(); render({ keepView: quiet }); return; }
        say((events.length ? `${plural(events.length, 'event', 'events')} within ${scanLabel()} of ${label}${live ? `, ${live} happening now` : ''}.` : `Nothing public within ${scanLabel()} of ${label} right now.`) + exact
        );
        render();
        const want = new URLSearchParams(location.search).get('event');
        const e = want && events.find((x) => x.id === want);
        if (e) { history.replaceState(null, '', location.pathname); openSheet(e); }
      }
      function render({ keepView = false } = {}) {
        if (events.length) listEl.innerHTML = '';
        else if (RANGES.indexOf(scanM) > -1 && RANGES.indexOf(scanM) < RANGES.length - 1) {
          // Nothing this close: offer the next range up (it also moves the chips)
          const next = RANGES[RANGES.indexOf(scanM) + 1];
          listMsg(`Nothing within ${scanLabel()}`, 'No public events this close right now. Look further, or search another place above.', { retry: `Look within ${fmtRange(next)}` });
          const again = listEl.querySelector('[data-rescan]');
          again?.replaceWith(again.cloneNode(true));
          listEl.querySelector('[data-rescan]')?.addEventListener('click', () => { setRange(next, { rescan: false }); look(center, lookLabel, next); });
        }
        else listMsg(`Nothing within ${scanLabel()}`, `No public events within ${scanLabel()} right now. Scan again later, or search another place above.`, { retry: true });
        for (const e of events) listEl.append(cardFor(e));
        // The closest few show to begin with (the style sheet hides the rest until "Show all")
        listEl.classList.remove('is-all');
        moreBtn.hidden = events.length <= SHOWN;
        moreBtn.textContent = `Show all ${events.length} events`;
        const m = ensureMap();
        note.hidden = !!events.length || !m;
        if (!events.length && m) { note.textContent = 'No public events around here right now'; note.hidden = false; }
        if (!m) return;
        clearMarks();
        sweep?.remove(); sweep = null;
        // On the surface, all to true size: the scan, each event's zone, and how exact your position is
        // (or, for an approximate area, a soft circle round the nearest town instead of a precise-looking dot)
        areas.scanning = false;
        areas.scan = center ? area('scan', center.lat, center.lng, scanM) : null;
        areas.approx = center?.approx ? area('approx', center.lat, center.lng, 3000) : null;
        areas.acc = center && !center.approx ? area('acc', center.lat, center.lng, Math.max(5, center.accuracy || 5)) : null;
        areas.zones = events.map((e) => area(e.inside ? 'zone-in' : 'zone', e.zone.lat, e.zone.lng, e.zone.radiusM));
        paintAreas();
        if (center) {
          if (center.approx) me?.remove(); else meAt(center);
          tagRange(center, scanM);
        }
        events.forEach((e, i) => {
          const mk = printFor(e);
          markers.set(e.id, mk);
          // A fresh scan's prints pop in one after another, the closest first
          if (!keepView && !still) { const el = mk.getElement(); el.classList.add('is-new'); el.style.setProperty('--i', i); setTimeout(() => el.classList.remove('is-new'), 700 + i * 70); }
        });
        if (center && events.length > 1) stack = stackFor(events, center);
        if (picked && markers.has(picked.id)) markers.get(picked.id).getElement().classList.add('is-picked');
        sizeToZoom();
        liftStack();
        paintTools();
        // The globe has already landed on the scan; it only eases out if an event sits past the view
        if (keepView || !center) return;
        if (events.some((e) => !onView(e.zone.lng, e.zone.lat))) flyTo3D(center.lat, center.lng, scanBounds(events.map((e) => [e.zone.lng, e.zone.lat])), { ping: false });
      }
      function cardFor(e) {
        const w = when(e);
        const el = document.createElement('article');
        el.className = 'evc panel';
        el.tabIndex = 0;
        el.dataset.id = e.id;
        el.setAttribute('aria-label', `${e.name}, ${w.text}, ${dist(e.distanceM)} away`);
        const pics = e.pics.slice(1, 5).map((p) => `<img src="${esc(p)}" alt="" loading="lazy">`).join('') + (e.photos > 5 ? `<span>+${Math.min(e.photos - 5, 999)}</span>` : '');
        el.innerHTML = `
          <div class="evc-cover">${evCover(e) ? `<img src="${esc(evCover(e))}" alt="" loading="lazy">` : '<span class="evc-none">No photos yet</span>'}<span class="evc-tag${w.live ? ' is-live' : ''}">${w.live ? '<i></i>Live now' : 'Upcoming'}</span></div>
          <div class="evc-body">
            <h3>${esc(e.name)}</h3>
            <p class="evc-meta">${esc([(window.Momento?.event?.isPlaceholder?.(e.place) ? '' : e.place), `by ${e.hostName}`].filter(Boolean).join(' · '))}</p>
            ${w.live ? '' : `<p class="evc-when">${esc(w.text)}</p>`}
            <p class="evc-where"><b>${e.direction === 'here' ? 'Right here' : `${dist(e.distanceM)} ${e.direction ? e.direction : 'away'}`}</b>${whereChip(e)}</p>
            ${pics ? `<div class="evc-pics">${pics}</div>` : ''}
          </div>`;
        el.addEventListener('click', () => selectEvent(e));
        el.addEventListener('keydown', (k) => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); el.click(); } });
        el.addEventListener('pointerenter', () => pick(e, false));
        return el;
      }
      function pick(e, scroll) {
        picked = e;
        listEl.querySelectorAll('.evc').forEach((c) => c.classList.toggle('is-picked', c.dataset.id === e.id));
        markers.forEach((mk, id) => mk.getElement().classList.toggle('is-picked', id === e.id));
        if (scroll) listEl.querySelector(`.evc[data-id="${CSS.escape(e.id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }

      // ---- An event's sheet: its photos, what it is, and the way in ----
      function openSheet(e) {
        const w = when(e);
        const grid = e.pics.length
          ? `<div class="ev-grid">${e.pics.map((p) => `<img src="${esc(p)}" alt="" loading="lazy">`).join('')}</div>`
          : '<p class="ev-grid-empty">Photos are available inside the album.</p>';
        card.innerHTML = `
          <button class="ev-x" type="button" data-close aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
          <div class="ev-hero">${evCover(e) ? `<img src="${esc(evCover(e))}" alt="">` : ''}<span class="evc-tag${w.live ? ' is-live' : ''}">${w.live ? '<i></i>' : ''}${esc(w.text)}</span><h2 id="evSheetTitle">${esc(e.name)}</h2></div>
          <div class="ev-info">
            <p class="evc-meta">${esc([e.venue?.address || (window.Momento?.event?.isPlaceholder?.(e.place) ? '' : e.place), `Hosted by ${e.hostName}`].filter(Boolean).join(' · '))}</p>
            <p class="evc-where"><b>${e.direction === 'here' ? 'Right here' : `${dist(e.distanceM)} ${e.direction ? e.direction : 'away'}`}</b>${whereChip(e)}</p>
            <p class="ev-facts"><span><b>${plural(e.photos, 'photo', 'photos')}</b></span><span><b>${plural(e.guests, 'person', 'people')}</b> in it</span><span>Venue radius <b>${dist(e.zone.radiusM)}</b></span></p>
          </div>
          ${grid}
          <div class="ev-acts">
            ${e.joined
              ? `<a class="btn btn-dark" href="albums.html#album=${encodeURIComponent(e.id)}">Open album</a>`
              : `<button class="btn btn-dark" type="button" data-join>Join and add photos</button>`}
            <p class="ev-acts-note" role="status">${e.joined ? 'You’re in this album.' : 'Check in to join. If approval is needed, your request goes to the host.'}</p>
          </div>`;
        card.querySelector('[data-close]').addEventListener('click', closeSheet);
        card.querySelector('[data-join]')?.addEventListener('click', (k) => join(e, k.currentTarget));
        sheet.showModal();
        card.scrollTop = 0;
        if (!still) {
          try { sheet.animate({ opacity: [0, 1] }, { duration: 300, easing: 'ease-out', pseudoElement: '::backdrop' }); } catch (err) {}
          card.animate([{ opacity: 0, transform: 'translateY(16px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22, 1, .36, 1)' });
        }
      }
      async function closeSheet() {
        if (!sheet.open || sheet._closing) return;
        sheet._closing = true;
        if (!still) {
          const jobs = [card.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(10px) scale(.985)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).finished];
          try { jobs.push(sheet.animate({ opacity: [1, 0] }, { duration: 260, easing: 'ease-in', fill: 'forwards', pseudoElement: '::backdrop' }).finished); } catch (err) {}
          await Promise.all(jobs).catch(() => {});
        }
        sheet.close();
        sheet.getAnimations({ subtree: true }).forEach((a) => a.cancel());
        sheet._closing = false;
      }
      sheet.addEventListener('cancel', (k) => { k.preventDefault(); closeSheet(); });
      sheet.addEventListener('pointerdown', (k) => { sheet._down = k.target === sheet; });
      sheet.addEventListener('click', (k) => { if (k.target === sheet && sheet._down) closeSheet(); });

      // ---- Where you really are (asked for only when you press a button) ----
      // Where you are, from the phone or computer itself (free: no map service involved).
      // A quick fix first (Wi-Fi based, fine for a 1 km scan), then a precise one if that fails.
      // A failure says which kind it was: 'blocked' (this browser said no to Momento) or 'device'
      // (the device couldn't work out where it is: location off in Windows, no Wi-Fi, no location service)
      const fail = (kind, text) => Object.assign(new Error(text), { kind });
      async function locate() {
        if (!navigator.geolocation || !window.isSecureContext) throw fail('device', 'This browser can’t share a location here.');
        // Says why first, the first time
        if (Momento.permission && !(await Momento.permission.ensure('location'))) {
          // Blocked in the browser, or they tapped Not now on Momento's explanation
          const state = await Momento.permission.state('location').catch(() => '');
          throw state === 'denied' ? fail('blocked', 'Location is blocked for Momento in this browser.') : fail('declined', 'No problem: Momento only uses your location when you scan.');
        }
        // The phone (or computer) improves its fix over a few seconds: keep listening for up to 12 s
        // and use the most precise one, stopping as soon as it's within 25 m. Never a cached position.
        const best = () => new Promise((resolve, reject) => {
          let top = null, lastErr = null, done = false;
          const finish = () => {
            if (done) return; done = true;
            navigator.geolocation.clearWatch(id); clearTimeout(timer);
            top ? resolve(top) : reject(lastErr || { code: 3 });
          };
          const id = navigator.geolocation.watchPosition((p) => {
            const fix = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) };
            if (!top || fix.accuracy < top.accuracy) top = fix;
            say(`Finding you… accurate to about ${dist(top.accuracy)} so far`);
            if (top.accuracy <= 25) finish();
          }, (e) => { lastErr = e; if (e.code === 1) finish(); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 });
          const timer = setTimeout(finish, 12000);
        });
        const once = () => new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }), reject,
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }));
        try { return await best(); }
        catch (first) {
          try { return await once(); }
          catch (err) {
            const state = await Momento.permission?.state?.('location').catch?.(() => '') ?? '';
            if (state === 'denied') throw fail('blocked', 'Location is blocked for Momento in this browser.');
            throw fail('device', 'This device couldn’t work out where you are.');
          }
        }
      }

      // When your own location can't be used: say why, and offer the free ways that always work
      const isWindows = /Windows/.test(navigator.userAgent);
      function locationHelp(err) {
        moreBtn.hidden = true;
        const blocked = err.kind === 'blocked', declined = err.kind === 'declined';
        const tip = declined ? 'Tap Scan nearby whenever you’re ready to share it.'
          : blocked ? 'You can allow it again in this browser’s site settings.'
          : isWindows ? 'On a Windows PC, check Settings › Privacy & security › Location: turn on Location services and “Let desktop apps access your location”, and connect to Wi-Fi.'
          : 'Check that Location is on for this device and browser, and that you’re on Wi-Fi or mobile data.';
        listEl.innerHTML = `<div class="ev-empty ev-scan panel is-idle"><h2></h2><p></p><p class="ev-alt">You can also search for a town above.</p>
          <div class="ev-scan-acts">${blocked ? '<button class="btn btn-light" type="button" data-how>How to allow it</button>' : ''}<button class="btn btn-light" type="button" data-again>Try again</button><button class="btn btn-dark" type="button" data-area>Use my approximate area</button></div></div>`;
        listEl.querySelector('h2').textContent = declined ? 'Scan without your location' : blocked ? 'Location is blocked for Momento' : 'Couldn’t find where you are';
        if (declined) listEl.querySelector('[data-again]').textContent = 'Scan nearby';
        listEl.querySelector('p').textContent = `${err.message} ${tip}`;
        listEl.querySelector('[data-how]')?.addEventListener('click', (e) => Momento.permission?.request('location', { from: e.currentTarget }).then((ok) => ok && useMyLocation()));
        listEl.querySelector('[data-again]').addEventListener('click', () => useMyLocation());
        listEl.querySelector('[data-area]').addEventListener('click', () => approximateArea());
        listEl.querySelectorAll('.btn').forEach((b) => rollButton?.(b));
        const m = ensureMap();
        if (m) { note.textContent = 'Search a place above to see nearby events'; note.hidden = false; mapScan.hidden = true; }
      }

      // Roughly where you are from your internet connection (a free service, no key, no account).
      // Only about the nearest town, so it scans 5 km around it
      async function approximateArea() {
        say('Finding your area…');
        listMsg('Finding your area…', 'Using your internet connection to find the nearest town.', { scanning: true });
        try {
          const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
          const r = await fetch('https://get.geojs.io/v1/ip/geo.json', { cache: 'no-store', signal: ctl.signal }).then((x) => (x.ok ? x.json() : Promise.reject()));
          clearTimeout(t);
          const at = { lat: Number(r.latitude), lng: Number(r.longitude), approx: true };
          if (!Number.isFinite(at.lat) || !Number.isFinite(at.lng)) throw new Error();
          stopFollowing();
          await look(at, r.city || 'your area');
        } catch (e) {
          say('');
          listMsg('Couldn’t find your area', 'Search a town or place above.', { retry: true });
        }
      }
      async function join(e, btn) {
        if (!Momento.account?.get?.()) { Momento.needLogin({ action: 'join', from: btn, next: 'events.html#events', album: { name: e.name, hostName: e.hostName, photos: e.photos, guests: e.guests, live: e.live, cover: e.cover } }); return; }
        const noteEl = card.querySelector('.ev-acts-note');
        const tell = (t, bad) => { noteEl.textContent = t; noteEl.classList.toggle('is-error', !!bad); };
        btn.disabled = true;
        const label = btn.textContent;
        btn.textContent = 'Checking where you are…';
        try {
          const r = await Momento.eventAdmission('/api/events/' + encodeURIComponent(e.id) + '/join', {});
          if (r.pending) { tell('Waiting for host approval.'); btn.textContent = 'Requested'; document.dispatchEvent(new CustomEvent('momento:albums')); return; }
          e.joined = true;
          tell(r.already ? 'You were already in. Opening the album…' : 'You’re in! Opening the album…');
          btn.textContent = 'Opening…';
          Momento.flash?.(`You joined ${e.name}`, 'Add your photos while it’s on.');
          setTimeout(() => { if (Momento.openAlbumHere) Momento.openAlbumHere(e.id); else location.href = 'albums.html#album=' + encodeURIComponent(e.id); }, 700);
        } catch (err) {
          btn.disabled = false; btn.textContent = label;
          tell(err.message, true);
        }
      }

      // ---- Use my location ----
      const locBtn = $('evLocate');
      // ---- Following you: the dot moves as you move ----
      // The phone keeps sending positions; each one moves the dot and its accuracy circle. Readings that
      // are much worse than the last good one, or that jump faster than any person travels, are ignored
      // so the dot doesn't leap about. After moving 100 m (400 m on a 5 km scan) it scans again quietly.
      // Nothing is tracked while the page is hidden, and nothing is sent anywhere but this page.
      let watchId = null, following = false;
      const metres = (a, b) => {
        const r = Math.PI / 180, h = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2;
        return 12742000 * Math.asin(Math.sqrt(Math.min(1, h)));
      };
      function liveSay() {
        const n = events.length, liveNow = events.filter((e) => e.live).length;
        say(`Following you live · ${n ? `${plural(n, 'event', 'events')} within ${scanLabel()}${liveNow ? `, ${liveNow} happening now` : ''}` : `nothing within ${scanLabel()} yet`} · accurate to about ${dist(real?.accuracy || 5)}`);
      }
      function onFix(p) {
        const fix = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy), at: Date.now() };
        if (real && real.at) {
          const fresh = fix.at - real.at < 60000;
          // Much less exact than the last good reading (and that one is recent): skip it
          if (fresh && fix.accuracy > Math.max(100, real.accuracy * 3)) return;
          // Faster than 60 m/s (216 km/h) beyond what the two readings' accuracy allows: a glitch
          const moved = metres(real, fix) - real.accuracy - fix.accuracy;
          if (moved > 0 && moved / Math.max(1, (fix.at - real.at) / 1000) > 60) return;
        }
        real = fix;
        if (!following) return;
        center = real;
        if (mapOk) {
          // The dot, its accuracy circle and the scan move with you
          if (areas.scan) areas.scan = area('scan', fix.lat, fix.lng, scanM);
          areas.acc = area('acc', fix.lat, fix.lng, Math.max(5, fix.accuracy));
          paintAreas();
          meAt(fix);
          if (rangeTag?.getElement().isConnected) tagRange(fix, scanM);
        }
        liveSay();
        // Far enough from where the last scan was: scan again, quietly
        const step = Math.min(400, Math.max(50, scanM / 10));   // re-scan after moving about a tenth of the range
        if (!scanning && scannedAt && metres(scannedAt, fix) > step && Date.now() - scannedAt.t > 4000) look(real, 'you', scanM, { quiet: true });
      }
      function watch() {
        if (watchId !== null || !navigator.geolocation) return;
        watchId = navigator.geolocation.watchPosition(onFix, (e) => { if (e.code === 1) stopFollowing(); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
      }
      function unwatch() { if (watchId !== null) navigator.geolocation.clearWatch(watchId); watchId = null; }
      // Scanning only happens while the Events section is on screen (or when Scan is pressed). Scroll away and
      // following stops; come back and it picks up again with a fresh look around
      // It also waits while a window is open over the page (joining with a code, an album, the QR scanner, a
      // location question), so the two never fight over the screen, the location or the focus; it carries on
      // once the window closes
      let inView = false, pausedFollow = false, autoScan = false, covered = false;
      const resume = () => {
        if (!inView || covered) return;
        if (autoScan) { autoScan = false; useMyLocation(); }
        else if (pausedFollow && real && !real.approx) { startFollowing(); look(real, 'you', scanM, { quiet: true }); }
      };
      new MutationObserver(() => {
        const now = !!document.querySelector('dialog[open]');
        if (now === covered) return;
        covered = now;
        if (covered) { if (following) { stopFollowing(); pausedFollow = true; } }
        else resume();
      }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['open'] });
      function startFollowing() {
        if (!inView || covered) { following = false; pausedFollow = true; paintFollow(); return; }
        pausedFollow = false; following = true; watch(); paintFollow(); liveSay();
      }
      function stopFollowing() { following = false; pausedFollow = false; unwatch(); paintFollow(); }
      // (on screen means a good part of it, for half a second: a glimpse while the page loads or scrolls past doesn't count)
      let dwell = 0;
      new IntersectionObserver(([en]) => {
        clearTimeout(dwell);
        if (en.intersectionRatio >= 0.15) {
          dwell = setTimeout(() => { inView = true; resume(); }, 500);
        } else {
          inView = false;
          if (following) { stopFollowing(); pausedFollow = true; say(''); }
        }
      }, { threshold: [0, 0.15] }).observe(document.getElementById('events'));
      // Nothing is tracked while the page is in the background
      document.addEventListener('visibilitychange', () => { if (document.hidden) unwatch(); else if (following && inView) watch(); });
      addEventListener('pagehide', unwatch);

      // Over the globe: "Live" while following, or "Follow me" to start again
      let followBtn = null;
      function paintFollow() {
        const m = ensureMap();
        if (!m) return;
        if (!followBtn) {
          followBtn = document.createElement('button');
          followBtn.type = 'button';
          followBtn.className = 'ev-follow';
          followBtn.addEventListener('click', () => (following ? null : (real && !real.approx ? (startFollowing(), look(real, 'you', scanM)) : useMyLocation())));
          box.append(followBtn);
        }
        const b = followBtn;
        b.classList.toggle('is-live', following);
        b.innerHTML = following ? '<i aria-hidden="true"></i>Live' : '<i aria-hidden="true"></i>Follow me';
        b.setAttribute('aria-pressed', String(following));
        b.title = following ? 'Your position is following you as you move' : 'Follow my position as I move';
        b.hidden = !following && !real;
      }

      async function useMyLocation() {
        if (locating) return;
        locating = true; scanBusy(true);
        say('Finding you…');
        listMsg('Scanning for events near you…', `Checking for public events within ${fmtRange(rangeM)}.`, { scanning: true });
        try {
          real = { ...(await locate()), at: Date.now() };
          following = true;
          await look(real, 'you');
          startFollowing();
        }
        catch (err) {
          say('');
          stopFollowing();
          locationHelp(err);
        }
        finally { locating = false; scanBusy(false); }
      }
      locBtn.addEventListener('click', useMyLocation);

      // ---- How far to look: the chips beside the search. Picking one scans again from wherever you last looked ----
      const rangeEl = $('evRange'), chips = [...rangeEl.querySelectorAll('[role="radio"]')];
      let rangeTimer = 0;
      const showIdle = () => {
        listMsg('Scan to see the events near you', `Pick how far to look, then scan to see public events within ${fmtRange(rangeM)}. Momento asks for your location first, and only uses it when you scan.`, { cta: true });
        listEl.querySelector('.ev-scan')?.setAttribute('data-idle', '');
        mapScan.hidden = false; note.hidden = true;   // the globe's own scan button, until a scan happens
      };
      function paintRange() {
        rangeEl.style.setProperty('--i', Math.max(0, RANGES.indexOf(rangeM)));
        chips.forEach((b) => { const on = +b.dataset.m === rangeM; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; });
        document.querySelectorAll('[data-range-label]').forEach((el) => { el.textContent = fmtRange(rangeM); });
      }
      function setRange(m, { rescan = true } = {}) {
        if (!RANGES.includes(m)) return;
        rangeM = m;
        try { localStorage.setItem(RANGE_KEY, String(m)); } catch (err) {}
        paintRange();
        clearTimeout(rangeTimer);
        if (!center) { if (listEl.querySelector('.ev-scan[data-idle]')) showIdle(); return; }   // nothing scanned yet: only the wording changes
        if (rescan) rangeTimer = setTimeout(() => look(center, lookLabel, rangeM), 300);   // a short pause, so tapping through the chips scans once
      }
      rangeEl.addEventListener('click', (k) => { const b = k.target.closest('[role="radio"]'); if (b) setRange(+b.dataset.m); });
      rangeEl.addEventListener('keydown', (k) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[k.key];
        if (step === undefined && k.key !== 'Home' && k.key !== 'End') return;
        k.preventDefault();
        const to = k.key === 'Home' ? 0 : k.key === 'End' ? RANGES.length - 1 : Math.min(RANGES.length - 1, Math.max(0, RANGES.indexOf(rangeM) + step));
        setRange(RANGES[to]);
        chips[to].focus();
      });
      paintRange();

      // ---- Or look around somewhere else (OpenStreetMap place search, no key needed) ----
      const input = $('evSearch'), sug = $('evSuggest');
      let found = [], active = -1, timer = 0, ctrl = null;
      const open = (v) => { sug.hidden = !v; input.setAttribute('aria-expanded', v); };
      const paint = () => {
        sug.innerHTML = found.map((s, i) => `<li role="option" data-i="${i}" class="${i === active ? 'is-active' : ''}" aria-selected="${i === active}"><b>${esc(s.name)}</b><small>${esc(s.address)}</small></li>`).join('');
        open(found.length > 0);
      };
      async function suggest(q) {
        ctrl?.abort(); ctrl = new AbortController();
        const u = new URL('https://photon.komoot.io/api/');
        u.searchParams.set('q', q); u.searchParams.set('limit', '6');
        const r = await fetch(u, { signal: ctrl.signal });
        const { features = [] } = await r.json();
        return features.map(({ properties: p, geometry: g }) => ({
          name: p.name || p.city || p.street || q,
          address: [p.city !== p.name ? p.city : '', p.state, p.country].filter(Boolean).join(', '),
          lat: g.coordinates[1], lng: g.coordinates[0],
        })).slice(0, 5);
      }
      const choose = (s) => { input.value = s.name; open(false); stopFollowing(); look({ lat: s.lat, lng: s.lng }, s.name); };
      input.addEventListener('input', () => {
        clearTimeout(timer);
        const q = input.value.trim();
        if (q.length < 2) { found = []; open(false); return; }
        timer = setTimeout(async () => { try { found = await suggest(q); active = found.length ? 0 : -1; paint(); } catch (err) { if (err.name !== 'AbortError') open(false); } }, 250);
      });
      input.addEventListener('keydown', (k) => {
        if (sug.hidden || !found.length) return;
        if (k.key === 'ArrowDown' || k.key === 'ArrowUp') { k.preventDefault(); active = (active + (k.key === 'ArrowDown' ? 1 : -1) + found.length) % found.length; paint(); }
        else if (k.key === 'Enter') { k.preventDefault(); choose(found[Math.max(0, active)]); }
        else if (k.key === 'Escape') open(false);
      });
      sug.addEventListener('pointerdown', (k) => { const li = k.target.closest('li[data-i]'); if (li) { k.preventDefault(); choose(found[+li.dataset.i]); } });
      input.addEventListener('blur', () => setTimeout(() => open(false), 120));

      // ---- Tell me when something's on near me (checked by assets/nearby.js on every page) ----
      const notifyBtn = $('evNotify');
      // Arriving from "Event alerts" in the footer: bring the switch into view and point it out
      const toAlerts = () => {
        if (location.hash !== '#alerts') return;
        const row = notifyBtn.closest('.ev-notify');
        row.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
        notifyBtn.focus({ preventScroll: true });
        if (!still) row.animate([{ boxShadow: '0 0 0 0 rgba(184, 174, 245, 0)' }, { boxShadow: '0 0 0 6px rgba(184, 174, 245, .45)' }, { boxShadow: '0 0 0 0 rgba(184, 174, 245, 0)' }], { duration: 1400, delay: 300, easing: 'ease-in-out' });
      };
      addEventListener('hashchange', toAlerts);
      setTimeout(toAlerts, 600);
      const notifyOn = () => { try { return localStorage.getItem(NOTIFY) === '1'; } catch (err) { return false; } };
      notifyBtn.setAttribute('aria-checked', notifyOn());
      notifyBtn.addEventListener('click', async () => {
        const on = !notifyOn();
        try { localStorage.setItem(NOTIFY, on ? '1' : '0'); } catch (err) {}
        notifyBtn.setAttribute('aria-checked', on);
        if (on && 'Notification' in window && Notification.permission === 'default') {
          const p = (await Momento.permission.request('notifications', { from: notifyBtn })) ? 'granted' : 'denied';
          Momento.toast?.(p === 'granted' ? 'You’ll hear about events near you' : 'You’ll see a message on Momento', p === 'granted' ? 'Momento will tell you when you’re inside a public event’s zone.' : 'Browser notifications are off, so the alert shows on the page instead.');
        } else Momento.toast?.(on ? 'You’ll hear about events near you' : 'Event alerts are off', on ? 'Momento will tell you when you’re inside a public event’s zone.' : 'Turn them back on here any time.');
        if (on && !real) useMyLocation();
      });

      // ---- Start: the map, and your location straight away if you've already allowed it ----
      document.addEventListener('DOMContentLoaded', async () => {
        let user;
        try { user = await Momento.sessionReady; }
        catch (err) { say('Couldn’t reach Momento. Check your connection, then reload the page.', true); return; }
        // Visitors (not logged in) can scan and look at events too; joining one asks them to log in
        // Events is one part of a longer page, so it never asks for your location unprompted: if you've
        // already allowed it, it scans when you reach the Events section; otherwise it waits for a tap on "Scan nearby"
        ensureMap();
        let allowed = false;
        try { allowed = (await navigator.permissions?.query({ name: 'geolocation' }))?.state === 'granted'; } catch (err) {}
        // Already allowed: it scans once the Events section is on screen (straight away if it already is)
        if (allowed) { showIdle(); autoScan = true; resume(); }
        else showIdle();
      });
    })();

    // ---- Groups ----
    // Make a group, invite people with a link or QR code, accept or decline invites, and browse each group's albums.
    // Each group is a tile; opening one slides in a panel with its albums and people.
    // Being in a group is what gives access to its albums: the server checks it on every album and photo.
    (() => {
      const $ = (id) => document.getElementById(id);
      const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      // An album's cover: the host's own image while it's upcoming, then its most loved photo (the server decides)
      const evCover = (a) => a.cover?.thumbUrl || a.pics?.[0] || null;
      const plural = (n, one, many) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
      const FACES = ['#D9D0EA', '#E6CDD6', '#C9DEDB', '#EADCC8', '#D3DCEE'];
      const statusEl = $('grStatus'), body = $('grBody'), inviteBox = $('grInvites'), drawer = $('grDrawer'), panel = $('grPanel');
      const say = (t, bad) => { statusEl.textContent = t || ''; statusEl.classList.toggle('is-error', !!bad); };
      const ICON = {
        mail: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/></svg>',
        plus: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
        close: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
      };

      // The link (and so the QR code) that lets people into a group; a native share sheet only where there is one
      const linkOf = (g) => (Momento.groupLink ? Momento.groupLink(g.inviteCode) : 'https://api.hexarch.org/s/' + encodeURIComponent(g.inviteCode));
      // The QR keeps the old-style link: the in-app scanner reads ?group= (a /s/ code can't say album or group)
      const qrLinkOf = (g) => new URL('events.html?group=' + encodeURIComponent(g.inviteCode), location.href).href;
      const canShare = !!navigator.share && matchMedia('(pointer: coarse)').matches;
      const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

      let groups = [], invites = [];
      let openId = null;   // the group whose panel is open, kept across redraws

      const initials = (name) => (name === 'You' ? 'You' : String(name).trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?');
      const hue = (id) => FACES[[...String(id)].reduce((t, c) => t + c.charCodeAt(0), 0) % FACES.length];
      const face = (m, i = 0) => `<span class="grc-face${m.you ? ' is-you' : ''}" style="--c: ${hue(m.id)}; --z: ${9 - i}" title="${esc(m.name)}">${m.avatarUrl ? `<img src="${esc(m.avatarUrl)}" alt="" referrerpolicy="no-referrer">` : esc(initials(m.name))}</span>`;
      function showInitials(event) {
        const img = event.target;
        if (img.matches?.('.grc-face > img')) {
          const badge = img.parentElement;
          badge.textContent = initials(badge.title);
        }
      }
      // Image errors don't bubble. Capture them for both the cards and the open group.
      body.addEventListener('error', showInitials, true);
      panel.addEventListener('error', showInitials, true);
      const dateOf = (a) => new Date(a.date + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

      async function load(quiet) {
        try {
          ({ groups, invites } = await momentoApi('/api/groups'));
          if (!quiet) say('');
        } catch (err) {
          say(err.message, true);
          return;
        }
        render();
      }

      function render() {
        body.removeAttribute('aria-busy');
        body.textContent = '';
        // Invites go to "Needs you" at the top of the page: they're the one thing here that needs an answer
        inviteBox.textContent = '';
        for (const i of invites) inviteBox.append(inviteCard(i));
        inviteBox.querySelectorAll('.btn').forEach(rollButton);
        inviteBox.querySelectorAll('.panel').forEach(lightUp);
        if (!groups.length) {
          const empty = document.createElement('div');
          empty.className = 'gr-empty panel';
          empty.innerHTML = `
            <h3>Start a group for the people you share with most</h3>
            <p>Make a group, share its link or QR code, then share albums with it. Everyone who joins sees every album the group shares, including ones added later.</p>
            <button class="btn btn-dark" type="button" data-new>Make a group</button>`;
          empty.querySelector('[data-new]').addEventListener('click', (e) => newGroup(e.currentTarget));
          body.append(empty);
        } else {
          const grid = document.createElement('div');
          grid.className = 'gt-grid';
          for (const g of groups) grid.append(groupTile(g));
          const add = document.createElement('button');
          add.type = 'button';
          add.className = 'gt-add';
          add.innerHTML = `${ICON.plus}<span>New group</span>`;
          add.addEventListener('click', (e) => newGroup(e.currentTarget));
          grid.append(add);
          body.append(grid);
        }
        body.querySelectorAll('.btn').forEach(rollButton);
        body.querySelectorAll('.panel').forEach(lightUp);
        // A panel that was open shows the new data, or closes if its group is gone
        const open = openId && groups.find((x) => x.id === openId);
        if (open) paintPanel(open); else if (openId) { openId = null; closePanel(); }
        openFromHash();
      }

      // ---- An invite waiting for you ----
      function inviteCard(i) {
        const el = document.createElement('article');
        el.className = 'gri panel';
        el.innerHTML = `
          <i class="gri-ic" aria-hidden="true">${ICON.mail}</i>
          <p class="gri-text"><b>${esc(i.by)}</b> invited you to the group <b>${esc(i.group.name)}</b><small>${plural(i.members, 'person', 'people')} in it, ${plural(i.albums, 'shared album', 'shared albums')}</small></p>
          <div class="gri-acts"><button class="btn btn-light" type="button" data-no>Decline</button><button class="btn btn-dark" type="button" data-yes>Join group</button></div>`;
        el.querySelector('[data-yes]').addEventListener('click', async (e) => {
          e.currentTarget.disabled = true;
          try {
            const { group } = await momentoApi(`/api/groups/invites/${encodeURIComponent(i.id)}/accept`, { method: 'POST' });
            Momento.toast(`You joined ${group.name}`, group.albums.length ? `${plural(group.albums.length, 'album', 'albums')} added to My albums` : 'Albums shared with it will show up here');
            await load();
            openPanel(group.id);
          } catch (err) { e.currentTarget.disabled = false; Momento.toast('Couldn’t join the group', err.message); }
        });
        el.querySelector('[data-no]').addEventListener('click', async (e) => {
          const ok = await Momento.confirm({ from: e.currentTarget, title: `Decline the invite to ${i.group.name}?`, body: `${i.by} can invite you again later.`, ok: 'Decline', danger: false });
          if (!ok) return;
          try {
            await momentoApi(`/api/groups/invites/${encodeURIComponent(i.id)}/decline`, { method: 'POST' });
            Momento.toast('Invite declined', i.group.name);
            await load();
          } catch (err) { Momento.toast('Couldn’t decline the invite', err.message); }
        });
        return el;
      }

      // ---- A group, as a tile: its faces, its name, and a peek at its albums ----
      function groupTile(g) {
        const shown = g.members.slice(0, 4);
        const more = g.members.length - shown.length;
        const live = g.albums.some((a) => a.live);
        const peek = g.albums.slice(0, 3).map((a) => (evCover(a) ? `<img src="${esc(evCover(a))}" alt="" loading="lazy">` : '<span></span>')).join('');
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'gt panel';
        el.dataset.id = g.id;
        el.setAttribute('aria-label', `${g.name}, ${plural(g.members.length, 'person', 'people')}, ${plural(g.albums.length, 'shared album', 'shared albums')}. Open group`);
        el.innerHTML = `
          <span class="grc-faces" aria-hidden="true">${shown.map((m, i) => face(m, i)).join('')}${more > 0 ? `<span class="grc-face is-more">+${more}</span>` : ''}</span>
          <span class="gt-name"><b>${esc(g.name)}</b><small>${plural(g.members.length, 'person', 'people')}, ${plural(g.albums.length, 'album', 'albums')}</small></span>
          ${g.albums.length
            ? `<span class="gt-pics" aria-hidden="true">${peek}${live ? '<em class="gt-live"><i></i>Live now</em>' : ''}</span>`
            : '<span class="gt-none">No albums yet</span>'}`;
        el.addEventListener('click', () => openPanel(g.id, el));
        return el;
      }

      // ---- A group opened: its albums and people, in a panel beside the page ----
      let opener = null;
      function paintPanel(g) {
        const owner = g.role === 'owner';
        const shown = g.members.slice(0, 5);
        const more = g.members.length - shown.length;
        const albums = g.albums.map((a) => `
          <a class="gra" href="albums.html#album=${encodeURIComponent(a.id)}" aria-label="${esc(a.name)}, ${esc(dateOf(a))}, ${plural(a.photos, 'photo', 'photos')}">
            <span class="gra-pic">${evCover(a) ? `<img src="${esc(evCover(a))}" alt="" loading="lazy">` : '<span class="gra-none">No photos yet</span>'}${a.live ? '<span class="gra-live"><i></i>Live</span>' : ''}</span>
            <b>${esc(a.name)}</b>
            <small>${esc(dateOf(a))}, ${plural(a.photos, 'photo', 'photos')}</small>
            <small>${a.hostIsYou ? 'You’re hosting' : `Host: ${esc(a.hostName)}`}</small>
          </a>`).join('');
        const people = g.members.map((m) => `
          <li>${face(m, 0)}<span class="grc-who"><b>${esc(m.name)}</b><small>${m.role === 'owner' ? 'Made the group' : `Joined ${new Date(m.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}</small></span>
            ${owner && !m.you ? `<button class="grc-link is-danger" type="button" data-remove="${esc(m.id)}" data-name="${esc(m.name)}">Remove</button>` : ''}</li>`).join('');
        const scroll = panel.scrollTop;
        panel.innerHTML = `
          <div class="gd-top">
            <span class="grc-faces" aria-hidden="true">${shown.map((m, i) => face(m, i)).join('')}${more > 0 ? `<span class="grc-face is-more">+${more}</span>` : ''}</span>
            <button class="gd-x" type="button" data-close aria-label="Close">${ICON.close}</button>
          </div>
          <h2 class="gd-title" id="grTitle">${esc(g.name)}</h2>
          <p class="gd-sub">${plural(g.members.length, 'person', 'people')}, ${plural(g.albums.length, 'shared album', 'shared albums')}${owner ? '. You made it' : ''}</p>
          ${g.inviteCode ? `
          <section class="gd-invite" aria-label="Invite people to ${esc(g.name)}">
            <p class="gd-invite-label">Invite people with a link or QR code</p>
            <p class="gd-invite-note">Anyone who opens the link or scans the code can join, and sees every album shared with the group.</p>
            <span class="gd-invite-link" data-link-text>${esc(linkOf(g))}</span>
            <div class="gd-acts">
              <button class="btn btn-dark" type="button" data-qr>Show QR code</button>
              <button class="btn btn-light" type="button" data-copy>Copy link</button>
              ${canShare ? '<button class="btn btn-light" type="button" data-share>Share</button>' : ''}
            </div>
            ${owner ? '<button class="grc-link" type="button" data-reset>Reset link</button>' : ''}
          </section>` : ''}
          <h3 class="gd-h3">Albums</h3>
          <div class="gd-albums" aria-label="Albums shared with ${esc(g.name)}">
            ${albums}
            <button class="gra-add" type="button" data-create data-create-group="${esc(g.id)}" data-create-group-name="${esc(g.name)}">${ICON.plus}${g.albums.length ? 'Share another album' : 'Share the first album with this group'}</button>
          </div>
          <h3 class="gd-h3">People</h3>
          <ul class="grc-list">${people}</ul>
          <div class="grc-foot">
            ${owner
              ? '<button class="grc-link" type="button" data-rename>Rename group</button><button class="grc-link is-danger" type="button" data-delete>Delete group</button>'
              : '<button class="grc-link is-danger" type="button" data-leave>Leave group</button>'}
          </div>`;
        panel.scrollTop = scroll;
        panel.querySelectorAll('.btn').forEach(rollButton);
        panel.querySelector('[data-close]').addEventListener('click', closePanel);
        panel.querySelector('[data-qr]')?.addEventListener('click', (e) => showQr(g, e.currentTarget));
        panel.querySelector('[data-copy]')?.addEventListener('click', (e) => copyLink(g, e.currentTarget));
        panel.querySelector('[data-share]')?.addEventListener('click', (e) => shareLink(g, e.currentTarget));
        panel.querySelector('[data-reset]')?.addEventListener('click', (e) => resetLink(g, e.currentTarget));
        panel.querySelector('[data-rename]')?.addEventListener('click', (e) => rename(g, e.currentTarget));
        panel.querySelector('[data-delete]')?.addEventListener('click', (e) => removeGroup(g, e.currentTarget));
        panel.querySelector('[data-leave]')?.addEventListener('click', (e) => leave(g, e.currentTarget));
        panel.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => removeMember(g, b)));
      }
      const phone = matchMedia('(max-width: 600px)');
      function openPanel(id, from) {
        const g = groups.find((x) => x.id === id);
        if (!g) return;
        openId = id;
        if (from) opener = from;
        // The open group is kept in the address, so a reload opens it again
        history.replaceState(history.state, '', location.pathname + location.search + '#group=' + encodeURIComponent(id));
        paintPanel(g);
        if (drawer.open) return;
        panel.scrollTop = 0;
        drawer.showModal();
        if (!still) {
          const slide = phone.matches ? 'translateY(48px)' : 'translateX(48px)';
          try { drawer.animate({ opacity: [0, 1] }, { duration: 300, easing: 'ease-out', pseudoElement: '::backdrop' }); } catch (err) {}
          panel.animate([{ opacity: 0, transform: slide }, { opacity: 1, transform: 'none' }], { duration: 420, easing: OUT });
        }
      }
      async function closePanel() {
        if (!drawer.open || drawer._closing) return;
        drawer._closing = true;
        openId = null;
        if (!still) {
          const to = phone.matches ? 'translateY(32px)' : 'translateX(32px)';
          const jobs = [panel.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: to }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).finished];
          try { jobs.push(drawer.animate({ opacity: [1, 0] }, { duration: 260, easing: 'ease-in', fill: 'forwards', pseudoElement: '::backdrop' }).finished); } catch (err) {}
          await Promise.all(jobs).catch(() => {});
        }
        drawer.close();
        drawer.getAnimations({ subtree: true }).forEach((a) => a.cancel());
        drawer._closing = false;
        // Back to the tile it came from (which is drawn again whenever the list reloads)
        const tile = opener?.dataset?.id && body.querySelector(`.gt[data-id="${CSS.escape(opener.dataset.id)}"]`);
        (tile || (opener?.isConnected ? opener : null))?.focus({ preventScroll: true });
      }
      drawer.addEventListener('cancel', (e) => { e.preventDefault(); closePanel(); });
      drawer.addEventListener('pointerdown', (e) => { drawer._down = e.target === drawer; });
      drawer.addEventListener('click', (e) => { if (e.target === drawer && drawer._down) closePanel(); });
      drawer.addEventListener('close', () => {
        openId = null;
        if (/^#group=/.test(location.hash)) history.replaceState(history.state, '', location.pathname + location.search + '#groups');
      });

      // Links like events.html#group=<id> open that group
      function openFromHash() {
        const id = decodeURIComponent((location.hash.match(/^#group=(.+)$/) || [])[1] || '');
        if (!id || !groups.some((g) => g.id === id)) return;
        history.replaceState(null, '', location.pathname + location.search + '#groups');
        openPanel(id);
      }
      addEventListener('hashchange', openFromHash);

      // ---- Actions ----
      async function newGroup(from) {
        const name = await Momento.ask({
          from, title: 'New group', body: 'Name it after the people in it. You’ll get a link and QR code to share next.',
          label: 'Group name', placeholder: 'For example Uni friends', ok: 'Create group',
          check: (v) => (!v ? 'Give the group a name.' : v.length > 60 ? 'Keep the name under 60 characters.' : ''),
        });
        if (!name) return;
        let group;
        try { ({ group } = await momentoApi('/api/groups', momentoJson('POST', { name }))); }
        catch (err) { Momento.toast('Couldn’t create the group', err.message); return; }
        await load();
        Momento.toast('Group created', 'Share its link or QR code to bring people in');
        openPanel(group.id);
        const qrBtn = panel.querySelector('[data-qr]');
        if (qrBtn) showQr(group, qrBtn);
      }

      // ---- Inviting: a link, a QR code, or the phone's share sheet ----
      const showQr = (g, from) => Momento.qr.show({ name: g.name, url: qrLinkOf(g), shareUrl: linkOf(g), kicker: 'Scan to join the group', hideCode: true }, from);

      async function copyLink(g, btn) {
        const label = btn.textContent;
        try { await navigator.clipboard.writeText(linkOf(g)); btn.textContent = 'Link copied'; }
        catch (err) { btn.textContent = 'Copy failed'; Momento.toast('Copy this link', linkOf(g)); }
        setTimeout(() => { if (btn.isConnected) btn.textContent = label; }, 1800);
      }

      async function shareLink(g, btn) {
        try { await navigator.share({ title: g.name, text: `Join ${g.name} on Momento`, url: linkOf(g) }); }
        catch (err) { if (err.name !== 'AbortError') copyLink(g, panel.querySelector('[data-copy]') || btn); }
      }

      async function resetLink(g, from) {
        const ok = await Momento.confirm({
          from, title: 'Reset the invite link?',
          body: 'The current link and QR code stop working, so anyone you shared them with can’t use them to join. People already in the group stay in.',
          ok: 'Reset link', danger: false,
        });
        if (!ok) return;
        try {
          await momentoApi(`/api/groups/${encodeURIComponent(g.id)}/invite-link`, { method: 'POST' });
          Momento.toast('New invite link ready', 'The old link and QR code no longer work');
          await load(true);
        } catch (err) { Momento.toast('Couldn’t reset the link', err.message); }
      }

      // ---- Joining from a link or a scanned QR code (events.html?group=CODE) ----
      async function joinFromLink(raw) {
        const code = cleanCode(raw);
        if (!code) return;
        let preview;
        try { preview = await momentoApi('/api/groups/preview/' + encodeURIComponent(code)); }
        catch (err) { Momento.toast('This group link doesn’t work', err.message || 'Ask for a new one.'); return; }
        const g = preview.group;
        let user = null;
        try { user = await Momento.sessionReady; } catch (err) {}
        // Not logged in: log in or sign up first, and the link carries on from there
        if (!user) { Momento.needLogin({ action: 'joinGroup', next: 'events.html?group=' + encodeURIComponent(code) }); return; }
        if (preview.member) {
          await load(true);
          Momento.toast('You’re already in this group', g.name);
          openPanel(g.id);
          return;
        }
        const ok = await Momento.confirm({
          title: `Join “${g.name}”?`,
          body: `${plural(g.members, 'person is', 'people are')} in it${g.by ? `, made by ${g.by}` : ''}. You’ll see every album shared with the group, including ones added later.`,
          ok: 'Join group', danger: false,
        });
        if (!ok) return;
        try {
          const { group, already } = await momentoApi('/api/groups/join', momentoJson('POST', { code }));
          Momento.toast(already ? 'You’re already in this group' : `You joined ${group.name}`, !already && group.albums.length ? `${plural(group.albums.length, 'album', 'albums')} added to My albums` : '');
          await load();
          openPanel(group.id);
        } catch (err) { Momento.toast('Couldn’t join the group', err.message); }
      }
      (window.Momento ||= {}).joinGroupFromLink = joinFromLink;   // (this runs before the shared scripts, so Momento may not exist yet)

      async function rename(g, from) {
        const name = await Momento.ask({
          from, title: 'Rename group', label: 'Group name', value: g.name, ok: 'Save name',
          check: (v) => (!v ? 'Give the group a name.' : v.length > 60 ? 'Keep the name under 60 characters.' : ''),
        });
        if (!name || name === g.name) return;
        try {
          await momentoApi(`/api/groups/${encodeURIComponent(g.id)}`, momentoJson('PATCH', { name }));
          Momento.toast('Group renamed', name);
          await load(true);
        } catch (err) { Momento.toast('Couldn’t rename the group', err.message); }
      }

      async function removeGroup(g, from) {
        const others = g.members.length - 1;
        const ok = await Momento.confirm({
          from, title: `Delete “${g.name}”?`,
          body: `${others ? `${plural(others, 'person loses', 'people lose')} access to the albums shared with it, unless they joined an album with its code.` : 'Nobody else is in it yet.'} The albums themselves stay with their hosts.`,
          ok: 'Delete group',
        });
        if (!ok) return;
        try {
          await momentoApi(`/api/groups/${encodeURIComponent(g.id)}`, { method: 'DELETE' });
          closePanel();
          Momento.toast('Group deleted', g.name, { danger: true });
          await load(true);
        } catch (err) { Momento.toast('Couldn’t delete the group', err.message); }
      }

      async function leave(g, from) {
        const hosting = g.albums.filter((a) => a.hostIsYou).length;
        const ok = await Momento.confirm({
          from, title: `Leave “${g.name}”?`,
          body: `You’ll stop seeing the albums shared with it, unless you joined one with its code. ${hosting ? `The ${plural(hosting, 'album', 'albums')} you host leave the group with you. ` : ''}Your photos stay in the albums.`,
          ok: 'Leave group',
        });
        if (!ok) return;
        try {
          await momentoApi(`/api/groups/${encodeURIComponent(g.id)}/members/me`, { method: 'DELETE' });
          closePanel();
          Momento.toast('You left the group', g.name);
          await load(true);
        } catch (err) { Momento.toast('Couldn’t leave the group', err.message); }
      }

      async function removeMember(g, btn) {
        const name = btn.dataset.name;
        const ok = await Momento.confirm({
          from: btn, title: `Remove ${name} from “${g.name}”?`,
          body: 'They stop seeing the albums shared with the group, unless they joined one with its code. Albums they host leave the group with them. Their photos stay.',
          ok: 'Remove',
        });
        if (!ok) return;
        try {
          await momentoApi(`/api/groups/${encodeURIComponent(g.id)}/members/${encodeURIComponent(btn.dataset.remove)}`, { method: 'DELETE' });
          Momento.toast(`${name} was removed`, g.name, { danger: true });
          await load(true);
        } catch (err) { Momento.toast('Couldn’t remove them', err.message); }
      }

      $('grNew').addEventListener('click', (e) => (Momento.account?.get?.() ? newGroup(e.currentTarget) : Momento.needLogin({ action: 'groups', from: e.currentTarget, next: 'events.html#groups' })));
      // An album made from here (Share another album) shows up in its group straight away
      document.addEventListener('momento:albums', () => load(true));

      // ---- Start ----
      document.addEventListener('DOMContentLoaded', async () => {
        let user;
        // A group's invite link or QR code (events.html?group=CODE): taken off the address, then asked about below
        const params = new URLSearchParams(location.search), groupCode = params.get('group');
        if (groupCode) { params.delete('group'); history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + (location.hash || '#groups')); }
        try { user = await Momento.sessionReady; }
        catch (err) { say('Couldn’t reach Momento. Check your connection, then reload the page.', true); return; }
        if (!user) {
          body.removeAttribute('aria-busy');
          body.innerHTML = '<div class="panel gr-guest"><h3>Your friends, your albums</h3><p>Make a group for the people you see most, and every album you share with it shows up for all of them.</p><button class="btn btn-dark" type="button" data-guest-groups>Log in to see your groups</button></div>';
          body.querySelector('[data-guest-groups]').addEventListener('click', (e) => Momento.needLogin({ action: 'groups', from: e.currentTarget, next: 'events.html#groups' }));
          if (groupCode) joinFromLink(groupCode);
          return;
        }
        if (!user.emailVerified) return;   // the confirm-your-email popup (assets/guard.js) covers the page
        await load();
        if (groupCode) joinFromLink(groupCode);
      });
    })();

    // ---- Settling: the sections appear once the groups and your albums have both arrived ----
    // Both fill "Needs you" at the top, at different moments; showing the sections only when both are in
    // keeps the page from jumping. A slow or failed load never holds them back for more than 2.5s
    (() => {
      const page = document.querySelector('main.page'), body = document.getElementById('grBody');
      let groups = !body?.hasAttribute('aria-busy'), joined = !document.querySelector('script[src*="event-albums.js"]'), done = false;
      const reveal = () => {
        if (done) return;
        done = true;
        page.classList.remove('is-settling');
        if (still) return;
        for (const el of page.querySelectorAll('#soNeed:not([hidden]), #groups, #events')) el.animate({ opacity: [0, 1] }, { duration: 320, easing: 'ease-out' });
      };
      const check = () => { if (groups && joined) reveal(); };
      if (body) new MutationObserver(() => { if (!body.hasAttribute('aria-busy')) { groups = true; check(); } }).observe(body, { attributes: true, attributeFilter: ['aria-busy'] });
      document.addEventListener('momento:joined-ready', () => { joined = true; check(); }, { once: true });
      // A link to a part of the page (#events, #needs) shouldn't wait on the rest
      setTimeout(reveal, /^#(events|join|alerts)/.test(location.hash) ? 0 : 2500);
      check();
    })();

    // ---- Social: one page, read top to bottom ----
    // Links that point at a part of it scroll there: #groups, or #events (and #alerts, #join, ?join=, ?event=,
    // which open what they name). "Needs you" only shows while something is waiting for an answer.
    (() => {
      const need = document.getElementById('soNeed'), count = document.getElementById('soNeedCount');
      // Watches the rows only (not the heading that holds the count, or it would trigger itself)
      const paintNeed = () => {
        const n = need.querySelectorAll('.gri').length, label = n ? String(n) : '';
        need.hidden = !n;
        if (count.textContent !== label) count.textContent = label;
      };
      new MutationObserver(paintNeed).observe(need.querySelector('.so-stack'), { childList: true, subtree: true });

      // (#needs is where the notifications inbox sends invites: "Needs you", at the top)
      const sections = { groups: document.getElementById('groups'), events: document.getElementById('events'), needs: document.getElementById('soNeed') };
      const fromUrl = () => {
        const h = location.hash;
        if (/^#needs\b/.test(h)) return 'needs';
        if (/^#groups\b/.test(h)) return 'groups';
        if (/^#events\b/.test(h)) return 'events';
        return null;
      };
      // ("Needs you" stays hidden until its invites have loaded, so it's waited for, for a few seconds at most)
      const show = (name, tries = 0) => {
        const el = sections[name];
        if (!el) return;
        if (el.hidden) { if (tries < 12) setTimeout(() => show(name, tries + 1), 250); return; }
        el.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' });
      };
      window.socialTab = show;
      // Groups and events fill in after the page loads, so wait a moment before scrolling to them
      const go = () => { const t = fromUrl(); if (t) show(t); };
      addEventListener('load', () => setTimeout(go, 500));
      addEventListener('hashchange', go);
      // The two shortcuts under the title scroll to their part of the page
      document.querySelectorAll('.so-jump-item').forEach((a) => a.addEventListener('click', (e) => {
        e.preventDefault();
        const t = a.getAttribute('href').slice(1);
        show(t);
        history.replaceState(null, '', location.pathname + location.search + '#' + t);
      }));
    })();

    // ---- The header gains a veil once scrolled, and the page opens ----
    const header = document.getElementById('header');
    const veil = () => header.classList.toggle('is-veiled', scrollY > 40);
    addEventListener('scroll', veil, { passive: true });
    veil();
    // (after the page intro, when there is one: it lifts the veil by announcing momento:intro-reveal)
    const open = () => requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-ready')));
    if (root.classList.contains('intro-on')) document.addEventListener('momento:intro-reveal', open, { once: true });
    else open();

    // ---- One loop for everything that moves ----
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(Math.max((now - last) / 1000, 0), .1);
      last = now;
      if (!document.hidden) {
        renderFluid(dt);
        if (useCursor) {
          rx = lerp(rx, pointer.x, .35); ry = lerp(ry, pointer.y, .35);
          if (Math.abs(pointer.x - rx) < .05 && Math.abs(pointer.y - ry) < .05) { rx = pointer.x; ry = pointer.y; }
          const lx = pointer.x - rx, ly = pointer.y - ry;
          const lens = root.classList.contains('cursor-hover') || root.classList.contains('cursor-drag');
          const s = lens ? 0 : Math.min(Math.hypot(lx, ly) / 50, .55);
          const tf = `translate3d(${rx}px, ${ry}px, 0) rotate(${lens ? 0 : Math.atan2(ly, lx)}rad) scale(${1 + s}, ${1 - s * .45})`;
          if (tf !== cursorEl._tf) cursorEl.style.transform = cursorEl._tf = tf;
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}
