  // Shared by index.html and albums.html: theme, account, account menu.
  (() => {
    const root = document.documentElement;
    const KEY = 'momento-theme';
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const TH = window.__theme || (window.__theme = { target: 0, a: 0, b: 0 });
    const themeListeners = new Set();
    const read = () => { try { return localStorage.getItem(KEY) || 'system'; } catch (e) { return 'system'; } };
    const resolve = (p) => (p === 'dark' || (p === 'system' && mq.matches) ? 'dark' : 'light');
    let pref = read();
  
    // Applies a preference. The page cross-fades where View Transitions exist; the silk shader
    // eases on its own from the new target
    function apply(p, animate) {
      pref = p;
      const next = resolve(p);
      const flip = () => { root.dataset.theme = next; root.dataset.themePref = p; TH.target = next === 'dark' ? 1 : 0; };
      if (root.dataset.theme === next) root.dataset.themePref = p;
      else if (animate && document.startViewTransition && !reduced.matches && document.readyState === "complete" && !document.hidden) {
        root.classList.add('theming');   // so the page-to-page motion doesn't also play on a theme switch
        const done = () => root.classList.remove('theming');
        // An aborted transition (page still revealing, tab hidden) rejects ready: the theme still flips, so it is ignored
        const vt = document.startViewTransition(flip);
        vt.ready.catch(() => {});
        vt.updateCallbackDone.catch(() => {});
        vt.finished.then(done, done);
      } else flip();
      themeListeners.forEach((fn) => fn(p, next));
    }
    mq.addEventListener('change', () => { if (pref === 'system') apply('system', true); });
    addEventListener('storage', (e) => { if (e.key === KEY) apply(read(), true); });
  
    const Momento = (window.Momento = window.Momento || {});
    Momento.theme = {
      get pref() { return pref; },
      get resolved() { return resolve(pref); },
      set(p) {
        try { localStorage.setItem(KEY, p); } catch (e) {}
        apply(p, true);
      },
      onChange(fn) { themeListeners.add(fn); },
    };
  
    // ---- Account: kept for the tab (sessionStorage), shared by every page ----
    const AKEY = 'momento-account';
    const NOTIFY = { photos: true, closing: true, recap: false };
    const accountListeners = new Set();
    const norm = (a) => a && { name: '', email: '', ...a, notify: { ...NOTIFY, ...(a.notify || {}) } };
    let current = null;
    const persist = () => {
      try {
        if (current) sessionStorage.setItem(AKEY, JSON.stringify(current));
        else { sessionStorage.removeItem(AKEY); sessionStorage.removeItem('momento-user'); }
      } catch (e) {}
    };
    const emit = () => accountListeners.forEach((fn) => fn(current));
    Momento.account = {
      get() { return current; },
      set(patch) {
        current = norm({ ...(current || {}), ...patch, notify: { ...(current && current.notify), ...patch.notify } });
        persist(); emit();
        return current;
      },
      clear() { current = null; persist(); emit(); },
      onChange(fn) { accountListeners.add(fn); },
    };
  
    Momento.sessionReady = momentoApi('/api/auth/me').then(({ user }) => {
      if (user) Momento.account.set(user); else Momento.account.clear();
      return user;
    });
    Momento.sessionReady.catch(() => {});

    // ---- Account chip, menu and dialogs ----
    const svg = (inner, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
    const ICON = {
      chev: svg('<path d="m6 9 6 6 6-6"/>', 14),
      close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
      settings: svg('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'),
      help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2.1-2.4 3.8M12 17h.01"/>'),
      logout: svg('<path d="M9 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3M15 8l4 4-4 4M19 12H9"/>'),
      sun: svg('<circle cx="12" cy="12" r="3.6"/><g class="rays"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></g>', 16),
      moon: svg('<path class="moon" d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>', 16),
      system: svg('<rect x="3" y="4.5" width="18" height="12" rx="2.2"/><path d="M8.5 20h7M12 16.5V20"/><circle class="scr-dot" cx="12" cy="10.5" r="1.8" fill="currentColor" stroke="none"/>', 16),
    };
    const first = (n) => (n || '').trim().split(/\s+/)[0] || '';
    const SUPPORT = 'support@hexarch.org';   // placeholder address
  
    // The custom cursor can't draw above a modal, so the normal cursor comes back while one is open
    let cursorWas = false;
    // The card grows out of the account chip when it opens and shrinks back into it when it closes:
    // the chip's box and the card's box, as a move and a (non-uniform) scale
    const morph = (from, card) => {
      const f = from.getBoundingClientRect(), c = card.getBoundingClientRect();
      if (!f.width || !c.width) return null;
      const dx = f.left + f.width / 2 - (c.left + c.width / 2), dy = f.top + f.height / 2 - (c.top + c.height / 2);
      return `translate(${dx}px, ${dy}px) scale(${Math.max(.08, f.width / c.width)}, ${Math.max(.05, f.height / c.height)})`;
    };
    const phoneStill = () => matchMedia('(max-width: 600px)').matches;
    function dialog(id, html, getReturn) {
      const d = document.createElement('dialog');
      d.className = 'acct-dialog'; d.id = id; d.setAttribute('aria-labelledby', `${id}Title`);
      d.innerHTML = html;
      document.body.append(d);
      const card = () => d.querySelector('.acct-card');
      let closing = false;
      d.dismiss = async () => {
        if (closing || !d.open) return;
        closing = true;
        const c = card(), from = getReturn(), shape = from && c && morph(from, c);
        if (!reduced.matches && !phoneStill() && c) {   // phones: it simply goes
          const out = shape ? [{ transform: 'none', opacity: 1 }, { transform: shape, opacity: 0 }] : [{ opacity: 1 }, { opacity: 0 }];
          try { await c.animate(out, { duration: shape ? 340 : 200, easing: 'cubic-bezier(.5, 0, .75, 0)', fill: 'forwards' }).finished; } catch (e) {}
        }
        d.close();
        if (c) c.getAnimations().forEach((a) => a.cancel());
        closing = false;
      };
      d.addEventListener('pointerdown', (e) => { d._downOutside = e.target === d; }); d.addEventListener('click', (e) => { if (e.target === d && d._downOutside) d.dismiss(); });
      d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.dismiss()));
      d.addEventListener('cancel', (e) => { e.preventDefault(); d.dismiss(); });
      d.addEventListener('close', () => {
        if (cursorWas && !document.querySelector('dialog[open]')) root.classList.add('has-cursor');
        const back = getReturn(); if (back) back.focus();
      });
      d.launch = () => {
        if (!document.querySelector('dialog[open]')) cursorWas = root.classList.contains('has-cursor');
        root.classList.remove('has-cursor', 'cursor-hover', 'cursor-drag');
        d.showModal();
        // Opening focuses the first control; on a short phone that could leave the window scrolled past its
        // title. It always starts at the top, title and close button in view
        const top = () => { d.scrollTop = 0; const c0 = card(); if (c0) c0.scrollTop = 0; };
        top(); requestAnimationFrame(top);
        if (reduced.matches || phoneStill()) return;   // phones: the window is simply there, no morph and no rows rising in
        const c = card(), from = getReturn(), shape = from && morph(from, c);
        c.animate(shape
          ? [{ transform: shape, opacity: 0 }, { opacity: 1, offset: .22 }, { transform: 'none', opacity: 1 }]
          : [{ opacity: 0, transform: 'translateY(12px) scale(.96)' }, { opacity: 1, transform: 'none' }],
        { duration: shape ? 620 : 380, easing: 'cubic-bezier(.34, 1.25, .64, 1)' });
        // Its rows rise in one after another once the card has opened out
        [...c.children].filter((el) => !el.matches('.acct-x')).forEach((el, i) => el.animate(
          [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
          { duration: 460, delay: 200 + i * 45, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'backwards' }));
        try { d.animate({ opacity: [0, 1] }, { duration: 300, pseudoElement: '::backdrop' }); } catch (e) {}
      };
      return d;
    }
  
    function settingsDialog(getReturn) {
      const d = dialog('acctSettings', `
        <form class="acct-card" novalidate>
          <button class="acct-x" type="button" aria-label="Close" data-close>${ICON.close}</button>
          <h2 id="acctSettingsTitle">Account settings</h2>
          <p class="acct-sub">Update your photo, name and email notification preferences.</p>
          <div class="acct-photo">
            <span class="acct-photo-av" aria-hidden="true"></span>
            <span class="acct-photo-text"><b>Profile photo</b><small>Shown in groups and albums</small></span>
            <span class="acct-photo-acts"><button class="acct-photo-btn" type="button" data-photo-pick>Add photo</button><button class="acct-photo-btn is-danger" type="button" data-photo-rm hidden>Remove</button></span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*" hidden data-photo-file>
          </div>
          <label class="acct-field"><span>Your name</span><input name="name" autocomplete="name"></label>
          <label class="acct-field"><span>Email</span><input name="email" type="email" autocomplete="email" inputmode="email"></label>
          <div class="acct-group" role="group" aria-label="Email me when">
            <b>Email me when</b>
            <div class="acct-row"><span><b>Someone adds photos</b><small>to an album I’m in</small></span><button class="acct-sw" type="button" role="switch" aria-label="Someone adds photos to an album I’m in" aria-checked="true" data-key="photos"></button></div>
            <div class="acct-row"><span><b>An album is about to close</b><small>so I can download my photos in time</small></span><button class="acct-sw" type="button" role="switch" aria-label="An album is about to close" aria-checked="true" data-key="closing"></button></div>
            <div class="acct-row"><span><b>Weekly recap</b><small>the best new photos from my albums</small></span><button class="acct-sw" type="button" role="switch" aria-label="Weekly recap" aria-checked="false" data-key="recap"></button></div>
          </div>
          <a class="acct-adv" href="settings.html"><span class="acct-adv-ic">${ICON.settings}</span><span><b>Advanced settings</b><small>Password, permissions, notifications and storage</small></span>${ICON.chev}</a>
          <p class="acct-status" role="status"></p>
          <div class="acct-actions"><button class="acct-ghost" type="button" data-close>Cancel</button><button class="acct-primary" type="submit">Save changes</button></div>
        </form>`, getReturn);
      if (/settings\.html$/.test(location.pathname)) d.querySelector('.acct-adv').hidden = true;   // already here
      const form = d.querySelector('form'), status = d.querySelector('.acct-status');
      const switches = [...d.querySelectorAll('.acct-sw')];
      // Profile photo: saved straight away (not with Save changes), like on the Settings page
      const photoAv = d.querySelector('.acct-photo-av'), photoPick = d.querySelector('[data-photo-pick]'), photoRm = d.querySelector('[data-photo-rm]'), photoFile = d.querySelector('[data-photo-file]');
      const showPhoto = (a) => {
        const name = (a && (a.name || a.email)) || 'You';
        photoAv.replaceChildren();
        if (a && a.avatarUrl) {
          const img = document.createElement('img');
          img.src = a.avatarUrl; img.alt = ''; img.referrerPolicy = 'no-referrer';
          img.onerror = () => { img.remove(); photoAv.textContent = name[0].toUpperCase(); };
          photoAv.append(img);
        } else photoAv.textContent = name[0].toUpperCase();
        photoPick.textContent = a && a.avatarUrl ? 'Change' : 'Add photo';
        photoRm.hidden = !(a && a.avatarUrl);
      };
      Momento.account.onChange(showPhoto);
      showPhoto(Momento.account.get());
      photoPick.addEventListener('click', () => photoFile.click());
      photoFile.addEventListener('change', async () => {
        const f = photoFile.files[0];
        photoFile.value = '';
        if (!f) return;
        if (f.size > 10 * 1024 * 1024) { say('Choose a photo under 10 MB.', true); return; }
        // Crop it to a square first (Cancel keeps the current photo)
        const pic = Momento.cropAvatar ? await Momento.cropAvatar(f) : f;
        if (!pic) return;
        const fd = new FormData();
        fd.append('avatar', pic, pic === f ? (f.name || 'photo.jpg') : 'avatar.jpg');
        photoAv.classList.add('is-busy'); photoPick.disabled = photoRm.disabled = true; say('Uploading your photo…');
        try {
          const { user } = await momentoApi('/api/auth/avatar', { method: 'POST', body: fd });
          Momento.account.set(user);
          say('Photo updated. Friends see it in groups and albums.');
        } catch (err) { say(err.message, true); }
        finally { photoAv.classList.remove('is-busy'); photoPick.disabled = photoRm.disabled = false; }
      });
      photoRm.addEventListener('click', async () => {
        photoPick.disabled = photoRm.disabled = true;
        try {
          const { user } = await momentoApi('/api/auth/avatar', { method: 'DELETE' });
          Momento.account.set(user);
          say('Photo removed. Your initials show instead.');
        } catch (err) { say(err.message, true); }
        finally { photoPick.disabled = photoRm.disabled = false; }
      });
      switches.forEach((s) => s.addEventListener('click', () => s.setAttribute('aria-checked', s.getAttribute('aria-checked') !== 'true')));
      const say = (msg, bad) => { status.textContent = msg; status.classList.toggle('is-error', !!bad); };
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = form.name.value.trim(), email = form.email.value.trim();
        if (!name) { say('Enter your name so guests know who added each photo.', true); form.name.focus(); return; }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { say('Enter an email address like name@example.com.', true); form.email.focus(); return; }
        const notify = {};
        switches.forEach((s) => { notify[s.dataset.key] = s.getAttribute('aria-checked') === 'true'; });
        if (email !== current.email) { say('To change your email, use the Settings page (Advanced settings).', true); return; }
        try {
          const { user } = await momentoApi('/api/auth/me', momentoJson('PATCH', { name, notify }));
          Momento.account.set(user);
        } catch (err) { say(err.message, true); return; }
        say('Saved');
        Momento.toast('Account settings saved', email || name);
        setTimeout(() => d.dismiss(), reduced.matches ? 0 : 700);
      });
      const launch = d.launch;
      d.launch = () => {
        const a = current || norm({});
        form.name.value = a.name; form.email.value = a.email;
        switches.forEach((s) => s.setAttribute('aria-checked', a.notify[s.dataset.key]));
        say('');
        launch();
      };
      return d;
    }
  
    function helpDialog(getReturn) {
      const d = dialog('acctHelp', `
        <div class="acct-card acct-help">
          <button class="acct-x" type="button" aria-label="Close" data-close>${ICON.close}</button>
          <h2 id="acctHelpTitle">Help and support</h2>
          <p class="acct-sub">Quick answers. If you’re still stuck, email us.</p>
          <details><summary>How do guests join an album?</summary><p>They point their phone camera at the host’s QR code and the album opens. Signing up lets them add their own photos.</p></details>
          <details><summary>Who can see the photos?</summary><p>Only the people who joined the album. The host decides whether guests can see the gallery while the event is on.</p></details>
          <details><summary>How long does an album stay open?</summary><p>Uploads and downloads stay open for a while after the event, then the album is kept as an archive. Download your photos before it closes.</p></details>
          <div class="acct-links">
            <a href="support.html">Contact us</a>
            <a href="index.html#how-it-works">How it works</a>
            <a href="index.html#faq">FAQ</a>
            <a href="mailto:${SUPPORT}">Email support</a>
          </div>
        </div>`, getReturn);
      if (/support\.html$/.test(location.pathname)) d.querySelector('.acct-links [href="support.html"]').hidden = true;   // already here
      return d;
    }
  
    // One of each dialog per page. Whatever opened it (the chip, a footer link) is where it grows
    // out of and where focus returns
    let returnTo = null, settingsD = null, helpD = null;
    Momento.openSettings = (from) => { returnTo = from; (settingsD ||= settingsDialog(() => returnTo)).launch(); };
    Momento.openHelp = (from) => { returnTo = from; (helpD ||= helpDialog(() => returnTo)).launch(); };

    // ---- Confirmations: every action answers with a toast; anything that removes something asks first
    // and can be undone from the toast. The toast is a popover so it shows above open dialogs too ----
    const MARK = {
      check: svg('<path d="m5 12.5 4.2 4.2L19 7"/>', 15),
      bin: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>', 15),
      bigCheck: svg('<path d="m5 12.5 4.2 4.2L19 7"/>', 26),
      bigBin: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>', 22),
    };
    const canPop = typeof HTMLElement.prototype.showPopover === 'function';
    let toastEl = null, toastTimer = 0, toastLife = 0;
    function hideToast() {
      clearTimeout(toastTimer);
      if (!toastEl) return;
      const gone = () => { toastEl.style.visibility = 'hidden'; if (canPop && toastEl.matches(':popover-open')) toastEl.hidePopover(); };
      if (reduced.matches) return gone();
      toastEl.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(16px)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).finished.then(gone, gone);
    }
    const armToast = (ms) => { clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, ms); };
    // While a window is open everything outside it is inert, so the toast lives inside the topmost open
    // window (and its Undo stays clickable), and is re-shown so it lands on top of it
    function placeToast() {
      const host = [...document.querySelectorAll('dialog[open]')].pop() || document.body;
      if (toastEl.parentElement !== host) host.append(toastEl);
      if (canPop) { if (toastEl.matches(':popover-open')) toastEl.hidePopover(); toastEl.showPopover(); }
    }
    // When that window closes, the toast moves out to whatever is open underneath
    document.addEventListener('close', (e) => {
      if (!toastEl || !e.target.contains(toastEl) || toastEl.style.visibility === 'hidden') return;
      requestAnimationFrame(placeToast);
    }, true);
    Momento.toast = (title, sub = '', opts = {}) => {
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.className = 'm-toast glass';
        toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite');
        if (canPop) toastEl.popover = 'manual';
        toastEl.innerHTML = '<i class="m-toast-ic" aria-hidden="true"></i><span class="m-toast-text"><b></b><small></small></span><button class="m-toast-act" type="button" hidden></button>';
        document.body.append(toastEl);
        // Reading it (or reaching for Undo) holds it on screen
        toastEl.addEventListener('pointerenter', () => clearTimeout(toastTimer));
        toastEl.addEventListener('pointerleave', () => armToast(1800));
        toastEl.addEventListener('focusin', () => clearTimeout(toastTimer));
      }
      const act = toastEl.querySelector('.m-toast-act'), a = opts.action;
      toastEl.querySelector('.m-toast-ic').innerHTML = opts.danger ? MARK.bin : MARK.check;
      toastEl.querySelector('b').textContent = title;
      toastEl.querySelector('small').textContent = sub;
      toastEl.classList.toggle('is-danger', !!opts.danger);
      toastEl.classList.toggle('has-act', !!a);
      act.hidden = !a; act.textContent = a ? a.label : '';
      act.onclick = a ? () => { hideToast(); a.run(); } : null;
      toastEl.getAnimations().forEach((x) => x.cancel());
      toastEl.style.visibility = '';
      placeToast();
      if (!reduced.matches) toastEl.animate([{ opacity: 0, transform: 'translateY(22px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.34, 1.4, .64, 1)' });
      toastLife = a ? 6000 : 3400;
      armToast(toastLife);
    };
    // A toast for the next page, when the action also navigates (logging out, say)
    const FLASH = 'momento-flash';
    Momento.flash = (title, sub = '') => { try { sessionStorage.setItem(FLASH, JSON.stringify([title, sub])); } catch (e) {} };
    try {
      const f = JSON.parse(sessionStorage.getItem(FLASH) || 'null');
      sessionStorage.removeItem(FLASH);
      if (f) {
        const later = () => setTimeout(() => Momento.toast(f[0], f[1]), 450);
        if (root.classList.contains('intro-on')) document.addEventListener('momento:intro-end', later, { once: true });
        else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', later, { once: true });
        else later();
      }
    } catch (e) {}

    // Asks before something is removed. Resolves true only for the confirm button
    let confirmD = null, confirmDone = null;
    Momento.confirm = ({ title, body = '', ok = 'Delete', danger = true, from = null }) => new Promise((resolve) => {
      if (!confirmD) {
        confirmD = dialog('mConfirm', `
          <div class="acct-card">
            <i class="m-warn-ic" aria-hidden="true">${MARK.bigBin}</i>
            <h2 id="mConfirmTitle"></h2>
            <p class="acct-sub"></p>
            <div class="acct-actions"><button class="acct-ghost" type="button" data-close>Cancel</button><button class="acct-primary" type="button" data-ok></button></div>
          </div>`, () => returnTo);
        confirmD.querySelector('[data-ok]').addEventListener('click', () => { const r = confirmDone; confirmDone = null; confirmD.dismiss(); if (r) r(true); });
        confirmD.addEventListener('close', () => { const r = confirmDone; confirmDone = null; if (r) r(false); });
      }
      returnTo = from;
      confirmD.querySelector('h2').textContent = title;
      confirmD.querySelector('.acct-sub').textContent = body;
      confirmD.querySelector('.m-warn-ic').hidden = !danger;
      const okBtn = confirmD.querySelector('[data-ok]');
      okBtn.textContent = ok; okBtn.classList.toggle('is-danger', danger);
      confirmDone = resolve;
      confirmD.launch();
      confirmD.querySelector('.acct-ghost').focus();   // the safe choice has focus
    });

    // Asks for one value (an email address, say). Resolves the value, or null if cancelled
    let askD = null, askDone = null;
    Momento.ask = ({ title, body = '', label, type = 'text', value = '', placeholder = '', ok = 'Continue', check, from = null }) => new Promise((resolve) => {
      if (!askD) {
        askD = dialog('mAsk', `
          <form class="acct-card" novalidate>
            <button class="acct-x" type="button" aria-label="Close" data-close>${ICON.close}</button>
            <h2 id="mAskTitle"></h2>
            <p class="acct-sub"></p>
            <label class="acct-field"><span></span><input name="v" autocomplete="email"></label>
            <p class="acct-status" role="status"></p>
            <div class="acct-actions"><button class="acct-ghost" type="button" data-close>Cancel</button><button class="acct-primary" type="submit"></button></div>
          </form>`, () => returnTo);
        askD.addEventListener('close', () => { const r = askDone; askDone = null; if (r) r(null); });
      }
      returnTo = from;
      const form = askD.querySelector('form'), input = form.v, status = askD.querySelector('.acct-status');
      askD.querySelector('h2').textContent = title;
      askD.querySelector('.acct-sub').textContent = body;
      askD.querySelector('.acct-field span').textContent = label;
      Object.assign(input, { type, value, placeholder });
      askD.querySelector('[type="submit"]').textContent = ok;
      status.textContent = ''; status.classList.remove('is-error');
      form.onsubmit = (e) => {
        e.preventDefault();
        const v = input.value.trim(), problem = check ? check(v) : (v ? '' : `Enter ${label.toLowerCase()}.`);
        if (problem) { status.textContent = problem; status.classList.add('is-error'); input.focus(); return; }
        const r = askDone; askDone = null; askD.dismiss(); r(v);
      };
      askDone = resolve;
      askD.launch();
      input.focus();
    });

    // ---- Albums: create one (ending on a "created" screen with its guest code), and remove one ----
    const isoToday = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
    const onAlbums = /albums\.html$/.test(location.pathname);
    const viewAlbum = (id) => {
      if (onAlbums) document.dispatchEvent(new CustomEvent('momento:open-album', { detail: id }));
      else location.href = `albums.html#album=${encodeURIComponent(id)}`;
    };

    // Removes an album after asking. `a` needs id, name and role; photos/mine make the message exact
    // The link a host sends guests: opening it asks them to log in or sign up first, then offers to join
    Momento.inviteLink = (code) => 'https://api.hexarch.org/s/' + encodeURIComponent(code);
    Momento.shareInvite = async (album, btn, label = 'Share link') => {
      const url = Momento.inviteLink(album.code);
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        try { await navigator.share({ title: album.name, text: `Add your photos to ${album.name} on Momento`, url }); return; }
        catch (err) { if (err.name === 'AbortError') return; }
      }
      try { await navigator.clipboard.writeText(url); btn.textContent = 'Link copied'; } catch (err) { btn.textContent = 'Copy failed'; Momento.toast('Copy this link', url); }
      setTimeout(() => { btn.textContent = label; }, 1800);
    };
    Momento.removeAlbum = async (a, from) => {
      const host = a.role !== 'guest';
      const n = a.photos || 0;
      const ok = await Momento.confirm({
        from,
        title: host ? `Delete “${a.name}”?` : `Leave “${a.name}”?`,
        body: host
          ? (n ? `All ${n.toLocaleString('en-GB')} photos and the guest code go with it, for everyone who joined.` : 'It has no photos yet, so only the album and its guest code are removed.')
          : `It’s taken off your albums. ${a.mine ? `Your ${a.mine} photos stay` : 'Photos stay'} in the album for the host and other guests.`,
        ok: host ? 'Delete album' : 'Leave album',
      });
      if (!ok) return false;
      try {
        await momentoApi('/api/albums/' + encodeURIComponent(a.id) + (host ? '' : '/membership'), { method: 'DELETE' });
      } catch (err) { Momento.toast('Could not remove album', err.message); return false; }
      document.dispatchEvent(new CustomEvent('momento:albums', { detail: { type: 'remove', id: a.id } }));
      Momento.toast(host ? 'Album deleted' : 'You left the album', a.name);
      return true;
    };

    let createD = null;
    function createDialog(getReturn) {
      const d = dialog('mCreate', `
        <form class="acct-card" novalidate>
          <button class="acct-x" type="button" aria-label="Close" data-close>${ICON.close}</button>
          <div class="m-view" data-view="form">
            <h2 id="mCreateTitle" tabindex="-1">Create an album</h2>
            <p class="m-progress" data-create-progress>Step 1 of 2</p>
            <div data-create-step="details">
              <label class="acct-field m-first"><span data-name-label>Album name</span><input name="name" maxlength="60" placeholder="Enter album name" autocomplete="off"></label>
              <label class="acct-field m-date"><span>Date</span><input name="date" type="date" placeholder="Enter a date"></label>
              <div class="m-kind" role="radiogroup" aria-labelledby="mKindTitle">
                <span class="m-kind-title" id="mKindTitle">What is it?</span>
                <label><input type="radio" name="kind" value="album" checked><b>Album</b><small>Photos together, any time. Join with the code or link</small></label>
                <label><input type="radio" name="kind" value="event"><b>Event</b><small>A time and a place, with a sharing zone</small></label>
              </div>
              <input name="place" type="hidden">
              <label class="acct-field m-group m-share" hidden><span>Share with</span><select name="group"></select></label>
            </div>
            <div data-create-step="event" hidden></div>
            <p class="acct-status" role="status"></p>
            <div class="acct-actions"><button class="acct-ghost" type="button" data-create-back>Cancel</button><button class="acct-primary" type="submit">Next</button></div>
          </div>
          <div class="m-view m-done" data-view="done" hidden>
            <i class="m-done-ic" aria-hidden="true">${MARK.bigCheck}</i>
            <h2 tabindex="-1">Album created</h2>
            <p class="acct-sub"></p>
            <div class="m-code"><span><small>Guest code</small><b></b></span><button class="m-copy" type="button">Copy code</button></div>
            <div class="m-code"><span><small>Invite link</small><em class="m-link"></em></span><button class="m-copy" type="button" data-copy-link>Copy link</button></div>
            <div class="acct-actions m-showqr"><button class="acct-primary" type="button" data-show-qr>Show QR code</button></div>
            <div class="acct-actions"><button class="acct-ghost" type="button" data-close>Done</button><button class="acct-primary" type="button" data-view-album>View album</button></div>
            <button class="m-del" type="button" data-delete>Delete this album</button>
          </div>
        </form>`, getReturn);
      const form = d.querySelector('form'), status = d.querySelector('.acct-status');
      const views = [...d.querySelectorAll('.m-view')];
      const showView = (v) => views.forEach((x) => { x.hidden = x.dataset.view !== v; });
      const submit = form.querySelector('[type="submit"]'), back = form.querySelector('[data-create-back]');
      const title = d.querySelector('#mCreateTitle'), progress = d.querySelector('[data-create-progress]');
      const steps = [...d.querySelectorAll('[data-create-step]')];
      const kindField = d.querySelector('.m-kind');
      // Only an event asks for times and a venue; an album (and a friend-group album) is just its name and date
      const isEvent = () => !form.group?.value && form.kind?.value === 'event';
      let step = 'details', made = null;
      const say = (msg, field) => {
        form.querySelectorAll('.m-field-error').forEach((el) => el.remove());
        form.querySelectorAll('[aria-invalid="true"]').forEach((el) => {
          el.removeAttribute('aria-invalid');
          const ids = (el.getAttribute('aria-describedby') || '').split(' ').filter((id) => id && id !== 'mCreateError');
          if (ids.length) el.setAttribute('aria-describedby', ids.join(' ')); else el.removeAttribute('aria-describedby');
        });
        status.textContent = field ? '' : msg;
        status.classList.toggle('is-error', !!msg && !field);
        if (msg && field) {
          const error = document.createElement('small');
          error.className = 'm-field-error'; error.id = 'mCreateError'; error.setAttribute('role', 'alert'); error.textContent = msg;
          (field.closest('.acct-field, .ev-sec') || field.parentElement).append(error);
          field.setAttribute('aria-invalid', 'true');
          field.setAttribute('aria-describedby', [field.getAttribute('aria-describedby'), error.id].filter(Boolean).join(' '));
          field.focus();
        }
      };
      const showStep = (next, focus = false) => {
        const grouped = !!form.group?.value, event = isEvent();
        step = event ? next : 'details';
        steps.forEach((panel) => { panel.hidden = panel.dataset.createStep !== step; });
        if (kindField) kindField.hidden = grouped;
        // An event's date and time are on step two (Starts and Ends), so step one has no date
        form.querySelector('.m-date').hidden = event;
        form.querySelector('[data-name-label]').textContent = event ? 'Event name' : 'Album name';
        form.name.placeholder = event ? 'Enter event name' : 'Enter album name';
        title.textContent = step === 'event' ? 'Event details' : event ? 'Create an event' : 'Create an album';
        progress.hidden = !event;
        progress.textContent = step === 'event' ? 'Step 2 of 2' : 'Step 1 of 2';
        submit.textContent = event ? (step === 'event' ? 'Create event' : 'Next') : 'Create album';
        const first = form.group?.options?.[0];
        if (first && !first.value) first.textContent = event ? 'Guests at the event' : 'Anyone with the code or link';
        back.textContent = step === 'event' ? 'Back' : 'Cancel';
        if (step === 'event') Momento.event?.activate(form);
        d.scrollTop = 0;
        if (focus) title.focus({ preventScroll: true });
      };
      back.addEventListener('click', () => {
        if (form.dataset.busy) return;
        if (step === 'event') { say(''); showStep('details', true); } else d.dismiss();
      });
      form.addEventListener('input', (e) => { if (e.target.getAttribute('aria-invalid') === 'true') say(''); });
      form.addEventListener('change', (e) => { if (e.target.name === 'kind') { say(''); showStep('details'); } });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (form.dataset.busy || made) return;
        const name = form.name.value.trim();
        let date = form.date.value;
        let place = form.place.value.trim();
        if (!name) { showStep('details'); say(isEvent() ? 'Enter an event name.' : 'Enter an album name.', form.name); return; }
        if (!date && !isEvent()) { showStep('details'); say('Choose a date.', form.date); return; }
        // Group albums finish here. Event albums collect times and a venue on the next screen.
        const groupId = shareList.value || '', groupName = groupId ? shareList.selectedOptions[0]?.textContent || '' : '';
        const event = isEvent();
        if ((event || groupId) && !Momento.event) { say('Event details couldn’t load. Refresh the page and try again.'); return; }
        if (event && step === 'details') { say(''); showStep('event', true); return; }
        // An event: its times and venue. A group album: what the group needs. An album: nothing more
        const ev = event || groupId ? Momento.event.read(form) : { fields: { place: '' } };
        if (ev.error) { say(ev.error, ev.focus); return; }
        if (ev.fields.place !== undefined) place = ev.fields.place;
        if (ev.fields.date) date = ev.fields.date;
        say('');
        form.dataset.busy = 'true';
        submit.disabled = back.disabled = true;
        try {
          ({ album: made } = await momentoApi('/api/albums', momentoJson('POST', { name, date, place, ...ev.fields, ...(groupId && { groupId }) })));
          document.dispatchEvent(new CustomEvent('momento:albums', { detail: { type: 'add', album: made } }));
        } catch (err) { say(err.message); return; }
        finally { delete form.dataset.busy; submit.disabled = back.disabled = false; }
        const when = new Date(date + 'T12:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        d.querySelector('.m-done .acct-sub').textContent = `“${name}” is ready for ${when}${place ? ` in ${place}` : ''}.${groupName ? ` Everyone in ${groupName} can see it already. Share this code with anyone else you want in.` : ' Share this code so guests can join and add their photos.'}`;
        d.querySelector('.m-code b').textContent = made.code;
        d.querySelector('.m-copy').textContent = 'Copy code';
        d.querySelector('.m-link').textContent = Momento.inviteLink(made.code);
        d.querySelector('[data-copy-link]').textContent = 'Copy link';
        showView('done');
        if (!reduced.matches) [...d.querySelector('.m-done').children].forEach((el, i) => el.animate(
          [{ opacity: 0, transform: i ? 'translateY(10px)' : 'scale(.4)' }, { opacity: 1, transform: 'none' }],
          { duration: i ? 460 : 620, delay: i * 55, easing: i ? 'cubic-bezier(.16, 1, .3, 1)' : 'cubic-bezier(.34, 1.56, .64, 1)', fill: 'backwards' }));
        d.querySelector('.m-done h2').focus();
      });
      d.querySelector('.m-copy').addEventListener('click', async (e) => {
        const b = e.currentTarget;
        try { await navigator.clipboard.writeText(made.code); b.textContent = 'Copied'; } catch (err) { b.textContent = 'Select and copy'; }
        setTimeout(() => { b.textContent = 'Copy code'; }, 1800);
      });
      d.querySelector('[data-copy-link]').addEventListener('click', (e) => Momento.shareInvite(made, e.currentTarget, 'Copy link'));
      d.querySelector('[data-view-album]').addEventListener('click', async () => { const id = made.id; await d.dismiss(); viewAlbum(id); });
      d.querySelector('[data-show-qr]').addEventListener('click', (e) => { if (made) Momento.qr?.show(made, e.currentTarget); });
      d.querySelector('[data-delete]').addEventListener('click', async (e) => {
        if (await Momento.removeAlbum({ ...made, photos: 0 }, e.currentTarget)) d.dismiss();
      });
      const launch = d.launch;
      // The friend groups to offer, fetched each time the form opens (a group may be new or gone)
      const groupField = d.querySelector('.m-group');
      // "Share with": an event's guests (they join with the code), or one of your friend groups (everyone in
      // it sees the album). A dropdown, shown only when you have groups
      const shareList = groupField.querySelector('select');
      const shareOption = (value, title) => { const o = document.createElement('option'); o.value = value; o.textContent = title; return o; };
      shareList.addEventListener('change', () => { say(''); showStep('details'); });
      let groupsAsked = 0;
      async function loadGroups(groupId, groupName) {
        const ask = ++groupsAsked;
        if (groupId) {
          shareList.replaceChildren(shareOption(groupId, groupName || 'This group'));
          shareList.value = groupId;
          groupField.hidden = false;
          return;
        }
        // Your groups as remembered for this tab (assets/event.js, Momento.myGroups): the field is there as the
        // form opens, not a moment later. The fresh list follows and only changes what's different
        const fill = (groups) => {
          const keep = shareList.value;
          shareList.replaceChildren(shareOption('', 'Guests at the event'), ...groups.map((g) => shareOption(g.id, g.name)));
          if (groups.some((g) => g.id === keep)) shareList.value = keep;
          groupField.hidden = !groups.length;
          shareList.options[0].textContent = isEvent() ? 'Guests at the event' : 'Anyone with the code or link';   // (as showStep words it)
        };
        const known = Momento.myGroups?.cached();
        fill(known || []);
        let groups;
        try { groups = Momento.myGroups ? await Momento.myGroups.refresh() : (await momentoApi('/api/groups')).groups; } catch { return; }
        if (ask !== groupsAsked) return;
        if (JSON.stringify(groups.map((g) => [String(g.id), g.name])) !== JSON.stringify((known || []).map((g) => [g.id, g.name]))) fill(groups);
      }
      d.launch = (opts = {}) => {
        form.reset(); made = null; say('');
        loadGroups(opts.groupId, opts.groupName);
        // (the date starts empty: the field says "Enter a date" and its calendar opens on today)
        // "Create an event" opens with Event chosen, "Create an album" with Album
        const kind = form.querySelector(`input[name="kind"][value="${opts.kind === 'event' ? 'event' : 'album'}"]`);
        if (kind) kind.checked = true;
        Momento.event?.mount(form, { fromGroup: Boolean(opts.groupId) });
        showStep('details');
        showView('form');
        launch();
        form.name.focus();
      };
      return d;
    }
    // opts.groupId: restrict sharing to the group that opened the form
    Momento.createAlbum = (from, opts) => { returnTo = from; (createD ||= createDialog(() => returnTo)).launch(opts); };
    // Any "Create an album" control on any page: <a|button data-create>
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-create]');
      if (!t) return;
      e.preventDefault();
      Momento.createAlbum(t, { groupId: t.dataset.createGroup, groupName: t.dataset.createGroupName, kind: t.dataset.createKind });
    });
  
    // A Light / Dark / System segment bound to the theme (the account menu and the footer both use it)
    function wireSeg(seg) {
      const btns = [...seg.querySelectorAll('button')];
      seg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) Momento.theme.set(b.dataset.theme); });
      const sync = () => btns.forEach((b, i) => {
        const on = b.dataset.theme === Momento.theme.pref;
        b.setAttribute('aria-checked', on);
        if (on) seg.style.setProperty('--i', i);
      });
      Momento.theme.onChange(sync);
      sync();
    }
  
    // Fills one host element with the chip and its menu. `out` (optional) is the signed-out UI,
    // shown instead of the chip when there is no account. `always` shows the chip regardless.
    function mountAccount({ host, out, always, onLogout }) {
      let built = null;
      function build() {
        const wrap = document.createElement('div');
        wrap.className = 'acct';
        wrap.innerHTML = `
          <button class="acct-btn glass" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="acctMenu" aria-label="Account menu"><i class="acct-av"></i><span class="acct-name"></span>${ICON.chev.replace('<svg', '<svg class="acct-chev"')}</button>
          <div class="acct-menu glass" id="acctMenu" role="menu" aria-label="Account">
            <div class="acct-head"><i class="acct-av"></i><span><b></b><small></small></span></div>
            <button class="acct-item" type="button" role="menuitem" data-act="settings">${ICON.settings}Account settings</button>
            <div class="acct-label" id="acctThemeLabel">Appearance</div>
            <div class="acct-seg" role="radiogroup" aria-labelledby="acctThemeLabel">
              <span class="acct-seg-pill" aria-hidden="true"></span>
              <button type="button" role="radio" aria-checked="false" data-theme="light">${ICON.sun}Light</button>
              <button type="button" role="radio" aria-checked="false" data-theme="dark">${ICON.moon}Dark</button>
              <button type="button" role="radio" aria-checked="false" data-theme="system">${ICON.system}System</button>
            </div>
            <button class="acct-item" type="button" role="menuitem" data-act="help">${ICON.help}Help and support</button>
            <hr class="acct-sep">
            <button class="acct-item" type="button" role="menuitem" data-act="logout">${ICON.logout}Log out</button>
          </div>`;
        host.append(wrap);
  
        const btn = wrap.querySelector('.acct-btn'), menu = wrap.querySelector('.acct-menu'), seg = wrap.querySelector('.acct-seg');
        const segBtns = [...seg.querySelectorAll('button')];
        const items = () => [...menu.querySelectorAll('.acct-item, .acct-seg button')];
        let open = false;
  
        function setOpen(v, focusFirst) {
          if (v === open) return;
          open = v;
          menu.classList.toggle('is-open', v);
          btn.setAttribute('aria-expanded', v);
          if (v && focusFirst) items()[0].focus();
        }
        btn.addEventListener('click', (e) => setOpen(!open, e.detail === 0));
        document.addEventListener('pointerdown', (e) => { if (open && !wrap.contains(e.target)) setOpen(false); });
        wrap.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && open) { setOpen(false); btn.focus(); return; }
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault();
          if (!open) { setOpen(true, true); return; }
          const list = items(), i = list.indexOf(document.activeElement);
          const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
          list[next].focus();
        });
        menu.addEventListener('click', async (e) => {
          const choice = e.target.closest('.acct-seg button');
          if (choice) { Momento.theme.set(choice.dataset.theme); return; }   // stays open so the change can be seen
          const item = e.target.closest('.acct-item');
          if (!item) return;
          setOpen(false);
          const act = item.dataset.act;
          if (act === 'settings') Momento.openSettings(btn);
          else if (act === 'help') Momento.openHelp(btn);
          else { try { await momentoApi('/api/auth/logout', { method: 'POST' }); } catch (err) { Momento.toast('Could not log out', err.message); return; } Momento.account.clear(); if (onLogout) { Momento.flash('You’re logged out', 'Log back in any time'); onLogout(); } else Momento.toast('You’re logged out', 'Log back in any time'); }
        });
  
        const syncSeg = () => {
          segBtns.forEach((b, i) => {
            const on = b.dataset.theme === Momento.theme.pref;
            b.setAttribute('aria-checked', on);
            if (on) seg.style.setProperty('--i', i);
          });
        };
        Momento.theme.onChange(syncSeg);
        syncSeg();
        return { avatars: wrap.querySelectorAll('.acct-av'), name: wrap.querySelector('.acct-name'), headName: menu.querySelector('.acct-head b'), headMail: menu.querySelector('.acct-head small') };
      }
      function render() {
        const a = current, show = !!a || !!always;
        host.hidden = !show;
        if (out) out.hidden = show;
        if (!show) return;
        built ||= build();
        const name = (a && a.name) || '';
        built.avatars.forEach((el) => {
          const pic = a && a.avatarUrl;
          el.textContent = pic ? '' : (name || 'You')[0].toUpperCase();
          if (pic) { const img = document.createElement('img'); img.src = pic; img.alt = ''; img.referrerPolicy = 'no-referrer'; img.onerror = () => { img.remove(); el.textContent = (name || 'You')[0].toUpperCase(); }; el.append(img); }
        });
        built.name.textContent = first(name) || 'You';
        built.headName.textContent = name || 'You';
        built.headMail.textContent = (a && a.email) || 'Your account';
      }
      accountListeners.add(render);
      render();
    }
  
    // ---- The thread: a faint string draws itself down the page as you scroll, with small see-through
    // polaroids hung along it. A page marks the container:
    //   <div class="trail" data-trail data-avoid="selectors of content to keep clear" data-pad="26">
    // The string runs behind everything; a print is only hung where its box clears the avoided content ----
    (function trail() {
      const host = document.querySelector('[data-trail]');
      if (!host) return;
      const wrap = host.parentElement;
      const IDS = [1062, 1011, 1027, 64, 1047, 1012, 177, 1025, 91, 1040, 1015, 1035, 1005, 1043, 1050, 1054, 1058, 1060, 1068, 1074];
      const TILT = [-9, 6, -5, 10, -12, 4, -7, 8, -3, 12, -10, 5];
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      const path = document.createElementNS(NS, 'path');
      svg.setAttribute('class', 'trail-svg'); path.setAttribute('class', 'trail-line'); svg.append(path);
      const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
      let prints = [], lut = [], len = 0, target = 0, drawn = 0, raf = 0, timer = 0;
  
      function build() {
        host.replaceChildren(svg); prints = []; lut = [];
        const wr = wrap.getBoundingClientRect(), W = wrap.offsetWidth, H = wrap.offsetHeight;
        const small = innerWidth < 700, pad = +host.dataset.pad || 26;
        svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  
        // A vertical trochoid: when the loop radius d outgrows the step r, the string curls
        const y0 = innerHeight * .85, y1 = H - 40;
        const r = clamp(W * .05, 46, 80) * (small ? .7 : 1), swing = small ? .26 : .36;
        const pts = [];
        for (let t = 0; ; t += .11) {
          const d = r * (.55 + .95 * Math.max(0, Math.sin(t * .23 + 1)));
          const y = y0 + r * t - d * Math.sin(t);
          if (y > y1) break;
          pts.push(`${(W / 2 + W * swing * Math.sin(t * .11) + W * .07 * Math.sin(t * .37) + d * Math.cos(t)).toFixed(1)},${y.toFixed(1)}`);
        }
        path.setAttribute('d', 'M' + pts.join(' L'));
        len = path.getTotalLength();
        path.style.strokeDasharray = len;
        // Length against the furthest point reached so far, so the loops don't confuse the search
        let maxY = -Infinity;
        for (let i = 0; i <= 600; i++) {
          const l = len * i / 600;
          maxY = Math.max(maxY, path.getPointAtLength(l).y);
          lut.push([l, maxY]);
        }
  
        // The content to keep clear of, measured once, relative to the page: whole blocks the page names
        // (data-avoid), plus every line of text, picture and control, so a print can hang in the empty
        // parts of a glass panel but never under what you read
        const blocks = [];
        const keep = (b, p) => { if (b.width > 1 && b.height > 1) blocks.push({ l: b.left - wr.left - p, t: b.top - wr.top - p, r: b.right - wr.left + p, b: b.bottom - wr.top + p }); };
        const sel = host.dataset.avoid || '';
        if (sel) wrap.querySelectorAll(sel).forEach((el) => keep(el.getBoundingClientRect(), pad));
        wrap.querySelectorAll('img, svg, video, canvas, input, textarea, select, button, .btn').forEach((el) => {
          if (!host.contains(el) && (el.tagName !== 'svg' || !el.parentElement.closest('svg'))) keep(el.getBoundingClientRect(), 8);
        });
        const range = document.createRange();
        const words = document.createTreeWalker(wrap, NodeFilter.SHOW_TEXT);
        for (let n; (n = words.nextNode());) {
          if (!n.nodeValue.trim() || host.contains(n) || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(n.parentElement.tagName)) continue;
          range.selectNodeContents(n);
          for (const q of range.getClientRects()) keep(q, 10);
        }
        const hits = (x, y, w, h) => blocks.some((b) => x + w > b.l && x < b.r && y + h > b.t && y < b.b);
  
        // Hang a print every so often along the string, wherever there is room for it
        const gap = small ? 80 : 90, kept = [];
        let k = 0;
        for (let l = 140; l < len - 40; l += gap) {
          const p = path.getPointAtLength(l), q = path.getPointAtLength(l + 4);
          const pw = (small ? 30 : 36) + (k % 3) * 4, ph = pw + 9;
          const x = p.x - pw / 2, y = p.y - 2;
          if (x < 8 || x + pw > W - 8 || y < 80 || y + ph > H - 40 || hits(x, y, pw, ph)) continue;
          // Not too near the last one: prints are an accent on the string, not a row of photos
          if (kept.some((o) => Math.hypot(o.x - x, o.y - y) < 150)) continue;
          kept.push({ x, y });
          // It hangs under the string, leaning a little with the string's direction
          const dev = ((Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI - 90 + 540) % 360) - 180;
          const el = document.createElement('span');
          el.className = 'tp';
          el.style.cssText = `--x:${x.toFixed(1)}px;--y:${y.toFixed(1)}px;--w:${pw}px;--r:${(clamp(dev * .25, -14, 14) + TILT[k % TILT.length] * .5).toFixed(1)}deg`;
          el.innerHTML = `<img src="assets/photos/${IDS[k % IDS.length]}-96.webp" alt="" loading="lazy" decoding="async" draggable="false">`;
          host.append(el);
          prints.push({ el, l, on: false });
          k++;
        }
        drawn = reduced.matches ? len : Math.min(drawn, len);
        target = reduced.matches ? len : aim();
        write();
        if (drawn !== target) kick();
      }
  
      // How far along the string the reading line (a little above the bottom of the screen) has got
      function aim(sy = scrollY) {
        if (!lut.length) return 0;
        const y = sy + innerHeight * .7;
        let lo = 0, hi = lut.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; lut[mid][1] < y ? lo = mid + 1 : hi = mid; }
        return lut[lo][0];
      }
      function write() {
        path.style.strokeDashoffset = (len - drawn).toFixed(1);
        for (const p of prints) {
          const on = p.l <= drawn;
          if (on !== p.on) { p.on = on; p.el.classList.toggle('is-on', on); }
        }
      }
      // The string eases toward the reading line; the loop stops as soon as it gets there
      // Runs from the main loop’s write phase (after every read in the frame), so its style changes
      // never force the browser to lay the page out twice
      function tick() {
        const d = target - drawn;
        drawn = Math.abs(d) < .5 ? target : drawn + d * .2;
        write();
      }
      window.stringTick = () => { if (drawn !== target) tick(); };
      function kick() {}
  
      // Told the scroll position by the main loop (read before any writes), so it never forces a layout
      if (!reduced.matches) window.stringScrolled = (sy) => { const t = aim(sy); if (t !== target) { target = t; kick(); } };
      new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(build, 250); }).observe(wrap);
      // Text that is still rising into place when the page first measures is measured again once it has settled
      const later = (ms) => () => { clearTimeout(timer); timer = setTimeout(build, ms); };
      addEventListener('load', later(1800));
      document.addEventListener('momento:intro-end', later(1600));
    })();
  
    // ---- Leaving a page, in browsers that can't cross-fade between pages themselves: the page fades and
    // lifts away (CSS .is-leaving), then the next one loads ----
    // (Also for pages opened straight from the folder: browsers only cross-fade pages served from an address)
    const ptFile = location.protocol === 'file:';
    if ((!('CSSViewTransitionRule' in window) || ptFile) && !reduced.matches) {
      document.addEventListener('click', (e) => {
        const a = e.target.closest && e.target.closest('a[href]');
        if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target || a.hasAttribute('download')) return;
        const url = new URL(a.href, location.href);
        if (url.origin !== location.origin || url.pathname === location.pathname) return;   // other sites, mailto:, same-page anchors
        e.preventDefault();
        root.classList.add('is-leaving');
        if (ptFile) { root.classList.add('pt-file'); try { sessionStorage.setItem('momento-pt', '1'); } catch (err) {} }
        setTimeout(() => { location.href = url.href; }, 240);
      });
      addEventListener('pageshow', (e) => { if (e.persisted) root.classList.remove('is-leaving'); });   // back from the page cache
    }
  
    // ---- Page intros ----
    // A page puts a veil (#intro) over itself and plays a short sequence once per tab session, ending by
    // handing off to real elements (the header logo, an album cover, a nav icon). Momento.intro(run) gives
    // `run` a small kit. A press, key, wheel or touch skips straight to the finished page.
    Momento.intro = (run) => {
      const veil = document.getElementById('intro');
      if (!root.classList.contains('intro-on')) { if (veil) veil.remove(); return; }
      const anims = [], undo = [];
      let done = false, revealed = false;
      // The moment the page's own entrance (groups rising in, headings) may begin
      const reveal = () => { if (!revealed) { revealed = true; document.dispatchEvent(new Event('momento:intro-reveal')); } };
      const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
      const skip = () => finish(true);
      function finish(skipped) {
        if (done) return;
        done = true;
        EVENTS.forEach((t) => removeEventListener(t, skip, true));
        root.classList.remove('intro-on');
        anims.forEach((a) => a.cancel());
        undo.forEach((fn) => fn());
        try { sessionStorage.setItem('momento-intro-' + root.dataset.page, '1'); } catch (e) {}
        reveal();
        document.dispatchEvent(new Event('momento:intro-end'));
        if (!veil) return;
        if (!skipped) { veil.remove(); return; }
        // Skipped: the veil keeps catching the press for a moment, then fades off the finished page
        veil.style.display = 'block';
        veil.animate({ opacity: [1, 0] }, { duration: 260, easing: 'ease-out' }).finished.then(() => veil.remove(), () => veil.remove());
      }
      // Once the intro has finished (or been skipped) nothing in the sequence may carry on: its promises
      // simply never settle, so the code after an `await` never runs against elements that are gone
      const never = new Promise(() => {});
      const kit = {
        get done() { return done; },
        reveal, finish,
        undo: (fn) => undo.push(fn),
        // Plays an animation that holds its end state until the intro finishes; resolves when it ends
        play(el, frames, opts = {}) {
          if (done || !el) return never;
          const a = el.animate(frames, { fill: 'both', ...opts });
          anims.push(a);
          return a.finished.then(() => {}, () => never);
        },
        // Keeps a real element invisible until its turn
        hold: (el) => kit.play(el, [{ opacity: 0 }, { opacity: 0 }], { duration: 1 }),
        wait: (ms) => new Promise((r) => setTimeout(() => { if (!done) r(); }, ms)),
        // Calls fn(progress 0..1) every frame for `ms`
        tween: (ms, fn) => new Promise((res) => {
          const t0 = performance.now();
          const step = (t) => { if (done) return; const p = Math.min(1, (t - t0) / ms); fn(p); if (p < 1) requestAnimationFrame(step); else res(); };
          requestAnimationFrame(step);
        }),
        // Where `el` would have to move and scale (about its top left) to cover `to`
        flip(el, to) {
          const a = el.getBoundingClientRect();
          return `translate(${to.left - a.left}px, ${to.top - a.top}px) scale(${to.width / a.width}, ${to.height / a.height})`;
        },
      };
      if (scrollY > 40) { finish(); return; }   // reopened part-way down: no intro
      EVENTS.forEach((t) => addEventListener(t, skip, { capture: true, passive: true }));
      setTimeout(() => finish(), 9000);
      Promise.resolve().then(() => run(kit)).then(() => finish(), (e) => { console.error(e); finish(true); });
    };

    // ---- Nav flourish: only home has a page intro. On the other pages the current nav item gives a short
    // nudge once per tab (the Settings knobs slide into place). Transform only; skipped for reduced motion ----
    Momento.flourish = () => {
      const page = document.documentElement.dataset.page;
      const cur = document.querySelector('.nav > .nav-item[aria-current="page"]');
      if (!cur || !cur.animate || page === 'home' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      try { if (sessionStorage.getItem('momento-flourish-' + page)) return; sessionStorage.setItem('momento-flourish-' + page, '1'); } catch (e) {}
      const SPRING = 'cubic-bezier(.34, 1.4, .64, 1)';
      const knobs = cur.classList.contains('nav-settings') ? [...cur.querySelectorAll('svg circle')] : [];
      if (knobs.length) knobs.forEach((k, i) => k.animate([{ transform: `translateX(${i ? 3 : -3}px)` }, { transform: 'none' }], { duration: 480, delay: i * 90, easing: SPRING }));
      else cur.animate([{ transform: 'none' }, { transform: 'translateY(-2px) scale(1.1)', offset: .4 }, { transform: 'none' }], { duration: 380, easing: SPRING });
    };
    if (document.documentElement.dataset.page !== 'home') addEventListener('load', () => setTimeout(() => Momento.flourish(), 250), { once: true });
  
    // ---- Site footer: one footer for every page. A page marks it <footer class="site-foot" data-site-foot> ----
    document.querySelectorAll('[data-site-foot]').forEach((foot) => {
      const home = root.dataset.page === 'home', P = home ? '' : 'index.html';
      const up = svg('<path d="M12 19V5M6 11l6-6 6 6"/>', 15), chev = svg('<path d="M6 9l6 6 6-6"/>', 16);
      foot.innerHTML = `
        <div class="sf-grid">
          <div class="sf-brand">
            <a class="sf-logo" href="${home ? '#home' : 'index.html'}" aria-label="Momento, home"><svg class="glyph" aria-hidden="true"><use href="#glyph-album"/></svg><svg class="brand-word" aria-hidden="true"><use href="#wordmark"/></svg></a>
            <p>Every photo from your event, in one shared album.</p>
          </div>
          <nav class="sf-col" aria-labelledby="sfProduct">
            <h2 id="sfProduct"><span class="sf-h-text">Product</span><button class="sf-head" type="button" aria-expanded="false" aria-controls="sfProductList">Product<span class="sf-chev" aria-hidden="true">${chev}</span></button></h2>
            <ul id="sfProductList">
              <li><a class="sf-link" href="${P}#how-it-works">How it works</a></li>
              <li><a class="sf-link" href="${P}#features">Features</a></li>
              <li><a class="sf-link" href="${P}#quality">Full quality</a></li>
            </ul>
          </nav>
          <nav class="sf-col" aria-labelledby="sfAlbums">
            <h2 id="sfAlbums"><span class="sf-h-text">Your albums</span><button class="sf-head" type="button" aria-expanded="false" aria-controls="sfAlbumsList">Your albums<span class="sf-chev" aria-hidden="true">${chev}</span></button></h2>
            <ul id="sfAlbumsList">
              <li><a class="sf-link" href="albums.html">My albums</a></li>
              <li><a class="sf-link" href="events.html#join">Join with a code</a></li>
              <li><a class="sf-link" href="events.html#groups">Groups</a></li>
              <li><a class="sf-link" href="${P}#how-it-works" data-create>Create an album</a></li>
              <li><a class="sf-link" href="settings.html">Settings</a></li>
            </ul>
          </nav>
          <nav class="sf-col" aria-labelledby="sfEvents">
            <h2 id="sfEvents"><span class="sf-h-text">Events</span><button class="sf-head" type="button" aria-expanded="false" aria-controls="sfEventsList">Events<span class="sf-chev" aria-hidden="true">${chev}</span></button></h2>
            <ul id="sfEventsList">
              <li><a class="sf-link" href="events.html#events">Events near you</a></li>
              <li><a class="sf-link" href="${P}#how-it-works" data-create data-create-kind="event">Host a public event</a></li>
              <li><a class="sf-link" href="events.html#alerts">Event alerts</a></li>
            </ul>
          </nav>
          <nav class="sf-col" aria-labelledby="sfHelp">
            <h2 id="sfHelp"><span class="sf-h-text">Help</span><button class="sf-head" type="button" aria-expanded="false" aria-controls="sfHelpList">Help<span class="sf-chev" aria-hidden="true">${chev}</span></button></h2>
            <ul id="sfHelpList">
              <li><button class="sf-link" type="button" data-foot-act="help">Help and support</button></li>
              <li><a class="sf-link" href="support.html">Contact support</a></li>
              <li><a class="sf-link" href="${P}#faq">FAQ</a></li>
              <li><a class="sf-link" href="mailto:${SUPPORT}">Email support</a></li>
              <li><a class="sf-link" href="privacy.html">Privacy policy</a></li>
              <li><a class="sf-link" href="terms.html">Terms of Service</a></li>
              <li data-foot-account hidden><button class="sf-link" type="button" data-foot-act="settings">Account settings</button></li>
            </ul>
          </nav>
        </div>
        <div class="sf-base">
          <p class="sf-legal"><span>© 2026 HexArch Limited</span><span>Proof of concept. Design and features are subject to change.</span></p>
          <div class="acct-seg" role="radiogroup" aria-label="Appearance">
            <span class="acct-seg-pill" aria-hidden="true"></span>
            <button type="button" role="radio" aria-checked="false" data-theme="light">${ICON.sun}Light</button>
            <button type="button" role="radio" aria-checked="false" data-theme="dark">${ICON.moon}Dark</button>
            <button type="button" role="radio" aria-checked="false" data-theme="system">${ICON.system}System</button>
          </div>
          <button class="sf-top" type="button">Back to top${up}</button>
        </div>`;
      wireSeg(foot.querySelector('.acct-seg'));
      foot.querySelectorAll('[data-foot-act]').forEach((b) => b.addEventListener('click', () => {
        if (b.dataset.footAct === 'help') Momento.openHelp(b); else Momento.openSettings(b);
      }));
      // Phones: each group heading folds its list (the buttons are display:none on larger screens)
      foot.querySelectorAll('.sf-head').forEach((b) => b.addEventListener('click', () => {
        const col = b.closest('.sf-col'), open = !col.classList.contains('is-open');
        col.classList.toggle('is-open', open); b.setAttribute('aria-expanded', String(open));
        if (!open) return;
        // The footer ends the page, so a group that has just opened can sit below the screen: once it has finished growing, bring it into view
        let t;
        const settle = () => { clearTimeout(t); col.removeEventListener('transitionend', onEnd); col.scrollIntoView({ block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' }); };
        const onEnd = (e) => { if (e.target === col && e.propertyName === 'grid-template-rows') settle(); };
        t = setTimeout(settle, 700); col.addEventListener('transitionend', onEnd);
      }));
      foot.querySelector('.sf-top').addEventListener('click', () => scrollTo({ top: 0, behavior: reduced.matches ? 'auto' : 'smooth' }));
      // Account settings only makes sense once there is an account
      const acct = foot.querySelector('[data-foot-account]');
      const syncAcct = () => { acct.hidden = !current; };
      accountListeners.add(syncAcct); syncAcct();
      // On the home page its own sections are reached the way its menu does it (the album stage is pinned)
      if (home) foot.addEventListener('click', (e) => {
        const a = e.target.closest('a[href^="#"]');
        if (!a || a.matches('.sf-logo')) return;
        const item = document.querySelector(`.menu-item[href="${a.getAttribute('href')}"]`);
        if (item) { e.preventDefault(); item.click(); }
      });
    });
  
    // Pages mark where the chip goes:
    //   <div data-acct-host hidden data-acct-out="authOut"></div>            (home: shown once signed in)
    //   <div data-acct-host data-acct-always data-acct-logout="index.html">   (albums: always there)
    document.querySelectorAll('[data-acct-host]').forEach((host) => {
      const to = host.dataset.acctLogout;
      mountAccount({
        host,
        out: host.dataset.acctOut ? document.getElementById(host.dataset.acctOut) : null,
        always: host.hasAttribute('data-acct-always'),
        onLogout: to ? () => { location.href = to; } : null,
      });
    });
  })();

  // ---- Popup cards catch the pointer light too (they're created later, so listen on the page) ----
  (() => {
    const SEL = '.auth-card, .modal-card, .acct-card, .vgate-card';
    let el = null, x = 0, y = 0, queued = false;
    addEventListener('pointermove', (e) => {
      const card = e.target.closest ? e.target.closest(SEL) : null;
      if (card !== el) { if (el) el.style.setProperty('--shine', 0); el = card; if (el) el.style.setProperty('--shine', 1); }
      if (!el) return;
      x = e.clientX; y = e.clientY;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${x - r.left}px`);
        el.style.setProperty('--my', `${y - r.top}px`);
      });
    }, { passive: true });
  })();
