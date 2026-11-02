import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';
import { requireUser } from '../middleware/authMiddleware.js';
import { HttpError } from '../utils/httpError.js';
import { ALLOWED_TYPES } from '../services/storageService.js';
import * as albums from '../controllers/albumController.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 30 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new HttpError(400, `${file.originalname} isn’t a photo we can take (JPEG, PNG, WebP, HEIC or GIF).`));
  },
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
albumRoutes.use(requireUser);

albumRoutes.get('/', albums.list);
albumRoutes.post('/', albums.create);
albumRoutes.post('/join', joinLimit, albums.join);

albumRoutes.get('/:id', albums.show);
albumRoutes.patch('/:id', albums.update);
albumRoutes.delete('/:id', albums.remove);
albumRoutes.delete('/:id/membership', albums.leave);

albumRoutes.post('/:id/photos', albums.checkMember, upload.array('photos', 30), albums.addPhotos);
albumRoutes.get('/:id/download', albums.download);
