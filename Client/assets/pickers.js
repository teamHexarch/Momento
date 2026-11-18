// Date and time pickers in Momento's own style.
// The browser's pop-up calendar and time list can't be styled, so every <input type="date">, "time" and
// "datetime-local" on the page (including ones added later, like the Create album and event forms) opens
// this picker instead. The input itself stays: it shows the value and holds it in the usual format
// (2026-11-21, 19:00, 2026-11-21T19:00), so forms read it exactly as before. Choosing sends the usual
// input and change events.
(() => {
  const TYPES = ['date', 'time', 'datetime-local'];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const parseTime = (s) => { const m = /(\d{2}):(\d{2})/.exec(s || ''); return m ? { h: +m[1], m: +m[2] } : null; };
  const SVG = (d, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

  const css = `
    /* The field keeps its look; the browser's own picker button gives way to a small icon */
    input.mp-on { cursor: pointer; caret-color: transparent; padding-right: 2.6rem !important; background-repeat: no-repeat !important; background-position: right .95rem center !important; background-size: 17px !important; }
    input.mp-on::-webkit-calendar-picker-indicator { display: none; }
    input.mp-on[type="date"], input.mp-on[type="datetime-local"] { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235C596B' stroke-width='2' stroke-linecap='round'%3E%3Crect x='3.5' y='5' width='17' height='15.5' rx='3'/%3E%3Cpath d='M3.5 10h17M8 3v4M16 3v4'/%3E%3C/svg%3E"); }
    input.mp-on[type="time"] { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235C596B' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='12' cy='12' r='8.5'/%3E%3Cpath d='M12 7.5V12l3 2'/%3E%3C/svg%3E"); }
    :root[data-theme="dark"] input.mp-on[type="date"], :root[data-theme="dark"] input.mp-on[type="datetime-local"] { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23C9C4D8' stroke-width='2' stroke-linecap='round'%3E%3Crect x='3.5' y='5' width='17' height='15.5' rx='3'/%3E%3Cpath d='M3.5 10h17M8 3v4M16 3v4'/%3E%3C/svg%3E"); }
    :root[data-theme="dark"] input.mp-on[type="time"] { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23C9C4D8' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='12' cy='12' r='8.5'/%3E%3Cpath d='M12 7.5V12l3 2'/%3E%3C/svg%3E"); }

    .mp {
      position: fixed; inset: auto; margin: 0; z-index: 2147483000; box-sizing: border-box; max-width: calc(100vw - 16px); padding: .7rem; overflow: visible;
      color: var(--dusk, #2E2C3A); font-family: var(--font-main, system-ui, sans-serif);
    }   /* the pane (fill, rim, radius, shadow) is the GlassPopover in assets/glass.css: no blur, it often opens over a dialog */
    .mp[hidden] { display: none; }
    .mp-body { display: flex; gap: .7rem; align-items: stretch; }
    .mp-cal { width: 17.5rem; max-width: 100%; }
    .mp-head { display: flex; align-items: center; justify-content: space-between; gap: .4rem; padding: .1rem .1rem .5rem; }
    .mp-title { font-size: .98rem; font-weight: 700; letter-spacing: -.01em; }
    .mp-nav { display: flex; gap: .2rem; }
    .mp-btn {
      display: grid; place-items: center; min-width: 2.4rem; height: 2.4rem; padding: 0; border: none; border-radius: 50%; background: none; color: inherit;
      font: 600 .9rem var(--font-main, system-ui, sans-serif); font-variant-numeric: tabular-nums; cursor: pointer; transition: transform .25s cubic-bezier(.34, 1.56, .64, 1);
      -webkit-tap-highlight-color: transparent;
    }
    .mp-btn:active { transform: scale(.92); }
    .mp-btn:focus-visible { outline: 2px solid var(--focus-ring, #2E2C3A); outline-offset: 1px; }
    .mp-btn:disabled { opacity: .3; cursor: default; background: none; transform: none; }
    .mp-week, .mp-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: .1rem; }
    .mp-week span { display: grid; place-items: center; height: 1.9rem; color: var(--slate, #5C596B); font-size: .74rem; font-weight: 650; }
    .mp-days .mp-btn { width: 100%; height: 2.35rem; border-radius: 12px; }
    .mp-days .is-out { color: var(--stone, #8E8A9C); }
    .mp-days .is-today { box-shadow: inset 0 0 0 1.5px rgba(46, 44, 58, .35); }
    /* The chosen day or time: deep smoke glass, the strongest tier, so the choice is unmistakable */
    .mp-btn[aria-pressed="true"], .mp-btn[aria-selected="true"] { background: var(--gb-smoke-sheen) padding-box, var(--gb-smoke-fill) padding-box; color: var(--paper, #F8F7FA); box-shadow: var(--gb-smoke-shadow); }
    .mp-time { display: flex; gap: .3rem; }
    .mp-col { display: grid; align-content: start; gap: .15rem; width: 3.6rem; max-height: 15.4rem; padding: .1rem; overflow-y: auto; overscroll-behavior: contain; scroll-snap-type: y proximity; scrollbar-width: none; }
    .mp-col::-webkit-scrollbar { display: none; }
    .mp-col .mp-btn { width: 100%; height: 2.4rem; border-radius: 12px; scroll-snap-align: start; }
    .mp-cal + .mp-time { padding-left: .7rem; border-left: 1px solid rgba(46, 44, 58, .1); }
    .mp-foot { display: flex; justify-content: space-between; gap: .5rem; margin-top: .6rem; padding-top: .55rem; border-top: 1px solid rgba(46, 44, 58, .08); }
    .mp-foot .mp-btn { height: 2.3rem; padding: 0 .9rem; border-radius: 100px; font-size: .86rem; font-weight: 650; }
    .mp-foot span { flex: 1; }
    :root[data-theme="dark"] .mp { color: #F2EFF8; }
    :root[data-theme="dark"] .mp-week span { color: #A8A3B8; }
    :root[data-theme="dark"] .mp-days .is-out { color: #7D7890; }
    :root[data-theme="dark"] .mp-days .is-today { box-shadow: inset 0 0 0 1.5px rgba(242, 239, 248, .4); }
    :root[data-theme="dark"] .mp-cal + .mp-time { border-left-color: rgba(255, 255, 255, .1); }
    :root[data-theme="dark"] .mp-foot { border-top-color: rgba(255, 255, 255, .08); }
    /* Phones: bigger targets, and date over time when both are asked for */
    @media (pointer: coarse) { .mp-days .mp-btn { height: 2.6rem; } .mp-col .mp-btn { height: 2.75rem; } .mp-col { max-height: 16.5rem; } }
    @media (max-width: 480px) {
      .mp-body.is-both { flex-direction: column; }
      .mp-body.is-both .mp-time { justify-content: center; padding: .6rem 0 0; border-left: none; border-top: 1px solid rgba(46, 44, 58, .1); }
      .mp-body.is-both .mp-col { max-height: 9.5rem; width: 4.2rem; }
      .mp-cal { width: min(17.5rem, calc(100vw - 2.4rem)); }
    }
    @media (prefers-reduced-motion: reduce) { .mp-btn { transition: none; } }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);

  const valueDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  let cur = null;   // { input, el, kind, view, date, time }

  function emit(input, v) {
    valueDesc.set.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const dayOk = (input, d) => {
    const min = parseDate(input.min), max = parseDate(input.max);
    return !(min && d < min) && !(max && d > max);
  };

  // ---- Building the picker ----
  function build() {
    const { input, kind } = cur;
    const el = cur.el;
    const body = document.createElement('div');
    body.className = 'mp-body' + (kind === 'datetime-local' ? ' is-both' : '');
    if (kind !== 'time') body.append(calendar());
    if (kind !== 'date') body.append(timeCols());
    const foot = document.createElement('div');
    foot.className = 'mp-foot';
    const btn = (label, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'mp-btn ' + cls; b.textContent = label; b.addEventListener('click', fn); return b; };
    if (!input.required && input.value) foot.append(btn('Clear', 'mp-clear', () => { emit(input, ''); close(true); }));
    if (kind !== 'time') foot.append(btn('Today', 'mp-today', () => { const t = new Date(); cur.view = new Date(t.getFullYear(), t.getMonth(), 1); pickDay(t, true); }));
    foot.append(document.createElement('span'));
    foot.append(btn('Done', 'mp-done', () => close(true)));
    el.replaceChildren(body, foot);
  }

  function calendar() {
    const { input } = cur;
    const box = document.createElement('div');
    box.className = 'mp-cal';
    const view = cur.view;
    const title = view.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    box.innerHTML = `<div class="mp-head"><span class="mp-title" aria-live="polite"></span><span class="mp-nav">
      <button class="mp-btn" type="button" data-step="-1" aria-label="Previous month">${SVG('<path d="M15 6l-6 6 6 6"/>')}</button>
      <button class="mp-btn" type="button" data-step="1" aria-label="Next month">${SVG('<path d="M9 6l6 6-6 6"/>')}</button></span></div>
      <div class="mp-week" aria-hidden="true">${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="mp-days" role="grid" aria-label="${title}"></div>`;
    box.querySelector('.mp-title').textContent = title;
    box.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => { cur.view = new Date(view.getFullYear(), view.getMonth() + +b.dataset.step, 1); rebuild('[data-step="' + b.dataset.step + '"]'); }));
    const grid = box.querySelector('.mp-days');
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
    const today = iso(new Date()), chosen = cur.date ? iso(cur.date) : '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mp-btn';
      b.textContent = d.getDate();
      b.dataset.day = iso(d);
      if (d.getMonth() !== view.getMonth()) b.classList.add('is-out');
      if (b.dataset.day === today) b.classList.add('is-today');
      b.setAttribute('aria-pressed', b.dataset.day === chosen);
      b.setAttribute('aria-label', d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
      b.disabled = !dayOk(input, d);
      b.tabIndex = -1;
      b.addEventListener('click', () => pickDay(d, false));
      grid.append(b);
    }
    // One day in the grid takes Tab; the arrow keys move around it
    const focusDay = grid.querySelector('[aria-pressed="true"]') || grid.querySelector(`[data-day="${today}"]:not(.is-out)`) || grid.querySelector('.mp-btn:not(.is-out):not(:disabled)');
    if (focusDay) focusDay.tabIndex = 0;
    grid.addEventListener('keydown', (e) => {
      const at = e.target.closest('[data-day]');
      if (!at) return;
      const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      let d = parseDate(at.dataset.day);
      if (e.key in moves) d.setDate(d.getDate() + moves[e.key]);
      else if (e.key === 'PageUp' || e.key === 'PageDown') d.setMonth(d.getMonth() + (e.key === 'PageUp' ? -1 : 1));
      else return;
      e.preventDefault();
      cur.focusDay = iso(d);
      if (d.getMonth() !== view.getMonth() || d.getFullYear() !== view.getFullYear()) { cur.view = new Date(d.getFullYear(), d.getMonth(), 1); rebuild(); }
      else { grid.querySelectorAll('[data-day]').forEach((x) => { x.tabIndex = x.dataset.day === cur.focusDay ? 0 : -1; }); grid.querySelector(`[data-day="${cur.focusDay}"]`)?.focus(); }
    });
    return box;
  }

  function timeCols() {
    const box = document.createElement('div');
    box.className = 'mp-time';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Time');
    const t = cur.time;
    const h12 = t ? ((t.h + 11) % 12) + 1 : null, pm = t ? t.h >= 12 : null;
    const step = Math.max(1, Math.round((+cur.input.step || 300) / 60));
    const mins = [];
    for (let m = 0; m < 60; m += step >= 60 ? 60 : step) mins.push(m);
    if (t && !mins.includes(t.m)) { mins.push(t.m); mins.sort((a, b) => a - b); }
    const col = (label, items, isOn, pick) => {
      const c = document.createElement('div');
      c.className = 'mp-col'; c.setAttribute('role', 'listbox'); c.setAttribute('aria-label', label);
      for (const [text, val] of items) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'mp-btn'; b.textContent = text; b.setAttribute('role', 'option');
        b.setAttribute('aria-selected', isOn(val));
        b.tabIndex = isOn(val) ? 0 : -1;
        b.addEventListener('click', () => pick(val));
        c.append(b);
      }
      if (!c.querySelector('[tabindex="0"]')) c.firstChild.tabIndex = 0;
      c.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const all = [...c.children], i = all.indexOf(document.activeElement);
        all[Math.min(all.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
      });
      return c;
    };
    const base = () => cur.time || defaultTime();
    const setT = (h, m) => pickTime({ h, m });
    box.append(
      col('Hour', Array.from({ length: 12 }, (_, i) => [pad(i + 1), i + 1]), (v) => v === h12, (v) => { const b = base(); setT((v % 12) + (b.h >= 12 ? 12 : 0), b.m); }),
      col('Minutes', mins.map((m) => [pad(m), m]), (v) => t && v === t.m, (v) => { const b = base(); setT(b.h, v); }),
      col('AM or PM', [['AM', false], ['PM', true]], (v) => pm === v, (v) => { const b = base(); setT((b.h % 12) + (v ? 12 : 0), b.m); }),
    );
    return box;
  }
  function defaultTime() { const n = new Date(); return { h: Math.min(23, n.getHours() + 1), m: 0 }; }

  // ---- Choosing ----
  function write() {
    const { input, kind, date, time } = cur;
    if (kind === 'date') emit(input, date ? iso(date) : '');
    else if (kind === 'time') emit(input, time ? `${pad(time.h)}:${pad(time.m)}` : '');
    else if (date || time) {
      const d = date || new Date(), t = time || { h: 12, m: 0 };
      cur.date = d; cur.time = t;
      emit(input, `${iso(d)}T${pad(t.h)}:${pad(t.m)}`);
    }
  }
  function pickDay(d, fromToday) {
    if (!dayOk(cur.input, d)) return;
    cur.date = d;
    cur.view = new Date(d.getFullYear(), d.getMonth(), 1);
    cur.focusDay = iso(d);
    write();
    // A date on its own is done once picked; with a time, it stays open for the time
    if (cur.kind === 'date' && !fromToday) { close(true); return; }
    rebuild();
  }
  function pickTime(t) {
    cur.time = t;
    write();
    const focused = document.activeElement?.closest?.('.mp-col');
    const which = focused ? [...focused.parentElement.children].indexOf(focused) : -1;
    rebuild();
    if (which >= 0) cur.el.querySelectorAll('.mp-col')[which]?.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
  }
  function rebuild(focusSel) {
    const scrolls = [...cur.el.querySelectorAll('.mp-col')].map((c) => c.scrollTop);
    build();
    cur.el.querySelectorAll('.mp-col').forEach((c, i) => { c.scrollTop = scrolls[i] ?? 0; });
    if (focusSel) cur.el.querySelector(focusSel)?.focus({ preventScroll: true });
    else if (cur.focusDay) cur.el.querySelector(`[data-day="${cur.focusDay}"]`)?.focus({ preventScroll: true });
    place();
  }

  // ---- Opening, placing and closing ----
  function open(input) {
    if (cur?.input === input) return;
    close(false);
    const kind = input.type;
    const v = input.value;
    const date = kind === 'time' ? null : parseDate(v);
    const time = kind === 'date' ? null : parseTime(kind === 'time' ? v : v.split('T')[1]);
    const base = date || parseDate(input.min) && new Date() < parseDate(input.min) && parseDate(input.min) || new Date();
    const el = document.createElement('div');
    el.className = 'mp';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', kind === 'time' ? 'Choose a time' : kind === 'date' ? 'Choose a date' : 'Choose a date and time');
    // Inside an open dialog it has to live in that dialog, or the dialog makes it unclickable
    (input.closest('dialog[open]') || document.body).append(el);
    if (el.showPopover) { el.setAttribute('popover', 'manual'); try { el.showPopover(); } catch (e) {} }
    cur = { input, el, kind, date, time, view: new Date(base.getFullYear(), base.getMonth(), 1), focusDay: date ? iso(date) : null };
    input.setAttribute('aria-expanded', 'true');
    build();
    place();
    // The chosen time is scrolled into view in each column
    el.querySelectorAll('.mp-col').forEach((c) => { const on = c.querySelector('[aria-selected="true"]'); if (on) c.scrollTop = on.offsetTop - c.clientHeight / 2 + on.offsetHeight / 2; });
    if (!still) el.animate([{ opacity: 0, transform: 'translateY(-6px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    (el.querySelector('.mp-days [tabindex="0"]') || el.querySelector('.mp-col [tabindex="0"]'))?.focus({ preventScroll: true });
  }
  function place() {
    if (!cur) return;
    const { input, el } = cur;
    const r = input.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight, gap = 8, edge = 8;
    const below = innerHeight - r.bottom - gap - edge, above = r.top - gap - edge;
    let top = below >= h || below >= above ? r.bottom + gap : r.top - gap - h;
    top = Math.max(edge, Math.min(top, innerHeight - h - edge));
    const left = Math.max(edge, Math.min(r.left, innerWidth - w - edge));
    el.style.top = top + 'px'; el.style.left = left + 'px';
  }
  function close(focusInput) {
    if (!cur) return;
    const { input, el } = cur;
    cur = null;
    input.setAttribute('aria-expanded', 'false');
    try { el.hidePopover?.(); } catch (e) {}
    el.remove();
    if (focusInput) input.focus({ preventScroll: true });
  }

  // ---- Wiring each input ----
  function enhance(input) {
    if (input.dataset.mp || !TYPES.includes(input.type)) return;
    input.dataset.mp = '1';
    input.classList.add('mp-on');
    // Read-only stops the phone's own wheel or calendar from opening; the forms check these fields themselves
    input.readOnly = true;
    input.setAttribute('aria-haspopup', 'dialog');
    input.setAttribute('aria-expanded', 'false');
    input.addEventListener('click', (e) => { e.preventDefault(); cur?.input === input ? close(false) : open(input); });
    input.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'F4' || e.key === 'ArrowDown') { e.preventDefault(); open(input); }
    });
  }
  const scan = (root) => {
    if (root.matches?.('input')) enhance(root);
    root.querySelectorAll?.(TYPES.map((t) => `input[type="${t}"]`).join(',')).forEach(enhance);
  };
  scan(document);
  new MutationObserver((list) => { for (const m of list) m.addedNodes.forEach((n) => { if (n.nodeType === 1) scan(n); }); })
    .observe(document.documentElement, { childList: true, subtree: true });

  // A tap outside closes it; Esc closes it first (before any dialog it sits in)
  document.addEventListener('pointerdown', (e) => { if (cur && !cur.el.contains(e.target) && e.target !== cur.input) close(false); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && cur) { e.preventDefault(); e.stopPropagation(); close(true); } }, true);
  addEventListener('resize', () => place());
  document.addEventListener('scroll', (e) => { if (cur && !cur.el.contains(e.target)) place(); }, true);
  // The dialog it belongs to closing takes it too
  document.addEventListener('close', (e) => { if (cur && e.target.contains?.(cur.input)) close(false); }, true);
})();
