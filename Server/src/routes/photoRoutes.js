import { Router } from 'express';
import { requireUser } from '../middleware/authMiddleware.js';
import * as photos from '../controllers/photoController.js';

export const photoRoutes = Router();
photoRoutes.use(requireUser);

photoRoutes.get('/:id', photos.file);
photoRoutes.delete('/:id', photos.remove);
