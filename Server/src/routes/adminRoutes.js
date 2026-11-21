import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireStaff } from '../middleware/authMiddleware.js';
import * as admin from '../controllers/adminController.js';

// Staff only. requireStaff answers 404 to everyone else, so these addresses don't even appear to exist.
export const adminRoutes = Router();
adminRoutes.use(requireStaff);
adminRoutes.use(rateLimit({ windowMs: 10 * 60000, limit: 300, keyGenerator: (req) => 'staff:' + req.user.id, standardHeaders: 'draft-8', legacyHeaders: false }));

adminRoutes.get('/reports', admin.reports);
adminRoutes.get('/reports/:id/preview', admin.reportPreview);
adminRoutes.post('/reports/:id/dismiss', admin.dismissReport);
adminRoutes.post('/photos/:id/takedown', admin.takedown);
adminRoutes.post('/users/:id/unsuspend', admin.unsuspend);
adminRoutes.get('/moderation', admin.decisions);
adminRoutes.get('/moderation-status', admin.moderationStatus);
adminRoutes.post('/moderation-status/relearn', admin.relearnNow);
adminRoutes.get('/moderation/:id/preview', admin.moderationPreview);
adminRoutes.get('/moderation/:id', admin.decisionStatus);
adminRoutes.post('/moderation/:id', admin.decide);
adminRoutes.get('/switches', admin.getSwitches);
adminRoutes.patch('/switches', admin.setSwitches);
adminRoutes.post('/sessions/revoke-all', admin.revokeAll);
