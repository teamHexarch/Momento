import { config } from '../config/env.js';

// The site (hexarch.org) and the API (api.hexarch.org) are different origins, so the browser
// asks permission before sending requests with the login cookie. Only CORS_ORIGINS get it.
const allowed = new Set(config.corsOrigins);

export function cors(req, res, next) {
  const origin = req.headers.origin;
  if (origin && allowed.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
    res.vary('Origin');
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
      res.set('Access-Control-Allow-Headers', 'Content-Type, X-Momento-Location');
      res.set('Access-Control-Max-Age', '86400');
      return res.sendStatus(204);
    }
  }
  next();
}

// Belt and braces against cross-site request forgery: a request that changes something and
// comes from a page on another site is refused, whatever cookies it carries
export function sameOriginWrites(req, res, next) {
  const origin = req.headers.origin;
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !origin) return next();
  if (allowed.has(origin) || origin === config.publicUrl) return next();
  res.status(403).json({ error: 'This request came from a site that isn’t allowed to use Momento.' });
}
