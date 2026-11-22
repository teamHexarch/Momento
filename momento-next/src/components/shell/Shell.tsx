'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { HelpDialog, SettingsDialog, type OpenHandle } from './AccountDialogs';
import CreateDialog, { type CreateHandle, type CreateOpts } from './CreateDialog';
import { AskDialog, ChooseDialog, ConfirmDialog, type AskOpts, type ChooseOpts, type ConfirmOpts, type QuestionHandle } from './Questions';
import { api, momentoGlobal, shell } from './core';
import { flourish, useCardLight, useFlourish, usePageLeave, useTrail } from './effects';
import { intro } from './intro';

type Name = 'settings' | 'help' | 'confirm' | 'ask' | 'choose' | 'create';
type Album = { id: string; code: string; name: string; role?: string; photos?: number; mine?: number };

/**
 * The shared shell of the app pages (Home, My albums, Social, Settings, Support): the dialogs, the page effects and
 * the window.Momento functions the old page scripts still call. Replaces the ~860-line block each of those pages had a
 * copy of. (The header, footer, toast, theme and account are their own components.)
 *
 * Dialogs are made the first time they're needed and added to the end of <body> in that order, as before.
 * Shell must come before <LegacyScripts> in the page, so window.Momento is ready before any old script runs.
 */
export default function Shell({ trailFromMainLoop = false, choose = false }: {
  /** Home: the thread is driven by the home page's own animation loop */
  trailFromMainLoop?: boolean;
  /** Social: Momento.choose (the only page that asks it) */
  choose?: boolean;
}) {
  const [made, setMade] = useState<Name[]>([]);
  const madeRef = useRef<Name[]>([]);
  const settings = useRef<OpenHandle>(null), help = useRef<OpenHandle>(null), create = useRef<CreateHandle>(null);
  const confirmQ = useRef<QuestionHandle<ConfirmOpts, boolean>>(null);
  const askQ = useRef<QuestionHandle<AskOpts, string | null>>(null);
  const chooseQ = useRef<QuestionHandle<ChooseOpts, unknown>>(null);
  const [path, setPath] = useState('');

  useTrail(trailFromMainLoop);
  usePageLeave();
  useCardLight();
  useFlourish();

  useEffect(() => {
    setPath(location.pathname);
    const M = momentoGlobal();
    /** Makes a dialog (once) before it's used */
    const need = (n: Name) => {
      if (madeRef.current.includes(n)) return;
      madeRef.current = [...madeRef.current, n];
      flushSync(() => setMade(madeRef.current));
    };
    const onAlbums = /albums\.html$/.test(location.pathname);
    const viewAlbum = (id: string) => {
      if (onAlbums) document.dispatchEvent(new CustomEvent('momento:open-album', { detail: id }));
      else if (choose && M.openAlbumHere) M.openAlbumHere(id); // Social opens it over the page
      else location.href = `albums.html#album=${encodeURIComponent(id)}`;
    };
    viewAlbumRef.current = viewAlbum;

    // Whatever opened a dialog (the chip, a footer link) is where it grows out of and where focus returns
    M.openSettings = (from: HTMLElement | null) => { shell.returnTo = from; need('settings'); settings.current!.open(); };
    M.openHelp = (from: HTMLElement | null) => { shell.returnTo = from; need('help'); help.current!.open(); };
    M.confirm = (o: ConfirmOpts) => { need('confirm'); return confirmQ.current!.ask(o); };
    M.ask = (o: AskOpts) => { need('ask'); return askQ.current!.ask(o); };
    if (choose) M.choose = (o: ChooseOpts) => { need('choose'); return chooseQ.current!.ask(o); };
    // opts.groupId: restrict sharing to the group that opened the form
    M.createAlbum = (from: HTMLElement | null, opts?: CreateOpts) => { shell.returnTo = from; need('create'); create.current!.open(opts); };

    // The link a host sends guests: opening it asks them to log in or sign up first, then offers to join
    M.inviteLink = (code: string) => 'https://api.hexarch.org/s/' + encodeURIComponent(code);
    M.shareInvite = async (album: Album, btn: HTMLElement, label = 'Share link') => {
      const url = M.inviteLink(album.code);
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        try { await navigator.share({ title: album.name, text: `Add your photos to ${album.name} on Momento`, url }); return; }
        catch (err) { if ((err as Error).name === 'AbortError') return; }
      }
      try { await navigator.clipboard.writeText(url); btn.textContent = 'Link copied'; } catch { btn.textContent = 'Copy failed'; M.toast('Copy this link', url); }
      setTimeout(() => { btn.textContent = label; }, 1800);
    };
    // Removes an album after asking. `a` needs id, name and role; photos/mine make the message exact
    M.removeAlbum = async (a: Album, from: HTMLElement | null) => {
      const host = a.role !== 'guest';
      const n = a.photos || 0;
      const ok = await M.confirm({
        from,
        title: host ? `Delete “${a.name}”?` : `Leave “${a.name}”?`,
        body: host
          ? (n ? `All ${n.toLocaleString('en-GB')} photos and the guest code go with it, for everyone who joined.` : 'It has no photos yet, so only the album and its guest code are removed.')
          : `It’s taken off your albums. ${a.mine ? `Your ${a.mine} photos stay` : 'Photos stay'} in the album for the host and other guests.`,
        ok: host ? 'Delete album' : 'Leave album',
      });
      if (!ok) return false;
      try {
        await api('/api/albums/' + encodeURIComponent(a.id) + (host ? '' : '/membership'), { method: 'DELETE' });
      } catch (err) { M.toast('Could not remove album', (err as Error).message); return false; }
      document.dispatchEvent(new CustomEvent('momento:albums', { detail: { type: 'remove', id: a.id } }));
      M.toast(host ? 'Album deleted' : 'You left the album', a.name);
      return true;
    };
    M.intro = intro;
    M.flourish = flourish;

    // Any "Create an album" control on any page: <a|button data-create>
    const onCreateClick = (e: MouseEvent) => {
      const t = (e.target as Element).closest?.<HTMLElement>('[data-create]');
      if (!t) return;
      e.preventDefault();
      M.createAlbum(t, { groupId: t.dataset.createGroup, groupName: t.dataset.createGroupName, kind: t.dataset.createKind });
    };
    document.addEventListener('click', onCreateClick);
    return () => {
      document.removeEventListener('click', onCreateClick);
      for (const k of ['openSettings', 'openHelp', 'confirm', 'ask', 'choose', 'createAlbum', 'inviteLink', 'shareInvite', 'removeAlbum', 'intro', 'flourish']) delete M[k];
    };
  }, [choose]);
  const viewAlbumRef = useRef<(id: string) => void>(() => {});

  if (!made.length) return null;
  const dialog = (n: Name) => {
    switch (n) {
      case 'settings': return <SettingsDialog key={n} ref={settings} onSettingsPage={/settings\.html$/.test(path)} />;
      case 'help': return <HelpDialog key={n} ref={help} onSupportPage={/support\.html$/.test(path)} />;
      case 'confirm': return <ConfirmDialog key={n} ref={confirmQ} />;
      case 'ask': return <AskDialog key={n} ref={askQ} />;
      case 'choose': return <ChooseDialog key={n} ref={chooseQ} />;
      case 'create': return <CreateDialog key={n} ref={create} viewAlbum={(id) => viewAlbumRef.current(id)} />;
    }
  };
  // each its own portal, so each is added to the end of <body> when it's first made
  return <>{made.map((n) => createPortal(dialog(n), document.body, n))}</>;
}
