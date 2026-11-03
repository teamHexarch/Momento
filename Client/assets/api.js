// Where the Momento API lives, and one way to call it.
// - Live site (hexarch.org): the API is on its own address, api.hexarch.org.
// - Locally through the Momento server (localhost:4000): same address, so no prefix.
// - Locally through serve.mjs (localhost:3000): the API is the Momento server on port 4000.
(() => {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  window.MOMENTO_API = !local ? 'https://api.hexarch.org' : location.port === '4000' ? '' : 'http://localhost:4000';
  // fetch, aimed at the API and carrying the login cookie (needed when the API is another address)
  window.momentoFetch = (path, opts = {}) => fetch(window.MOMENTO_API + path, { credentials: 'include', ...opts });
  window.momentoApi = async (path, opts = {}) => {
    const response = await window.momentoFetch(path, opts);
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
})();
