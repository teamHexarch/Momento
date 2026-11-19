import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { countStatus } from '../services/securityAlerts.js';
import { HttpError } from '../utils/httpError.js';

// ---- A request ID on every request (X-Request-Id), shown with errors so a report can be matched to the log ----
export function requestId(req, res, next) {
  const given = req.get('x-request-id');
  req.id = given && /^[\w-]{8,64}$/.test(given) ? given : crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  // Counted for the security alerts (spikes of 401/403/429)
  res.on('finish', () => countStatus(res.statusCode));
  next();
}

// ---- Security headers ----
// Everything: no MIME sniffing, no referrer to other sites. HTTPS servers: browsers must keep using HTTPS (HSTS).
// API answers: nothing may run or frame them (CSP), and by default nothing is cached (photo and cover
// files set their own caching), so private data doesn't stay in shared caches.
export function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (config.secureCookies) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (req.path.startsWith('/api/')) {
    res.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    res.set('X-Frame-Options', 'DENY');
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    // Photos and covers are shown by the site (same site: hexarch.org / api.hexarch.org), never by others
    if (config.isProduction) res.set('Cross-Origin-Resource-Policy', 'same-site');
  }
  next();
}

// ---- Request bodies and query strings: plain data only ----
// MongoDB treats keys starting with "$" as operators, and "__proto__" / "constructor" / "prototype"
// can change JavaScript objects, so no request may contain such keys, at any depth. Very deep or
// very wide data is refused too. Every route still checks its own fields on top of this.
const BAD_KEY = /^\$|^(__proto__|constructor|prototype)$/;
function inspect(value, depth = 0) {
  if (depth > 8) return 'too deep';
  if (Array.isArray(value)) {
    if (value.length > 5000) return 'too long';
    for (const v of value) { const bad = inspect(v, depth + 1); if (bad) return bad; }
    return null;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length > 200) return 'too many fields';
    for (const k of keys) {
      if (BAD_KEY.test(k) || k.includes('\0')) return `field "${k.slice(0, 20)}"`;
      const bad = inspect(value[k], depth + 1); if (bad) return bad;
    }
  }
  if (typeof value === 'string' && value.length > 100000) return 'text too long';
  return null;
}
export function inputGuard(req, res, next) {
  const bad = inspect(req.body) || inspect(req.query);
  if (bad) return next(new HttpError(400, 'That request isn’t valid.', 'bad-input'));
  next();
}
