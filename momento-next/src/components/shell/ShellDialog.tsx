'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { morph, phoneStill, reducedMotion, shell } from './core';

export type DialogHandle = {
  /** Opens it, growing out of shell.returnTo (desktop, motion allowed) */
  launch(): void;
  /** Closes it, shrinking back into shell.returnTo; resolves once it has closed */
  dismiss(): Promise<void>;
  el(): HTMLDialogElement | null;
};

/**
 * The shell's popup window: a modal <dialog class="acct-dialog"> holding one glass `.acct-card`.
 * Replaces the old shared script's dialog() helper; behaviour is the same:
 * - opening: the card grows out of what opened it (shell.returnTo), its rows rise in one after another, the backdrop
 *   fades in; it always starts scrolled to the top. Phones and reduced motion: it is simply there
 * - closing (the X or any [data-close], Escape, a press that starts and ends outside the card): it shrinks back
 *   into what opened it, then focus goes back there
 * - the custom cursor is turned off while any dialog is open and comes back when the last one closes
 * `onClose` runs after that focus return, as the old per-dialog close listeners did.
 */
const ShellDialog = forwardRef<DialogHandle, { id: string; onClose?: () => void; children: React.ReactNode }>(function ShellDialog({ id, onClose, children }, ref) {
  const dRef = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  const downOutside = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const card = () => dRef.current?.querySelector<HTMLElement>('.acct-card') ?? null;

  const dismiss = async () => {
    const d = dRef.current;
    if (!d || closing.current || !d.open) return;
    closing.current = true;
    const c = card(), from = shell.returnTo, shape = from && c && morph(from, c);
    if (!reducedMotion() && !phoneStill() && c) { // phones: it simply goes
      const out = shape ? [{ transform: 'none', opacity: 1 }, { transform: shape, opacity: 0 }] : [{ opacity: 1 }, { opacity: 0 }];
      try { await c.animate(out, { duration: shape ? 340 : 200, easing: 'cubic-bezier(.5, 0, .75, 0)', fill: 'forwards' }).finished; } catch {}
    }
    d.close();
    if (c) c.getAnimations().forEach((a) => a.cancel());
    closing.current = false;
  };

  const launch = () => {
    const d = dRef.current;
    if (!d) return;
    const root = document.documentElement;
    if (!document.querySelector('dialog[open]')) shell.cursorWas = root.classList.contains('has-cursor');
    root.classList.remove('has-cursor', 'cursor-hover', 'cursor-drag');
    d.showModal();
    // Opening focuses the first control; on a short phone that could leave the window scrolled past its title.
    // It always starts at the top, title and close button in view
    const top = () => { d.scrollTop = 0; const c0 = card(); if (c0) c0.scrollTop = 0; };
    top(); requestAnimationFrame(top);
    if (reducedMotion() || phoneStill()) return; // phones: no morph and no rows rising in
    const c = card();
    if (!c) return;
    const from = shell.returnTo, shape = from && morph(from, c);
    c.animate(shape
      ? [{ transform: shape, opacity: 0 }, { opacity: 1, offset: 0.22 }, { transform: 'none', opacity: 1 }]
      : [{ opacity: 0, transform: 'translateY(12px) scale(.96)' }, { opacity: 1, transform: 'none' }],
    { duration: shape ? 620 : 380, easing: 'cubic-bezier(.34, 1.25, .64, 1)' });
    // Its rows rise in one after another once the card has opened out
    [...c.children].filter((el) => !el.matches('.acct-x')).forEach((el, i) => el.animate(
      [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
      { duration: 460, delay: 200 + i * 45, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'backwards' }));
    try { d.animate({ opacity: [0, 1] }, { duration: 300, pseudoElement: '::backdrop' }); } catch {}
  };

  useImperativeHandle(ref, () => ({ launch, dismiss, el: () => dRef.current }));

  useEffect(() => {
    const d = dRef.current!;
    const onDown = (e: PointerEvent) => { downOutside.current = e.target === d; };
    const onClick = (e: MouseEvent) => {
      if (e.target === d && downOutside.current) { dismiss(); return; }
      if ((e.target as Element).closest?.('[data-close]') && d.contains(e.target as Node)) dismiss();
    };
    const onCancel = (e: Event) => { e.preventDefault(); dismiss(); };
    const onClosed = () => {
      if (shell.cursorWas && !document.querySelector('dialog[open]')) document.documentElement.classList.add('has-cursor');
      const back = shell.returnTo; if (back) back.focus();
      onCloseRef.current?.();
    };
    d.addEventListener('pointerdown', onDown);
    d.addEventListener('click', onClick);
    d.addEventListener('cancel', onCancel);
    d.addEventListener('close', onClosed);
    return () => {
      d.removeEventListener('pointerdown', onDown);
      d.removeEventListener('click', onClick);
      d.removeEventListener('cancel', onCancel);
      d.removeEventListener('close', onClosed);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <dialog className="acct-dialog" id={id} aria-labelledby={`${id}Title`} ref={dRef}>{children}</dialog>;
});

export default ShellDialog;
