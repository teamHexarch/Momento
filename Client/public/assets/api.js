// Where the Momento API lives, and one way to call it.
// - Live site (hexarch.org): the API is on its own address, api.hexarch.org.
// - Locally through the Momento server (localhost:4000): same address, so no prefix.
// - Locally through serve.mjs (localhost:3000): the API is the Momento server on port 4000.
// Clickjacking guard: Momento's pages may only be shown inside a frame by Momento itself (the album window on
// Social is one). Put in a frame by another site, the page stays blank, so it can't be used to trick people
// into clicking (GitHub Pages can't send the X-Frame-Options / frame-ancestors headers that would do this).
(() => {
  if (window.top === window.self) return;
  let ours = false;
  try { ours = window.top.location.origin === location.origin; } catch { /* another site: can't even read it */ }
  if (ours) return;
  document.documentElement.style.setProperty('visibility', 'hidden', 'important');
  try { window.top.location.replace(location.href); } catch { /* browsers may block this; the page stays blank */ }
})();

// Page-to-page transitions (glass.css @view-transition): when one is skipped (a second click, a hidden tab, the
// page already revealed) the browser rejects its promises, which shows up as an uncaught console error. The page
// itself is fine, so those rejections are caught here. This file loads in <head>, early enough for pagereveal.
for (const type of ['pageswap', 'pagereveal']) {
  addEventListener(type, (e) => {
    const vt = e.viewTransition;
    if (!vt) return;
    // Arriving through the page-to-page motion: the whole page already rises in, so the big title doesn't
    // rise a second time on its own (glass.css, :root.vt-in)
    if (type === 'pagereveal') document.documentElement.classList.add('vt-in');
    vt.ready?.catch(() => {});
    vt.finished?.catch(() => {});
    vt.updateCallbackDone?.catch(() => {});
  });
}

(() => {
  const self = document.currentScript;
  // A page opened straight from the folder (file://) counts as local too, so double-clicking
  // albums.html shows the sample albums
  const local = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  window.MOMENTO_API = !local ? 'https://api.hexarch.org' : location.port === '4000' ? '' : 'http://localhost:4000';
  // The Terms and Privacy Policy version people agree to (the Privacy Policy's "Last updated" date): sign-up and Google
  // send it (components/home/authLogic.ts), and agreeing to upload to an album is remembered against it (assets/event.js)
  window.MOMENTO_TERMS_VERSION = '2026-11-07';
  // fetch, aimed at the API and carrying the login cookie (needed when the API is another address)
  window.momentoFetch = (path, opts = {}) => fetch(window.MOMENTO_API + path, { credentials: 'include', ...opts });
  window.momentoApi = async (path, opts = {}) => {
    let response;
    try { response = await window.momentoFetch(path, opts); }
    catch (err) {
      // No answer at all (server not running, offline, blocked): say so in plain words, not "Failed to fetch"
      if (err.name === 'AbortError') throw err;
      const error = new Error(local
        ? 'Can’t reach the Momento server on this computer. Start it (in Server: npm run dev), or add ?dev to the address to try the site with sample albums.'
        : 'Can’t reach Momento right now. Check your internet connection and try again.');
      error.status = 0;
      error.code = 'offline';
      throw error;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // The server writes its messages in English: shown in the page's language (assets/i18n.js; the English stays
      // in error.serverMessage, with error.code for code that needs to tell errors apart)
      const said = data.error || 'The request failed. Please try again.';
      const error = new Error(window.Momento?.i18n?.t ? window.Momento.i18n.t(said) : said);
      error.serverMessage = said;
      error.status = response.status;
      error.code = data.code;
      if (data.code === 'session_limit' || data.code === 'SESSION_LIMIT_REACHED') { error.challenge = data.challenge; error.devices = data.devices; error.pendingLoginToken = data.pendingLoginToken; }
      error.retryAt = data.retryAt;
      throw error;
    }
    return data;
  };
  window.momentoJson = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  // The notifications bell (assets/inbox.js) only appears once the server has answered, which pushed the
  // header sideways a moment after a reload. When it was beside the account chip earlier in this tab, its
  // place is held from the first paint instead (glass.css, .bell-ready)
  try {
    if (sessionStorage.getItem('momento-account') && sessionStorage.getItem('momento-bell') === '1') document.documentElement.classList.add('bell-ready');
  } catch (e) {}

  // Dev preview: assets/devpreview.js answers the API calls with sample albums and photos, so every
  // page works with no server. It's on by default for the local preview (node serve.mjs, port 3000),
  // on this computer or a phone on the same Wi-Fi. ?dev=off turns it off, ?dev turns it back on,
  // ?dev=reset starts the sample data again. The integrated local server always uses the real API.
  if (location.port === '4000') return;
  try {
    const lan = local || /^(192\.168|10)\.\d+\.\d+(\.\d+)?$|^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$|\.local$/.test(location.hostname);
    const q = new URLSearchParams(location.search).get('dev');
    if (lan && q !== null) localStorage.setItem('momento-dev', q === 'off' ? '0' : '1');
    const saved = localStorage.getItem('momento-dev');
    const on = saved === '1' || (saved !== '0' && location.port !== '4000');
    if (lan && on && self && self.src) {
      document.write('<script src="' + self.src.replace(/api\.js(\?.*)?$/, 'devpreview.js') + '"><\/script>');
    }
  } catch (e) {}
})();
