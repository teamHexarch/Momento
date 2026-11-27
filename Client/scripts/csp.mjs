// The website's Content-Security-Policy: what each page may load, run, connect to and show. GitHub Pages can't send
// headers, so it goes in a <meta> tag at the top of every page in out/ (added by finish-export.mjs after each build).
//
// Scripts: only from this site and the services listed below, plus the inline scripts each page actually has, by
// their SHA-256 hash (worked out from the built files every time, so a script that isn't in the page can't run).
// No 'unsafe-inline' and no 'unsafe-eval' for scripts. Styles keep 'unsafe-inline' (the pages and their scripts set
// style attributes everywhere); styles can't run code.
//
// When the site starts using something new from another address (a script, an API, images, a frame), add it here,
// or the browser will block it. To check: open the page with DevTools' Console showing; a block says
// "Refused to ... because it violates the following Content Security Policy directive".
import crypto from 'node:crypto';

// Where the API is: the live one, and this computer (the local preview and the smoke test use :4000)
const API = ['https://api.hexarch.org', 'http://localhost:4000'];
// Photos and downloads: the API sends signed links to the photo storage (Amazon S3, or a CloudFront domain)
const PHOTO_STORAGE = ['https://*.amazonaws.com', 'https://*.cloudfront.net', 'https://*.hexarch.org'];
// Google: Maps (the venue search, when the server has a Maps key), sign-in with Google, and reCAPTCHA at sign-up.
// The Maps entries are Google's own list for an allowlist policy (developers.google.com/maps/documentation/javascript/content-security-policy)
const GOOGLE_MAPS = ['https://*.googleapis.com', 'https://*.gstatic.com', 'https://*.google.com', 'https://*.ggpht.com', 'https://*.googleusercontent.com'];
const GOOGLE_SIGN_IN = ['https://accounts.google.com/gsi/'];
const RECAPTCHA = ['https://www.google.com/recaptcha/', 'https://www.gstatic.com/recaptcha/', 'https://recaptcha.google.com/recaptcha/'];
// The Events globe: MapLibre (one pinned version, also checked by its hash in the page), the satellite and place
// tiles (Esri), the town search (Photon) and a rough location from the IP address (GeoJS)
const GLOBE_SCRIPT = ['https://unpkg.com/maplibre-gl@5.24.0/'];
const GLOBE_DATA = ['https://server.arcgisonline.com', 'https://photon.komoot.io', 'https://get.geojs.io'];

export function policy(inlineHashes = []) {
  const d = {
    'default-src': ["'self'"],
    'script-src': ["'self'", ...inlineHashes.map((h) => `'sha256-${h}'`), ...GLOBE_SCRIPT, ...GOOGLE_MAPS, ...GOOGLE_SIGN_IN, ...RECAPTCHA, 'blob:'],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', ...GOOGLE_SIGN_IN],
    'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
    'img-src': ["'self'", 'data:', 'blob:', ...API, ...PHOTO_STORAGE, ...GLOBE_DATA, ...GOOGLE_MAPS],
    'media-src': ["'self'", 'data:', 'blob:', ...API, ...PHOTO_STORAGE],
    'connect-src': ["'self'", 'data:', 'blob:', ...API, ...PHOTO_STORAGE, ...GLOBE_DATA, ...GOOGLE_MAPS, ...GOOGLE_SIGN_IN],
    'frame-src': ["'self'", ...GOOGLE_SIGN_IN, ...RECAPTCHA, 'https://*.google.com'],
    'worker-src': ["'self'", 'blob:'],
    'child-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    // (the album page adds <base target="_top"> when it's shown inside another Momento page; it has no address)
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };
  return Object.entries(d).map(([k, v]) => `${k} ${[...new Set(v)].join(' ')}`).join('; ');
}

// The SHA-256 of every inline <script> in a page: the text between the tags, as the browser reads it (the HTML parser
// turns Windows line endings into plain ones first, so a file saved with CRLF must be hashed the same way)
export function inlineScriptHashes(html) {
  const hashes = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(m[1]) || !m[2]) continue;
    const text = m[2].replace(/\r\n?/g, '\n');
    hashes.push(crypto.createHash('sha256').update(text, 'utf8').digest('base64'));
  }
  return [...new Set(hashes)];
}

// The page with its policy: a <meta> right at the start of <head> (after the character set), before any script
export function withPolicy(html) {
  if (/http-equiv=["']Content-Security-Policy["']/i.test(html)) html = html.replace(/<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/i, '');
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy(inlineScriptHashes(html)).replace(/"/g, '&quot;')}">`;
  const charset = html.match(/<meta\s+charset=["']?[\w-]+["']?\s*\/?>/i);
  if (charset) return html.replace(charset[0], charset[0] + meta);
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (h) => h + meta);
  throw new Error('no <head> to put the Content-Security-Policy in');
}
