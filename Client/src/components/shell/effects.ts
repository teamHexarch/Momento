'use client';

import { useEffect } from 'react';
import { reducedMotion } from './core';
import { onLegacyReady } from '@/lib/legacy';

/**
 * The shell's page effects as hooks. Each starts on mount and undoes everything on unmount (listeners, timers, the
 * animation frame, observers). The drawing code is the old shared script's, unchanged.
 */

const IDS = [1062, 1011, 1027, 64, 1047, 1012, 177, 1025, 91, 1040, 1015, 1035, 1005, 1043, 1050, 1054, 1058, 1060, 1068, 1074];
const TILT = [-9, 6, -5, 10, -12, 4, -7, 8, -3, 12, -10, 5];
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * The thread: a faint string draws itself down the page as you scroll, with small see-through polaroids hung along it.
 * The page marks the container: <div class="trail" data-trail data-avoid="selectors to keep clear" data-pad="26">.
 * A print is only hung where its box clears the avoided content and every line of text, picture and control.
 *
 * `mainLoop` (Home): the home page's own animation loop tells it the scroll position (window.stringScrolled, read
 * before any writes in the frame) and runs its step (window.stringTick, in the write phase), so it never forces a layout.
 */
export function useTrail(mainLoop: boolean) {
  useEffect(() => {
    const host = document.querySelector<HTMLElement>('[data-trail]');
    if (!host) return;
    const wrap = host.parentElement!;
    const reduced = reducedMotion();
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    const path = document.createElementNS(NS, 'path');
    svg.setAttribute('class', 'trail-svg'); path.setAttribute('class', 'trail-line'); svg.append(path);
    let prints: { el: HTMLElement; l: number; on: boolean }[] = [], lut: [number, number][] = [], len = 0, target = 0, drawn = 0, raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function build() {
      host!.replaceChildren(svg); prints = []; lut = [];
      const wr = wrap.getBoundingClientRect(), W = wrap.offsetWidth, H = wrap.offsetHeight;
      const small = innerWidth < 700, pad = +(host!.dataset.pad || 0) || 26;
      svg.setAttribute('width', String(W)); svg.setAttribute('height', String(H)); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

      // A vertical trochoid: when the loop radius d outgrows the step r, the string curls
      const y0 = innerHeight * 0.85, y1 = H - 40;
      const r = clamp(W * 0.05, 46, 80) * (small ? 0.7 : 1), swing = small ? 0.26 : 0.36;
      const pts: string[] = [];
      for (let t = 0; ; t += 0.11) {
        const d = r * (0.55 + 0.95 * Math.max(0, Math.sin(t * 0.23 + 1)));
        const y = y0 + r * t - d * Math.sin(t);
        if (y > y1) break;
        pts.push(`${(W / 2 + W * swing * Math.sin(t * 0.11) + W * 0.07 * Math.sin(t * 0.37) + d * Math.cos(t)).toFixed(1)},${y.toFixed(1)}`);
      }
      path.setAttribute('d', 'M' + pts.join(' L'));
      len = path.getTotalLength();
      path.style.strokeDasharray = String(len);
      // Length against the furthest point reached so far, so the loops don't confuse the search
      let maxY = -Infinity;
      for (let i = 0; i <= 600; i++) {
        const l = len * i / 600;
        maxY = Math.max(maxY, path.getPointAtLength(l).y);
        lut.push([l, maxY]);
      }

      // The content to keep clear of, measured once, relative to the page
      const blocks: { l: number; t: number; r: number; b: number }[] = [];
      const keep = (b: DOMRect, p: number) => { if (b.width > 1 && b.height > 1) blocks.push({ l: b.left - wr.left - p, t: b.top - wr.top - p, r: b.right - wr.left + p, b: b.bottom - wr.top + p }); };
      const sel = host!.dataset.avoid || '';
      if (sel) wrap.querySelectorAll(sel).forEach((el) => keep(el.getBoundingClientRect(), pad));
      wrap.querySelectorAll('img, svg, video, canvas, input, textarea, select, button, .btn').forEach((el) => {
        if (!host!.contains(el) && (el.tagName !== 'svg' || !el.parentElement!.closest('svg'))) keep(el.getBoundingClientRect(), 8);
      });
      const range = document.createRange();
      const words = document.createTreeWalker(wrap, NodeFilter.SHOW_TEXT);
      for (let n: Node | null; (n = words.nextNode());) {
        if (!n.nodeValue!.trim() || host!.contains(n) || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(n.parentElement!.tagName)) continue;
        range.selectNodeContents(n);
        for (const q of range.getClientRects()) keep(q, 10);
      }
      const hits = (x: number, y: number, w: number, h: number) => blocks.some((b) => x + w > b.l && x < b.r && y + h > b.t && y < b.b);

      // Hang a print every so often along the string, wherever there is room for it
      const gap = small ? 80 : 90, kept: { x: number; y: number }[] = [];
      let k = 0;
      for (let l = 140; l < len - 40; l += gap) {
        const p = path.getPointAtLength(l), q = path.getPointAtLength(l + 4);
        const pw = (small ? 30 : 36) + (k % 3) * 4, ph = pw + 9;
        const x = p.x - pw / 2, y = p.y - 2;
        if (x < 8 || x + pw > W - 8 || y < 80 || y + ph > H - 40 || hits(x, y, pw, ph)) continue;
        // Not too near the last one: prints are an accent on the string, not a row of photos
        if (kept.some((o) => Math.hypot(o.x - x, o.y - y) < 150)) continue;
        kept.push({ x, y });
        // It hangs under the string, leaning a little with the string's direction
        const dev = ((Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI - 90 + 540) % 360) - 180;
        const el = document.createElement('span');
        el.className = 'tp';
        el.style.cssText = `--x:${x.toFixed(1)}px;--y:${y.toFixed(1)}px;--w:${pw}px;--r:${(clamp(dev * 0.25, -14, 14) + TILT[k % TILT.length] * 0.5).toFixed(1)}deg`;
        el.innerHTML = `<img src="assets/photos/${IDS[k % IDS.length]}-96.webp" alt="" loading="lazy" decoding="async" draggable="false">`;
        host!.append(el);
        prints.push({ el, l, on: false });
        k++;
      }
      drawn = reduced ? len : Math.min(drawn, len);
      target = reduced ? len : aim();
      write();
      if (drawn !== target) kick();
    }

    // How far along the string the reading line (a little above the bottom of the screen) has got
    function aim(sy = scrollY) {
      if (!lut.length) return 0;
      const y = sy + innerHeight * 0.7;
      let lo = 0, hi = lut.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (lut[mid][1] < y) lo = mid + 1; else hi = mid; }
      return lut[lo][0];
    }
    function write() {
      path.style.strokeDashoffset = (len - drawn).toFixed(1);
      for (const p of prints) {
        const on = p.l <= drawn;
        if (on !== p.on) { p.on = on; p.el.classList.toggle('is-on', on); }
      }
    }
    // The string eases toward the reading line; the loop stops as soon as it gets there
    function step() {
      const d = target - drawn;
      drawn = Math.abs(d) < 0.5 ? target : drawn + d * 0.2;
      write();
    }
    function tick() { raf = 0; step(); if (drawn !== target) raf = requestAnimationFrame(tick); }
    const kick = mainLoop ? () => {} : () => { if (!raf) raf = requestAnimationFrame(tick); };

    const w = window as unknown as { stringTick?: () => void; stringScrolled?: (sy: number) => void };
    const onScroll = () => { target = aim(); kick(); };
    if (mainLoop) {
      w.stringTick = () => { if (drawn !== target) step(); };
      if (!reduced) w.stringScrolled = (sy) => { const t = aim(sy); if (t !== target) { target = t; kick(); } };
    } else if (!reduced) addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(build, 250); });
    ro.observe(wrap);
    // Text that is still rising into place when the page first measures is measured again once it has settled
    const later = (ms: number) => () => { clearTimeout(timer); timer = setTimeout(build, ms); };
    const onLoad = later(1800), onIntroEnd = later(1600);
    // (the page's load, as the old scripts see it: once they have all run)
    const cancelLoad = onLegacyReady(onLoad);
    document.addEventListener('momento:intro-end', onIntroEnd);

    return () => {
      removeEventListener('scroll', onScroll);
      cancelLoad();
      document.removeEventListener('momento:intro-end', onIntroEnd);
      ro.disconnect();
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      if (w.stringTick) delete w.stringTick;
      if (w.stringScrolled) delete w.stringScrolled;
      host.replaceChildren();
    };
  }, [mainLoop]);
}

/**
 * Leaving a page, in browsers that can't cross-fade between pages themselves: the page fades and lifts away
 * (CSS .is-leaving), then the next one loads. (Browsers with View Transitions do this on their own.)
 */
export function usePageLeave() {
  useEffect(() => {
    const root = document.documentElement;
    const ptFile = location.protocol === 'file:';
    if (('CSSViewTransitionRule' in window && !ptFile) || reducedMotion()) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return; // other sites, mailto:, same-page anchors
      e.preventDefault();
      root.classList.add('is-leaving');
      // The next page reads this mark and rises in (headScripts.ts, is-arriving), so the switch is one motion out and in
      try { sessionStorage.setItem('momento-pt', '1'); } catch {}
      if (ptFile) root.classList.add('pt-file');
      setTimeout(() => { location.href = url.href; }, 240);
    };
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) root.classList.remove('is-leaving'); }; // back from the page cache
    document.addEventListener('click', onClick);
    addEventListener('pageshow', onShow);
    return () => { document.removeEventListener('click', onClick); removeEventListener('pageshow', onShow); };
  }, []);
}

/** Popup cards catch the pointer light too (they're created later, so it listens on the page) */
export function useCardLight() {
  useEffect(() => {
    const SEL = '.auth-card, .modal-card, .acct-card, .vgate-card';
    let el: HTMLElement | null = null, x = 0, y = 0, queued = false, raf = 0;
    const onMove = (e: PointerEvent) => {
      const card = (e.target as Element).closest ? (e.target as Element).closest<HTMLElement>(SEL) : null;
      if (card !== el) { if (el) el.style.setProperty('--shine', '0'); el = card; if (el) el.style.setProperty('--shine', '1'); }
      if (!el) return;
      x = e.clientX; y = e.clientY;
      if (queued) return;
      queued = true;
      raf = requestAnimationFrame(() => {
        queued = false;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${x - r.left}px`);
        el.style.setProperty('--my', `${y - r.top}px`);
      });
    };
    addEventListener('pointermove', onMove, { passive: true });
    return () => { removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); };
  }, []);
}

/**
 * Nav flourish: only Home has a page intro. On the other pages the current nav item gives a short nudge once per tab
 * (the Settings knobs slide into place), 250 ms after the page has loaded. Transform only; skipped for reduced motion.
 */
export function flourish() {
  const page = document.documentElement.dataset.page;
  const cur = document.querySelector('.nav > .nav-item[aria-current="page"]');
  if (!cur || !(cur as HTMLElement).animate || page === 'home' || reducedMotion()) return;
  try { if (sessionStorage.getItem('momento-flourish-' + page)) return; sessionStorage.setItem('momento-flourish-' + page, '1'); } catch {}
  const SPRING = 'cubic-bezier(.34, 1.4, .64, 1)';
  const knobs = cur.classList.contains('nav-settings') ? [...cur.querySelectorAll('svg circle')] : [];
  if (knobs.length) knobs.forEach((k, i) => k.animate([{ transform: `translateX(${i ? 3 : -3}px)` }, { transform: 'none' }], { duration: 480, delay: i * 90, easing: SPRING }));
  else cur.animate([{ transform: 'none' }, { transform: 'translateY(-2px) scale(1.1)', offset: 0.4 }, { transform: 'none' }], { duration: 380, easing: SPRING });
}
export function useFlourish() {
  useEffect(() => {
    if (document.documentElement.dataset.page === 'home') return;
    let t: ReturnType<typeof setTimeout> | undefined;
    // 250 ms after the page's load, as the old scripts see it (once they have all run)
    const cancel = onLegacyReady(() => { t = setTimeout(flourish, 250); });
    return () => { cancel(); clearTimeout(t); };
  }, []);
}
