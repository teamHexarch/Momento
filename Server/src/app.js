import fs from 'node:fs';
import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { installLogRedaction } from './utils/logRedaction.js';
import { requestId, securityHeaders, inputGuard } from './middleware/security.js';
import { adminRoutes } from './routes/adminRoutes.js';
import { supportRoutes } from './routes/supportRoutes.js';
import { reviewRoutes } from './routes/reviewRoutes.js';
import mongoose from 'mongoose';
import { RAW_TYPES } from './services/imageService.js';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { loadUser } from './middleware/authMiddleware.js';
import { cors, sameOriginWrites } from './middleware/cors.js';
import { errorHandler } from './middleware/errorHandler.js';
import { HttpError } from './utils/httpError.js';
import { authRoutes } from './routes/authRoutes.js';
import { albumRoutes } from './routes/albumRoutes.js';
import { photoRoutes } from './routes/photoRoutes.js';
import { eventRoutes } from './routes/eventRoutes.js';
import { groupRoutes } from './routes/groupRoutes.js';
import { userRoutes } from './routes/userRoutes.js';
import { trashRoutes } from './routes/trashRoutes.js';
import { notificationRoutes } from './routes/notificationRoutes.js';
import { sharePage, shareImage } from './controllers/shareController.js';

// Passwords, tokens, keys and email addresses are taken out of every log line
installLogRedaction();

export const app = express();
app.disable('x-powered-by');
// How many proxies sit in front of the server, so rate limits see the visitor's real IP.
// 1 on the AWS Lightsail server (Caddy); add 1 for each extra proxy in front of it.
app.set('trust proxy', config.trustProxy);

app.use(requestId);
app.use(securityHeaders);
app.use('/api', cors, sameOriginWrites);
// JSON bodies up to 100 KB (photos come as uploads, with their own limits)
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser(config.jwtSecret));
// No "$operator", "__proto__" or absurdly deep data in any request
app.use(inputGuard);
app.use(loadUser);
// A ceiling for everything: 3000 requests per 10 minutes per account (an album page loads one per
// thumbnail), 600 per IP address for visitors. Many guests at one venue share an IP, hence per account.
app.use('/api', rateLimit({
  windowMs: 10 * 60000,
  limit: (req) => (req.user ? 3000 : 600),
  keyGenerator: (req) => (req.user ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip)}`),
  standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Too many requests. Wait a few minutes, then try again.' },
}));

// What the browser needs for Google sign-in, the sign-up check and maps (all public values)
app.get('/api/config', (req, res) => {
  res.json({
    // The reCAPTCHA site key for the sign-up check (never the secret)
    captcha: config.captcha.siteKey && config.captcha.secretKey ? { provider: 'recaptcha', siteKey: config.captcha.siteKey } : null,
    googleClientId: config.google.clientId && config.google.clientSecret ? config.google.clientId : null,
    mapsApiKey: config.mapsApiKey || null,
    // Upload limits, so the page can say them and skip a too-big file before sending it
    uploads: { maxPhotoMB: Math.round(config.maxUploadBytes / 1048576), maxRawMB: Math.round(config.maxRawUploadBytes / 1048576), rawTypes: Object.keys(RAW_TYPES) },
  });
});
// For uptime alerts: 200 only when the server can really reach the database, otherwise 503
app.get('/api/health', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await Promise.race([
      mongoose.connection.db.admin().ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false, error: 'The database can’t be reached.' });
  }
});
app.use('/api/auth', authRoutes);
app.use('/api/albums', albumRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api', trashRoutes);   // /api/trash and /api/hidden
app.use('/api', (req, res, next) => next(new HttpError(404, 'Not found.')));

// Share links (https://api.hexarch.org/s/CODE): a small page with the album's or group's own link preview
// card for chat apps, which then sends the person on to the site. 120 a 10 minutes per address.
const shareLimit = rateLimit({ windowMs: 10 * 60000, limit: 120, keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip)}`, standardHeaders: 'draft-8', legacyHeaders: false });
app.get('/s/:code', shareLimit, sharePage);
app.get('/s/:code/:tag.jpg', shareLimit, shareImage);

// Locally, the site itself comes from the Client folder too, so one address does everything.
// In production the site is hosted on its own (FRONTEND_URL) and this server is API only.
// Only what the Pages workflow publishes is served: the pages and simple files in assets/ and
// assets/vendor/, assets/i18n/, assets/globe/ and assets/photos/, and the web app manifest (plain names, so not the design screenshot). Everything else in Client/ stays private.
const PUBLIC_PAGES = new Set(['/', '/index.html', '/albums.html', '/settings.html', '/support.html', '/events.html', '/groups.html', '/privacy.html', '/terms.html', '/review.html', '/404.html', '/manifest.webmanifest', '/favicon.ico']);
const PUBLIC_ASSET = /^\/assets\/((vendor|i18n|globe|photos)\/)?[\w-]+(\.[\w-]+)*\.(js|css|png|jpe?g|svg|webp|ico|woff2?)$/i;
if (!config.serveClient) {
  console.log(`API only: the site is served from ${config.frontendUrl}.`);
} else if (fs.existsSync(config.clientDir)) {
  const serveClient = express.static(config.clientDir, { dotfiles: 'ignore' });
  app.use((req, res, next) => {
    let p;
    try { p = decodeURIComponent(req.path); } catch { return next(); }
    // Judged on the path as written: anything with //, /./, /../ or a backslash is refused
    // rather than tidied up, so it can't be dressed up to reach a private file
    if (/\/\/|\/\.\.?(\/|$)|\\/.test(p)) return next();
    return PUBLIC_PAGES.has(p) || PUBLIC_ASSET.test(p) ? serveClient(req, res, next) : next();
  });
} else {
  console.warn(`Client folder not found at ${config.clientDir}; serving the API only.`);
}

app.use(errorHandler);
