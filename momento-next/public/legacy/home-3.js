    // ---- Nav: Home goes to the top; the arrow beside it (or hovering) opens this page's sections ----
    (() => {
      const header = document.getElementById('header');
      const wrap = document.getElementById('navWrap');
      const split = wrap.querySelector('.nav-split');
      const home = wrap.querySelector('.nav-home');
      const caret = wrap.querySelector('.nav-caret');
      const menu = document.getElementById('navMenu');
      const pill = menu.querySelector('.menu-pill');
      const items = [...menu.querySelectorAll('.menu-item')];
      let active = null, open = false, closeTimer;

      function place(item) {
        pill.style.opacity = 1;
        pill.style.height = `${item.offsetHeight}px`;
        pill.style.translate = `0 ${item.offsetTop}px`;
      }
      // null means the top of the page, where no section is marked
      function select(item) {
        if (item === active) return;
        active?.classList.remove('active');
        active = item;
        if (item) { item.classList.add('active'); place(item); }
        else pill.style.opacity = 0;
      }
      function setOpen(v) {
        clearTimeout(closeTimer);
        if (v === open) return;
        open = v;
        menu.classList.toggle('is-open', v);
        caret.setAttribute('aria-expanded', v);
        if (v && active) place(active);
      }
      const sectionOf = (item) => document.querySelector(item.getAttribute('href'));
      let lock = 0;
      window.updateNav = () => {
        header.classList.toggle('is-veiled', document.getElementById('how-it-works').getBoundingClientRect().top < 90 || (innerWidth <= 900 && scrollY > 40));
        if (performance.now() < lock) return;
        let current = null;
        for (const item of items) if (sectionOf(item).getBoundingClientRect().top <= innerHeight * .4) current = item;
        select(current);
      };
      const sectionTop = (item) => {
        const section = sectionOf(item);
        return section.getBoundingClientRect().top + scrollY - 90;
      };
      function go(item) {
        select(item);
        lock = performance.now() + 1500;
        scrollTo({ top: item ? sectionTop(item) : 0, behavior: still ? 'auto' : 'smooth' });
      }

      home.addEventListener('click', (e) => { e.preventDefault(); setOpen(false); go(null); });
      document.querySelector('.brand').addEventListener('click', (e) => { e.preventDefault(); go(null); window.resetHome?.(); });
      // A click just after hovering opened it keeps it open (instead of closing it straight away)
      caret.addEventListener('click', () => { if (open && performance.now() - (caret._hoverAt || 0) < 500) return; setOpen(!open); });
      // With a mouse, hovering Home or the list opens it; it waits a moment before closing
      if (finePointer) for (const zone of [split, menu]) {
        zone.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { if (!open) caret._hoverAt = performance.now(); setOpen(true); } });
        zone.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !drag?.on) closeTimer = setTimeout(() => setOpen(false), 260); });
      }
      document.addEventListener('pointerdown', (e) => { if (open && !wrap.contains(e.target)) setOpen(false); });
      addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { setOpen(false); caret.focus(); } });

      // ---- Hold and drag down the list: the pill follows and the page glides to each section.
      // A mouse drags straight away; a finger holds briefly first.
      const nearest = (y) => items.reduce((best, i) =>
        Math.abs(i.offsetTop + i.offsetHeight / 2 - y) < Math.abs(best.offsetTop + best.offsetHeight / 2 - y) ? i : best);
      let drag = null, swallowClick = false;
      function startDrag() {
        if (!drag || drag.on) return;
        drag.on = true;
        menu.classList.add('is-dragging');
        try { menu.setPointerCapture(drag.id); } catch {}
        lock = Infinity;
        followPointer(drag.lastY);
      }
      function followPointer(clientY) {
        const y = clientY - menu.getBoundingClientRect().top;
        const target = nearest(y);
        const first = items[0], last = items[items.length - 1], h = target.offsetHeight;
        pill.style.opacity = 1;
        pill.style.height = `${h}px`;
        pill.style.translate = `0 ${Math.min(Math.max(y - h / 2, first.offsetTop), last.offsetTop + last.offsetHeight - h)}px`;
        if (target !== drag.target) {
          drag.target = target;
          items.forEach((i) => i.classList.toggle('active', i === target));
          scrollTo({ top: sectionTop(target), behavior: still ? 'auto' : 'smooth' });
        }
      }
      menu.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || !e.target.closest('.menu-item')) return;
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, lastY: e.clientY, mouse: e.pointerType === 'mouse', on: false, target: active };
        if (!drag.mouse) drag.timer = setTimeout(startDrag, 260);
      });
      menu.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        drag.lastY = e.clientY;
        if (!drag.on) {
          const dx = Math.abs(e.clientX - drag.x), dy = Math.abs(e.clientY - drag.y);
          if (drag.mouse && dy > 5) startDrag();
          else if (!drag.mouse && (dx > 8 || dy > 8)) { clearTimeout(drag.timer); drag = null; }
          if (!drag?.on) return;
        }
        followPointer(e.clientY);
      });
      function endDrag() {
        if (!drag) return;
        clearTimeout(drag.timer);
        if (drag.on) {
          const target = drag.target;
          menu.classList.remove('is-dragging');
          // Only the click that ends this drag is ignored, never a later one
          swallowClick = true;
          setTimeout(() => { swallowClick = false; }, 0);
          active = null;
          select(target);
          lock = performance.now() + 1200;
          setTimeout(() => setOpen(false), 350);
        }
        drag = null;
      }
      menu.addEventListener('pointerup', endDrag);
      menu.addEventListener('pointercancel', endDrag);
      menu.addEventListener('dragstart', (e) => e.preventDefault());
      menu.addEventListener('touchmove', (e) => { if (drag?.on) e.preventDefault(); }, { passive: false });
      menu.addEventListener('contextmenu', (e) => { if (drag) e.preventDefault(); });

      menu.addEventListener('click', async (e) => {
        const item = e.target.closest('.menu-item');
        if (!item) return;
        e.preventDefault();
        if (swallowClick) { swallowClick = false; return; }
        go(item);
        setOpen(false);
      });
      const snap = () => { const a = active; active = undefined; select(a); };
      addEventListener('resize', snap);
      document.fonts.ready.then(snap);
      pill.style.opacity = 0;
      // Arriving from another page with a section in the address (e.g. #faq)
      const fromHash = items.find((i) => i.getAttribute('href') === location.hash);
      if (fromHash) addEventListener('load', () => setTimeout(() => go(fromHash), 60));
    })();

    // ---- Sign up / log in (a preview: nothing is sent anywhere) ----
    (() => {
      const dialog = document.getElementById('authDialog');
      const form = document.getElementById('authForm');
      const body = form.querySelector('.auth-body');
      const done = document.getElementById('authDone');
      const title = document.getElementById('authTitle');
      const sub = document.getElementById('authSub');
      const scanNote = document.getElementById('authScan');
      const skip = document.getElementById('authSkip');
      const error = document.getElementById('authError');
      const submit = document.getElementById('authSubmit');
      let captchaWidget = null, captchaToken = '', captchaLoading = null;
      const captchaStatus = document.getElementById('captchaStatus');
      async function prepareCaptcha() {
        if (captchaWidget !== null) return;
        if (captchaLoading) return captchaLoading;
        captchaLoading = (async () => {
          captchaStatus.textContent = 'Loading security check…';
          try {
            // Google reCAPTCHA's "I'm not a robot" box. The public site key comes from the server.
            const { captcha } = await momentoApi('/api/config');
            if (!captcha?.siteKey) throw new Error('Sign-up is temporarily unavailable. Please try again later.');
            if (!window.grecaptcha?.render) await new Promise((resolve, reject) => {
              const script = document.createElement('script');
              const fail = () => { clearTimeout(timer); script.remove(); reject(new Error('Security check could not load. Reopen sign-up to retry.')); };
              const timer = setTimeout(fail, 15000);
              window.__momentoRecaptchaReady = () => { clearTimeout(timer); resolve(); };
              script.src = 'https://www.google.com/recaptcha/api.js?render=explicit&onload=__momentoRecaptchaReady';
              script.async = true;
              script.onerror = fail;
              document.head.append(script);
            });
            // Its picture puzzle opens at the end of the page, which this (modal) window would cover:
            // move it into the window as soon as it appears
            const adopt = new MutationObserver(() => {
              const frame = document.querySelector('body > div iframe[src*="/recaptcha/"][src*="bframe"]');
              if (!frame) return;
              let box = frame;
              while (box.parentElement && box.parentElement !== document.body) box = box.parentElement;
              if (box.parentElement === document.body) { box.classList.add('rc-puzzle'); dialog.append(box); adopt.disconnect(); }
            });
            adopt.observe(document.body, { childList: true, subtree: true });
            captchaWidget = window.grecaptcha.render('signupCaptcha', {
              sitekey: captcha.siteKey,
              theme: Momento.theme?.resolved === 'dark' ? 'dark' : 'light',
              callback: (token) => { captchaToken = token; captchaStatus.textContent = ''; },
              'expired-callback': () => { captchaToken = ''; captchaStatus.textContent = 'Security check expired. Please tick the box again.'; },
              'error-callback': () => { captchaToken = ''; captchaStatus.textContent = 'Security check failed. Please retry or reload the page.'; },
            });
            captchaStatus.textContent = '';
          } catch (err) { captchaStatus.textContent = err.message; }
        })();
        await captchaLoading;
        captchaLoading = null;
      }
      const tabs = [...form.querySelectorAll('[role="tab"]')];
      let onDone = null, fromScan = false;
      // Where to go after logging in: back to the page that sent them here (an invite link), or My albums

      const field = (n) => form.querySelector(`[name="${n}"]`);
      // Sent with sign-up so the server keeps a consent record: what was agreed to, and which version
      const TERMS_VERSION = '2026-11-07';   // the Privacy Policy's "Last updated" date (privacy.html)
      const consent = () => ({ acceptTerms: field('acceptTerms').checked, termsVersion: TERMS_VERSION });
      const setLabel = (btn, text) => btn.querySelectorAll('.roll > span').forEach((s) => { s.textContent = text; });
      // Busy: a turning ring and what's happening ("Logging in…"); null puts the normal label back
      function setBusy(text, idleText) {
        submit.classList.toggle('is-busy', !!text);
        submit.setAttribute('aria-busy', String(!!text));
        if (!text) { setLabel(submit, idleText); return; }
        submit.querySelectorAll('.roll > span').forEach((s) => { s.innerHTML = '<i class="btn-spin" aria-hidden="true"></i>'; s.append(text); });
      }
      // After logging in, go back to the album link that sent you here (albums.html only), or to your albums
      const nextPage = () => {
        const next = new URLSearchParams(location.search).get('next') || '';
        return /^(?:albums|events)\.html([?#]|$)/.test(next) ? next : 'albums.html';
      };
      // Sent here by an invite link (events.html?join=…): the dialog says so
      const fromInvite = /[?&]join=/.test(nextPage());
      // The album code in that invite link: sent with sign-up, so confirming the email joins the album
      const inviteCode = () => new URLSearchParams(nextPage().split('?')[1] || '').get('join') || undefined;
      // Coming back to this page (Back button) shouldn't leave the button stuck on "Opening your albums…"
      addEventListener('pageshow', (e) => { if (e.persisted && submit.classList.contains('is-busy')) { submit.disabled = false; setBusy(null, form.dataset.mode === 'signup' ? 'Create account' : 'Log in'); } });
      function setMode(mode) {
        form.dataset.mode = mode;
        if (mode === 'signup') void prepareCaptcha();
        tabs.forEach((t) => t.setAttribute('aria-selected', t.dataset.mode === mode));
        field('password').autocomplete =mode === 'signup' ? 'new-password' : 'current-password';
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

      window.openAuth = async (opts = {}) => {
        try { await Momento.sessionReady; } catch {} 
        onDone = opts.onDone || null;
        fromScan = !!opts.fromScan;
        if (window.Momento.account.get()) {
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
      function finish() {
        const cb = onDone; onDone = null;
        if (cb) cb();
      }
      dialog.addEventListener('close', () => {
        if (useCursor) document.documentElement.classList.add('has-cursor');
        finish();
      });
      // Closing by hand fades the card out first (success and redirects still close straight away)
      let closingAuth = false;
      async function dismissAuth() {
        if (closingAuth || !dialog.open) return;
        closingAuth = true;
        let anim = null;
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
          anim = form.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px) scale(.96)' }],
            { duration: 200, easing: 'cubic-bezier(.5, 0, .75, 0)', fill: 'forwards' });
          try { await anim.finished; } catch (e) {}
        }
        dialog.close();
        if (anim) anim.cancel();
        closingAuth = false;
      }
      dialog.addEventListener('cancel', (e) => { e.preventDefault(); dismissAuth(); });
      form.querySelector('[data-close]').addEventListener('click', dismissAuth);
      skip.addEventListener('click', dismissAuth);
      dialog.addEventListener('pointerdown', (e) => { dialog._downOutside = e.target === dialog; }); dialog.addEventListener('click', (e) => { if (e.target === dialog && dialog._downOutside) dismissAuth(); });   // click outside the card
      tabs.forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));
      form.querySelector('.auth-forgot').addEventListener('click', async (e) => {
        e.preventDefault();
        const email = field('email').value.trim();
        if (!email) { error.textContent = 'Enter your email first.'; return; }
        try { await momentoApi('/api/auth/password/forgot', momentoJson('POST', { email })); error.textContent = 'If this account exists, a password reset link has been sent.'; }
        catch (err) { error.textContent = err.message; }
      });

      // Google, on both Sign up and Log in. Google's popup hands back a one-time code, which the
      // server swaps for the account (POST /api/auth/google): a new account, or the existing one
      // with that email.
      const googleBtn = form.querySelector('.auth-alt[data-provider="Google"]');
      const deviceStep = document.getElementById('deviceStep');
      const deviceHelp = document.getElementById('deviceHelp');
      const deviceAction = document.getElementById('deviceAction');
      const deviceCode = document.getElementById('deviceCode');
      const codeField = document.getElementById('deviceCodeField');
      const resend = document.getElementById('deviceResend');
      const choices = document.getElementById('deviceChoices');
      const deviceError = document.getElementById('deviceError');
      let challenge, ticket;
      function loginError(err) {
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
      dialog.addEventListener('close', () => {
        challenge = ticket = null;
        deviceStep.hidden = true;
        dialog.setAttribute('aria-labelledby', 'authTitle');
      });
      async function deviceRequest(step) {
        const current = challenge;
        const selected = choices.querySelector('input:checked');
        if (step === 'replace' && !selected) { deviceError.textContent = 'Choose a device first.'; return; }
        deviceAction.disabled = resend.disabled = true;
        deviceError.textContent = '';
        try {
          const result = await momentoApi('/api/auth/devices/' + step, momentoJson('POST', {
            challenge, code: deviceCode.value.trim(), ticket, deviceId: selected?.value,
          }));
          if (current !== challenge) return;
          if (step === 'code') {
            deviceHelp.textContent = 'Enter the six-digit code sent to your account email.';
            deviceAction.textContent = 'Verify code';
            codeField.hidden = resend.hidden = false;
            deviceCode.value = '';
            deviceCode.focus();
          } else if (step === 'verify') {
            ticket = result.ticket;
            codeField.hidden = resend.hidden = true;
            deviceHelp.textContent = result.devices.length ? 'Choose a device to log out so you can sign in here.' : 'A slot has opened. Close this window and log in again.';
            deviceAction.textContent = 'Log out selected device and sign in';
            for (const device of result.devices) {
              const label = document.createElement('label');
              label.className = 'device-choice';   // a glass choice card (assets/glass.css)
              const radio = document.createElement('input');
              radio.type = 'radio'; radio.name = 'replaceDevice'; radio.value = device.id;
              const when = device.loggedInAt ? 'Last login: ' + new Date(device.loggedInAt).toLocaleString()
                : 'Login time unavailable · Expires ' + new Date(device.expiresAt).toLocaleString();
              label.append(radio, ' ' + device.name + ' · ' + when);
              choices.append(label);
            }
            choices.querySelector('input')?.focus();
          } else {
            Momento.account.set(result.user);
            location.href = nextPage();
          }
        } catch (err) { if (current === challenge) deviceError.textContent = err.message; }
        finally { if (current === challenge) { deviceAction.disabled = !!ticket && !choices.childElementCount; resend.disabled = false; } }
      }
      deviceAction.addEventListener('click', () => deviceRequest(ticket ? 'replace' : codeField.hidden ? 'code' : 'verify'));
      resend.addEventListener('click', () => deviceRequest('code'));
      let googleId = null, gsiP = null;
      const loadGsi = () => (gsiP ||= new Promise((resolve, reject) => {
        if (window.google?.accounts?.oauth2) return resolve();
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { gsiP = null; reject(new Error('Google sign-in couldn’t load. Check your connection and try again.')); };
        document.head.append(s);
      }));
      // Loaded ahead of the click, so the popup opens straight from it (browsers block late popups)
      momentoApi('/api/config').then((c) => { googleId = c.googleClientId || null; if (googleId) loadGsi().catch(() => {}); }).catch(() => {});
      googleBtn.addEventListener('click', async () => {
        error.textContent = '';
        // A new Google account is a sign-up too, so it needs the same agreement
        if (form.dataset.mode === 'signup' && !field('acceptTerms').checked) { error.textContent = 'Confirm you’re 13 or older and agree to the Terms and Privacy Policy to create an account.'; field('acceptTerms').focus(); return; }
        if (!googleId) { error.textContent = 'Google sign-in isn’t switched on yet. Use your email for now.'; return; }
        try { await loadGsi(); } catch (err) { error.textContent = err.message; return; }
        const idle = () => (form.dataset.mode === 'signup' ? 'Create account' : 'Log in');
        window.google.accounts.oauth2.initCodeClient({
          client_id: googleId,
          scope: 'openid email profile',
          ux_mode: 'popup',
          callback: async (resp) => {
            if (resp.error || !resp.code) { error.textContent = 'Google sign-in was cancelled.'; return; }
            googleBtn.disabled = submit.disabled = true;
            setBusy('Signing in with Google…');
            try {
              const newAccount = form.dataset.mode === 'signup';
              const { user } = await momentoApi('/api/auth/google', momentoJson('POST', { code: resp.code, ...(newAccount ? consent() : {}) }));
              Momento.account.set(user);
              // A new account picks its language before going in
              if (newAccount) await Momento.chooseLanguage?.();
              setBusy('Opening your albums…');
              location.href = nextPage();
            } catch (err) {
              googleBtn.disabled = submit.disabled = false;
              setBusy(null, idle());
              // A new Google account, started from Log in: Momento needs the Terms agreed first, which is on Sign up
              if (err.code === 'terms-required') {
                setMode('signup');
                error.textContent = 'This Google account is new to Momento. Agree to the Terms and Privacy Policy, then press Continue with Google again.';
                field('acceptTerms')?.focus();
                return;
              }
              loginError(err);
            }
          },
          error_callback: (e) => { if (e?.type !== 'popup_closed') error.textContent = 'Google’s window didn’t open. Allow pop-ups for this site and try again.'; },
        }).requestCode();
      });
      form.addEventListener('submit', async (e) => {
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
          const { user } = await momentoApi('/api/auth/' + (signup ? 'signup' : 'login'), momentoJson('POST', { name, email, password: pass, ...(signup ? { captchaToken, joinCode: inviteCode(), ...consent() } : {}) }));
          field('password').value = '';
          Momento.account.set(user);
          // A new account picks its language before going in
          if (signup) await Momento.chooseLanguage?.();
          // Stays busy until the next page has loaded, so it never looks like nothing happened
          leaving = true;
          setBusy('Opening your albums…');
          location.href = nextPage();
        } catch (err) { loginError(err); }
        finally {
          if (!leaving) { submit.disabled = false; setBusy(null, idle); }
          if (signup && captchaWidget !== null) { captchaToken = ''; window.grecaptcha.reset(captchaWidget); }
        }
      });
      document.querySelectorAll('[data-auth]').forEach((b) => b.addEventListener('click', () => window.openAuth({ mode: b.dataset.auth })));
      // From an invite link most people are new, so it opens on Sign up (Log in is one tap away)
      document.addEventListener('DOMContentLoaded', () => { if (new URLSearchParams(location.search).has('login')) window.openAuth({ mode: fromInvite || new URLSearchParams(location.search).has('signup') ? 'signup' : 'login' }); });
      // ---- Links from emails: password reset, approving an email change, and how a link went ----
      // Tokens are taken out of the address bar straight away (the referrer meta also keeps them
      // from ever reaching another site)
      const linkParams = new URLSearchParams(location.search);
      const resetToken = linkParams.get('reset'), approveToken = linkParams.get('email-approve');
      const emailResult = linkParams.get('email'), verified = linkParams.get('verified');
      if (resetToken || approveToken || emailResult || verified) {
        ['reset', 'email-approve', 'email', 'verified'].forEach((k) => linkParams.delete(k));
        history.replaceState(null, '', location.pathname + (linkParams.size ? '?' + linkParams : '') + location.hash);
      }
      const ICON_X = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      // A small slab of the popup glass, the same as the QR code's
      function emailSlab(titleId) {
        const d = document.createElement('dialog');
        d.className = 'acct-dialog mq-pop';
        d.setAttribute('aria-labelledby', titleId);
        d.innerHTML = `<div class="acct-card mq-slab email-slab"><button class="acct-x" type="button" aria-label="Close" data-close>${ICON_X}</button><div class="email-slab-in"></div></div>`;
        document.body.append(d);
        const card = d.querySelector('.email-slab'), inner = d.querySelector('.email-slab-in');
        const close = () => { if (d.open) d.close(); };
        d.addEventListener('close', () => d.remove());
        d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) close(); });
        // Each step swaps the slab's contents; the card settles in again so the change is seen
        const view = (html) => {
          inner.innerHTML = html;
          if (!matchMedia('(prefers-reduced-motion: reduce)').matches) inner.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.16, 1, .3, 1)' });
          inner.querySelector('[autofocus]')?.focus();
        };
        const open = () => {
          d.showModal();
          if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
            card.animate([{ opacity: 0, transform: 'translateY(14px) scale(.95)' }, { opacity: 1, transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.34, 1.25, .64, 1)' });
            try { d.animate({ opacity: [0, 1] }, { duration: 300, pseudoElement: '::backdrop' }); } catch (e) {}
          }
        };
        return { d, inner, view, open, close };
      }
      const text = (el, s) => { el.textContent = s; return el; };

      // The reset link from "Forgot your password?" (also how a Google-only account adds a password)
      function openReset(token) {
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
          const f = s.inner.querySelector('form'), say = (msg) => { const st = f.querySelector('.acct-status'); st.textContent = msg; st.classList.toggle('is-error', !!msg); };
          f.addEventListener('submit', async (e) => {
            e.preventDefault();
            const pw = f.pw.value, again = f.again.value;
            if (pw.length < 8) { say('Use at least 8 characters for your password.'); f.pw.focus(); return; }
            if (pw !== again) { say('The two passwords don’t match.'); f.again.focus(); return; }
            const go = f.querySelector('[type="submit"]'); go.disabled = true; go.textContent = 'Setting password…'; say('');
            try {
              const { user } = await momentoApi('/api/auth/password/reset', momentoJson('POST', { token, password: pw }));
              Momento.account.set(user);
              Momento.flash?.('Password set', 'You’re logged in.');
              location.href = 'albums.html';
            } catch (err) {
              go.disabled = false; go.textContent = 'Set password';
              if (err.status === 400 && /expired|used/i.test(err.message)) showExpired(); else say(err.message);
            }
          });
        };
        const showExpired = () => {
          s.view(`
            <h2 id="rsTitle">This link has expired</h2>
            <p class="email-slab-lede">Reset links work for an hour and only once. Ask for a new one and use the newest email.</p>
            <div class="acct-actions"><button class="acct-ghost" type="button" data-close>Close</button><button class="acct-primary" type="button" data-again autofocus>Send a new link</button></div>`);
          s.inner.querySelector('[data-again]').addEventListener('click', async () => {
            s.close();
            await window.openAuth({ mode: 'login' });
            error.textContent = 'Enter your email, then choose “Forgot your password?” for a new link.';
            field('email').focus();
          });
        };
        showForm();
        s.open();
      }

      // The approval link sent to the CURRENT address when someone asks to move the account
      async function openApprove(token) {
        const s = emailSlab('eaTitle');
        const expired = () => s.view(`
          <h2 id="eaTitle">This link has expired</h2>
          <p class="email-slab-lede">It may already have been used. Nothing about your account has changed.</p>
          <div class="acct-actions"><button class="acct-primary" type="button" data-close autofocus>Close</button></div>`);
        s.view('<h2 id="eaTitle">Checking the link…</h2>');
        s.open();
        let info;
        try { info = await momentoApi('/api/auth/email/approve-info?token=' + encodeURIComponent(token)); }
        catch (err) { expired(); return; }
        s.view(`
          <h2 id="eaTitle">Approve your new email?</h2>
          <p class="email-slab-lede">Someone signed in to your account asked to move it from <b data-from></b> to <b data-to></b>.</p>
          <p class="email-slab-note">Not you? Choose Not me: the change stops and every device is logged out.</p>
          <p class="acct-status" role="status"></p>
          <div class="acct-actions"><button class="acct-primary is-danger" type="button" data-no>Not me</button><button class="acct-primary" type="button" data-yes autofocus>Approve</button></div>`);
        text(s.inner.querySelector('[data-from]'), info.email);
        text(s.inner.querySelector('[data-to]'), info.newEmail);
        const say = (msg) => { const st = s.inner.querySelector('.acct-status'); st.textContent = msg; st.classList.toggle('is-error', !!msg); };
        const decide = async (path, b) => {
          s.inner.querySelectorAll('.acct-actions button').forEach((x) => { x.disabled = true; });
          b.textContent = path === 'approve' ? 'Approving…' : 'Stopping…';
          try {
            const { result } = await momentoApi('/api/auth/email/' + path, momentoJson('POST', { token }));
            if (result === 'approved') {
              s.view(`
                <h2 id="eaTitle">One last step</h2>
                <p class="email-slab-lede">We sent a confirm link to <b data-to></b>. Open it there to finish moving your account. Every device will then log in again with the new address.</p>
                <div class="acct-actions"><button class="acct-primary" type="button" data-close autofocus>Done</button></div>`);
              text(s.inner.querySelector('[data-to]'), info.newEmail);
            } else if (result === 'cancelled') {
              Momento.account.clear();
              s.view(`
                <h2 id="eaTitle">Change stopped</h2>
                <p class="email-slab-lede">Your email stays the same and every device has been logged out. Log in again, and change your password if you think someone else had access.</p>
                <div class="acct-actions"><button class="acct-ghost" type="button" data-close>Close</button><button class="acct-primary" type="button" data-login autofocus>Log in</button></div>`);
              s.inner.querySelector('[data-login]').addEventListener('click', () => { s.close(); window.openAuth({ mode: 'login' }); });
            } else if (result === 'taken') {
              s.view(`
                <h2 id="eaTitle">That email is taken</h2>
                <p class="email-slab-lede">Another account started using that address, so nothing was changed.</p>
                <div class="acct-actions"><button class="acct-primary" type="button" data-close autofocus>Close</button></div>`);
            } else expired();
          } catch (err) {
            s.inner.querySelectorAll('.acct-actions button').forEach((x) => { x.disabled = false; });
            b.textContent = path === 'approve' ? 'Approve' : 'Not me';
            say(err.message);
          }
        };
        s.inner.querySelector('[data-yes]').addEventListener('click', (e) => decide('approve', e.currentTarget));
        s.inner.querySelector('[data-no]').addEventListener('click', (e) => decide('cancel', e.currentTarget));
      }

      document.addEventListener('DOMContentLoaded', () => {
        if (resetToken) openReset(resetToken);
        else if (approveToken) openApprove(approveToken);
        // The confirm link from the new address lands here (the move logged every device out, so ?login opens Log in)
        if (emailResult === 'changed') Momento.toast('Email changed', 'Log in with your new address.');
        if (emailResult === 'taken') Momento.toast('Email not changed', 'Another account already uses that address.');
        if (emailResult === 'invalid') Momento.toast('That link has expired', 'Start the change again from Settings.');
        if (verified === 'session_limit') Momento.toast('Your email is verified', 'Log in to choose a device to log out.');
        if (verified === 'invalid') Momento.toast('This verification link has expired', 'It may already have been used. Sign in to check your account or request a new link.');
      });
    })();

    // ---- Sections: rise-in, steps, zone slider, switches, FAQ, counters ----
    (() => {
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      }, { threshold: .12 });
      document.querySelectorAll('.rise-in').forEach((el) => io.observe(el));


      const qas = [...document.querySelectorAll('.qa')];
      for (const qa of qas) qa.querySelector('button').addEventListener('click', () => {
        const opening = !qa.classList.contains('is-open');
        for (const other of qas) {
          other.classList.toggle('is-open', other === qa && opening);
          other.querySelector('button').setAttribute('aria-expanded', other === qa && opening);
        }
      });

      // Full quality: the range sets --x (and the divider's position); on first view a gentle sweep shows it can be dragged
      const qc = document.getElementById('qc');
      const qcRange = document.getElementById('qcRange');
      const setQc = (v) => { qc.style.setProperty('--x', v + '%'); qc.style.setProperty('--qx', (qc.clientWidth * v / 100) + 'px'); };
      let qcTouched = false;
      qcRange.addEventListener('input', () => { qcTouched = true; setQc(+qcRange.value); });
      addEventListener('resize', () => setQc(+qcRange.value));
      setQc(50);
      new IntersectionObserver((entries, obs) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        obs.disconnect();
        if (still) return;
        const start = performance.now() + 400, stops = [50, 30, 70, 50];
        const tick = (now) => {
          if (qcTouched) return;
          const p = Math.min(Math.max((now - start) / 2400, 0), 1), seg = Math.min(Math.floor(p * 3), 2), t = ease(p * 3 - seg);
          const v = lerp(stops[seg], stops[seg + 1], t);
          qcRange.value = v; setQc(v);
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, { threshold: .5 }).observe(qc);

      // How it works: autoplay lights the five cards up one after another (CSS runs the timer bar, this only
      // listens for its end). Hovering or focusing the row holds it, and once the visitor clicks a card or uses
      // the arrow keys it stops and they're in charge. Nothing here listens to the wheel, touch or swipe,
      // so the page always scrolls normally.
      const hiw = document.querySelector('.hiw');
      const row = hiw.querySelector('.hiw-steps');
      const cards = [...hiw.querySelectorAll('.hiw-card')];
      let current = -1;
      function setStep(i) {
        if (i === current) return;
        current = i;
        cards.forEach((c, k) => {
          c.classList.toggle('is-on', k === i); c.classList.toggle('is-done', k < i);
          const b = c.querySelector('button');
          if (k === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
        });
      }
      window.updateSteps = () => {};
      setStep(0);

      const reducedHiw = matchMedia('(prefers-reduced-motion: reduce)');
      let auto = !reducedHiw.matches;
      hiw.classList.toggle('is-auto', auto);
      const stopAuto = () => { if (auto) { auto = false; hiw.classList.remove('is-auto'); } };
      hiw.addEventListener('animationend', (e) => {
        if (e.animationName !== 'step-time' || !auto) return;
        setStep((current + 1) % cards.length);
      });
      // Held (timer paused) while the row is off screen, hovered or has focus
      let seen = false, over = false, focused = false;
      const syncHeld = () => hiw.classList.toggle('is-held', !seen || over || focused);
      syncHeld();
      new IntersectionObserver(([en]) => { seen = en.isIntersecting; syncHeld(); }, { threshold: .2 }).observe(row);
      if (matchMedia('(hover: hover)').matches) {
        row.addEventListener('pointerenter', () => { over = true; syncHeld(); });
        row.addEventListener('pointerleave', () => { over = false; syncHeld(); });
      }
      row.addEventListener('focusin', () => { focused = true; syncHeld(); });
      row.addEventListener('focusout', () => { focused = false; syncHeld(); });

      const go = (i) => { stopAuto(); setStep(Math.max(0, Math.min(cards.length - 1, i))); };
      row.addEventListener('click', (e) => {
        const b = e.target.closest('.hiw-btn');
        if (b) go(Number(b.dataset.i));
      });
      // Left and right arrows move between the cards (up and down are left alone, so the page still scrolls)
      row.addEventListener('keydown', (e) => {
        const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (d === undefined || !e.target.closest('.hiw-btn')) return;
        e.preventDefault();
        go(current + d);
        cards[current].querySelector('button').focus({ preventScroll: true });
      });

      // Features: the sharing-zone slider. 25 m at the left end to 1 km at the right.
      const map = document.getElementById('zoneMap');
      const range = document.getElementById('zoneR');
      const out = document.getElementById('zoneOut');
      const countIn = document.getElementById('zoneIn');
      const metres = (v) => Math.round((25 * Math.pow(40, v / 100)) / 5) * 5;
      const label = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);
      const radius = (v) => .12 + (v / 100) * .72;
      const GUESTS = [
        { v: 10, a: 40, p: 2 }, { v: 22, a: 200, p: 12 }, { v: 31, a: 120, p: 13 }, { v: 38, a: 300, p: 7 },
        { v: 52, a: 15, p: 4 }, { v: 63, a: 160, p: 1 }, { v: 74, a: 250, p: 9 }, { v: 86, a: 95, p: 5 }, { v: 96, a: 330, p: 11 },
      ];
      document.getElementById('zoneAll').textContent = GUESTS.length;
      const guests = GUESTS.map((g) => {
        const d = document.createElement('span');
        d.className = 'guest';
        d.style.backgroundImage = `url(${photo(g.p, 80)})`;
        d.innerHTML = '<small></small>';
        map.querySelector('.zone-guests').append(d);
        return { ...g, el: d, tag: d.firstChild };
      });
      function update() {
        const v = Number(range.value);
        // On a small map the outer guests' "… out" tags would run off its edge, so everything is
        // drawn a little closer to the middle there (the zone and the guests together)
        const half = map.clientWidth / 2 * (map.clientWidth < 380 ? .84 : 1);
        map.style.setProperty('--r', `${radius(v) * half}px`);
        range.style.setProperty('--fill', `${v}%`);
        out.textContent = label(metres(v));
        let count = 0;
        for (const g of guests) {
          const r = radius(g.v) * half, a = (g.a * Math.PI) / 180;
          g.el.style.setProperty('--gx', `${Math.cos(a) * r}px`);
          g.el.style.setProperty('--gy', `${Math.sin(a) * r}px`);
          const inside = g.v <= v;
          g.el.classList.toggle('is-in', inside);
          if (inside) count++; else g.tag.textContent = `${label(metres(g.v) - metres(v))} out`;
        }
        countIn.textContent = count;
      }
      range.addEventListener('input', update);
      addEventListener('resize', update);
      update();
    })();

    // ---- Growing lines: the rules under titles draw themselves as they scroll into view ----
    (() => {
      const grows = [...document.querySelectorAll('.grow, .divider-line')];
      // Read phase, then write phase: the loop measures every element before changing any
      const tops = [];
      window.measureLines = () => { grows.forEach((g, i) => { tops[i] = g.getBoundingClientRect().top; }); };
      window.updateLines = () => {
        grows.forEach((g, i) => {
          // Only when it changes: most of the time a line is fully grown (or not started) and stays put
          const t = `scaleX(${easeOut(clamp01((innerHeight * .95 - tops[i]) / (innerHeight * .5))).toFixed(3)})`;
          if (g._t !== t) { g._t = t; g.style.transform = t; }
        });
      };
    })();

    // ---- Depth on scroll: pictures lean back as they rise, stand up mid-screen, and stretch
    // and bend with the speed of the scroll, while the photo inside drifts and zooms ----
    (() => {
      const targets = [...document.querySelectorAll('.qc, .zone-map')];
      const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
      let y = scrollY, v = 0, lastKey = '', pending = null;
      // Read phase: every rect is measured before anything is written this frame
      window.measureWarp = (dt) => {
        pending = null;
        if (still || LOW_POWER || !dt) return;
        v = lerp(v, (scrollY - y) / dt, 1 - Math.exp(-dt * 10));
        y = scrollY;
        const s = clamp(v / 2000, -1, 1);
        const key = `${scrollY}|${s.toFixed(3)}`;
        if (key === lastKey) return;   // nothing has moved since the last frame
        lastKey = key;
        const place = (el) => {
          const r = el.getBoundingClientRect();
          return r.bottom < -100 || r.top > innerHeight + 100 ? null : clamp((r.top + r.height / 2) / innerHeight * 2 - 1, -1, 1);
        };
        pending = { s, t: targets.map(place) };
      };
      // Write phase
      window.updateWarp = () => {
        if (!pending) return;
        const { s, t } = pending, a = Math.abs(s);
        pending = null;
        targets.forEach((el, k) => {
          if (t[k] === null) return;
          el.style.transform = `perspective(1200px) rotateX(${(t[k] * 7 + s * 12).toFixed(2)}deg) skewY(${(s * 2.5).toFixed(2)}deg) scale(${(1 - a * .04).toFixed(4)}, ${(1 + a * .06).toFixed(4)})`;
        });
      };
    })();

    // ---- Pause looping animations that are off screen ----
    (() => {
      const idle = new IntersectionObserver((entries) => {
        for (const e of entries) e.target.classList.toggle('is-idle', !e.isIntersecting);
      }, { rootMargin: '120px 0px' });
      document.querySelectorAll('.qr-card, .zone-map, .hiw-art').forEach((el) => idle.observe(el));
    })();

    // ---- One loop for the background, cursor, album and scroll effects ----
    (() => {
      let last = performance.now(), lastScroll = -1, lastW = 0;
      function frame(now) {
        const dt = Math.min(Math.max((now - last) / 1000, 0), .1);
        last = now;
        if (!document.hidden) {
          // Reads first (one layout), then every write, so nothing forces a second layout mid-frame
          const sy = scrollY;   // read once, before anything is written this frame
          const scrolled = sy !== lastScroll || vw !== lastW;
          if (scrolled) window.measureLines();
          window.measureWarp(dt);
          if (scrolled) { window.updateNav(); window.updateSteps(); }
          renderFluid(dt);
          if (useCursor) {
            // The bead trails the pointer just slightly; the gap becomes a stretch along the
            // direction of travel, so it reads like a droplet, and it rounds off when still
            rx = lerp(rx, pointer.x, .35); ry = lerp(ry, pointer.y, .35);
            if (Math.abs(pointer.x - rx) < .05 && Math.abs(pointer.y - ry) < .05) { rx = pointer.x; ry = pointer.y; }
            const lx = pointer.x - rx, ly = pointer.y - ry;
            const lens = document.documentElement.classList.contains('cursor-hover') || document.documentElement.classList.contains('cursor-drag');
            // The focus frame stays square and upright, so it doesn't stretch
            const s = lens ? 0 : Math.min(Math.hypot(lx, ly) / 50, .55);
            const tf = `translate3d(${rx}px, ${ry}px, 0) rotate(${lens ? 0 : Math.atan2(ly, lx)}rad) scale(${1 + s}, ${1 - s * .45})`;
            if (tf !== cursorEl._tf) cursorEl.style.transform = cursorEl._tf = tf;
          }
          if (scrolled) window.stringScrolled?.(sy);
          window.updateAlbum(dt, now, sy);
          if (scrolled) { lastScroll = sy; lastW = vw; window.updateLines(); }
          window.updateWarp();
          window.stringTick?.();
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    })();
