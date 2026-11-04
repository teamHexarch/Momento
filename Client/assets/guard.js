// Loaded on every page, right after api.js.
// 1. Photos can't be saved with "Save image as…", copied from the right-click menu, dragged out
//    of the page or long-pressed to save on phones. (Anyone determined can still take a
//    screenshot; the album's own Download buttons are the intended way to keep photos.)
// 2. Anyone signed in whose email isn't confirmed yet gets a popup that can't be dismissed, and the
//    page behind it can't be used, until they confirm. The server refuses albums and photos to
//    them as well, so this is the friendly face of a rule that's enforced there.
(() => {
  // ---- 1. Photo protection ----
  const css = document.createElement('style');
  css.textContent = `
    img { -webkit-user-drag: none; -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
  `;
  document.head.append(css);
  // Whether a pointer event landed on (or on something drawn over) an image
  const overImage = (e) => {
    if (e.target?.closest?.('img, picture, canvas')) return true;
    if (typeof e.clientX !== 'number') return false;
    return document.elementsFromPoint(e.clientX, e.clientY).some((el) => el.matches('img, picture, canvas'));
  };
  document.addEventListener('contextmenu', (e) => { if (overImage(e)) e.preventDefault(); }, true);
  document.addEventListener('dragstart', (e) => { if (e.target?.closest?.('img, picture, canvas')) e.preventDefault(); }, true);
  document.addEventListener('copy', (e) => {
    const sel = getSelection();
    if (!sel || !sel.rangeCount) return;
    const frag = sel.getRangeAt(0).cloneContents();
    if (frag.querySelector?.('img, picture, canvas')) e.preventDefault();
  }, true);

  // ---- 2. Email confirmation gate ----
  const fetchUser = () => window.momentoApi('/api/auth/me').then((r) => r.user).catch(() => null);
  const GATE_CSS = `
    .vgate { border: none; padding: 0; background: transparent; max-width: calc(100vw - 32px); width: 440px; color: var(--dusk, #2E2C3A); }
    .vgate::backdrop { background: rgba(26, 24, 34, .55); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
    .vgate-card { box-sizing: border-box; padding: 2rem 1.75rem 1.5rem; border-radius: 28px; background: var(--paper, #FBF8F3);
      box-shadow: 0 1px 2px rgba(46, 44, 58, .08), 0 24px 60px -12px rgba(46, 44, 58, .35); text-align: center; font-family: var(--font-main, system-ui, sans-serif); }
    .vgate-ic { display: grid; place-items: center; width: 64px; height: 64px; margin: 0 auto 1rem; border-radius: 50%; background: rgba(46, 44, 58, .07); }
    .vgate h2 { margin: 0 0 .5rem; font-size: 1.5rem; letter-spacing: -.02em; }
    .vgate p { margin: 0 0 1.25rem; line-height: 1.6; color: var(--slate, #5D5A6B); }
    .vgate p b { color: inherit; color: var(--dusk, #2E2C3A); word-break: break-all; }
    .vgate-status { min-height: 1.4em; margin: -.5rem 0 1rem !important; font-size: .9rem; }
    .vgate-status.is-error { color: #9A3D3D; }
    .vgate-actions { display: flex; flex-direction: column; gap: .6rem; }
    .vgate button { padding: .85rem 1.2rem; border: none; border-radius: 100px; font: 650 .95rem var(--font-main, system-ui, sans-serif); cursor: pointer;
      transition: transform .3s cubic-bezier(.34, 1.56, .64, 1), opacity .2s ease; }
    .vgate button:active { transform: scale(.97); }
    .vgate button:focus-visible { outline: 2px solid var(--dusk, #2E2C3A); outline-offset: 2px; }
    .vgate button:disabled { opacity: .55; cursor: default; transform: none; }
    .vgate-primary { background: var(--dusk, #2E2C3A); color: var(--paper, #FBF8F3); }
    .vgate-ghost { background: rgba(46, 44, 58, .07); color: inherit; }
    .vgate-link { background: none !important; color: var(--slate, #5D5A6B) !important; font-weight: 600 !important; }
    .vgate-ghost:hover { background: rgba(46, 44, 58, .12); }
    :root[data-theme="dark"] .vgate { color: #F3F0EA; }
    :root[data-theme="dark"] .vgate-card { background: #24222D; }
    :root[data-theme="dark"] .vgate p, :root[data-theme="dark"] .vgate-link { color: #B9B5C6 !important; }
    :root[data-theme="dark"] .vgate p b { color: #F3F0EA; }
    :root[data-theme="dark"] .vgate-primary { background: #F3F0EA; color: #24222D; }
    :root[data-theme="dark"] .vgate-ghost, :root[data-theme="dark"] .vgate-ic { background: rgba(255, 255, 255, .09); }
  `;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let gate = null;
  function showGate(user) {
    if (gate) return;
    const style = document.createElement('style'); style.textContent = GATE_CSS; document.head.append(style);
    gate = document.createElement('dialog');
    gate.className = 'vgate';
    gate.setAttribute('aria-labelledby', 'vgateTitle');
    gate.innerHTML = `
      <div class="vgate-card">
        <div class="vgate-ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/></svg></div>
        <h2 id="vgateTitle">Confirm your email</h2>
        <p>We sent a link to <b>${esc(user.email)}</b>. Open it to start using Momento. Can’t find it? Check your spam folder or send a new one.</p>
        <p class="vgate-status" role="status"></p>
        <div class="vgate-actions">
          <button class="vgate-primary" type="button" data-check>I’ve confirmed it</button>
          <button class="vgate-ghost" type="button" data-resend>Send a new link</button>
          <button class="vgate-link" type="button" data-logout>Log out</button>
        </div>
      </div>`;
    document.body.append(gate);
    // Nothing behind the popup can be clicked, focused or read out
    const lockPage = () => [...document.body.children].forEach((el) => { if (el !== gate) el.inert = true; });
    lockPage();
    new MutationObserver(lockPage).observe(document.body, { childList: true });
    document.documentElement.classList.remove('has-cursor');
    // Escape doesn't close it (and if the browser closes it anyway, it comes straight back)
    gate.addEventListener('cancel', (e) => e.preventDefault());
    gate.addEventListener('keydown', (e) => { if (e.key === 'Escape') e.preventDefault(); });
    gate.addEventListener('close', () => { if (gate.isConnected) gate.showModal(); });
    gate.showModal();

    const status = gate.querySelector('.vgate-status');
    const say = (msg, error = false) => { status.textContent = msg; status.classList.toggle('is-error', error); };
    const resend = gate.querySelector('[data-resend]'), check = gate.querySelector('[data-check]');
    let retryAt = new Date(user.verificationResendAt || 0).getTime(), sending = false;
    const tick = () => {
      const s = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      resend.disabled = sending || s > 0;
      resend.textContent = sending ? 'Sending…' : s > 0 ? `Send a new link in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'Send a new link';
    };
    tick(); setInterval(tick, 1000);
    resend.addEventListener('click', async () => {
      sending = true; tick();
      try {
        const r = await window.momentoApi('/api/auth/verify-email/resend', { method: 'POST' });
        retryAt = new Date(r.retryAt).getTime();
        say(r.sent ? 'New link sent. Check your inbox and spam folder.' : 'Email isn’t set up on this server: the link is in the server log.');
      } catch (err) {
        if (err.retryAt) retryAt = new Date(err.retryAt).getTime();
        say(err.message, true);
      } finally { sending = false; tick(); }
    });
    const recheck = async (quiet) => {
      const u = await fetchUser();
      if (!u) { location.href = 'index.html?login=1'; return; }
      if (u.emailVerified) { location.reload(); return; }
      if (!quiet) say('Not confirmed yet. Open the link in the email we sent, then try again.', true);
    };
    check.addEventListener('click', async () => { check.disabled = true; try { await recheck(false); } finally { check.disabled = false; } });
    // Confirmed in another tab? Unlock as soon as they come back to this one
    document.addEventListener('visibilitychange', () => { if (!document.hidden) recheck(true); });
    gate.querySelector('[data-logout]').addEventListener('click', async () => {
      try { await window.momentoApi('/api/auth/logout', { method: 'POST' }); } catch (e) {}
      try { sessionStorage.removeItem('momento-account'); sessionStorage.removeItem('momento-user'); } catch (e) {}
      location.href = 'index.html';
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    let user;
    try { user = await (window.Momento?.sessionReady || fetchUser()); } catch (e) { user = null; }
    if (user && !user.emailVerified) showGate(user);
  });
})();
