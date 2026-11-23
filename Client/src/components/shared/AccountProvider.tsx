'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { onLegacyReady } from '@/lib/legacy';
import { api } from '@/lib/api';

/** Which emails a person gets. Pages differ in the defaults they assume (see NOTIFY below) */
export type Notify = { photos: boolean; closing: boolean; recap: boolean; activity?: boolean };
/** The signed-in person, as the server sends it (GET /api/auth/me), plus whatever the pages have updated */
export type Account = { name: string; email: string; notify: Notify; [k: string]: unknown };

/** The notification defaults the pages have always assumed. My albums, Settings and Social also list `activity: true`;
 *  Home and Support never did (`activity` prop). */
const NOTIFY: Notify = { photos: true, closing: true, recap: false };

const AKEY = 'momento-account';
const AccountContext = createContext<Account | null>(null);

/** The signed-in person, or null (also while the page is still asking the server) */
export const useAccount = () => useContext(AccountContext);

/**
 * The account: who is signed in, kept for the tab (sessionStorage 'momento-account'), shared by every page.
 * Replaces the account part of the old shared script and provides window.Momento.account and Momento.sessionReady
 * for the old scripts (about 56 places) until they are converted.
 *
 * As before: on start-up the page asks the server who is signed in (GET /api/auth/me) and sets or clears the account;
 * Momento.sessionReady is that request. The answer is applied once every old script has loaded and registered its
 * listeners (the old script only started asking once it ran, so no script ever saw the answer before it was listening).
 */
export default function AccountProvider({ activity = false, children }: { activity?: boolean; children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    const notify: Notify = activity ? { ...NOTIFY, activity: true } : NOTIFY;
    const norm = (a: Partial<Account> | null): Account | null =>
      a && ({ name: '', email: '', ...a, notify: { ...notify, ...(a.notify || {}) } } as Account);
    const listeners = new Set<(a: Account | null) => void>();
    let current: Account | null = null;
    const persist = () => {
      try {
        if (current) sessionStorage.setItem(AKEY, JSON.stringify(current));
        else { sessionStorage.removeItem(AKEY); sessionStorage.removeItem('momento-user'); }
      } catch {}
    };
    const emit = () => { setAccount(current); listeners.forEach((fn) => fn(current)); };
    const store = {
      get: () => current,
      set(patch: Partial<Account>) {
        current = norm({ ...(current || {}), ...patch, notify: { ...(current && current.notify), ...patch.notify } as Notify });
        persist(); emit();
        return current;
      },
      clear() { current = null; persist(); emit(); },
      onChange(fn: (a: Account | null) => void) { listeners.add(fn); },
      /** An account with every field at its default: what the settings window shows when there is no account */
      blank: () => norm({}) as Account,
    };

    const w = window as unknown as { Momento?: Record<string, unknown> };
    const M = (w.Momento ||= {});
    M.account = store;
    let live = true;
    const asked = api.auth.me();
    M.sessionReady = asked.then(({ user }) => new Promise((resolve) => {
      onLegacyReady(() => {
        if (live) { if (user) store.set(user as Partial<Account>); else store.clear(); }
        resolve(user);
      });
    }));
    (M.sessionReady as Promise<unknown>).catch(() => {});
    return () => { live = false; if (M.account === store) delete M.account; };
  }, [activity]);

  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}
