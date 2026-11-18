// Small things every page shares, loaded after the page's own scripts are parsed:
// - Show/hide on every password field (an eye button inside the field)
// - Momento.permission: asks for the camera, location or notifications the way an app does: it
//   says why first, then the browser asks; if it was blocked, it says how to allow it again
(function () {
  const M = (window.Momento ||= {});
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Chat is gone from Momento (it cost too much to store). Tidy up what it left in this browser.
  try {
    for (const k of ['momento-chat-seen', 'momento-event-chat-seen', 'momento-social-tab']) localStorage.removeItem(k);
    const s = JSON.parse(localStorage.getItem('momento-settings') || 'null');
    if (s && 'chatNotify' in s) { delete s.chatNotify; localStorage.setItem('momento-settings', JSON.stringify(s)); }
  } catch (e) {}

  // ---------- Styles for the pieces below ----------
  const css = document.createElement('style');
  css.textContent = `
    .pw-wrap { position: relative; display: block; }
    .pw-wrap > input { width: 100%; box-sizing: border-box; padding-right: 3rem !important; }
    .pw-eye {
      position: absolute; right: .35rem; top: 50%; translate: 0 -50%; display: grid; place-items: center; width: 2.3rem; height: 2.3rem;
      border-radius: 50%; color: var(--stone, #8A869A); cursor: pointer;   /* a ghost GlassButton (assets/glass.css) */
    }
    .pw-eye:hover { color: var(--dusk, #2E2C3A); }
    .pw-eye svg { width: 1.2rem; height: 1.2rem; }
    .pw-eye .slash { stroke-dasharray: 26; stroke-dashoffset: 26; transition: stroke-dashoffset .3s ease; }
    .pw-eye[aria-pressed="false"] .slash { stroke-dashoffset: 0; }

    .perm-ic { display: grid; place-items: center; width: 3.2rem; height: 3.2rem; margin-bottom: .8rem; border-radius: 1rem; background: linear-gradient(135deg, #D9D0EE, #EDD6DF 55%, #CFE3E0); color: #2E2C3A; }
    .perm-ic svg { width: 1.6rem; height: 1.6rem; }
    .perm-list { margin: .2rem 0 1rem; padding: 0; list-style: none; display: grid; gap: .45rem; }
    .perm-list li { display: flex; gap: .55rem; align-items: flex-start; font-size: .92rem; line-height: 1.45; color: var(--slate, #5C596B); }
    .perm-list li::before { content: ""; flex: none; width: .45rem; height: .45rem; margin-top: .45rem; border-radius: 50%; background: var(--copper, #9A603D); }
    .perm-steps { margin: 0 0 1rem; padding-left: 1.2rem; font-size: .92rem; line-height: 1.55; color: var(--slate, #5C596B); }

    /* Account settings popup: the profile photo row */
    .acct-photo { display: flex; align-items: center; gap: .85rem; margin: .4rem 0 1rem; padding: .75rem .85rem; border-radius: 18px; background: rgba(255, 255, 255, .45); box-shadow: inset 0 0 0 1px rgba(46, 44, 58, .08); }
    .acct-photo-av { position: relative; display: grid; place-items: center; flex: none; width: 3.3rem; height: 3.3rem; border-radius: 50%; overflow: hidden;
      background: linear-gradient(135deg, #C9C0E2, #E6CDD6 55%, #A9CCC8); color: #2E2C3A; font-size: 1.25rem; font-weight: 700; }
    .acct-photo-av img { width: 100%; height: 100%; object-fit: cover; }
    .acct-photo-av.is-busy::after { content: ""; position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(from 0deg, transparent 0 70%, var(--copper, #9A603D) 100%); animation: acct-spin 1s linear infinite;
      -webkit-mask: radial-gradient(circle, transparent 56%, #000 58%); mask: radial-gradient(circle, transparent 56%, #000 58%); }
    @keyframes acct-spin { to { rotate: 360deg; } }
    .acct-photo-text { display: grid; flex: 1; min-width: 0; }
    .acct-photo-text b { font-size: .95rem; }
    .acct-photo-text small { font-size: .8rem; color: var(--slate, #5C596B); }
    .acct-photo-acts { display: flex; flex-direction: column; gap: .3rem; align-items: stretch; }
    .acct-photo-btn { padding: .45rem .9rem; border-radius: 100px; font: 600 .84rem var(--font-main, system-ui); cursor: pointer; }   /* clear glass; Remove is the red-label danger tier (assets/glass.css) */
    .acct-photo-btn[hidden] { display: none; }
    :root[data-theme="dark"] .acct-photo { background: rgba(255, 255, 255, .05); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1); }
    :root[data-theme="dark"] .acct-photo-btn.is-danger { background: none; color: #F0A3A3; }
    /* The header for visitors: a Log in button where the account button would be */
    .nl-login { min-height: 2.6rem; padding: 0 1.2rem; font-size: .92rem; }
    /* The log-in prompt: what you're about to join */
    .nl-album { display: flex; align-items: center; gap: .8rem; margin: .2rem 0 1rem; padding: .7rem .8rem; border-radius: 18px; background: rgba(255, 255, 255, .5); box-shadow: inset 0 0 0 1px rgba(46, 44, 58, .08); }
    .nl-album[hidden] { display: none; }
    .nl-cover { display: grid; place-items: center; flex: none; width: 3rem; height: 3rem; border-radius: 14px; background: linear-gradient(135deg, #C9C0E2, #E6CDD6 55%, #A9CCC8); color: #2E2C3A; font-weight: 700; font-size: 1.2rem; }
    .nl-cover.has-pic { overflow: hidden; width: 4.2rem; height: 3rem; box-shadow: 0 6px 16px -8px rgba(46, 44, 58, .5); }
    .nl-cover img { width: 100%; height: 100%; object-fit: cover; }
    .nl-text { display: grid; min-width: 0; }
    .nl-text b { font-size: 1rem; }
    .nl-text small { font-size: .82rem; color: var(--slate, #5C596B); }
    :root[data-theme="dark"] .nl-album { background: rgba(255, 255, 255, .06); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1); }
    @media (prefers-reduced-motion: reduce) { .pw-eye .slash { transition: none; } .acct-photo-av.is-busy::after { animation-duration: 3s; } }
  `;
  document.head.append(css);

  // ---------- Show / hide password ----------
  const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/><path class="slash" d="M4 4l16 16"/></svg>';
  function addEye(input) {
    if (input.dataset.eye || input.closest('.pw-wrap')) return;
    input.dataset.eye = '1';
    const wrap = document.createElement('span');
    wrap.className = 'pw-wrap';
    input.before(wrap);
    wrap.append(input);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-eye';
    btn.innerHTML = EYE;
    const set = (show) => {
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', String(show));
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.title = show ? 'Hide password' : 'Show password';
    };
    set(false);
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const pos = input.selectionStart;
      set(input.type === 'password');
      input.focus({ preventScroll: true });
      try { input.setSelectionRange(pos, pos); } catch (err) {}
    });
    // Hidden again whenever its form is sent, reset or closed, so it never stays on screen
    const hide = () => set(false);
    input.form?.addEventListener('submit', hide, true);
    input.form?.addEventListener('reset', hide);
    input.closest('dialog')?.addEventListener('close', hide);
    wrap.append(btn);
  }
  const scan = (root) => root.querySelectorAll?.('input[type="password"]').forEach(addEye);
  const start = () => {
    scan(document);
    new MutationObserver((list) => {
      for (const m of list) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches?.('input[type="password"]')) addEye(n); else scan(n);
      }
    }).observe(document.body, { childList: true, subtree: true });
  };

  // ---------- Permissions ----------
  const ICONS = {
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.2" r="3.6"/></svg>',
    location: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.4"/></svg>',
    notifications: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
  };
  const WHY = {
    camera: { title: 'Let Momento use your camera', name: 'Camera', points: ['To take photos for an album with Momento’s own camera (they’re never saved to your gallery)', 'To scan an album’s QR code', 'Nothing is recorded, and photos only leave your phone when you choose to upload them'] },
    location: { title: 'Let Momento use your location', name: 'Location', points: ['To check you’re at the event when you add photos to an album with a sharing zone', 'To find public events happening near you, when you ask', 'Only checked at those moments, never tracked in the background'] },
    notifications: { title: 'Turn on notifications', name: 'Notifications', points: ['Public events starting near you, if you turn that on', 'You can turn them off any time in Settings'] },
  };
  const QUERY = { camera: 'camera', location: 'geolocation', notifications: 'notifications' };
  const supported = (kind) => kind === 'notifications' ? 'Notification' in window
    : kind === 'camera' ? !!navigator.mediaDevices?.getUserMedia && window.isSecureContext
    : 'geolocation' in navigator;

  // 'granted', 'denied', 'prompt' (not asked yet) or 'unsupported'
  async function state(kind) {
    if (!supported(kind)) return 'unsupported';
    if (kind === 'notifications') return Notification.permission === 'default' ? 'prompt' : Notification.permission;
    try { return (await navigator.permissions.query({ name: QUERY[kind] })).state; } catch (e) { return 'prompt'; }
  }

  // The browser's own question
  async function ask(kind) {
    try {
      if (kind === 'notifications') return (await Notification.requestPermission()) === 'granted';
      if (kind === 'camera') { const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); s.getTracks().forEach((t) => t.stop()); return true; }
      return await new Promise((resolve) => navigator.geolocation.getCurrentPosition(() => resolve(true), (e) => resolve(e.code !== 1), { timeout: 15000, maximumAge: 600000 }));
    } catch (e) { return false; }
  }

  const isApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/Chrome|CriOS|Edg/.test(navigator.userAgent);
  const isPhone = matchMedia('(pointer: coarse)').matches;
  function unblockSteps(kind) {
    const what = WHY[kind].name;
    if (kind === 'notifications' && !supported(kind)) return [isApple ? 'On iPhone and iPad, notifications need Momento on your Home Screen: tap Share, then Add to Home Screen, and open Momento from there.' : 'This browser can’t show notifications. Try Chrome, Edge, Firefox or Safari.'];
    if (isApple && isPhone) return [`Open the Settings app, then Safari (or the browser you use).`, `Find ${what} and choose Allow, or Ask.`, 'Come back to Momento and try again.'];
    if (isApple) return [`In Safari’s menu, choose Settings, then Websites.`, `Pick ${what} on the left and set hexarch.org to Allow.`, 'Reload Momento.'];
    return ['Tap the icon at the left of the address bar (the lock or the sliders).', `Open Site settings or Permissions, and set ${what} to Allow.`, 'Reload Momento.'];
  }

  // One popup, used for both "why we ask" and "how to allow it again"
  function sheet({ kind, blocked, from }) {
    return new Promise((resolve) => {
      const w = WHY[kind];
      const d = document.createElement('dialog');
      d.className = 'acct-dialog';
      d.setAttribute('aria-labelledby', 'permTitle');
      d.innerHTML = `
        <form class="acct-card" method="dialog">
          <button class="acct-x" type="button" aria-label="Close" data-close><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
          <span class="perm-ic">${ICONS[kind]}</span>
          <h2 id="permTitle">${blocked ? `${w.name} is turned off for Momento` : w.title}</h2>
          ${blocked
            ? `<p class="acct-sub">Your browser is blocking it, so Momento can’t ask again. To allow it:</p><ol class="perm-steps">${unblockSteps(kind).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`
            : `<p class="acct-sub">Momento uses it for:</p><ul class="perm-list">${w.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul><p class="acct-sub">Your ${kind === 'notifications' ? 'browser' : 'phone or browser'} will ask you next.</p>`}
          <div class="acct-actions">${blocked
            ? '<button class="acct-primary" type="button" data-close>OK</button>'
            : '<button class="acct-ghost" type="button" data-close>Not now</button><button class="acct-primary" type="button" data-allow>Continue</button>'}</div>
        </form>`;
      document.body.append(d);
      let answer = false;
      d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.close()));
      d.querySelector('[data-allow]')?.addEventListener('click', () => { answer = true; d.close(); });
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
      d.addEventListener('close', () => { d.remove(); from?.focus?.({ preventScroll: true }); resolve(answer); });
      d.showModal();
    });
  }

  // Momento.permission.request(kind, { from }): explains, then asks. Resolves true once allowed.
  async function request(kind, { from = null } = {}) {
    const now = await state(kind);
    if (now === 'granted') return true;
    if (now === 'denied' || now === 'unsupported') { await sheet({ kind, blocked: true, from }); return false; }
    if (!(await sheet({ kind, blocked: false, from }))) return false;
    const ok = await ask(kind);
    if (!ok && (await state(kind)) === 'denied') M.toast?.(`${WHY[kind].name} not allowed`, 'You can allow it any time in Settings.');
    return ok;
  }
  // Only explains when the browser would actually ask (used right before a feature needs it)
  async function ensure(kind, opts) {
    const now = await state(kind);
    if (now === 'granted' || now === 'unsupported') return true;
    return request(kind, opts);
  }
  M.permission = { state, request, ensure, supported, names: Object.fromEntries(Object.entries(WHY).map(([k, v]) => [k, v.name])) };

  // ---------- Log in when you act ----------
  // Visitors can look around without an account. The moment they act (join, upload, create, ...),
  // this asks them to log in or sign up, then brings them back to carry on: a join code is joined,
  // "Create an album" opens.
  const ASK = {
    join: ['Log in to join this album', 'It only takes a moment, and then the photos are yours to see and add to.'],
    create: ['Log in to create your album', 'It’s free. Your guests join with a code or QR code, no app needed.'],
    upload: ['Log in to add your photos', 'Your photos go straight into the album, in full quality.'],
    react: ['Log in to like and react', 'Show some love for the best photos.'],
    groups: ['Log in to see your groups', 'Share albums with the people you see most, in one place.'],
    joinGroup: ['Log in to join this group', 'It only takes a moment, and then you’ll see every album shared with the group.'],
    view: ['Log in to see the photos', 'Join the album to see everything everyone added.'],
    continue: ['Log in to continue', 'Log in or sign up. It only takes a moment.'],
  };
  // Where to come back to after logging in (the home page only sends people to My albums or Social)
  const here = () => {
    const page = location.pathname.split('/').pop() || 'index.html';
    return /^(albums|events)\.html$/.test(page) ? page + location.search + location.hash : 'albums.html';
  };
  let asking = false;
  M.needLogin = ({ action = 'continue', next, from = null, album = null } = {}) => {
    if (asking) return;
    asking = true;
    const [title, body] = ASK[action] || ASK.continue;
    const d = document.createElement('dialog');
    d.className = 'acct-dialog';
    d.setAttribute('aria-labelledby', 'needLoginTitle');
    d.innerHTML = `
      <div class="acct-card">
        <button class="acct-x" type="button" aria-label="Close" data-close><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        <div class="nl-album" hidden><span class="nl-cover" aria-hidden="true"></span><span class="nl-text"><b></b><small></small></span></div>
        <h2 id="needLoginTitle"></h2>
        <p class="acct-sub"></p>
        <div class="acct-actions nl-acts"><button class="acct-ghost" type="button" data-go="login">Log in</button><button class="acct-primary" type="button" data-go="signup">Sign up free</button></div>
      </div>`;
    d.querySelector('h2').textContent = title;
    d.querySelector('.acct-sub').textContent = body;
    if (album) {
      // What they're about to join, so it's worth the sign-up
      const box = d.querySelector('.nl-album');
      box.hidden = false;
      const cover = box.querySelector('.nl-cover'), pic = album.cover?.thumbUrl;
      // The host's cover when there is one, otherwise the album's first letter
      if (pic) { const img = new Image(); img.alt = ''; img.src = pic; img.onerror = () => { img.remove(); cover.textContent = (album.name || '·').trim()[0]?.toUpperCase() || '·'; }; cover.append(img); cover.classList.add('has-pic'); }
      else cover.textContent = (album.name || '·').trim()[0]?.toUpperCase() || '·';
      box.querySelector('b').textContent = album.name;
      const bits = [album.hostName && `Hosted by ${album.hostName}`, album.photos ? `${album.photos} photo${album.photos === 1 ? '' : 's'}` : 'No photos yet', album.guests ? `${album.guests} in it` : '', album.live ? 'Happening now' : ''];
      box.querySelector('small').textContent = bits.filter(Boolean).join(' · ');
    }
    document.body.append(d);
    d.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
      const to = next || here();
      location.href = `index.html?login=1${b.dataset.go === 'signup' ? '&signup=1' : ''}&next=${encodeURIComponent(to)}`;
    }));
    d.querySelector('[data-close]').addEventListener('click', () => d.close());
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    d.addEventListener('close', () => { asking = false; d.remove(); from?.focus?.({ preventScroll: true }); });
    d.showModal();
  };
  // A safety net: any action the server says needs an account opens the prompt (looking never does)
  const api = window.momentoApi;
  if (api) {
    window.momentoApi = async (path, opts = {}) => {
      try { return await api(path, opts); }
      catch (err) {
        if (err.code === 'login-required' && (opts.method || 'GET').toUpperCase() !== 'GET') M.needLogin({ action: err.action || 'continue' });
        throw err;
      }
    };
  }
  // "Create an album" when logged out: the prompt, then the form opens after logging in
  const signedIn = () => !!M.account?.get?.();
  const wrapCreate = () => {
    const make = M.createAlbum;
    if (!make || make.guarded) return;
    M.createAlbum = Object.assign((from, opts) => {
      if (signedIn()) return make(from, opts);
      const page = here().split(/[?#]/)[0];
      return M.needLogin({ action: 'create', from, next: `${page}?create=1` });
    }, { guarded: true, original: make });
  };
  async function afterLogin() {
    const q = new URLSearchParams(location.search);
    if (!q.has('create')) return;
    const user = await M.sessionReady?.catch?.(() => null);
    if (!user) return;
    q.delete('create');
    history.replaceState(null, '', location.pathname + (q.size ? '?' + q : '') + location.hash);
    // (straight to the form: the account was just confirmed above)
    (M.createAlbum?.original || M.createAlbum)?.();
  }

  // In the header, visitors get a "Log in" button (and come back to this page afterwards) instead of an
  // account button with nobody in it
  async function guestHeader() {
    const slot = document.querySelector('.me-slot[data-acct-always]');
    if (!slot) return;
    const user = await M.sessionReady?.catch?.(() => null);
    if (user || M.account?.get?.()) return;
    const link = document.createElement('a');
    link.className = 'btn btn-dark nl-login';
    link.href = 'index.html?login=1&next=' + encodeURIComponent(here());
    link.textContent = 'Log in';
    slot.replaceChildren(link);
    slot.hidden = false;
  }

  const go = () => { wrapCreate(); afterLogin(); guestHeader(); start(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
