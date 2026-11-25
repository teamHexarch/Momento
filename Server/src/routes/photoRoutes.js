import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireVerified } from '../middleware/authMiddleware.js';
import * as photos from '../controllers/photoController.js';

export const photoRoutes = Router();
photoRoutes.use(requireVerified);

photoRoutes.get('/bookmarked', photos.liked);
photoRoutes.get('/liked', photos.liked);
photoRoutes.get('/:id', photos.file);
photoRoutes.get('/:id/download', photos.download);
photoRoutes.delete('/:id', photos.remove);

// Bookmarks and reactions. Writing is capped per account so a stuck key or a script can't flood an album
const socialLimit = rateLimit({
  windowMs: 10 * 60000,
  limit: 120,
  keyGenerator: (req) => `user:${req.user.id}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'That’s a lot at once. Wait a few minutes, then try again.' },
});
photoRoutes.post('/:id/bookmark', socialLimit, photos.bookmark);
photoRoutes.post('/:id/like', socialLimit, photos.like);
photoRoutes.get('/:id/likes', photos.likes);
photoRoutes.post('/:id/reaction', socialLimit, photos.react);
photoRoutes.get('/:id/reactions', photos.reactions);
// Comments: 10 a minute per person, so a script can't flood a photo (each photo holds at most 50)
const commentLimit = rateLimit({
  windowMs: 60000, limit: 10, keyGenerator: (req) => `comment:${req.user.id}`, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'That’s a lot of comments at once. Wait a minute, then try again.', code: 'COMMENT_RATE_LIMIT' },
});
photoRoutes.get('/:id/comments', photos.comments);
photoRoutes.post('/:id/comments', commentLimit, photos.addComment);
photoRoutes.delete('/:id/comments/:commentId', socialLimit, photos.removeComment);
// Report a photo (nudity, abuse, private information, copyright...)
photoRoutes.post('/:id/report', socialLimit, photos.report);
