'use client';

/**
 * What the shared shell's pieces have in common (was the top of the old shared script, copied into five pages).
 *
 * `shell.returnTo` is ONE value shared by every shell dialog (settings, help, confirm, ask, choose, create), as before:
 * whatever opened the most recent one is where a closing dialog's card shrinks back into and where focus returns.
 */
export const shell = {
  returnTo: null as HTMLElement | null,
  /** the custom cursor can't draw above a modal, so the normal cursor comes back while one is open */
  cursorWas: false,
};

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const phoneStill = () => matchMedia('(max-width: 600px)').matches;
export const SUPPORT = 'support@hexarch.org'; // placeholder address
export const firstName = (n: string | undefined | null) => (n || '').trim().split(/\s+/)[0] || '';

/** The card grows out of what opened it and shrinks back into it: that element's box against the card's, as a move and a scale */
export function morph(from: Element, card: Element) {
  const f = from.getBoundingClientRect(), c = card.getBoundingClientRect();
  if (!f.width || !c.width) return null;
  const dx = f.left + f.width / 2 - (c.left + c.width / 2), dy = f.top + f.height / 2 - (c.top + c.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${Math.max(0.08, f.width / c.width)}, ${Math.max(0.05, f.height / c.height)})`;
}

/** window.Momento, for the shims the old scripts still call */
export const momentoGlobal = () => ((window as unknown as { Momento?: Record<string, unknown> }).Momento ||= {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The 24x24 line icons the shell draws (the old `svg()` helper) */
export function Svg({ size = 18, className, children }: { size?: number; className?: string; children: React.ReactNode }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
export const ICON = {
  chev: (className?: string) => <Svg size={14} className={className}><path d="m6 9 6 6 6-6" /></Svg>,
  close: () => <Svg><path d="M6 6l12 12M18 6L6 18" /></Svg>,
  settings: () => <Svg><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></Svg>,
  help: () => <Svg><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2.1-2.4 3.8M12 17h.01" /></Svg>,
  logout: () => <Svg><path d="M9 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3M15 8l4 4-4 4M19 12H9" /></Svg>,
  sun: () => <Svg size={16}><circle cx="12" cy="12" r="3.6" /><g className="rays"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></g></Svg>,
  moon: () => <Svg size={16}><path className="moon" d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" /></Svg>,
  system: () => <Svg size={16}><rect x="3" y="4.5" width="18" height="12" rx="2.2" /><path d="M8.5 20h7M12 16.5V20" /><circle className="scr-dot" cx="12" cy="10.5" r="1.8" fill="currentColor" stroke="none" /></Svg>,
  bigCheck: () => <Svg size={26}><path d="m5 12.5 4.2 4.2L19 7" /></Svg>,
  bigBin: () => <Svg size={22}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></Svg>,
};
