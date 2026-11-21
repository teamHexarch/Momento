'use client';

import { useState } from 'react';
import { momento, type ThemePref } from '@/lib/legacy';
import { useAccount } from './AccountProvider';
import { useTheme } from './ThemeProvider';

const SUPPORT = 'support@hexarch.org'; // placeholder address (same as the old shared script)

/** The 24x24 line icon every Momento script draws (the old `svg()` helper) */
function Icon({ size = 18, children }: { size?: number; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
const Chev = () => <Icon size={16}><path d="M6 9l6 6 6-6" /></Icon>;

const THEMES: { pref: ThemePref; label: string; icon: React.ReactNode }[] = [
  { pref: 'light', label: 'Light', icon: <Icon size={16}><circle cx="12" cy="12" r="3.6" /><g className="rays"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></g></Icon> },
  { pref: 'dark', label: 'Dark', icon: <Icon size={16}><path className="moon" d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" /></Icon> },
  { pref: 'system', label: 'System', icon: <Icon size={16}><rect x="3" y="4.5" width="18" height="12" rx="2.2" /><path d="M8.5 20h7M12 16.5V20" /><circle className="scr-dot" cx="12" cy="10.5" r="1.8" fill="currentColor" stroke="none" /></Icon> },
];

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The site footer, the same on every app page (Home, My albums, Social, Settings, Support).
 * Replaces the "Site footer" block of the shared script, which built it into <footer data-site-foot> with innerHTML.
 *
 * - Light / Dark / System follows and sets the theme (useTheme)
 * - "Account settings" only shows once there is an account (useAccount)
 * - Phones: each group heading folds its list; a group that opens is scrolled into view once it has finished growing
 * - Home: links to its own sections go through the header menu (the album stage there is pinned)
 * "Create an album" / "Host a public event" keep data-create: the shared script's page-wide click listener opens them.
 */
export default function SiteFooter({ home = false }: { home?: boolean }) {
  const P = home ? '' : 'index.html';
  const { pref, set: setTheme } = useTheme();
  const signedIn = !!useAccount();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const toggle = (id: string, col: HTMLElement) => {
    const opening = !open[id];
    setOpen((o) => ({ ...o, [id]: opening }));
    if (!opening) return;
    // The footer ends the page, so a group that has just opened can sit below the screen: once it has finished
    // growing, bring it into view
    let t: ReturnType<typeof setTimeout>;
    const settle = () => {
      clearTimeout(t);
      col.removeEventListener('transitionend', onEnd);
      col.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    };
    const onEnd = (e: TransitionEvent) => { if (e.target === col && e.propertyName === 'grid-template-rows') settle(); };
    t = setTimeout(settle, 700);
    col.addEventListener('transitionend', onEnd);
  };

  // On the home page its own sections are reached the way its menu does it (the album stage is pinned)
  const onFootClick = home ? (e: React.MouseEvent) => {
    const a = (e.target as Element).closest('a[href^="#"]');
    if (!a || a.matches('.sf-logo')) return;
    const item = document.querySelector<HTMLElement>(`.menu-item[href="${a.getAttribute('href')}"]`);
    if (item) { e.preventDefault(); item.click(); }
  } : undefined;

  // A plain function, not a component: a component declared in here would be a new type on every render, so React
  // would rebuild the columns (losing the open/close transition and the translated text) each time one opens
  const col = (id: string, title: string, children: React.ReactNode) => (
    <nav className={open[id] ? 'sf-col is-open' : 'sf-col'} aria-labelledby={`sf${id}`}>
      <h2 id={`sf${id}`}><span className="sf-h-text">{title}</span><button className="sf-head" type="button" aria-expanded={!!open[id]} aria-controls={`sf${id}List`} onClick={(e) => toggle(id, e.currentTarget.closest('.sf-col') as HTMLElement)}>{title}<span className="sf-chev" aria-hidden="true"><Chev /></span></button></h2>
      <ul id={`sf${id}List`}>{children}</ul>
    </nav>
  );
  const checked = THEMES.findIndex((t) => t.pref === pref);

  return (
    <footer className="site-foot" data-site-foot="" onClick={onFootClick}>
      <div className="sf-grid">
        <div className="sf-brand">
          <a className="sf-logo" href={home ? '#home' : 'index.html'} aria-label="Momento, home"><svg className="glyph" aria-hidden="true"><use href="#glyph-album" /></svg><svg className="brand-word" aria-hidden="true"><use href="#wordmark" /></svg></a>
          <p>Every photo from your event, in one shared album.</p>
        </div>
        {col('Product', 'Product', <>
          <li><a className="sf-link" href={`${P}#how-it-works`}>How it works</a></li>
          <li><a className="sf-link" href={`${P}#features`}>Features</a></li>
          <li><a className="sf-link" href={`${P}#quality`}>Full quality</a></li>
        </>)}
        {col('Albums', 'Your albums', <>
          <li><a className="sf-link" href="albums.html">My albums</a></li>
          <li><a className="sf-link" href="events.html#join">Join with a code</a></li>
          <li><a className="sf-link" href="events.html#groups">Groups</a></li>
          <li><a className="sf-link" href={`${P}#how-it-works`} data-create="">Create an album</a></li>
          <li><a className="sf-link" href="settings.html">Settings</a></li>
        </>)}
        {col('Events', 'Events', <>
          <li><a className="sf-link" href="events.html#events">Events near you</a></li>
          <li><a className="sf-link" href={`${P}#how-it-works`} data-create="" data-create-kind="event">Host a public event</a></li>
          <li><a className="sf-link" href="events.html#alerts">Event alerts</a></li>
        </>)}
        {col('Help', 'Help', <>
          <li><button className="sf-link" type="button" data-foot-act="help" onClick={(e) => momento()?.openHelp?.(e.currentTarget)}>Help and support</button></li>
          <li><a className="sf-link" href="support.html">Contact support</a></li>
          <li><a className="sf-link" href={`${P}#faq`}>FAQ</a></li>
          <li><a className="sf-link" href={`mailto:${SUPPORT}`}>Email support</a></li>
          <li><a className="sf-link" href="privacy.html">Privacy policy</a></li>
          <li><a className="sf-link" href="terms.html">Terms of Service</a></li>
          <li data-foot-account="" hidden={!signedIn}><button className="sf-link" type="button" data-foot-act="settings" onClick={(e) => momento()?.openSettings?.(e.currentTarget)}>Account settings</button></li>
        </>)}
      </div>
      <div className="sf-base">
        <p className="sf-legal"><span>© 2026 HexArch Limited</span><span>Proof of concept. Design and features are subject to change.</span></p>
        <div className="acct-seg" role="radiogroup" aria-label="Appearance" style={checked >= 0 ? ({ '--i': checked } as React.CSSProperties) : undefined}>
          <span className="acct-seg-pill" aria-hidden="true"></span>
          {THEMES.map((t) => (
            <button key={t.pref} type="button" role="radio" aria-checked={t.pref === pref} data-theme={t.pref} onClick={() => setTheme(t.pref)}>{t.icon}{t.label}</button>
          ))}
        </div>
        <button className="sf-top" type="button" onClick={() => scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' })}>Back to top<Icon size={15}><path d="M12 19V5M6 11l6-6 6 6" /></Icon></button>
      </div>
    </footer>
  );
}
