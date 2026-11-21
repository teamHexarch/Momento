// "Join an album" on My albums: the same code window as on the Social page, but the joined album opens
// right here in My albums instead of sending you to Social. A scanned QR code joins here too.
// Uses assets/join-here.css. The Social page has its own copy (assets/event-albums.js).
(() => {
  const Momento = (window.Momento ||= {});
  const box = (n) => `<input type="text" inputmode="text" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="•" aria-label="Character ${n} of 7">`;
  let d = null, form, otp, boxes, hidden, note, restoreCursor = false;
  const CODE_CHAR = /[^A-Z0-9]/g;

  function build() {
    d = document.createElement('dialog');
    d.className = 'modal'; d.id = 'joinModal'; d.setAttribute('aria-labelledby', 'joinTitle');
    d.innerHTML = `
      <form class="modal-card small" id="joinForm" novalidate>
        <button class="close" type="button" data-close aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        <h2 id="joinTitle" style="padding-right: 2.5rem">Join an album</h2>
        <p class="modal-sub">Enter the 7-character code the host shared with you.</p>
        <div class="field"><span id="joinCodeLabel">Album code</span>
          <div class="otp" id="joinOtp" role="group" aria-labelledby="joinCodeLabel">${box(1)}${box(2)}${box(3)}<span class="otp-dash" aria-hidden="true"></span>${box(4)}${box(5)}${box(6)}${box(7)}</div>
          <input type="hidden" name="code" id="joinCode">
        </div>
        <p class="note" id="joinNote" role="status"></p>
        <div class="modal-actions"><button class="btn btn-dark" type="submit" style="width: 100%">Join album</button></div>
        <button class="join-scan" type="button" id="joinScan">Or scan the host’s QR code</button>
      </form>`;
    document.body.append(d);
    form = d.querySelector('form'); otp = d.querySelector('.otp'); boxes = [...otp.querySelectorAll('input')];
    hidden = d.querySelector('#joinCode'); note = d.querySelector('#joinNote');
    const close = () => d.close();
    d.querySelector('[data-close]').addEventListener('click', close);
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    d.addEventListener('pointerdown', (e) => { d._downOutside = e.target === d; });
    d.addEventListener('click', (e) => { if (e.target === d && d._downOutside) close(); });
    d.addEventListener('close', () => { document.documentElement.classList.toggle('has-cursor', restoreCursor); });
    d.querySelector('#joinScan').addEventListener('click', () => { close(); Momento.qr?.scan(document.activeElement); });
    boxes.forEach((b, i) => {
      b.addEventListener('focus', () => b.select());
      b.addEventListener('input', () => { const v = b.value; b.value = ''; fillFrom(i, v); });
      b.addEventListener('paste', (e) => { e.preventDefault(); fillFrom(i, e.clipboardData?.getData('text') || ''); });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !b.value && i > 0) { e.preventDefault(); boxes[i - 1].value = ''; boxes[i - 1].focus(); sync(); }
        else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); boxes[i - 1].focus(); }
        else if (e.key === 'ArrowRight' && i < boxes.length - 1) { e.preventDefault(); boxes[i + 1].focus(); }
      });
    });
    form.addEventListener('submit', submit);
  }
  function sync() {
    const chars = boxes.map((b) => b.value).join('');
    hidden.value = chars.length > 3 ? chars.slice(0, 3) + '-' + chars.slice(3) : chars;
    boxes.forEach((b) => b.classList.toggle('is-filled', !!b.value));
    otp.classList.remove('is-error');
    return chars;
  }
  function setCode(code) {
    const chars = String(code || '').toUpperCase().replace(CODE_CHAR, '').slice(0, 7);
    boxes.forEach((b, i) => { b.value = chars[i] || ''; });
    sync();
  }
  const focusFirstEmpty = () => (boxes.find((b) => !b.value) || boxes[boxes.length - 1]).focus();
  function fillFrom(i, text) {
    const chars = text.toUpperCase().replace(CODE_CHAR, '');
    if (!chars) { sync(); return; }
    for (let k = 0; k < chars.length && i + k < boxes.length; k++) boxes[i + k].value = chars[k];
    const full = sync().length === 7;
    boxes[Math.min(i + chars.length, boxes.length - 1)].focus();
    if (full && i + chars.length >= 7) form.requestSubmit();
  }
  function wrong(message) {
    note.classList.add('error'); note.textContent = message;
    otp.classList.add('is-error'); otp.classList.remove('is-shake'); void otp.offsetWidth; otp.classList.add('is-shake');
  }
  function open(code = '') {
    if (!d) build();
    setCode(code); note.textContent = ''; note.classList.remove('error');
    if (!d.open) {
      restoreCursor = document.documentElement.classList.contains('has-cursor');
      document.documentElement.classList.remove('has-cursor');
      d.showModal();
    }
    focusFirstEmpty();
  }
  // Joining an event may need a location check first: asked for only when the server says so
  async function admit(code) {
    try { return await momentoApi('/api/albums/join', momentoJson('POST', { code })); }
    catch (err) { if (err.code !== 'check-location') throw err; }
    let location = null;
    try { if (!Momento.permission || await Momento.permission.ensure('location')) location = await Momento.event?.locate(); } catch {}
    return momentoApi('/api/albums/join', momentoJson('POST', { code, location }));
  }
  async function submit(e) {
    e.preventDefault();
    const code = hidden.value.trim().toUpperCase().replace(/\s/g, '');
    if (!/^[A-Z0-9]{3}-?[A-Z0-9]{4}$/.test(code)) { wrong('Codes are 7 letters and numbers, like K7Q-48DM.'); focusFirstEmpty(); return; }
    note.classList.remove('error');
    const button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    button.disabled = true;
    try {
      // Not logged in: the Social page shows what the album is and asks to log in
      if (!(await Momento.sessionReady?.catch?.(() => null))) { location.href = 'events.html?join=' + encodeURIComponent(code); return; }
      const { album, pending } = await admit(code);
      if (pending) { note.textContent = 'Your request is waiting for the host. It shows in My albums once they let you in.'; return; }
      d.close();
      Momento.toast?.('You’re in', album?.name ? `Opening ${album.name}.` : 'Opening the album.');
      // My albums reloads its list and opens the album right here
      document.dispatchEvent(new CustomEvent('momento:open-album', { detail: album.id }));
    } catch (err) { wrong(err.message); }
    finally { button.disabled = false; }
  }
  Momento.openJoin = (code) => open(code);
  // A QR code scanned on this page joins here too
  Momento.joinFromQr = (code) => {
    if (!/^[A-Z0-9]{3}-?[A-Z0-9]{4}$/i.test(code)) { open(); wrong('This code isn’t right. Enter the code from your host.'); return; }
    open(code); form.requestSubmit();
  };
  // The "Join an album" buttons and links on this page open the window instead of going to Social
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !/\/events\.html$/.test(url.pathname) || url.hash !== '#join') return;
    e.preventDefault();
    open();
  }, true);
})();
