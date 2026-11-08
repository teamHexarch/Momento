// Where the Momento API lives, and one way to call it.
// - Live site (hexarch.org): the API is on its own address, api.hexarch.org.
// - Locally through the Momento server (localhost:4000): same address, so no prefix.
// - Locally through serve.mjs (localhost:3000): the API is the Momento server on port 4000.
(() => {
  const self = document.currentScript;
  // A page opened straight from the folder (file://) counts as local too, so double-clicking
  // albums.html shows the sample albums
  const local = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  window.MOMENTO_API = !local ? 'https://api.hexarch.org' : location.port === '4000' ? '' : 'http://localhost:4000';
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
      const error = new Error(data.error || 'The request failed. Please try again.');
      error.status = response.status;
      error.code = data.code;
      error.retryAt = data.retryAt;
      throw error;
    }
    return data;
  };
  window.momentoJson = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  // Dev preview: assets/devpreview.js answers the API calls with sample albums and photos, so every
  // page works with no server. It's on by default for the local preview (node serve.mjs, port 3000),
  // on this computer or a phone on the same Wi-Fi. ?dev=off turns it off, ?dev turns it back on,
  // ?dev=reset starts the sample data again. Through the real server (port 4000) it's off unless ?dev
  // is used, and it is never active on the live site.
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
