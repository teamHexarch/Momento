'use client';

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import ShellDialog, { type DialogHandle } from './ShellDialog';
import { ICON, SUPPORT, api, json, momentoGlobal, reducedMotion } from './core';
import { useAccount, type Account } from '../shared/AccountProvider';

export type OpenHandle = { open(): void };

/** Help and support: quick answers and ways to reach the team (Momento.openHelp) */
export const HelpDialog = forwardRef<OpenHandle, { onSupportPage: boolean }>(function HelpDialog({ onSupportPage }, ref) {
  const dlg = useRef<DialogHandle>(null);
  useImperativeHandle(ref, () => ({ open: () => dlg.current!.launch() }));
  return (
    <ShellDialog id="acctHelp" ref={dlg}>
      <div className="acct-card acct-help">
        <button className="acct-x" type="button" aria-label="Close" data-close="">{ICON.close()}</button>
        <h2 id="acctHelpTitle">Help and support</h2>
        <p className="acct-sub">Quick answers. If you’re still stuck, email us.</p>
        <details><summary>How do guests join an album?</summary><p>They point their phone camera at the host’s QR code and the album opens. Signing up lets them add their own photos.</p></details>
        <details><summary>Who can see the photos?</summary><p>Only the people who joined the album. The host decides whether guests can see the gallery while the event is on.</p></details>
        <details><summary>How long does an album stay open?</summary><p>Uploads and downloads stay open for a while after the event, then the album is kept as an archive. Download your photos before it closes.</p></details>
        <div className="acct-links">
          {/* already here on the Support page */}
          <a href="support.html" hidden={onSupportPage}>Contact us</a>
          <a href="index.html#how-it-works">How it works</a>
          <a href="index.html#faq">FAQ</a>
          <a href={`mailto:${SUPPORT}`}>Email support</a>
        </div>
      </div>
    </ShellDialog>
  );
});

const SWITCHES = [
  { key: 'photos', title: 'Someone adds photos', sub: 'to an album I’m in', label: 'Someone adds photos to an album I’m in' },
  { key: 'closing', title: 'An album is about to close', sub: 'so I can download my photos in time', label: 'An album is about to close' },
  { key: 'recap', title: 'Weekly recap', sub: 'the best new photos from my albums', label: 'Weekly recap' },
] as const;
type SwitchKey = (typeof SWITCHES)[number]['key'];

/** The person's initial, or their photo (falling back to the initial if it can't load) */
function Avatar({ account, fallback = 'You' }: { account: Account | null; fallback?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  const name = (account && (account.name || account.email)) || fallback;
  const pic = account?.avatarUrl as string | undefined;
  if (pic && broken !== pic) return <img src={pic} alt="" referrerPolicy="no-referrer" onError={() => setBroken(pic)} />;
  return <>{name[0].toUpperCase()}</>;
}

/**
 * Account settings (Momento.openSettings): photo, name, email and the three email switches.
 * As before: the form is filled from the account each time it opens; the photo is saved straight away (not with
 * Save changes); the email can only be changed on the Settings page.
 */
export const SettingsDialog = forwardRef<OpenHandle, { onSettingsPage: boolean }>(function SettingsDialog({ onSettingsPage }, ref) {
  const dlg = useRef<DialogHandle>(null);
  const form = useRef<HTMLFormElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const account = useAccount();
  const [sw, setSw] = useState<Record<SwitchKey, boolean>>({ photos: true, closing: true, recap: false });
  const [status, setStatus] = useState<{ msg: string; bad: boolean }>({ msg: '', bad: false });
  const [photoBusy, setPhotoBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const say = (msg: string, bad = false) => setStatus({ msg, bad });
  const M = () => momentoGlobal();

  useImperativeHandle(ref, () => ({
    open: () => {
      const a: Account = M().account.get() || M().account.blank();
      const f = form.current!;
      (f.elements.namedItem('name') as HTMLInputElement).value = a.name;
      (f.elements.namedItem('email') as HTMLInputElement).value = a.email;
      flushSync(() => { setSw({ photos: !!a.notify.photos, closing: !!a.notify.closing, recap: !!a.notify.recap }); say(''); });
      dlg.current!.launch();
    },
  }));

  const pickPhoto = async () => {
    const f = file.current!.files?.[0];
    file.current!.value = '';
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { say('Choose a photo under 10 MB.', true); return; }
    // Crop it to a square first (Cancel keeps the current photo)
    const pic: Blob | null = M().cropAvatar ? await M().cropAvatar(f) : f;
    if (!pic) return;
    const fd = new FormData();
    fd.append('avatar', pic, pic === f ? (f.name || 'photo.jpg') : 'avatar.jpg');
    setAvatarBusy(true); setPhotoBusy(true); say('Uploading your photo…');
    try {
      const { user } = await api('/api/auth/avatar', { method: 'POST', body: fd });
      M().account.set(user);
      say('Photo updated. Friends see it in groups and albums.');
    } catch (err) { say((err as Error).message, true); }
    finally { setAvatarBusy(false); setPhotoBusy(false); }
  };
  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      const { user } = await api('/api/auth/avatar', { method: 'DELETE' });
      M().account.set(user);
      say('Photo removed. Your initials show instead.');
    } catch (err) { say((err as Error).message, true); }
    finally { setPhotoBusy(false); }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = form.current!;
    const nameEl = f.elements.namedItem('name') as HTMLInputElement, emailEl = f.elements.namedItem('email') as HTMLInputElement;
    const name = nameEl.value.trim(), email = emailEl.value.trim();
    if (!name) { say('Enter your name so guests know who added each photo.', true); nameEl.focus(); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { say('Enter an email address like name@example.com.', true); emailEl.focus(); return; }
    const notify = { ...sw };
    if (email !== M().account.get().email) { say('To change your email, use the Settings page (Advanced settings).', true); return; }
    try {
      const { user } = await api('/api/auth/me', json('PATCH', { name, notify }));
      M().account.set(user);
    } catch (err) { say((err as Error).message, true); return; }
    say('Saved');
    M().toast('Account settings saved', email || name);
    setTimeout(() => dlg.current!.dismiss(), reducedMotion() ? 0 : 700);
  };
  const hasPic = !!account?.avatarUrl;

  return (
    <ShellDialog id="acctSettings" ref={dlg}>
      <form className="acct-card" noValidate ref={form} onSubmit={submit}>
        <button className="acct-x" type="button" aria-label="Close" data-close="">{ICON.close()}</button>
        <h2 id="acctSettingsTitle">Account settings</h2>
        <p className="acct-sub">Update your photo, name and email notification preferences.</p>
        <div className="acct-photo">
          <span className={avatarBusy ? 'acct-photo-av is-busy' : 'acct-photo-av'} aria-hidden="true"><Avatar account={account} /></span>
          <span className="acct-photo-text"><b>Profile photo</b><small>Shown in groups and albums</small></span>
          <span className="acct-photo-acts"><button className="acct-photo-btn" type="button" data-photo-pick="" disabled={photoBusy} onClick={() => file.current!.click()}>{hasPic ? 'Change' : 'Add photo'}</button><button className="acct-photo-btn is-danger" type="button" data-photo-rm="" hidden={!hasPic} disabled={photoBusy} onClick={removePhoto}>Remove</button></span>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*" hidden data-photo-file="" ref={file} onChange={pickPhoto} />
        </div>
        <label className="acct-field"><span>Your name</span><input name="name" autoComplete="name" /></label>
        <label className="acct-field"><span>Email</span><input name="email" type="email" autoComplete="email" inputMode="email" /></label>
        <div className="acct-group" role="group" aria-label="Email me when">
          <b>Email me when</b>
          {SWITCHES.map((s) => (
            <div className="acct-row" key={s.key}><span><b>{s.title}</b><small>{s.sub}</small></span><button className="acct-sw" type="button" role="switch" aria-label={s.label} aria-checked={sw[s.key]} data-key={s.key} onClick={() => setSw((o) => ({ ...o, [s.key]: !o[s.key] }))}></button></div>
          ))}
        </div>
        {/* already here on the Settings page */}
        <a className="acct-adv" href="settings.html" hidden={onSettingsPage}><span className="acct-adv-ic">{ICON.settings()}</span><span><b>Advanced settings</b><small>Password, permissions, notifications and storage</small></span>{ICON.chev()}</a>
        <p className={status.bad ? 'acct-status is-error' : 'acct-status'} role="status">{status.msg}</p>
        <div className="acct-actions"><button className="acct-ghost" type="button" data-close="">Cancel</button><button className="acct-primary" type="submit">Save changes</button></div>
      </form>
    </ShellDialog>
  );
});

export { Avatar };
