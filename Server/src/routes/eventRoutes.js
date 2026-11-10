import { reviewRequest, eventPolicy } from '../services/eventAdmission.js';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireVerified } from '../middleware/authMiddleware.js';
import * as events from '../controllers/eventController.js';

// Looking around is cheap but not free: 120 searches and 30 join attempts per 10 minutes per account
const lookLimit = rateLimit({
  windowMs: 10 * 60000, limit: 120, keyGenerator: (req) => `user:${req.user.id}`,
  standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'That’s a lot of searching. Wait a few minutes, then look again.' },
});
const joinLimit = rateLimit({
  windowMs: 10 * 60000, limit: 30, keyGenerator: (req) => `user:${req.user.id}`,
  standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Too many tries. Wait a few minutes, then try again.' },
});

export const eventRoutes = Router();
eventRoutes.use(requireVerified);
// Event chat, like friend groups: 120 messages per 10 minutes, typing pings more often
const chatLimit = rateLimit({
  windowMs: 10 * 60000, limit: 120, keyGenerator: (req) => `user:${req.user.id}`,
  standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'That’s a lot of messages at once. Wait a minute, then try again.' },
});
const typingLimit = rateLimit({
  windowMs: 10 * 60000, limit: 600, keyGenerator: (req) => `user:${req.user.id}`,
  standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Slow down a little.' },
});

eventRoutes.get('/requests', events.requests);
eventRoutes.get('/unread', events.unread);
eventRoutes.patch('/:id/policy', eventPolicy);
eventRoutes.post('/:id/requests/:guest', reviewRequest);
eventRoutes.get('/:id/chat', events.chat);
eventRoutes.post('/:id/chat', chatLimit, events.sendChat);
eventRoutes.post('/:id/typing', typingLimit, events.typing);
eventRoutes.get('/nearby', lookLimit, events.nearby);
eventRoutes.post('/:id/join', joinLimit, events.join);
