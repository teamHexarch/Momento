import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { requireStaff } from '../middleware/authMiddleware.js';
import { requireDevMode } from '../middleware/devMode.js';
import * as dev from '../controllers/devModeController.js';

// Dev Mode (photo moderation on the shared admin account). Staff only: everyone else gets a 404.
export const devRoutes = Router();
devRoutes.use(requireStaff);

// Guessing access codes: 5 wrong codes per browser address per 15 minutes, and 20 per admin account per hour from
// anywhere. Right codes don't count.
const limit = (windowMs, max, key) => rateLimit({
  windowMs, limit: max, skipSuccessfulRequests: true, keyGenerator: key, standardHeaders: 'draft-8', legacyHeaders: false,
  // Only a wrong code (401) counts; "all 6 sessions in use" or a typo in the form doesn't
  requestWasSuccessful: (req, res) => res.statusCode !== 401,
  handler: (req, res) => res.status(429).json({ error: 'Too many wrong codes. Wait a few minutes and try again.', code: 'dev-mode-locked' }),
});
const perAddress = limit(15 * 60000, 5, (req) => `dev-code:${req.user.id}:${ipKeyGenerator(req.ip)}`);
const perAccount = limit(60 * 60000, 20, (req) => `dev-code:${req.user.id}`);

devRoutes.get('/status', dev.status);
devRoutes.post('/enter', perAccount, perAddress, dev.enter);
devRoutes.post('/heartbeat', requireDevMode, dev.heartbeat);
devRoutes.post('/exit', dev.exit);
