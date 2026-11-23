'use client';

import { useEffect } from 'react';
import { createPageEffects } from './pageEffects.js';

/**
 * An inner page's chrome, for a page with no page script of its own (Support): the effects (cursor, silk background,
 * glass light, buttons, the loop), the header's veil once scrolled, and the page opening (after the intro, when there
 * is one). Everything is undone on unmount. Pages that still have a page script start the same effects from it.
 */
export default function PageChrome({ hover }: { hover?: string }) {
  useEffect(() => {
    const root = document.documentElement;
    const fx = createPageEffects(hover ? { hover } : {});
    fx.lightExisting();
    fx.rollExisting();

    // The header gains a veil once scrolled
    const header = document.getElementById('header')!;
    const veil = () => header.classList.toggle('is-veiled', scrollY > 40);
    addEventListener('scroll', veil, { passive: true });
    veil();
    // The page opens (after the page intro, when there is one: it lifts the veil by announcing momento:intro-reveal)
    let r1 = 0, r2 = 0;
    const open = () => { r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => root.classList.add('is-ready')); }); };
    if (root.classList.contains('intro-on')) document.addEventListener('momento:intro-reveal', open, { once: true });
    else open();

    fx.loop();
    return () => {
      fx.stop();
      removeEventListener('scroll', veil);
      document.removeEventListener('momento:intro-reveal', open);
      cancelAnimationFrame(r1); cancelAnimationFrame(r2);
    };
  }, [hover]);
  return null;
}
