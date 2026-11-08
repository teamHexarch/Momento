import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireVerified } from '../middleware/authMiddleware.js';
import * as photos from '../controllers/photoController.js';

export const photoRoutes = Router();
photoRoutes.use(requireVerified);

photoRoutes.get('/:id', photos.file);
photoRoutes.get('/:id/download', photos.download);
photoRoutes.delete('/:id', photos.remove);

// Likes and comments. Writing is capped per account so a stuck key or a script can't flood an album
const socialLimit = rateLimit({
  windowMs: 10 * 60000,
  limit: 120,
  keyGenerator: (req) => `user:${req.user.id}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'That’s a lot at once. Wait a few minutes, then try again.' },
});
photoRoutes.post('/:id/like', socialLimit, photos.like);
photoRoutes.get('/:id/comments', photos.comments);
photoRoutes.post('/:id/comments', socialLimit, photos.addComment);
photoRoutes.delete('/:id/comments/:commentId', photos.removeComment);
photoRoutes.post('/:id/comments/:commentId/like', socialLimit, photos.likeComment);
