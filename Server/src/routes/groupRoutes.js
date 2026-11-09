import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireVerified } from '../middleware/authMiddleware.js';
import * as groups from '../controllers/groupController.js';

// Friend groups: every route needs a logged-in account with a confirmed email
export const groupRoutes = Router();
groupRoutes.use(requireVerified);

const perUser = (windowMin, limit, error) => rateLimit({
  windowMs: windowMin * 60000,
  limit,
  keyGenerator: (req) => `user:${req.user.id}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error },
});
// Invites send real email, so at most 20 an hour per account
const inviteLimit = perUser(60, 20, 'That’s a lot of invites at once. Wait a little before sending more.');
const writeLimit = perUser(10, 60, 'That’s a lot at once. Wait a few minutes, then try again.');
const chatLimit = perUser(10, 120, 'That’s a lot of messages at once. Wait a minute, then try again.');

groupRoutes.get('/', groups.list);
groupRoutes.get('/unread', groups.unread);
groupRoutes.post('/', writeLimit, groups.create);
groupRoutes.post('/invites/:inviteId/accept', writeLimit, groups.accept);
groupRoutes.post('/invites/:inviteId/decline', writeLimit, groups.decline);

groupRoutes.get('/:id', groups.show);
groupRoutes.patch('/:id', writeLimit, groups.rename);
groupRoutes.delete('/:id', groups.remove);
groupRoutes.post('/:id/invites', inviteLimit, groups.invite);
groupRoutes.delete('/:id/invites/:inviteId', groups.cancelInvite);
groupRoutes.delete('/:id/members/:userId', groups.removeMember);
groupRoutes.get('/:id/messages', groups.messages);
groupRoutes.post('/:id/messages', chatLimit, groups.sendMessage);
// "Typing…": sent every few seconds while someone types, so allowed often
const typingLimit = perUser(10, 600, 'Slow down a little.');
groupRoutes.post('/:id/typing', typingLimit, groups.typing);
