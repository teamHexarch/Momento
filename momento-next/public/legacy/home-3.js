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
