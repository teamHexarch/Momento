import { Router } from 'express';
import { requireVerified } from '../middleware/authMiddleware.js';
import * as trash from '../controllers/trashController.js';

// Recently deleted (host only) and Hidden by you. Spec: Client/SERVER-TRASH-API.md
export const trashRoutes = Router();
trashRoutes.use(requireVerified);
trashRoutes.get('/trash', trash.listTrash);
trashRoutes.post('/trash', trash.moveToTrash);
trashRoutes.post('/trash/restore', trash.restore);
trashRoutes.post('/trash/purge', trash.purge);
trashRoutes.get('/hidden', trash.listHidden);
