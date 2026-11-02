import fs from 'node:fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { loadUser } from './middleware/authMiddleware.js';
import { cors, sameOriginWrites } from './middleware/cors.js';
import { errorHandler } from './middleware/errorHandler.js';
import { HttpError } from './utils/httpError.js';
import { authRoutes } from './routes/authRoutes.js';
import { albumRoutes } from './routes/albumRoutes.js';
import { photoRoutes } from './routes/photoRoutes.js';

export const app = express();
app.disable('x-powered-by');
// Behind a proxy (Render, Railway, nginx) this makes rate limits see the real client IP
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use('/api', cors, sameOriginWrites);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser(config.jwtSecret));
app.use(loadUser);

// What the browser needs to start Google and Apple sign-in (all public values)
app.get('/api/config', (req, res) => {
  res.json({
    googleClientId: config.google.clientId && config.google.clientSecret ? config.google.clientId : null,
    apple: !!config.apple.clientId,
  });
});
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/albums', albumRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api', (req, res, next) => next(new HttpError(404, 'Not found.')));

// Locally, the site itself comes from the Client folder too, so one address does everything.
// In production the site is hosted on its own (FRONTEND_URL) and this server is API only.
// Only page assets are served; notes, dev scripts and design screenshots stay private.
const PUBLIC_FILE = /^\/(?!temporary screenshots\/)[^]*\.(html|css|js|png|jpe?g|svg|webp|ico|woff2?)$/i;
if (!config.serveClient) {
  console.log(`API only: the site is served from ${config.frontendUrl}.`);
} else if (fs.existsSync(config.clientDir)) {
  const serveClient = express.static(config.clientDir, { dotfiles: 'ignore' });
  app.use((req, res, next) => {
    let p = req.path;
    try { p = decodeURIComponent(p); } catch { return next(); }
    return p === '/' || PUBLIC_FILE.test(p) ? serveClient(req, res, next) : next();
  });
} else {
  console.warn(`Client folder not found at ${config.clientDir}; serving the API only.`);
}

app.use(errorHandler);
