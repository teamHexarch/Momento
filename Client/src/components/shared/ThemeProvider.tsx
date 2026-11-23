'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { readThemePref, type ThemePref } from '@/lib/legacy';

type Resolved = 'light' | 'dark';
type ThemeValue = { pref: ThemePref | null; set(p: ThemePref): void };

const KEY = 'momento-theme';
const ThemeContext = createContext<ThemeValue>({ pref: null, set: () => {} });

/** The chosen theme (null until the page has started) and a way to change it */
export const useTheme = () => useContext(ThemeContext);

/**
 * The theme: Light, Dark or System, kept in localStorage ('momento-theme').
 * Replaces the theme part of the old shared script and provides window.Momento.theme for the old scripts
 * (the account menu's segment, the Settings page, the home page's map) until they are converted.
 *
 * Exactly as before: the boot script in <head> sets data-theme before first paint, so nothing is applied at start-up.
 * A change cross-fades the page where View Transitions exist (not with reduced motion, not before the page has fully
 * loaded, not in a hidden tab), and sets the silk background's target (window.__theme). "System" follows the device
 * setting as it changes, and a change made in another tab is followed here.
 *
 * Listeners (React state and Momento.theme.onChange) run right after the transition starts, before the browser
 * captures the old page, as the old code did, so every Light / Dark / System segment moves at the same moment.
 */
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [pref, setPref] = useState<ThemePref | null>(null);
  // set() only works once the effect below has run; before that (server render, first paint) it does nothing
  const setRef = useRef<(p: ThemePref) => void>(() => {});

  useEffect(() => {
    const root = document.documentElement;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const w = window as unknown as { __theme?: { target: number; a: number; b: number }; Momento?: Record<string, unknown> };
    const TH = w.__theme || (w.__theme = { target: 0, a: 0, b: 0 });
    const listeners = new Set<(p: ThemePref, resolved: Resolved) => void>();
    const resolve = (p: ThemePref): Resolved => (p === 'dark' || (p === 'system' && mq.matches) ? 'dark' : 'light');
    let current = readThemePref();
    setPref(current);

    function apply(p: ThemePref, animate: boolean) {
      current = p;
      const next = resolve(p);
      const flip = () => { root.dataset.theme = next; root.dataset.themePref = p; TH.target = next === 'dark' ? 1 : 0; };
      if (root.dataset.theme === next) root.dataset.themePref = p;
      else if (animate && document.startViewTransition && !reduced.matches && document.readyState === 'complete' && !document.hidden) {
        root.classList.add('theming'); // so the page-to-page motion doesn't also play on a theme switch
        const done = () => root.classList.remove('theming');
        // An aborted transition (page still revealing, tab hidden) rejects ready: the theme still flips, so it is ignored
        const vt = document.startViewTransition(flip);
        vt.ready.catch(() => {});
        vt.updateCallbackDone.catch(() => {});
        vt.finished.then(done, done);
      } else flip();
      flushSync(() => setPref(p));
      listeners.forEach((fn) => fn(p, next));
    }
    const onScheme = () => { if (current === 'system') apply('system', true); };
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) apply(readThemePref(), true); };
    mq.addEventListener('change', onScheme);
    window.addEventListener('storage', onStorage);

    const theme = {
      get pref() { return current; },
      get resolved() { return resolve(current); },
      set(p: ThemePref) {
        try { localStorage.setItem(KEY, p); } catch {}
        apply(p, true);
      },
      onChange(fn: (p: ThemePref, resolved: Resolved) => void) { listeners.add(fn); },
    };
    const M = (w.Momento ||= {});
    M.theme = theme;
    setRef.current = theme.set;
    return () => {
      mq.removeEventListener('change', onScheme);
      window.removeEventListener('storage', onStorage);
      if (M.theme === theme) delete M.theme;
    };
  }, []);

  const set = useCallback((p: ThemePref) => setRef.current(p), []);
  const value = useMemo<ThemeValue>(() => ({ pref, set }), [pref, set]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
