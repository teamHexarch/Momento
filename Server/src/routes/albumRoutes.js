import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';
import { requireVerified } from '../middleware/authMiddleware.js';
import * as albums from '../controllers/albumController.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 30 },
  // MIME types and names come from the client and are not proof of image content.
  // savePhoto fully decodes and re-encodes allowed image formats before any write.
});

// Codes have ~17 billion combinations, but guessing is capped anyway: 30 tries an hour per account
const joinLimit = rateLimit({
  windowMs: 60 * 60000,
  limit: 30,
  keyGenerator: (req) => `user:${req.user.id}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many codes tried. Wait an hour, or check the code with the host.' },
});

export const albumRoutes = Router();
albumRoutes.use(requireVerified);

albumRoutes.get('/', albums.list);
albumRoutes.post('/', albums.create);
albumRoutes.post('/join', joinLimit, albums.join);

albumRoutes.get('/:id', albums.show);
albumRoutes.patch('/:id', albums.update);
albumRoutes.delete('/:id', albums.remove);
albumRoutes.delete('/:id/membership', albums.leave);

albumRoutes.post('/:id/photos', albums.checkMember, upload.array('photos', 30), albums.addPhotos);
albumRoutes.get('/:id/download', albums.download);
// Sort photos: hide photos from your own view (everyone else still sees them)
albumRoutes.post('/:id/hidden', albums.setHidden);

// Host actions that send email: invites are capped at 20 an hour per account (reminders are
// already limited to one a day per album in the controller)
const inviteLimit = rateLimit({
  windowMs: 60 * 60000,
  limit: 20,
  keyGenerator: (req) => `user:${req.user.id}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'That’s a lot of invites at once. Wait a little before sending more.' },
});
albumRoutes.post('/:id/remind', albums.remind);
albumRoutes.post('/:id/invites', inviteLimit, albums.invite);
