import util from 'node:util';

// Every server log line goes through here (console.log / info / warn / error are wrapped once, on
// start-up), so passwords, tokens, keys and email addresses never end up in logs, whichever code
// wrote the line. The one exception: on a developer's PC without email set up, the "[email not set up]"
// lines keep their links, because that's how confirm and reset links reach the developer.

const isProduction = process.env.NODE_ENV === 'production';

const RULES = [
  // JSON or query-style secrets: "password":"…", password=…, token=…, secret, apiKey, authorization
  [/((?:^|[\s{,?&"'])"?(?:password|newPassword|newPasswordAgain|currentPassword|passwordHash|token|ticket|code|secret|apiKey|api_key|authorization|cookie|captchaToken)"?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,&;}:][^\s,&;}]*)/gi, '$1[redacted]'],
  // Signed login tokens (JWT)
  [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, '[jwt]'],
  // AWS access keys
  [/\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, '[aws-key]'],
  // Private keys
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[private-key]'],
  // Long random strings (tokens in links, secrets): 32+ letters/digits/-/_ with both letters and digits.
  // UUIDs (request IDs, storage keys) aren't secrets, so they stay readable.
  [/\b(?=[\w-]*\d)(?=[\w-]*[A-Za-z])[\w-]{32,}\b/g, (m) => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(m) ? m : '[secret]')],
  // Email addresses: first letter and domain only
  [/\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, '$1***@$2'],
];

export function redact(text) {
  let s = String(text);
  for (const [re, to] of RULES) s = s.replace(re, to);
  return s;
}

const devLink = (s) => !isProduction && /^\[email not set up\]/.test(s);

let installed = false;
export function installLogRedaction() {
  if (installed) return;
  installed = true;
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      const line = util.format(...args);
      original(devLink(line) ? line : redact(line));
    };
  }
}
