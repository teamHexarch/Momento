/* Settings: the page's own behaviour (moved from public/legacy/settings-1.js, settings-2.js).
   The code is the original, unchanged: it still drives the server-rendered markup by id and class. It is started by
   <SettingsScripts> (through LegacyScripts) at the point the first old script used to run, so its DOMContentLoaded and load
   listeners still run in their original order. Converting it into React components is the next step for this page. */
/* eslint-disable */
import { createPageEffects } from '@/components/effects/pageEffects.js';

export default function start() {
  // ======== from settings-1.js ========
              (() => {
                const i18n = window.Momento?.i18n, btn = document.getElementById('langBtn');
                if (!i18n) { btn.closest('.s-group').hidden = true; return; }
                const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
                const cur = i18n.langs.find((l) => l.code === i18n.get()) || i18n.langs[0];
                document.getElementById('langBtnText').textContent = cur.name;
                const tick = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
                // Each language in its own words, with the English name under it for anyone who can't read it
                const menu = document.createElement('div');
                menu.className = 's-lang-menu'; menu.id = 'langMenu'; menu.hidden = true;
                menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-labelledby', 'langLabel'); menu.dataset.noI18n = '';
                const opts = i18n.langs.map((l) => {
                  const o = document.createElement('button');
                  o.type = 'button'; o.className = 's-lang-opt'; o.dataset.code = l.code; o.tabIndex = -1;
                  o.setAttribute('role', 'option'); o.setAttribute('aria-selected', l === cur); o.lang = l.html;
                  o.innerHTML = `<b dir="auto"></b>${tick}${l.code === 'en' ? '' : '<small lang="en"></small>'}`;
                  o.querySelector('b').textContent = l.name;
                  if (l.code !== 'en') o.querySelector('small').textContent = l.en;
                  o.addEventListener('click', () => choose(l.code));
                  return o;
                });
                menu.append(...opts);
                btn.setAttribute('aria-controls', menu.id);
                document.body.append(menu);

                let active = 0;
                const focusOpt = (i) => { active = (i + opts.length) % opts.length; opts.forEach((o, k) => o.classList.toggle('is-active', k === active)); opts[active].focus({ preventScroll: true }); opts[active].scrollIntoView({ block: 'nearest' }); };
                // Always drops down from the button, never over the header. Without room for a good part of the
                // list, the page first scrolls the button up; whatever doesn't fit scrolls inside the list
                const GAP = 8, EDGE = 16, WANT = 340;
                const roomBelow = () => innerHeight - btn.getBoundingClientRect().bottom - GAP - EDGE;
                function place() {
                  const r = btn.getBoundingClientRect();
                  menu.style.width = innerWidth <= 520 ? r.width + 'px' : '';   // phones: as wide as the full-width button
                  const w = menu.offsetWidth;
                  menu.style.left = Math.max(EDGE, Math.min(r.right - w, innerWidth - w - EDGE)) + 'px';
                  menu.style.top = (r.bottom + GAP) + 'px';
                  menu.style.maxHeight = Math.max(160, roomBelow()) + 'px';
                }
                function open() {
                  if (!menu.hidden) return;
                  const need = Math.min(WANT, innerHeight * .6) - roomBelow();
                  if (need > 0) scrollBy({ top: need, behavior: 'instant' });
                  menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); place();
                  if (!still) menu.animate([{ opacity: 0, transform: 'translateY(-6px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.22, 1, .36, 1)' });
                  focusOpt(opts.findIndex((o) => o.dataset.code === cur.code));
                  addEventListener('scroll', place, true); addEventListener('resize', place);
                }
                function close(refocus = true) {
                  if (menu.hidden) return;
                  menu.hidden = true; btn.setAttribute('aria-expanded', 'false');
                  removeEventListener('scroll', place, true); removeEventListener('resize', place);
                  if (refocus) btn.focus({ preventScroll: true });
                }
                function choose(code) { close(); if (code !== cur.code) i18n.set(code); }
                btn.addEventListener('click', () => (menu.hidden ? open() : close()));
                btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } });
                menu.addEventListener('keydown', (e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); focusOpt(active + 1); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); focusOpt(active - 1); }
                  else if (e.key === 'Home') { e.preventDefault(); focusOpt(0); }
                  else if (e.key === 'End') { e.preventDefault(); focusOpt(opts.length - 1); }
                  else if (e.key === 'Escape') { e.preventDefault(); close(); }
                  else if (e.key === 'Tab') close(false);
                });
                menu.addEventListener('pointermove', (e) => { const o = e.target.closest('.s-lang-opt'); if (o) { active = opts.indexOf(o); opts.forEach((x) => x.classList.toggle('is-active', x === o)); } });
                document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) close(false); });
              })();

  // ======== from settings-2.js ========
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = matchMedia('(pointer: fine)').matches;
    const root = document.documentElement;
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const easeOut = (v) => 1 - Math.pow(1 - v, 3);
    const OUT = 'cubic-bezier(.16, 1, .3, 1)';

    // ---- Cursor, silk background, glass light, buttons, and the loop: src/components/effects/pageEffects.js ----
    const fx = createPageEffects({});
    const { pointer, useCursor, lightUp, rollButton } = fx;
    fx.lightExisting();
    fx.rollExisting();

    // ---- Settings: choices are remembered here; name, email and notifications live in the account ----
    const STORE = 'momento-settings';
    // Saved on this device: alerts for public events nearby (assets/nearby.js reads it)
    const DEFAULTS = { nearby: true, notify: { photos: true, closing: true, recap: false, activity: true } };
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) {}
    const S = { ...DEFAULTS, ...saved, notify: { ...DEFAULTS.notify, ...(saved.notify || {}) } };
    const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) {} };

    // A small confirmation that slides up after a change
    // Every change here is confirmed with the shared toast
    const toast = (title, sub = '') => window.Momento.toast(title, sub);

    // The shared script (theme, account) runs after this one, so everything that needs it waits
    addEventListener('DOMContentLoaded', () => {
      const M = window.Momento;

      // Switches. Notification switches are stored in the account when there is one
      const get = (key) => {
        if (key.startsWith('notify.')) { const a = M.account.get(); return a ? a.notify[key.slice(7)] : S.notify[key.slice(7)]; }
        return S[key];
      };
      const set = (key, on) => {
        if (key.startsWith('notify.')) {
          const k = key.slice(7);
          S.notify[k] = on;
          if (M.account.get()) {
            M.account.set({ notify: { [k]: on } });
            // Account switches live on the server, so the other pages (and other devices) see the change
            momentoApi('/api/auth/me', momentoJson('PATCH', { notify: { [k]: on } })).then(({ user } = {}) => {
              // The server answers with the saved account: if it kept the old value, say so instead of pretending
              // (a server that doesn't know this switch leaves it out of the answer: that's not saved either)
              const kept = user?.notify?.[k];
              if (kept !== on) {
                if (typeof kept === 'boolean') {
                  M.account.set({ notify: { [k]: kept } });
                  document.querySelectorAll(`.s-sw[data-key="${key}"]`).forEach((s) => s.setAttribute('aria-checked', kept));
                }
                toast('Couldn’t save that', 'Your account didn’t keep this change. Try again later.');
              }
            }).catch((err) => toast('Couldn’t save that', err.message));
          }
        } else S[key] = on;
        persist();
      };
      document.querySelectorAll('.s-sw[data-key]').forEach((sw) => {
        sw.setAttribute('aria-checked', get(sw.dataset.key));
        sw.addEventListener('click', () => {
          const on = sw.getAttribute('aria-checked') !== 'true';
          sw.setAttribute('aria-checked', on);
          set(sw.dataset.key, on);
          toast(sw.getAttribute('aria-label'), on ? 'On' : 'Off');
        });
      });
      // A click anywhere on the row flips its switch
      document.querySelectorAll('.s-row[data-row]').forEach((row) => row.addEventListener('click', (e) => {
        if (!e.target.closest('.s-sw')) row.querySelector('.s-sw').click();
      }));

      // Change buttons: each opens the form under its line (one at a time) and Cancel closes it
      const changes = [...document.querySelectorAll('.s-change[aria-controls]:not(.s-lang-btn)')];   // (the language menu runs itself)
      const openPanel = (btn, open) => {
        const panel = document.getElementById(btn.getAttribute('aria-controls'));
        btn.setAttribute('aria-expanded', open);
        btn.textContent = open ? 'Close' : 'Change';
        panel.hidden = !open;
        if (open) (panel.querySelector('input, [aria-checked="true"]') || panel).focus({ preventScroll: false });
      };
      changes.forEach((btn) => btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') !== 'true';
        changes.forEach((other) => { if (other !== btn && other.getAttribute('aria-expanded') === 'true') openPanel(other, false); });
        openPanel(btn, open);
      }));
      const closePanelOf = (el) => { const p = el.closest('.s-panel'); const btn = p && changes.find((c) => c.getAttribute('aria-controls') === p.id); if (btn) { openPanel(btn, false); btn.focus(); } };
      document.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => { b.closest('form')?.reset(); b.closest('form')?.querySelector('.s-note')?.replaceChildren(); closePanelOf(b); }));

      // Profile, email and password: saved to the account on the server.
      // Accounts made with Google (no password) can change their email but have no password to change.
      const form = document.getElementById('profileForm'), note = document.getElementById('profileNote');
      const emailForm = document.getElementById('emailForm'), emailNote = document.getElementById('emailNote');
      const passForm = document.getElementById('passwordForm'), passNote = document.getElementById('passwordNote');
      const codeForm = document.getElementById('passwordCodeForm');
      // Changing the password: 1 current password, 2 emailed code, 3 new password (popup)
      let pwStep = 1;
      const sayIn = (el) => (msg, bad) => { el.textContent = msg; el.classList.toggle('is-error', !!bad); };
      const say = sayIn(note), sayEmail = sayIn(emailNote), sayPass = sayIn(passNote);
      const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const busy = (f, on) => { const b = f.querySelector('[type="submit"]'); b.disabled = on; f.toggleAttribute('aria-busy', on); };
      const fill = () => {
        const a = M.account.get();
        if (!form.contains(document.activeElement)) form.name.value = a ? a.name : '';
        document.getElementById('nameNow').textContent = a?.name || 'Not set';
        document.getElementById('emailNow').textContent = a?.email || 'not logged in';
        document.getElementById('emailVia').textContent = a?.providers?.includes('google') ? ' (with Google)' : '';
        // No password on the account (Google sign-up): no password box, no password section
        const hasPassword = !!a?.hasPassword;
        document.getElementById('emailPassField').hidden = !hasPassword;
        document.getElementById('passwordGroup').hidden = !a || !hasPassword;
        // The password can only be changed once the email is confirmed (the server checks too)
        const verified = !!a?.emailVerified;
        document.getElementById('passwordVerify').hidden = !a || verified;
        passForm.hidden = !verified || pwStep !== 1;
        codeForm.hidden = !verified || pwStep !== 2;
        document.querySelector('#passwordVerify [data-verify-email]').textContent = a?.email || 'your email';
        // Log out and Delete my account only mean something to someone who is logged in
        document.querySelector('.s-leave').hidden = !a;
        if (!a) document.getElementById('deleteConfirm').hidden = true;
      };
      fill();
      M.account.onChange(fill);
      // This page's account comes from the server (it may be opened in a fresh tab)
      momentoApi('/api/auth/me').then(({ user }) => { if (user) M.account.set(user); else M.account.clear(); fill(); }, () => {});
      const needLogin = () => { if (M.account.get()) return false; location.href = '/?login=1'; return true; };

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (needLogin()) return;
        const name = form.name.value.trim();
        if (!name) { say('Enter your name so guests know who added each photo.', true); form.name.focus(); return; }
        busy(form, true);
        try {
          const { user } = await momentoApi('/api/auth/me', momentoJson('PATCH', { name }));
          M.account.set(user);
          say(''); toast('Name saved', name);
          closePanelOf(form.querySelector('[type="submit"]'));
        } catch (err) { say(err.message, true); }
        finally { busy(form, false); }
      });

      // Moving the account to a new email: the current inbox approves it first, then the new one confirms
      // (the approval link opens on the home page; the confirm link logs every device out and opens Log in)
      emailForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (needLogin()) return;
        const a = M.account.get(), email = emailForm.email.value.trim().toLowerCase();
        if (!EMAIL_RE.test(email)) { sayEmail('Enter an email address like name@example.com.', true); emailForm.email.focus(); return; }
        if (email === a.email) { sayEmail('That’s already your email.', true); return; }
        if (a.hasPassword && !emailForm.password.value) { sayEmail('Enter your password to change your email.', true); emailForm.password.focus(); return; }
        busy(emailForm, true);
        try {
          const { approveFrom } = await momentoApi('/api/auth/email', momentoJson('POST', { email, password: emailForm.password.value || undefined }));
          emailForm.reset();
          const from = approveFrom || a.email;
          sayEmail(`Approval link sent to ${from}. Open it there to approve moving your account to ${email}. Nothing changes until you do.`);
          toast('Check your current inbox', from);
        } catch (err) { sayEmail(err.message, true); }
        finally { busy(emailForm, false); }
      });
      const emailResult = new URLSearchParams(location.search).get('email');
      if (emailResult) {
        // (Older links came back here; the confirm link now goes to the home page's Log in)
        const msg = { changed: ['Email changed', 'Use your new address to log in from now on.'], taken: ['Email not changed', 'Another account already uses that address.'], invalid: ['That link has expired', 'Start the change again below.'] }[emailResult];
        if (msg) setTimeout(() => toast(msg[0], msg[1]), 600);
        history.replaceState(null, '', location.pathname + location.hash);
      }

      // Password (only for accounts that have one): current password → emailed code → new password.
      // Other devices are logged out at the end.
      const sayCode = sayIn(document.getElementById('passwordCodeNote'));
      const npDialog = document.getElementById('newPassDialog'), npForm = document.getElementById('newPassForm'), npStatus = npForm.querySelector('.acct-status');
      const sayNp = (msg, bad) => { npStatus.textContent = msg; npStatus.classList.toggle('is-error', !!bad); };
      let ticket = '';
      const goStep = (n, msg = '', bad = false) => {
        pwStep = n;
        if (n === 1) { ticket = ''; codeForm.reset(); sayCode(''); }
        fill();
        if (n === 1) { sayPass(msg, bad); if (!passForm.hidden) passForm.current.focus(); }
        if (n === 2) { sayCode(msg, bad); codeForm.code.focus(); }
      };
      // Step 1: the current password; the server emails a code
      passForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (needLogin()) return;
        const current = passForm.current.value;
        if (!current) { sayPass('Enter your current password.', true); passForm.current.focus(); return; }
        busy(passForm, true);
        try {
          const r = await momentoApi('/api/auth/password/code', momentoJson('POST', { currentPassword: current }));
          passForm.reset(); sayPass('');
          codeForm.querySelector('[data-code-to]').textContent = r.sentTo || 'your email';
          goStep(2);
        } catch (err) {
          sayPass(err.message, true);
          if (err.code === 'unverified') { M.account.set({ emailVerified: false }); fill(); }
        }
        finally { busy(passForm, false); }
      });
      // Step 2: the 6-digit code; the server gives a ticket and the new-password popup opens
      codeForm.code.addEventListener('input', () => { codeForm.code.value = codeForm.code.value.replace(/\D/g, '').slice(0, 6); });
      codeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = codeForm.code.value.replace(/\D/g, '');
        if (code.length !== 6) { sayCode('Enter the 6-digit code from the email.', true); codeForm.code.focus(); return; }
        busy(codeForm, true);
        try {
          ({ ticket } = await momentoApi('/api/auth/password/code/verify', momentoJson('POST', { code })));
          sayCode('');
          npForm.reset(); sayNp('');
          npDialog.showModal();
          npForm.next.focus();
        } catch (err) {
          sayCode(err.message + (err.code === 'code-expired' ? ' Use “Send a new code”.' : ''), true);
          codeForm.code.select();
        }
        finally { busy(codeForm, false); }
      });
      // A new code needs the current password again
      codeForm.querySelector('[data-new-code]').addEventListener('click', () => goStep(1, 'Enter your current password again and we’ll send a new code.'));
      codeForm.querySelector('[data-cancel]').addEventListener('click', () => goStep(1));
      passForm.querySelector('[data-cancel]').addEventListener('click', () => goStep(1));
      // Step 3 (popup): the new password twice, then it's changed
      const closeNp = (msg) => { if (npDialog.open) npDialog.close(); npForm.reset(); goStep(1, msg || ''); };
      npDialog.querySelectorAll('[data-np-close]').forEach((b) => b.addEventListener('click', () => closeNp('Password not changed.')));
      npDialog.addEventListener('cancel', (e) => { e.preventDefault(); closeNp('Password not changed.'); });
      npForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const next = npForm.next.value, again = npForm.again.value;
        if (next.length < 8) { sayNp('Use at least 8 characters for your new password.', true); npForm.next.focus(); return; }
        if (next !== again) { sayNp('The two new passwords don’t match.', true); npForm.again.focus(); return; }
        busy(npForm, true);
        try {
          const { user } = await momentoApi('/api/auth/password', momentoJson('POST', { ticket, newPassword: next, newPasswordAgain: again }));
          M.account.set(user);
          npDialog.close(); npForm.reset();
          goStep(1, 'Password changed. Other devices have been logged out.');
          closePanelOf(passForm);
          toast('Password changed', 'Other devices have been logged out.');
        } catch (err) {
          // The code step timed out: start again from the current password
          if (err.code === 'code-needed') { closeNp(err.message); return; }
          sayNp(err.message, true);
          (err.code === 'same-password' ? npForm.next : npForm.again).focus();
        }
        finally { busy(npForm, false); }
      });
      const verifySend = document.getElementById('passwordVerifySend'), sayVerify = sayIn(document.getElementById('passwordVerifyNote'));
      verifySend.addEventListener('click', async () => {
        if (needLogin()) return;
        verifySend.disabled = true;
        try {
          await momentoApi('/api/auth/verify-email/resend', { method: 'POST' });
          sayVerify(`Sent. Check ${M.account.get()?.email || 'your inbox'}, including spam.`);
        } catch (err) { sayVerify(err.message, true); }
        finally { verifySend.disabled = false; }
      });

      // Appearance: shares the choice with the account menu and every other page
      const seg = document.getElementById('appSeg'), segBtns = [...seg.querySelectorAll('button')];
      const syncSeg = () => segBtns.forEach((b, i) => { const on = b.dataset.theme === M.theme.pref; b.setAttribute('aria-checked', on); if (on) seg.style.setProperty('--i', i); });
      segBtns.forEach((b) => b.addEventListener('click', () => { M.theme.set(b.dataset.theme); toast('Appearance', b.textContent.trim()); }));
      M.theme.onChange(syncSeg); syncSeg();

      // ---- Profile photo: uploaded to the account, shown everywhere your name is ----
      const avNow = document.getElementById('avatarNow'), avPick = document.getElementById('avatarPick'), avRemove = document.getElementById('avatarRemove');
      const avFile = document.getElementById('avatarFile'), avHint = document.getElementById('avatarHint');
      const showAvatar = (a) => {
        const name = a?.name || a?.email || 'You';
        avNow.replaceChildren();
        if (a?.avatarUrl) {
          const img = document.createElement('img');
          img.src = a.avatarUrl; img.alt = ''; img.referrerPolicy = 'no-referrer';
          img.onerror = () => { img.remove(); avNow.textContent = name[0].toUpperCase(); };
          avNow.append(img);
        } else avNow.textContent = name[0].toUpperCase();
        avPick.textContent = a?.avatarUrl ? 'Change' : 'Add photo';
        avRemove.hidden = !a?.avatarUrl;
      };
      M.account.onChange(showAvatar);
      showAvatar(M.account.get());
      avPick.addEventListener('click', () => avFile.click());
      avFile.addEventListener('change', async () => {
        const f = avFile.files[0];
        avFile.value = '';
        if (!f) return;
        if (f.size > 10 * 1024 * 1024) { toast('That photo is too big', 'Choose one under 10 MB.'); return; }
        // Crop it to a square first (Cancel keeps the current photo)
        const pic = Momento.cropAvatar ? await Momento.cropAvatar(f) : f;
        if (!pic) return;
        const fd = new FormData();
        fd.append('avatar', pic, pic === f ? (f.name || 'photo.jpg') : 'avatar.jpg');
        avNow.classList.add('is-busy'); avPick.disabled = true;
        try {
          const { user } = await momentoApi('/api/auth/avatar', { method: 'POST', body: fd });
          M.account.set(user);
          toast('Profile photo updated', 'Your friends will see it in groups and albums.');
        } catch (err) { toast('Couldn’t update your photo', err.message); }
        finally { avNow.classList.remove('is-busy'); avPick.disabled = false; }
      });
      avRemove.addEventListener('click', async (e) => {
        const ok = await M.confirm({ from: e.currentTarget, title: 'Remove your profile photo?', body: 'Your initials show instead.', ok: 'Remove photo' });
        if (!ok) return;
        try {
          const { user } = await momentoApi('/api/auth/avatar', { method: 'DELETE' });
          M.account.set(user);
          toast('Profile photo removed');
        } catch (err) { toast('Couldn’t remove your photo', err.message); }
      });

      // ---- Notifications: "Public events near me" needs location, so it asks first ----
      const nearSw = document.querySelector('.s-sw[data-key="nearby"]');
      nearSw.addEventListener('click', async () => {
        if (nearSw.getAttribute('aria-checked') !== 'true' || !M.permission) return;
        const ok = await M.permission.ensure('location', { from: nearSw });
        if (!ok) { nearSw.setAttribute('aria-checked', 'false'); set('nearby', false); toast('Public events near me', 'Off: location isn’t allowed'); }
        refreshPerms();
      });

      // ---- Permissions, as the browser reports them ----
      const PERM_IC = {
        camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.2" r="3.6"/></svg>',
        location: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.4"/></svg>',
        notifications: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
      };
      const STATE_TEXT = { granted: 'Allowed', denied: 'Blocked', prompt: 'Not asked yet', unsupported: 'Not available in this browser' };
      const permRows = [...document.querySelectorAll('[data-perm]')];
      async function refreshPerms() {
        for (const row of permRows) {
          const kind = row.dataset.perm;
          row.querySelector('[data-perm-ic]').innerHTML = PERM_IC[kind];
          const st = M.permission ? await M.permission.state(kind) : 'unsupported';
          const label = row.querySelector('.s-perm-state'), btn = row.querySelector('[data-perm-btn]');
          label.dataset.state = st;
          label.textContent = STATE_TEXT[st];
          btn.hidden = st === 'granted';
          btn.textContent = st === 'prompt' ? 'Allow' : 'How to allow';
          btn.setAttribute('aria-label', `${btn.textContent}: ${M.permission?.names[kind] || kind}`);
        }
      }
      permRows.forEach((row) => row.querySelector('[data-perm-btn]').addEventListener('click', async (e) => {
        const ok = await M.permission.request(row.dataset.perm, { from: e.currentTarget });
        if (ok) toast(`${M.permission.names[row.dataset.perm]} allowed`);
        refreshPerms();
      }));
      // The browser tells us when a permission changes (in its own settings, say)
      for (const [kind, name] of [['camera', 'camera'], ['location', 'geolocation'], ['notifications', 'notifications']]) {
        navigator.permissions?.query({ name }).then((p) => { p.onchange = refreshPerms; }).catch(() => {});
        void kind;
      }
      document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshPerms(); });
      refreshPerms();

      // ---- Space on this device: what Momento keeps in this browser, part by part ----
      // Sizes come from the browser (navigator.storage) and from Momento's own saved items. Each part
      // can be cleared on its own; your photos are on Momento's servers, so nothing here holds them.
      const storeGroup = document.getElementById('storeGroup'), storeTotal = document.getElementById('storeTotal');
      const storeEl = document.getElementById('store'), barEl = document.getElementById('storeBar'), partsEl = document.getElementById('storeParts');
      const size = (b) => b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b >= 1e3 ? `${(b / 1e3).toFixed(1)} KB` : `${Math.round(b)} bytes`;
      const PARTS = [
        { id: 'cache', name: 'Saved pages and pictures', what: 'Copies the browser keeps so pages and photos open faster', c: '#AFC0F0', clear: 'Clear' },
        { id: 'alerts', name: 'Notification memory', what: 'Which nearby events you’ve already been told about', c: '#C9C0E2', clear: 'Clear', keys: /^momento-(nearby-seen|camera-asked)$/ },
        { id: 'shortcuts', name: 'Album shortcuts', what: 'Albums remembered on this device for quick access', c: '#C6DEDA', clear: 'Clear', keys: /^momento-(my-albums|removed|waitlist)/ },
        { id: 'preview', name: 'Sample albums (local preview)', what: 'The pretend albums used when trying Momento on this computer', c: '#EADCC8', clear: 'Clear', keys: /^momento-dev/ },
        { id: 'choices', name: 'Your choices', what: 'Light or dark, and the switches on this page', c: '#E6CDD6', keep: 'Kept', keys: /^momento-(settings|theme|notify-nearby)$/ },
      ];
      const lsBytes = (re) => { let t = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (re.test(k)) t += (k.length + (localStorage.getItem(k) || '').length) * 2; } } catch (e) {} return t; };
      const lsClear = (re) => { try { Object.keys(localStorage).filter((k) => re.test(k)).forEach((k) => localStorage.removeItem(k)); } catch (e) {} };
      let shownTotal = 0, focusId = '';
      const countTo = (to) => {
        const from = shownTotal, t0 = performance.now(), ms = still ? 0 : 700;
        shownTotal = to;
        const final = () => { storeTotal.textContent = `${size(to)} used by Momento`; };
        // No animation (reduced motion, hidden tab): show the number straight away
        if (!ms || document.hidden) { final(); return; }
        let done = false;
        const step = (t) => { if (done) return; const k = Math.min(1, Math.max(0, (t - t0) / ms)), e = 1 - Math.pow(1 - k, 3); storeTotal.textContent = `${size(from + (to - from) * e)} used by Momento`; if (k < 1) requestAnimationFrame(step); else done = true; };
        requestAnimationFrame(step);
        // If animation frames never run, the number still appears
        setTimeout(() => { if (!done) { done = true; final(); } }, ms + 150);
      };
      const highlight = (id) => {
        focusId = id;
        storeEl.classList.toggle('has-focus', !!id);
        barEl.querySelectorAll('i').forEach((i) => i.classList.toggle('is-on', i.dataset.part === id));
        partsEl.querySelectorAll('.s-part').forEach((p) => p.classList.toggle('is-on', p.dataset.part === id));
      };
      async function measure() {
        if (!navigator.storage?.estimate) { storeGroup.hidden = true; return; }
        const est = await navigator.storage.estimate().catch(() => ({}));
        const d = est.usageDetails || {};
        const sizes = {};
        for (const p of PARTS) if (p.keys) sizes[p.id] = lsBytes(p.keys);
        // Browser storage other than these small saved items (caches, databases, offline files)
        const local = Object.values(sizes).reduce((a, b) => a + b, 0);
        sizes.cache = d.caches != null || d.indexedDB != null ? (d.caches || 0) + (d.indexedDB || 0) + (d.serviceWorkerRegistrations || 0) : Math.max(0, (est.usage || 0) - local);
        const parts = PARTS.filter((p) => p.id !== 'preview' || sizes.preview);
        const total = parts.reduce((t, p) => t + sizes[p.id], 0);
        storeGroup.hidden = false;
        countTo(total);
        document.getElementById('storeFree').textContent = est.quota ? `About ${size(Math.max(0, est.quota - (est.usage || 0)))} still free for Momento in this browser. Your photos are on Momento’s servers, not here.` : 'Your photos are on Momento’s servers, not here.';
        // The bar: one coloured part each, in proportion
        barEl.replaceChildren(...parts.filter((p) => sizes[p.id] > 0).map((p) => {
          const i = document.createElement('i');
          i.dataset.part = p.id; i.style.setProperty('--c', p.c);
          i.style.width = `${Math.max(2, (sizes[p.id] / (total || 1)) * 100)}%`;
          i.title = `${p.name}: ${size(sizes[p.id])}`;
          return i;
        }));
        // A row per part, with its size and its own Clear
        partsEl.replaceChildren(...parts.map((p) => {
          const row = document.createElement('div');
          row.className = 's-part' + (sizes[p.id] ? '' : ' is-empty');
          row.dataset.part = p.id;
          row.style.setProperty('--c', p.c);
          row.innerHTML = `<span class="s-part-dot" aria-hidden="true"></span><span class="s-text"><b></b><small></small></span><span class="s-part-size"></span>`
            + (p.keep ? `<span class="s-part-keep">${p.keep}</span>` : `<button class="s-change" type="button">${p.clear}</button>`);
          row.querySelector('b').textContent = p.name;
          row.querySelector('small').textContent = p.what;
          row.querySelector('.s-part-size').textContent = sizes[p.id] ? size(sizes[p.id]) : 'Empty';
          const btn = row.querySelector('.s-change');
          if (btn) {
            btn.disabled = !sizes[p.id];
            btn.setAttribute('aria-label', `Clear ${p.name}`);
            btn.addEventListener('click', async () => { await clearPart(p); toast(`${p.name} cleared`, 'Your photos, albums and login are untouched.'); });
          }
          row.addEventListener('pointerenter', () => highlight(p.id));
          row.addEventListener('pointerleave', () => highlight(''));
          row.addEventListener('focusin', () => highlight(p.id));
          row.addEventListener('focusout', () => highlight(''));
          return row;
        }));
        if (focusId) highlight(focusId);
      }
      async function clearPart(p) {
        if (p.id === 'cache') {
          try { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch (err) {}
        } else if (p.keys) lsClear(p.keys);
        await measure();
      }
      // The bar: point at a part to see which it is; tap it to jump to its row
      barEl.addEventListener('pointermove', (e) => { const i = e.target.closest('i'); if (i) highlight(i.dataset.part); });
      barEl.addEventListener('pointerleave', () => highlight(''));
      barEl.addEventListener('click', (e) => {
        const i = e.target.closest('i'); if (!i) return;
        const row = partsEl.querySelector(`[data-part="${i.dataset.part}"]`);
        highlight(i.dataset.part);
        (row.querySelector('button:not(:disabled)') || row).focus?.({ preventScroll: true });
        row.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
      });
      document.getElementById('clearCache').addEventListener('click', async () => {
        for (const p of PARTS) if (!p.keep) await clearPart(p);
        toast('Space freed up', 'Your photos, albums, login and choices are untouched.');
      });
      // Persistent storage: the browser's own "don't clear this site by itself"
      const keepSw = document.getElementById('keepSw');
      if (!navigator.storage?.persist) document.getElementById('keepRow').hidden = true;
      else {
        navigator.storage.persisted().then((on) => keepSw.setAttribute('aria-checked', String(on))).catch(() => {});
        keepSw.addEventListener('click', async () => {
          // Ask the browser, and show its real answer
          const want = keepSw.getAttribute('aria-checked') !== 'true';
          if (!want) { toast('Your browser decides when to stop keeping it', 'Clearing this site’s data in the browser’s settings removes it.'); return; }
          const ok = await navigator.storage.persist().catch(() => false);
          keepSw.setAttribute('aria-checked', String(ok));
          toast(ok ? 'Momento’s data will be kept' : 'Your browser said no for now', ok ? 'The browser won’t clear it by itself.' : 'Browsers allow this once a site is used often, or installed to the Home Screen.');
        });
      }
      measure();
      document.addEventListener('visibilitychange', () => { if (!document.hidden) measure(); });

      // Account
      // Account
      // Download my data: the server builds the file; it is saved as JSON
      const exportBtn = document.getElementById('exportData');
      exportBtn.addEventListener('click', async () => {
        if (!M.account.get()) { location.href = '/?login=1'; return; }
        if (exportBtn.disabled) return;
        exportBtn.disabled = true;
        const idle = exportBtn.textContent;
        exportBtn.textContent = 'Preparing…';
        try {
          const data = await momentoApi('/api/auth/me/export');
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `momento-data-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.append(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          toast('Your data is downloading', 'Look for momento-data in your downloads');
        } catch (err) {
          toast('Couldn’t download your data', err.message);
        } finally {
          exportBtn.disabled = false;
          exportBtn.textContent = idle;
        }
      });

      // Account: log out and delete both happen on the server, not just in this browser
      document.getElementById('logOut').addEventListener('click', async () => {
        try { await momentoApi('/api/auth/logout', { method: 'POST' }); } catch (err) {}
        M.account.clear(); M.flash('You’re logged out', 'Log back in any time'); location.href = '/';
      });
      const delWrap = document.getElementById('deleteConfirm'), delPass = document.getElementById('deletePass'), delNote = document.getElementById('deleteNote');
      const sayDel = (msg, bad) => { delNote.textContent = msg; delNote.classList.toggle('is-error', !!bad); };
      document.getElementById('deleteAcct').addEventListener('click', async (e) => {
        const a = M.account.get();
        if (!a) { location.href = '/?login=1'; return; }
        // Accounts with a password confirm it first (Google-only accounts have none)
        if (a.hasPassword && !delPass.value) {
          delWrap.hidden = false;
          sayDel('Type your password, then press Delete my account again.');
          delPass.focus();
          return;
        }
        const from = e.currentTarget;
        const ok = await M.confirm({
          from, title: 'Delete your account?', ok: 'Delete account',
          body: 'Your profile, the albums you host (with all their photos) and the photos you added are removed for good. This can’t be undone.',
        });
        if (!ok) return;
        from.disabled = true;
        try {
          await momentoApi('/api/auth/me', momentoJson('DELETE', { password: delPass.value || undefined }));
        } catch (err) {
          from.disabled = false;
          delWrap.hidden = false;
          sayDel(err.message, true);
          return;
        }
        try { ['momento-my-albums', 'momento-removed', 'momento-waitlist'].forEach((k) => localStorage.removeItem(k)); } catch (err) {}
        M.account.clear();
        M.flash('Account deleted', 'Your albums and photos have been removed');
        location.href = '/';
      });
    });

    // ---- The header gains a veil once scrolled, and the page opens ----
    const header = document.getElementById('header');
    const veil = () => header.classList.toggle('is-veiled', scrollY > 40);
    addEventListener('scroll', veil, { passive: true });
    veil();
    // (after the page intro, when there is one: it lifts the veil by announcing momento:intro-reveal)
    const open = () => requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-ready')));
    if (root.classList.contains('intro-on')) document.addEventListener('momento:intro-reveal', open, { once: true });
    else open();

    // ---- One loop for everything that moves (shared) ----
    fx.loop();
}
