import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { requireVerified } from '../middleware/authMiddleware.js';
import * as groups from '../controllers/groupController.js';

// Friend groups: every route needs a logged-in account with a confirmed email, except seeing what a
// group link is for (so someone can decide before signing up). Codes are capped against guessing.
export const groupRoutes = Router();
const previewLimit = rateLimit({
  windowMs: 10 * 60000, limit: 60, keyGenerator: (req) => (req.user ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip)}`),
  standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'That’s a lot of group links. Wait a few minutes, then try again.' },
});
groupRoutes.get('/preview/:code', previewLimit, groups.preview);
groupRoutes.use(requireVerified);

const perUser = (windowMin, limit, error) => rateLimit({
  windowMs: windowMin * 60000,
  limit,
  keyGenerator: (req) => `user:${req.user.id}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error },
});
// Invites: at most 20 an hour per account. Joining with a link: 30 tries an hour (codes can't be guessed)
const inviteLimit = perUser(60, 20, 'That’s a lot of invites at once. Wait a little before sending more.');
const writeLimit = perUser(10, 60, 'That’s a lot at once. Wait a few minutes, then try again.');
const joinLimit = perUser(60, 30, 'That’s a lot of group links. Wait a while, then try again.');

groupRoutes.get('/', groups.list);
groupRoutes.post('/join', joinLimit, groups.joinByCode);
// The owner makes a new invite link (the old link and QR code stop working)
groupRoutes.post('/:id/invite-link', writeLimit, groups.resetLink);
groupRoutes.post('/', writeLimit, groups.create);
groupRoutes.post('/invites/:inviteId/accept', writeLimit, groups.accept);
groupRoutes.post('/invites/:inviteId/decline', writeLimit, groups.decline);

groupRoutes.get('/:id', groups.show);
groupRoutes.patch('/:id', writeLimit, groups.rename);
groupRoutes.delete('/:id', groups.remove);
groupRoutes.post('/:id/invites', inviteLimit, groups.invite);
groupRoutes.delete('/:id/invites/:inviteId', groups.cancelInvite);
groupRoutes.delete('/:id/members/:userId', groups.removeMember);
