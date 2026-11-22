'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** The nav item marked as the current page. Support is not in the nav, so it marks none. */
export type NavCurrent = 'albums' | 'social' | 'settings' | null;

/**
 * The header nav of the inner pages (My albums, Social, Settings, Support): Home goes to the home page, and the
 * arrow next to it (or hovering, with a mouse) opens the list of the home page's sections.
 *
 * Replaces the "Nav: Home goes to the home page" block that each inner page's script had a copy of. Same rules:
 * - the arrow toggles the list; a click just after hovering opened it keeps it open instead of closing it
 * - with a mouse (fine pointer), entering Home or the list opens it, leaving either closes it after 260 ms
 * - a press anywhere outside the nav closes it; Escape closes it and puts focus back on the arrow
 *
 * The page-wide listeners are native ones on document/window, where the old script put them, so other scripts that
 * stop an event (pickers.js stops Escape on document while a picker is open) still keep it from reaching this one.
 * The Home page has a richer nav (section pill, drag to glide) and keeps its own script for now.
 */
export default function NavWrap({ current }: { current: NavCurrent }) {
  const [open, setOpenState] = useState(false);
  const isOpen = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hoverAt = useRef(0);
  const finePointer = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLButtonElement>(null);

  const setOpen = useCallback((v: boolean) => {
    clearTimeout(closeTimer.current);
    if (v === isOpen.current) return;
    isOpen.current = v;
    setOpenState(v);
  }, []);

  useEffect(() => {
    finePointer.current = matchMedia('(pointer: fine)').matches;
    const onPointerDown = (e: PointerEvent) => {
      if (isOpen.current && !wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen.current) { setOpen(false); caretRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(closeTimer.current);
    };
  }, [setOpen]);

  const onCaretClick = () => {
    if (isOpen.current && performance.now() - hoverAt.current < 500) return;
    setOpen(!isOpen.current);
  };
  const onEnter = (e: React.PointerEvent) => {
    if (!finePointer.current || e.pointerType !== 'mouse') return;
    if (!isOpen.current) hoverAt.current = performance.now();
    setOpen(true);
  };
  const onLeave = (e: React.PointerEvent) => {
    if (!finePointer.current || e.pointerType !== 'mouse') return;
    closeTimer.current = setTimeout(() => setOpen(false), 260);
  };
  const here = (item: NavCurrent) => (current === item ? 'page' : undefined);

  return (
    <div className="nav-wrap" id="navWrap" ref={wrapRef}>
      <nav className="nav glass" aria-label="Main">
        <span className="nav-split" onPointerEnter={onEnter} onPointerLeave={onLeave}>
          <a href="/" className="nav-item nav-home" aria-label="Home"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 10.4 12 4l8 6.4V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.2H9v5.2H5.5A1.5 1.5 0 0 1 4 19Z" /></svg><span className="nav-label">Home</span></a>
          <button className="nav-caret" type="button" aria-expanded={open} aria-controls="navMenu" aria-label="Show the sections of the home page" ref={caretRef} onClick={onCaretClick}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
        </span>
        <a href="albums" className="nav-item nav-albums" aria-label="My albums" aria-current={here('albums')}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="7" width="13.5" height="13" rx="2.2" /><path d="M7.5 3.8h10.3a2.7 2.7 0 0 1 2.7 2.7V16" /><path d="m3.8 17 3.7-3.7 3 3 1.8-1.8 4.4 4.4" /></svg><span className="nav-label">My albums</span></a>
        <a href="events" className="nav-item nav-social" aria-label="Social" aria-current={here('social')}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="16.8" cy="9.5" r="2.5" /><path d="M15.6 14.6c2.4-.2 4.3 1.3 4.9 4.4" /></svg><span className="nav-label">Social</span></a>
        <a href="settings" className="nav-item nav-settings" aria-label="Settings" aria-current={here('settings')}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg><span className="nav-label">Settings</span></a>
      </nav>
      <div className={open ? 'nav-menu glass is-open' : 'nav-menu glass'} id="navMenu" aria-label="Home page sections" onPointerEnter={onEnter} onPointerLeave={onLeave}>
        <a href="/#how-it-works" className="menu-item">How it works</a>
        <a href="/#features" className="menu-item">Features</a>
        <a href="/#quality" className="menu-item">Full quality</a>
        <a href="/#faq" className="menu-item">FAQ</a>
      </div>
    </div>
  );
}
