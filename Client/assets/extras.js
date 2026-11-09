// Small things every page shares, loaded after the page's own scripts are parsed:
// - Show/hide on every password field (an eye button inside the field)
// - Momento.permission: asks for the camera, location or notifications the way an app does: it
//   says why first, then the browser asks; if it was blocked, it says how to allow it again
// - Group chat notifications: a count on the Groups link, a pop-up for new messages, and a
//   phone/computer notification when Momento is in the background (if allowed)
(function () {
  const M = (window.Momento ||= {});
  const SETTINGS = 'momento-settings';
  const readSettings = () => { try { return JSON.parse(localStorage.getItem(SETTINGS) || '{}') || {}; } catch (e) { return {}; } };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Styles for the pieces below ----------
  const css = document.createElement('style');
  css.textContent = `
    .pw-wrap { position: relative; display: block; }
    .pw-wrap > input { width: 100%; box-sizing: border-box; padding-right: 3rem !important; }
    .pw-eye {
      position: absolute; right: .35rem; top: 50%; translate: 0 -50%; display: grid; place-items: center; width: 2.3rem; height: 2.3rem;
      border: none; border-radius: 50%; background: none; color: var(--stone, #8A869A); cursor: pointer;
      transition: background-color .2s ease, color .2s ease, scale .3s cubic-bezier(.34, 1.4, .64, 1);
    }
    .pw-eye:hover { background: rgba(46, 44, 58, .07); color: var(--dusk, #2E2C3A); }
    .pw-eye:active { scale: .9; }
    .pw-eye:focus-visible { outline: 2px solid var(--dusk, #2E2C3A); outline-offset: 1px; }
    .pw-eye svg { width: 1.2rem; height: 1.2rem; }
    .pw-eye .slash { stroke-dasharray: 26; stroke-dashoffset: 26; transition: stroke-dashoffset .3s ease; }
    .pw-eye[aria-pressed="false"] .slash { stroke-dashoffset: 0; }
    :root[data-theme="dark"] .pw-eye:hover { background: rgba(255, 255, 255, .1); }

    .perm-ic { display: grid; place-items: center; width: 3.2rem; height: 3.2rem; margin-bottom: .8rem; border-radius: 1rem; background: linear-gradient(135deg, #D9D0EE, #EDD6DF 55%, #CFE3E0); color: #2E2C3A; }
    .perm-ic svg { width: 1.6rem; height: 1.6rem; }
    .perm-list { margin: .2rem 0 1rem; padding: 0; list-style: none; display: grid; gap: .45rem; }
    .perm-list li { display: flex; gap: .55rem; align-items: flex-start; font-size: .92rem; line-height: 1.45; color: var(--slate, #5C596B); }
    .perm-list li::before { content: ""; flex: none; width: .45rem; height: .45rem; margin-top: .45rem; border-radius: 50%; background: var(--copper, #9A603D); }
    .perm-steps { margin: 0 0 1rem; padding-left: 1.2rem; font-size: .92rem; line-height: 1.55; color: var(--slate, #5C596B); }

    .nav-groups { position: relative; }
    .nav-badge {
      position: absolute; top: -.15rem; right: -.2rem; min-width: 1.1rem; height: 1.1rem; padding: 0 .3rem; box-sizing: border-box; border-radius: .6rem;
      background: #C8553D; color: #fff; font: 700 .66rem/1.1rem var(--font-main, system-ui); text-align: center; box-shadow: 0 0 0 2px var(--paper, #F8F7FA);
      pointer-events: none;
    }
    .nav-badge.pop { animation: nav-badge-pop .5s cubic-bezier(.34, 1.6, .64, 1); }
    @keyframes nav-badge-pop { from { scale: .2; } to { scale: 1; } }
    :root[data-theme="dark"] .nav-badge { box-shadow: 0 0 0 2px #1D1B28; }
    .chat-toast-av { display: grid; place-items: center; width: 100%; height: 100%; border-radius: 50%; overflow: hidden; background: #D9D0EA; color: #2E2C3A; font-size: .7rem; font-weight: 700; }
    .chat-toast-av img { width: 100%; height: 100%; object-fit: cover; }
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
    .acct-photo-btn { padding: .45rem .9rem; border: none; border-radius: 100px; background: rgba(46, 44, 58, .08); color: var(--dusk, #2E2C3A); font: 600 .84rem var(--font-main, system-ui); cursor: pointer;
      transition: background-color .2s ease, scale .3s cubic-bezier(.34, 1.4, .64, 1); }
    .acct-photo-btn:hover { background: rgba(46, 44, 58, .14); }
    .acct-photo-btn:active { scale: .95; }
    .acct-photo-btn:focus-visible { outline: 2px solid var(--dusk, #2E2C3A); outline-offset: 2px; }
    .acct-photo-btn:disabled { opacity: .5; cursor: default; }
    .acct-photo-btn.is-danger { background: none; color: #9A3D3D; }
    .acct-photo-btn.is-danger:hover { background: rgba(154, 61, 61, .08); }
    .acct-photo-btn[hidden] { display: none; }
    :root[data-theme="dark"] .acct-photo { background: rgba(255, 255, 255, .05); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1); }
    :root[data-theme="dark"] .acct-photo-btn { background: rgba(255, 255, 255, .1); }
    :root[data-theme="dark"] .acct-photo-btn:hover { background: rgba(255, 255, 255, .16); }
    :root[data-theme="dark"] .acct-photo-btn.is-danger { background: none; color: #F0A3A3; }
    @media (prefers-reduced-motion: reduce) { .nav-badge.pop { animation: none; } .pw-eye .slash { transition: none; } .acct-photo-av.is-busy::after { animation-duration: 3s; } }
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
    notifications: { title: 'Turn on notifications', name: 'Notifications', points: ['New messages in your friend groups’ chats', 'Public events starting near you, if you turn that on', 'You can turn them off any time in Settings'] },
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

  // ---------- Group chat notifications ----------
  const SEEN = 'momento-chat-seen';
  let lastTotal = -1, polling = false;
  const seen = () => { try { return JSON.parse(localStorage.getItem(SEEN) || '{}') || {}; } catch (e) { return {}; } };
  const remember = (map) => { try { localStorage.setItem(SEEN, JSON.stringify(map)); } catch (e) {} };
  const chatNotifyOn = () => readSettings().chatNotify !== false;
  const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  function badge(total) {
    document.querySelectorAll('.nav-groups').forEach((link) => {
      let b = link.querySelector('.nav-badge');
      if (!total) { b?.remove(); link.removeAttribute('data-unread'); return; }
      if (!b) { b = document.createElement('span'); b.className = 'nav-badge'; b.setAttribute('aria-hidden', 'true'); link.append(b); }
      const text = total > 99 ? '99+' : String(total);
      if (b.textContent !== text) { b.textContent = text; b.classList.remove('pop'); void b.offsetWidth; if (!still) b.classList.add('pop'); }
      link.setAttribute('aria-label', `Friend groups, ${total} unread ${total === 1 ? 'message' : 'messages'}`);
    });
  }

  async function poll() {
    if (polling || !window.momentoApi) return;
    polling = true;
    try {
      const user = await M.sessionReady?.catch?.(() => null);
      if (!user?.emailVerified) return;
      const { total = 0, groups = [] } = await momentoApi('/api/groups/unread');
      badge(total);
      const map = seen(), first = lastTotal < 0;
      lastTotal = total;
      for (const g of groups) {
        const m = g.latest;
        if (!m || map[g.id] === m.id) continue;
        map[g.id] = m.id;
        // The Groups page shows it in the open chat itself
        if (first || !chatNotifyOn() || document.querySelector(`.grc[data-id="${CSS.escape(g.id)}"] .grc-chat[open]`)) continue;
        const go = () => { location.href = 'groups.html#chat=' + encodeURIComponent(g.id); };
        const av = m.avatarUrl ? `<img src="${esc(m.avatarUrl)}" alt="">` : esc(initials(m.by));
        M.toast?.(`${m.by} in ${g.name}`, m.text.length > 90 ? m.text.slice(0, 88) + '…' : m.text, { action: { label: 'Open chat', run: go } });
        // The sender's photo (or initials) in place of the tick
        const ic = document.querySelector('.m-toast .m-toast-ic');
        if (ic) ic.innerHTML = `<span class="chat-toast-av">${av}</span>`;
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          try {
            const n = new Notification(`${m.by} in ${g.name}`, { body: m.text, tag: 'momento-chat-' + g.id, icon: m.avatarUrl || 'assets/momento-icon.png' });
            n.onclick = () => { window.focus(); go(); n.close(); };
          } catch (e) {}
        }
      }
      remember(map);
    } catch (e) {
      // Offline or logged out: try again next time
    } finally { polling = false; }
  }
  M.chatPoll = poll;
  M.chatSeen = (groupId, messageId) => { const map = seen(); map[groupId] = messageId; remember(map); };

  const go = () => {
    start();
    poll();
    let t = 0;
    const next = () => { clearTimeout(t); t = setTimeout(() => { poll(); next(); }, document.hidden ? 60000 : 15000); };
    next();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); next(); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
