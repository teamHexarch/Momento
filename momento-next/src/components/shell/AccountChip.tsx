'use client';

import { useEffect, useRef, useState } from 'react';
import { ICON, firstName, momentoGlobal } from './core';
import { api } from '@/lib/api';
import { useAccount, type Account } from '../shared/AccountProvider';
import { useTheme } from '../shared/ThemeProvider';
import type { ThemePref } from '@/lib/legacy';

const THEMES: { pref: ThemePref; label: string; icon: () => React.ReactNode }[] = [
  { pref: 'light', label: 'Light', icon: ICON.sun },
  { pref: 'dark', label: 'Dark', icon: ICON.moon },
  { pref: 'system', label: 'System', icon: ICON.system },
];

/** The initial (of the name, or "You"), or the photo; the initial comes back if the photo can't load */
function ChipAvatar({ account }: { account: Account | null }) {
  const [broken, setBroken] = useState<string | null>(null);
  const name = (account && account.name) || '';
  const pic = account?.avatarUrl as string | undefined;
  if (pic && broken !== pic) return <i className="acct-av"><img src={pic} alt="" referrerPolicy="no-referrer" onError={() => setBroken(pic)} /></i>;
  return <i className="acct-av">{(name || 'You')[0].toUpperCase()}</i>;
}

/** The chip and its menu: Account settings, Appearance, Help and support, Log out */
function Chip({ logoutTo }: { logoutTo: string | null }) {
  const account = useAccount();
  const { pref, set: setTheme } = useTheme();
  const [open, setOpenState] = useState(false);
  const isOpen = useRef(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const items = () => [...menu.current!.querySelectorAll<HTMLElement>('.acct-item:not([hidden]), .acct-seg button')];
  const setOpen = (v: boolean, focusFirst = false) => {
    if (v === isOpen.current) return;
    isOpen.current = v;
    setOpenState(v);
    if (v && focusFirst) requestAnimationFrame(() => items()[0]?.focus());
  };

  useEffect(() => {
    const onDown = (e: PointerEvent) => { if (isOpen.current && !wrap.current!.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen.current) { setOpen(false); btn.current!.focus(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    if (!isOpen.current) { setOpen(true, true); return; }
    const list = items(), i = list.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
    list[next].focus();
  };
  const act = async (what: 'settings' | 'help' | 'logout') => {
    setOpen(false);
    const M = momentoGlobal();
    if (what === 'settings') M.openSettings(btn.current);
    else if (what === 'help') M.openHelp(btn.current);
    else {
      try { await api.auth.logout(); } catch (err) { M.toast('Could not log out', (err as Error).message); return; }
      M.account.clear();
      if (logoutTo) { M.flash('You’re logged out', 'Log back in any time'); location.href = logoutTo; }
      else M.toast('You’re logged out', 'Log back in any time');
    }
  };
  const name = (account && account.name) || '';
  const checked = THEMES.findIndex((t) => t.pref === pref);

  return (
    <div className="acct" ref={wrap} onKeyDown={onKeyDown}>
      {/* (a keyboard click, detail 0, also moves focus into the menu) */}
      <button className="acct-btn glass" type="button" aria-haspopup="menu" aria-expanded={open} aria-controls="acctMenu" aria-label="Account menu" ref={btn} onClick={(e) => setOpen(!isOpen.current, e.detail === 0)}><ChipAvatar account={account} /><span className="acct-name">{firstName(name) || 'You'}</span>{ICON.chev('acct-chev')}</button>
      <div className={open ? 'acct-menu glass is-open' : 'acct-menu glass'} id="acctMenu" role="menu" aria-label="Account" ref={menu}>
        <div className="acct-head"><ChipAvatar account={account} /><span><b>{name || 'You'}</b><small>{(account && account.email) || 'Your account'}</small></span></div>
        <button className="acct-item" type="button" role="menuitem" data-act="settings" onClick={() => act('settings')}>{ICON.settings()}Account settings</button>
        <div className="acct-label" id="acctThemeLabel">Appearance</div>
        {/* the menu stays open after a theme choice, so the change can be seen */}
        <div className="acct-seg" role="radiogroup" aria-labelledby="acctThemeLabel" style={checked >= 0 ? ({ '--i': checked } as React.CSSProperties) : undefined}>
          <span className="acct-seg-pill" aria-hidden="true"></span>
          {THEMES.map((t) => <button key={t.pref} type="button" role="radio" aria-checked={t.pref === pref} data-theme={t.pref} onClick={() => setTheme(t.pref)}>{t.icon()}{t.label}</button>)}
        </div>
        <button className="acct-item" type="button" role="menuitem" data-act="help" onClick={() => act('help')}>{ICON.help()}Help and support</button>
        {/* staff only (shown for the staff plan) */}
        <button className="acct-item" type="button" role="menuitem" data-act="review" hidden={!(account && account.plan === 'staff')} onClick={() => { setOpen(false); location.href = 'review.html'; }}>{ICON.review()}Photo review</button>
        <hr className="acct-sep" />
        <button className="acct-item" type="button" role="menuitem" data-act="logout" onClick={() => act('logout')}>{ICON.logout()}Log out</button>
      </div>
    </div>
  );
}

/** Inner pages: the chip is always there (signed out it reads "You"); logging out goes to the home page */
export function MeSlot() {
  return (
    <div className="me-slot" data-acct-host="" data-acct-always="" data-acct-logout="/">
      <Chip logoutTo="/" />
    </div>
  );
}

/** Home: Log in / Sign up while signed out; the chip (built the first time it's needed) once signed in */
export function HomeAuthArea() {
  const account = useAccount();
  const [built, setBuilt] = useState(false);
  useEffect(() => { if (account) setBuilt(true); }, [account]);
  return (
    <div className="auth" id="authArea">
      <div className="auth-out" id="authOut" hidden={!!account}>
        <button className="auth-login" type="button" data-auth="login">Log in</button>
        <button className="btn btn-pearl" type="button" data-auth="signup">Sign up</button>
      </div>
      <div className="auth-in" data-acct-host="" data-acct-out="authOut" hidden={!account}>
        {(built || account) && <Chip logoutTo={null} />}
      </div>
    </div>
  );
}
