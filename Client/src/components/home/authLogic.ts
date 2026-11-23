import { onLegacyReady } from '@/lib/legacy';
import { api, type ApiError } from '@/lib/api';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Err = ApiError;
const W = () => window as any;
const M = () => W().Momento;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = <T extends Element = HTMLElement>(id: string) => document.getElementById(id) as unknown as T;

/**
 * Sign up / log in on the home page (window.openAuth), the new-device step, Google sign-in, and the links from emails
 * (password reset, approving an email change, and how a link went). Moved from the old home page script unchanged,
 * attached to the AuthDialog markup. Returns a function that removes what it added.
 */
export function setUpAuth(): () => void {
  const cleanup: (() => void)[] = [];
  const on = <K extends keyof HTMLElementEventMap>(el: EventTarget, type: K | string, fn: (e: any) => void) => { el.addEventListener(type, fn); cleanup.push(() => el.removeEventListener(type, fn)); };
  const useCursor = matchMedia('(pointer: fine)').matches && !reduced();

  const dialog = $<HTMLDialogElement>('authDialog');
  const form = $<HTMLFormElement>('authForm');
  const body = form.querySelector<HTMLElement>('.auth-body')!;
  const done = $('authDone');
  const title = $('authTitle');
  const sub = $('authSub');
  const scanNote = $('authScan');
  const skip = $<HTMLButtonElement>('authSkip');
  const error = $('authError');
  const submit = $<HTMLButtonElement>('authSubmit');
  let captchaWidget: any = null, captchaToken = '', captchaLoading: Promise<void> | null = null;
  const captchaStatus = $('captchaStatus');
  async function prepareCaptcha() {
    if (captchaWidget !== null) return;
    if (captchaLoading) return captchaLoading;
    captchaLoading = (async () => {
      captchaStatus.textContent = 'Loading security check…';
      try {
        // Google reCAPTCHA's "I'm not a robot" box. The public site key comes from the server.
        const { captcha } = await api.config();
        if (!captcha?.siteKey) throw new Error('Sign-up is temporarily unavailable. Please try again later.');
        if (!W().grecaptcha?.render) await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          const fail = () => { clearTimeout(timer); script.remove(); reject(new Error('Security check could not load. Reopen sign-up to retry.')); };
          const timer = setTimeout(fail, 15000);
          W().__momentoRecaptchaReady = () => { clearTimeout(timer); resolve(); };
          script.src = 'https://www.google.com/recaptcha/api.js?render=explicit&onload=__momentoRecaptchaReady';
          script.async = true;
          script.onerror = fail;
          document.head.append(script);
        });
        // Its picture puzzle opens at the end of the page, which this (modal) window would cover: move it into the
        // window as soon as it appears
        const adopt = new MutationObserver(() => {
          const frame = document.querySelector('body > div iframe[src*="/recaptcha/"][src*="bframe"]');
          if (!frame) return;
          let box: Element = frame;
          while (box.parentElement && box.parentElement !== document.body) box = box.parentElement;
          if (box.parentElement === document.body) { box.classList.add('rc-puzzle'); dialog.append(box); adopt.disconnect(); }
        });
        adopt.observe(document.body, { childList: true, subtree: true });
        cleanup.push(() => adopt.disconnect());
        captchaWidget = W().grecaptcha.render('signupCaptcha', {
          sitekey: captcha.siteKey,
          theme: M().theme?.resolved === 'dark' ? 'dark' : 'light',
          callback: (token: string) => { captchaToken = token; captchaStatus.textContent = ''; },
          'expired-callback': () => { captchaToken = ''; captchaStatus.textContent = 'Security check expired. Please tick the box again.'; },
          'error-callback': () => { captchaToken = ''; captchaStatus.textContent = 'Security check failed. Please retry or reload the page.'; },
        });
        captchaStatus.textContent = '';
      } catch (err) { captchaStatus.textContent = (err as Error).message; }
    })();
    await captchaLoading;
    captchaLoading = null;
  }
  const tabs = [...form.querySelectorAll<HTMLElement>('[role="tab"]')];
  let onDone: (() => void) | null = null, fromScan = false;

  const field = (n: string) => form.querySelector(`[name="${n}"]`) as HTMLInputElement;
  // Sent with sign-up so the server keeps a consent record: what was agreed to, and which version
  const TERMS_VERSION = '2026-11-07'; // the Privacy Policy's "Last updated" date (privacy)
  const consent = () => ({ acceptTerms: field('acceptTerms').checked, termsVersion: TERMS_VERSION });
  const setLabel = (btn: Element, text: string) => btn.querySelectorAll('.roll > span').forEach((s) => { s.textContent = text; });
  // Busy: a turning ring and what's happening ("Logging in…"); null puts the normal label back
  function setBusy(text: string | null, idleText?: string) {
    submit.classList.toggle('is-busy', !!text);
    submit.setAttribute('aria-busy', String(!!text));
    if (!text) { setLabel(submit, idleText!); return; }
    submit.querySelectorAll('.roll > span').forEach((s) => { s.innerHTML = '<i class="btn-spin" aria-hidden="true"></i>'; s.append(text); });
  }
  // After logging in, go back to the album link that sent you here (albums.html only), or to your albums
  const nextPage = () => {
    const next = new URLSearchParams(location.search).get('next') || '';
    return /^(?:albums|events|reviews|review)(?:\.html)?([?#]|$)/.test(next) ? next : 'albums';
  };
  // Sent here by an invite link (events.html?join=…): the dialog says so
  const fromInvite = /[?&]join=/.test(nextPage());
  // The album code in that invite link: sent with sign-up, so confirming the email joins the album
  const inviteCode = () => new URLSearchParams(nextPage().split('?')[1] || '').get('join') || undefined;
  // Coming back to this page (Back button) shouldn't leave the button stuck on "Opening your albums…"
  on(window, 'pageshow', (e: PageTransitionEvent) => { if (e.persisted && submit.classList.contains('is-busy')) { submit.disabled = false; setBusy(null, form.dataset.mode === 'signup' ? 'Create account' : 'Log in'); } });
  function setMode(mode: string) {
    form.dataset.mode = mode;
    if (mode === 'signup') void prepareCaptcha();
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.mode === mode)));
    field('password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    error.textContent = '';
    if (fromScan) {
      title.textContent = mode === 'signup' ? 'Join to add your photos' : 'Log in to add your photos';
      sub.textContent = 'Everyone at the wedding can see the album. Sign up to add yours, or log in if you’ve used Momento before.';
    } else if (fromInvite) {
      title.textContent = mode === 'signup' ? 'Sign up to join the album' : 'Log in to join the album';
      sub.textContent = 'You’ve been invited to a Momento album. Log in, or create an account if you’re new, and you’ll be taken straight to it.';
    } else {
      title.textContent = mode === 'signup' ? 'Create your account' : 'Welcome back';
      sub.textContent = mode === 'signup' ? 'Keep every album you join, and add your photos in one tap.' : 'Log in to see your albums.';
    }
    setLabel(submit, mode === 'signup' ? 'Create account' : 'Log in');
  }

  const openAuth = async (opts: { mode?: string; fromScan?: boolean; onDone?: () => void } = {}) => {
    try { await M().sessionReady; } catch {}
    onDone = opts.onDone || null;
    fromScan = !!opts.fromScan;
    if (M().account.get()) {
      // Already signed in: scanning the code just opens the photobook; anything else carries straight on
      if (opts.fromScan) { onDone = null; opts.onDone?.(); return; }
      location.href = nextPage(); return;
    }
    scanNote.hidden = !fromScan;
    skip.hidden = !fromScan;
    body.hidden = false; done.hidden = true;
    setMode(opts.mode || 'signup');
    // The custom cursor can't draw above a modal, so the normal cursor comes back
    document.documentElement.classList.remove('has-cursor');
    dialog.showModal();
  };
  W().openAuth = openAuth;
  cleanup.push(() => { if (W().openAuth === openAuth) delete W().openAuth; });
  function finish() {
    const cb = onDone; onDone = null;
    if (cb) cb();
  }
  on(dialog, 'close', () => {
    if (useCursor) document.documentElement.classList.add('has-cursor');
    finish();
  });
  // Closing by hand fades the card out first (success and redirects still close straight away)
  let closingAuth = false, downOutside = false;
  async function dismissAuth() {
    if (closingAuth || !dialog.open) return;
    closingAuth = true;
    let anim: Animation | null = null;
    if (!reduced()) {
      anim = form.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px) scale(.96)' }],
        { duration: 200, easing: 'cubic-bezier(.5, 0, .75, 0)', fill: 'forwards' });
      try { await anim.finished; } catch {}
    }
    dialog.close();
    if (anim) anim.cancel();
    closingAuth = false;
  }
  on(dialog, 'cancel', (e: Event) => { e.preventDefault(); dismissAuth(); });
  on(form.querySelector('[data-close]')!, 'click', dismissAuth);
  on(skip, 'click', dismissAuth);
  on(dialog, 'pointerdown', (e: PointerEvent) => { downOutside = e.target === dialog; });
  on(dialog, 'click', (e: MouseEvent) => { if (e.target === dialog && downOutside) dismissAuth(); }); // click outside the card
  tabs.forEach((t) => on(t, 'click', () => setMode(t.dataset.mode!)));
  on(form.querySelector('.auth-forgot')!, 'click', async (e: Event) => {
    e.preventDefault();
    const email = field('email').value.trim();
    if (!email) { error.textContent = 'Enter your email first.'; return; }
    try { await api.auth.forgotPassword(email); error.textContent = 'If this account exists, a password reset link has been sent.'; }
    catch (err) { error.textContent = (err as Error).message; }
  });

  // Google, on both Sign up and Log in. Google's popup hands back a one-time code, which the server swaps for the
  // account (POST /api/auth/google): a new account, or the existing one with that email.
  const googleBtn = form.querySelector<HTMLButtonElement>('.auth-alt[data-provider="Google"]')!;
  const deviceStep = $('deviceStep');
  const deviceHelp = $('deviceHelp');
  const deviceAction = $<HTMLButtonElement>('deviceAction');
  const deviceCode = $<HTMLInputElement>('deviceCode');
  const codeField = $('deviceCodeField');
  const resend = $<HTMLButtonElement>('deviceResend');
  const choices = $('deviceChoices');
  const deviceError = $('deviceError');
  let challenge: string | null = null, ticket: string | null = null;
  function loginError(err: Err) {
    if (!err.challenge || !dialog.open) { error.textContent = err.message; return; }
    challenge = err.challenge;
    ticket = null;
    field('password').value = deviceCode.value = '';
    choices.replaceChildren();
    codeField.hidden = resend.hidden = true;
    body.hidden = true;
    deviceStep.hidden = false;
    dialog.setAttribute('aria-labelledby', 'deviceTitle');
    deviceHelp.textContent = 'Verify your email to choose which device to log out.';
    deviceError.textContent = '';
    deviceAction.textContent = 'Email me a code';
    deviceAction.disabled = false;
    deviceAction.focus();
  }
  on(dialog, 'close', () => {
    challenge = ticket = null;
    deviceStep.hidden = true;
    dialog.setAttribute('aria-labelledby', 'authTitle');
  });
  async function deviceRequest(step: 'code' | 'verify' | 'replace') {
    const current = challenge;
    const selected = choices.querySelector<HTMLInputElement>('input:checked');
    if (step === 'replace' && !selected) { deviceError.textContent = 'Choose a device first.'; return; }
    deviceAction.disabled = resend.disabled = true;
    deviceError.textContent = '';
    try {
      const result = await api.auth.devices(step, { challenge, code: deviceCode.value.trim(), ticket, deviceId: selected?.value });
      if (current !== challenge) return;
      if (step === 'code') {
        deviceHelp.textContent = 'Enter the six-digit code sent to your account email.';
        deviceAction.textContent = 'Verify code';
        codeField.hidden = resend.hidden = false;
        deviceCode.value = '';
        deviceCode.focus();
      } else if (step === 'verify') {
        ticket = result.ticket ?? null;
        codeField.hidden = resend.hidden = true;
        const devices = result.devices || [];
        deviceHelp.textContent = devices.length ? 'Choose a device to log out so you can sign in here.' : 'A slot has opened. Close this window and log in again.';
        deviceAction.textContent = 'Log out selected device and sign in';
        for (const device of devices) {
          const label = document.createElement('label');
          label.className = 'device-choice'; // a glass choice card (assets/glass.css)
          const radio = document.createElement('input');
          radio.type = 'radio'; radio.name = 'replaceDevice'; radio.value = device.id;
          const when = device.loggedInAt ? 'Last login: ' + new Date(device.loggedInAt).toLocaleString()
            : 'Login time unavailable · Expires ' + new Date(device.expiresAt).toLocaleString();
          label.append(radio, ' ' + device.name + ' · ' + when);
          choices.append(label);
        }
        choices.querySelector<HTMLElement>('input')?.focus();
      } else {
        M().account.set(result.user);
        location.href = nextPage();
      }
    } catch (err) { if (current === challenge) deviceError.textContent = (err as Error).message; }
    finally { if (current === challenge) { deviceAction.disabled = !!ticket && !choices.childElementCount; resend.disabled = false; } }
  }
  on(deviceAction, 'click', () => deviceRequest(ticket ? 'replace' : codeField.hidden ? 'code' : 'verify'));
  on(resend, 'click', () => deviceRequest('code'));
  let googleId: string | null = null, gsiP: Promise<void> | null = null;
  const loadGsi = () => (gsiP ||= new Promise<void>((resolve, reject) => {
    if (W().google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gsiP = null; reject(new Error('Google sign-in couldn’t load. Check your connection and try again.')); };
    document.head.append(s);
  }));
  // Loaded ahead of the click, so the popup opens straight from it (browsers block late popups)
  api.config().then((c) => { googleId = c.googleClientId || null; if (googleId) loadGsi().catch(() => {}); }).catch(() => {});
  on(googleBtn, 'click', async () => {
    error.textContent = '';
    // A new Google account is a sign-up too, so it needs the same agreement
    if (form.dataset.mode === 'signup' && !field('acceptTerms').checked) { error.textContent = 'Confirm you’re 13 or older and agree to the Terms and Privacy Policy to create an account.'; field('acceptTerms').focus(); return; }
    if (!googleId) { error.textContent = 'Google sign-in isn’t switched on yet. Use your email for now.'; return; }
    try { await loadGsi(); } catch (err) { error.textContent = (err as Error).message; return; }
    const idle = () => (form.dataset.mode === 'signup' ? 'Create account' : 'Log in');
    W().google.accounts.oauth2.initCodeClient({
      client_id: googleId,
      scope: 'openid email profile',
      ux_mode: 'popup',
      callback: async (resp: { error?: string; code?: string }) => {
        if (resp.error || !resp.code) { error.textContent = 'Google sign-in was cancelled.'; return; }
        googleBtn.disabled = submit.disabled = true;
        setBusy('Signing in with Google…');
        try {
          const newAccount = form.dataset.mode === 'signup';
          const { user } = await api.auth.google({ code: resp.code!, ...(newAccount ? consent() : {}) });
          M().account.set(user);
          // A new account picks its language before going in
          if (newAccount) await M().chooseLanguage?.();
          setBusy('Opening your albums…');
          location.href = nextPage();
        } catch (err) {
          googleBtn.disabled = submit.disabled = false;
          setBusy(null, idle());
          // A new Google account, started from Log in: Momento needs the Terms agreed first, which is on Sign up
          if ((err as Err).code === 'terms-required') {
            setMode('signup');
            error.textContent = 'This Google account is new to Momento. Agree to the Terms and Privacy Policy, then press Continue with Google again.';
            field('acceptTerms')?.focus();
            return;
          }
          loginError(err as Err);
        }
      },
      error_callback: (e: { type?: string }) => { if (e?.type !== 'popup_closed') error.textContent = 'Google’s window didn’t open. Allow pop-ups for this site and try again.'; },
    }).requestCode();
  });
  on(form, 'submit', async (e: Event) => {
    e.preventDefault();
    if (challenge) { deviceAction.click(); return; }
    if (submit.disabled) return;
    const signup = form.dataset.mode === 'signup';
    const name = field('name').value.trim(), email = field('email').value.trim(), pass = field('password').value;
    if (signup && !name) { error.textContent = 'Enter your name so guests know who added each photo.'; field('name').focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { error.textContent = 'Enter an email address like name@example.com.'; field('email').focus(); return; }
    if (pass.length < 8) { error.textContent = 'Use at least 8 characters for your password.'; field('password').focus(); return; }
    if (signup && !field('acceptTerms').checked) { error.textContent = 'Confirm you’re 13 or older and agree to the Terms and Privacy Policy to create an account.'; field('acceptTerms').focus(); return; }
    if (signup && !captchaToken) { error.textContent = 'Complete the security check before signing up.'; return; }
    submit.disabled = true;
    error.textContent = '';
    const idle = signup ? 'Create account' : 'Log in';
    setBusy(signup ? 'Creating your account…' : 'Logging in…');
    let leaving = false;
    try {
      const { user } = await (signup
        ? api.auth.signup({ name, email, password: pass, captchaToken, joinCode: inviteCode(), ...consent() })
        : api.auth.login({ email, password: pass }));
      field('password').value = '';
      M().account.set(user);
      // A new account picks its language before going in
      if (signup) await M().chooseLanguage?.();
      // Stays busy until the next page has loaded, so it never looks like nothing happened
      leaving = true;
      setBusy('Opening your albums…');
      location.href = nextPage();
    } catch (err) { loginError(err as Err); }
    finally {
      if (!leaving) { submit.disabled = false; setBusy(null, idle); }
      if (signup && captchaWidget !== null) { captchaToken = ''; W().grecaptcha.reset(captchaWidget); }
    }
  });
  document.querySelectorAll<HTMLElement>('[data-auth]').forEach((b) => on(b, 'click', () => openAuth({ mode: b.dataset.auth })));

  // ---- Links from emails: password reset, approving an email change, and how a link went ----
  // Tokens are taken out of the address bar straight away (the referrer meta also keeps them from ever reaching
  // another site)
  const linkParams = new URLSearchParams(location.search);
  const resetToken = linkParams.get('reset'), approveToken = linkParams.get('email-approve');
  const emailResult = linkParams.get('email'), verified = linkParams.get('verified');
  if (resetToken || approveToken || emailResult || verified) {
    ['reset', 'email-approve', 'email', 'verified'].forEach((k) => linkParams.delete(k));
    history.replaceState(null, '', location.pathname + (linkParams.size ? '?' + linkParams : '') + location.hash);
  }
  const ICON_X = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  // A small slab of the popup glass, the same as the QR code's
  function emailSlab(titleId: string) {
    const d = document.createElement('dialog');
    d.className = 'acct-dialog mq-pop';
    d.setAttribute('aria-labelledby', titleId);
    d.innerHTML = `<div class="acct-card mq-slab email-slab"><button class="acct-x" type="button" aria-label="Close" data-close>${ICON_X}</button><div class="email-slab-in"></div></div>`;
    document.body.append(d);
    const card = d.querySelector<HTMLElement>('.email-slab')!, inner = d.querySelector<HTMLElement>('.email-slab-in')!;
    const close = () => { if (d.open) d.close(); };
    d.addEventListener('close', () => d.remove());
    d.addEventListener('click', (e) => { if (e.target === d || (e.target as Element).closest('[data-close]')) close(); });
    // Each step swaps the slab's contents; the card settles in again so the change is seen
    const view = (html: string) => {
      inner.innerHTML = html;
      if (!reduced()) inner.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.16, 1, .3, 1)' });
      inner.querySelector<HTMLElement>('[autofocus]')?.focus();
    };
    const open = () => {
      d.showModal();
      if (!reduced()) {
        card.animate([{ opacity: 0, transform: 'translateY(14px) scale(.95)' }, { opacity: 1, transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.34, 1.25, .64, 1)' });
        try { d.animate({ opacity: [0, 1] }, { duration: 300, pseudoElement: '::backdrop' }); } catch {}
      }
    };
    return { d, inner, view, open, close };
  }
  const text = (el: Element, s: string) => { el.textContent = s; return el; };

  // The reset link from "Forgot your password?" (also how a Google-only account adds a password)
  function openReset(token: string) {
    const s = emailSlab('rsTitle');
    const showForm = () => {
      s.view(`
        <h2 id="rsTitle">Choose a new password</h2>
        <p class="email-slab-lede">Use at least 8 characters. Every other device will be logged out.</p>
        <form novalidate>
          <label class="acct-field"><span>New password</span><input name="pw" type="password" autocomplete="new-password" minlength="8" autofocus></label>
          <label class="acct-field"><span>Type it again</span><input name="again" type="password" autocomplete="new-password"></label>
          <p class="acct-status" role="status"></p>
          <div class="acct-actions"><button class="acct-ghost" type="button" data-close>Cancel</button><button class="acct-primary" type="submit">Set password</button></div>
        </form>`);
      const f = s.inner.querySelector('form')! as HTMLFormElement & { pw: HTMLInputElement; again: HTMLInputElement };
      const say = (msg: string) => { const st = f.querySelector('.acct-status')!; st.textContent = msg; st.classList.toggle('is-error', !!msg); };
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pw = f.pw.value, again = f.again.value;
        if (pw.length < 8) { say('Use at least 8 characters for your password.'); f.pw.focus(); return; }
        if (pw !== again) { say('The two passwords don’t match.'); f.again.focus(); return; }
        const go = f.querySelector<HTMLButtonElement>('[type="submit"]')!; go.disabled = true; go.textContent = 'Setting password…'; say('');
        try {
          const { user } = await api.auth.resetPassword(token, pw);
          M().account.set(user);
          M().flash?.('Password set', 'You’re logged in.');
          location.href = 'albums';
        } catch (err) {
          go.disabled = false; go.textContent = 'Set password';
          if ((err as Err).status === 400 && /expired|used/i.test((err as Err).message)) showExpired(); else say((err as Err).message);
        }
      });
    };
    const showExpired = () => {
      s.view(`
        <h2 id="rsTitle">This link has expired</h2>
        <p class="email-slab-lede">Reset links work for an hour and only once. Ask for a new one and use the newest email.</p>
        <div class="acct-actions"><button class="acct-ghost" type="button" data-close>Close</button><button class="acct-primary" type="button" data-again autofocus>Send a new link</button></div>`);
      s.inner.querySelector('[data-again]')!.addEventListener('click', async () => {
        s.close();
        await openAuth({ mode: 'login' });
        error.textContent = 'Enter your email, then choose “Forgot your password?” for a new link.';
        field('email').focus();
      });
    };
    showForm();
    s.open();
  }

  // The approval link sent to the CURRENT address when someone asks to move the account
  async function openApprove(token: string) {
    const s = emailSlab('eaTitle');
    const expired = () => s.view(`
      <h2 id="eaTitle">This link has expired</h2>
      <p class="email-slab-lede">It may already have been used. Nothing about your account has changed.</p>
      <div class="acct-actions"><button class="acct-primary" type="button" data-close autofocus>Close</button></div>`);
    s.view('<h2 id="eaTitle">Checking the link…</h2>');
    s.open();
    let info: { email: string; newEmail: string };
    try { info = await api.auth.approveInfo(token); }
    catch { expired(); return; }
    s.view(`
      <h2 id="eaTitle">Approve your new email?</h2>
      <p class="email-slab-lede">Someone signed in to your account asked to move it from <b data-from></b> to <b data-to></b>.</p>
      <p class="email-slab-note">Not you? Choose Not me: the change stops and every device is logged out.</p>
      <p class="acct-status" role="status"></p>
      <div class="acct-actions"><button class="acct-primary is-danger" type="button" data-no>Not me</button><button class="acct-primary" type="button" data-yes autofocus>Approve</button></div>`);
    text(s.inner.querySelector('[data-from]')!, info.email);
    text(s.inner.querySelector('[data-to]')!, info.newEmail);
    const say = (msg: string) => { const st = s.inner.querySelector('.acct-status')!; st.textContent = msg; st.classList.toggle('is-error', !!msg); };
    const decide = async (path: 'approve' | 'cancel', b: HTMLButtonElement) => {
      s.inner.querySelectorAll<HTMLButtonElement>('.acct-actions button').forEach((x) => { x.disabled = true; });
      b.textContent = path === 'approve' ? 'Approving…' : 'Stopping…';
      try {
        const { result } = await (path === 'approve' ? api.auth.approveEmail(token) : api.auth.cancelEmail(token));
        if (result === 'approved') {
          s.view(`
            <h2 id="eaTitle">One last step</h2>
            <p class="email-slab-lede">We sent a confirm link to <b data-to></b>. Open it there to finish moving your account. Every device will then log in again with the new address.</p>
            <div class="acct-actions"><button class="acct-primary" type="button" data-close autofocus>Done</button></div>`);
          text(s.inner.querySelector('[data-to]')!, info.newEmail);
        } else if (result === 'cancelled') {
          M().account.clear();
          s.view(`
            <h2 id="eaTitle">Change stopped</h2>
            <p class="email-slab-lede">Your email stays the same and every device has been logged out. Log in again, and change your password if you think someone else had access.</p>
            <div class="acct-actions"><button class="acct-ghost" type="button" data-close>Close</button><button class="acct-primary" type="button" data-login autofocus>Log in</button></div>`);
          s.inner.querySelector('[data-login]')!.addEventListener('click', () => { s.close(); openAuth({ mode: 'login' }); });
        } else if (result === 'taken') {
          s.view(`
            <h2 id="eaTitle">That email is taken</h2>
            <p class="email-slab-lede">Another account started using that address, so nothing was changed.</p>
            <div class="acct-actions"><button class="acct-primary" type="button" data-close autofocus>Close</button></div>`);
        } else expired();
      } catch (err) {
        s.inner.querySelectorAll<HTMLButtonElement>('.acct-actions button').forEach((x) => { x.disabled = false; });
        b.textContent = path === 'approve' ? 'Approve' : 'Not me';
        say((err as Error).message);
      }
    };
    s.inner.querySelector('[data-yes]')!.addEventListener('click', (e) => decide('approve', e.currentTarget as HTMLButtonElement));
    s.inner.querySelector('[data-no]')!.addEventListener('click', (e) => decide('cancel', e.currentTarget as HTMLButtonElement));
  }

  // Once the page has started (it used to be DOMContentLoaded, which the old scripts now get once they have all run)
  cleanup.push(onLegacyReady(() => {
    // From an invite link most people are new, so it opens on Sign up (Log in is one tap away)
    if (new URLSearchParams(location.search).has('login')) openAuth({ mode: fromInvite || new URLSearchParams(location.search).has('signup') ? 'signup' : 'login' });
    if (resetToken) openReset(resetToken);
    else if (approveToken) openApprove(approveToken);
    // The confirm link from the new address lands here (the move logged every device out, so ?login opens Log in)
    if (emailResult === 'changed') M().toast('Email changed', 'Log in with your new address.');
    if (emailResult === 'taken') M().toast('Email not changed', 'Another account already uses that address.');
    if (emailResult === 'invalid') M().toast('That link has expired', 'Start the change again from Settings.');
    if (verified === 'session_limit') M().toast('Your email is verified', 'Log in to choose a device to log out.');
    if (verified === 'invalid') M().toast('This verification link has expired', 'It may already have been used. Sign in to check your account or request a new link.');
  }));

  return () => cleanup.forEach((fn) => fn());
}
