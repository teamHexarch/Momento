'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { onLegacyReady } from '@/lib/legacy';

export type ToastAction = { label: string; run: () => void };
export type ToastOptions = { danger?: boolean; action?: ToastAction };
type Shown = { title: string; sub: string; danger: boolean; action: ToastAction | null };

const Mark = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const CHECK = <Mark><path d="m5 12.5 4.2 4.2L19 7" /></Mark>;
const BIN = <Mark><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></Mark>;

const FLASH = 'momento-flash';

/**
 * The toast: every action answers with one; anything that removes something can be undone from it.
 * Replaces the toast part of the old shared script and provides window.Momento.toast / Momento.flash, which the old
 * scripts call (about 100 places), until they are converted.
 *
 * Kept exactly as before:
 * - it is a manual popover, so it shows above open dialogs; while a dialog is open everything outside it is inert, so
 *   the toast lives inside the topmost open dialog (and its Undo stays clickable), and moves back out when that closes
 * - shown for 3.4 s (6 s with an action); pointing at it or focusing it holds it; leaving gives it 1.8 s more
 * - Momento.toast() shows it in the same tick (flushSync), as the old one did, so a caller can rely on it being there
 * - Momento.flash() keeps a toast for the next page (after logging out, say), shown 450 ms after start-up or after the intro
 *
 * The outer <div class="m-toast"> is made and moved by hand, as the old script did (React never owns the element that
 * moves between <body> and dialogs); React renders everything inside it.
 */
export default function Toaster() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [shown, setShown] = useState<Shown>({ title: '', sub: '', danger: false, action: null });
  const hide = useRef(() => {}); // the Undo button reaches the effect's hideToast through this

  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const canPop = typeof HTMLElement.prototype.showPopover === 'function';
    let toastEl: HTMLDivElement | null = null;
    let toastTimer: ReturnType<typeof setTimeout> | undefined;

    function hideToast() {
      clearTimeout(toastTimer);
      if (!toastEl) return;
      const t = toastEl;
      const gone = () => { t.style.visibility = 'hidden'; if (canPop && t.matches(':popover-open')) t.hidePopover(); };
      if (reduced.matches) return gone();
      t.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(16px)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).finished.then(gone, gone);
    }
    const armToast = (ms: number) => { clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, ms); };
    function placeToast() {
      if (!toastEl) return;
      const host = [...document.querySelectorAll('dialog[open]')].pop() || document.body;
      if (toastEl.parentElement !== host) host.append(toastEl);
      if (canPop) { if (toastEl.matches(':popover-open')) toastEl.hidePopover(); toastEl.showPopover(); }
    }
    // When the dialog holding it closes, the toast moves out to whatever is open underneath
    const onClose = (e: Event) => {
      if (!toastEl || !(e.target as Node).contains(toastEl) || toastEl.style.visibility === 'hidden') return;
      requestAnimationFrame(placeToast);
    };
    document.addEventListener('close', onClose, true);

    const toast = (title: string, sub = '', opts: ToastOptions = {}) => {
      if (!toastEl) {
        const t = (toastEl = document.createElement('div'));
        t.className = 'm-toast glass';
        t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
        if (canPop) t.popover = 'manual';
        document.body.append(t);
        // Reading it (or reaching for Undo) holds it on screen
        t.addEventListener('pointerenter', () => clearTimeout(toastTimer));
        t.addEventListener('pointerleave', () => armToast(1800));
        t.addEventListener('focusin', () => clearTimeout(toastTimer));
        flushSync(() => setEl(t));
      }
      const a = opts.action || null;
      flushSync(() => setShown({ title: title == null ? '' : String(title), sub: sub == null ? '' : String(sub), danger: !!opts.danger, action: a }));
      toastEl.classList.toggle('is-danger', !!opts.danger);
      toastEl.classList.toggle('has-act', !!a);
      toastEl.getAnimations().forEach((x) => x.cancel());
      toastEl.style.visibility = '';
      placeToast();
      if (!reduced.matches) toastEl.animate([{ opacity: 0, transform: 'translateY(22px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.34, 1.4, .64, 1)' });
      armToast(a ? 6000 : 3400);
    };
    hide.current = hideToast;

    const M = ((window as unknown as { Momento?: Record<string, unknown> }).Momento ||= {});
    M.toast = toast;
    M.flash = (title: string, sub = '') => { try { sessionStorage.setItem(FLASH, JSON.stringify([title, sub])); } catch {} };

    // A toast left by the previous page
    let flashTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelReady = () => {};
    // (through Momento.toast, as the old script did, so anything wrapping it sees this one too)
    const later = () => { flashTimer = setTimeout(() => (M.toast as typeof toast)(f![0], f![1]), 450); };
    let f: [string, string] | null = null;
    try {
      f = JSON.parse(sessionStorage.getItem(FLASH) || 'null');
      sessionStorage.removeItem(FLASH);
    } catch {}
    if (f) {
      if (document.documentElement.classList.contains('intro-on')) document.addEventListener('momento:intro-end', later, { once: true });
      else cancelReady = onLegacyReady(later);
    }

    return () => {
      document.removeEventListener('close', onClose, true);
      document.removeEventListener('momento:intro-end', later);
      cancelReady();
      clearTimeout(toastTimer); clearTimeout(flashTimer);
      toastEl?.remove();
      if (M.toast === toast) delete M.toast;
    };
  }, []);

  if (!el) return null;
  const a = shown.action;
  return createPortal(
    <>
      <i className="m-toast-ic" aria-hidden="true">{shown.danger ? BIN : CHECK}</i>
      <span className="m-toast-text"><b>{shown.title}</b><small>{shown.sub}</small></span>
      <button className="m-toast-act" type="button" hidden={!a} onClick={a ? () => { hide.current(); a.run(); } : undefined}>{a ? a.label : ''}</button>
    </>,
    el,
  );
}

