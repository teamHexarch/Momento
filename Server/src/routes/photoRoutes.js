import { Router } from 'express';
import { requireVerified } from '../middleware/authMiddleware.js';
import * as photos from '../controllers/photoController.js';

export const photoRoutes = Router();
photoRoutes.use(requireVerified);

photoRoutes.get('/:id', photos.file);
photoRoutes.get('/:id/download', photos.download);
photoRoutes.delete('/:id', photos.remove);
