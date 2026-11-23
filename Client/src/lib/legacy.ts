/**
 * The bridge from React components to the original page scripts while both exist.
 *
 * The old scripts build window.Momento (theme, account, dialogs, toasts...). They only run once the page has hydrated
 * (src/legacy/LegacyScripts.tsx), after React's own effects, so a component that needs window.Momento waits for
 * `onLegacyReady`. Delete this file once nothing under public/ defines window.Momento any more.
 */

type Listener<T extends unknown[]> = (...args: T) => void;

/** The parts of window.Momento that converted React components use. Grows as pieces are converted; shrinks as the old scripts go. */
export interface MomentoLegacy {
  theme: { readonly pref: ThemePref; set(p: ThemePref): void; onChange(fn: Listener<[ThemePref, 'light' | 'dark']>): void };
  account: { get(): unknown | null; onChange(fn: Listener<[unknown | null]>): void };
  openHelp(from?: Element | null): void;
  openSettings(from?: Element | null): void;
}
export type ThemePref = 'light' | 'dark' | 'system';

const READY = 'momento:legacy-ready';
type W = Window & { __momentoLegacyReady?: boolean; Momento?: Partial<MomentoLegacy> };

/** Called by LegacyScripts once every old script has run and the start-up events have been replayed */
export function markLegacyReady() {
  (window as W).__momentoLegacyReady = true;
  window.dispatchEvent(new Event(READY));
}

/** Runs `fn` with window.Momento once the old scripts are ready (straight away if they already are). Returns a cancel function. */
export function onLegacyReady(fn: (M: MomentoLegacy) => void): () => void {
  const w = window as W;
  let live = true;
  const run = () => { if (live) fn(w.Momento as MomentoLegacy); };
  if (w.__momentoLegacyReady) run();
  else window.addEventListener(READY, run, { once: true });
  return () => { live = false; window.removeEventListener(READY, run); };
}

/** window.Momento right now, or undefined while the old scripts are still loading */
export const momento = (): Partial<MomentoLegacy> | undefined => (window as W).Momento;

/** The saved theme choice, read the way the old theme code reads it (localStorage 'momento-theme', default 'system') */
export function readThemePref(): ThemePref {
  try { return (localStorage.getItem('momento-theme') as ThemePref) || 'system'; } catch { return 'system'; }
}
