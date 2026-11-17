import { reviewRequest, eventPolicy } from '../services/eventAdmission.js';
import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { requireVerified } from '../middleware/authMiddleware.js';
import * as events from '../controllers/eventController.js';

// Looking around is cheap but not free: 120 searches per 10 minutes (per account, or per IP address
// for visitors who haven't logged in) and 30 join attempts per account
const lookLimit = rateLimit({
  windowMs: 10 * 60000, limit: 120, keyGenerator: (req) => (req.user ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip)}`),
  standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'That’s a lot of searching. Wait a few minutes, then look again.' },
});
const joinLimit = rateLimit({
  windowMs: 10 * 60000, limit: 30, keyGenerator: (req) => `user:${req.user.id}`,
  standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Too many tries. Wait a few minutes, then try again.' },
});

export const eventRoutes = Router();
// The nearby scan works before logging in (joining doesn't)
eventRoutes.get('/nearby', lookLimit, events.nearby);
eventRoutes.use(requireVerified);
eventRoutes.get('/requests', events.requests);
eventRoutes.patch('/:id/policy', eventPolicy);
eventRoutes.post('/:id/requests/:guest', reviewRequest);
eventRoutes.post('/:id/join', joinLimit, events.join);
