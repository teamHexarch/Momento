import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireStaff } from '../middleware/authMiddleware.js';
import { requireDevMode } from '../middleware/devMode.js';
import * as admin from '../controllers/adminController.js';

// Staff only. requireStaff answers 404 to everyone else, so these addresses don't even appear to exist.
export const adminRoutes = Router();
adminRoutes.use(requireStaff);
adminRoutes.use(rateLimit({ windowMs: 10 * 60000, limit: 300, keyGenerator: (req) => 'staff:' + req.user.id, standardHeaders: 'draft-8', legacyHeaders: false }));

// Moderation (unblurred photos, approve/reject, reports, takedowns) also needs an active Dev Mode session: the shared
// admin account unlocked with a personal access code (middleware/devMode.js), so each action names the person
adminRoutes.get('/reports', requireDevMode, admin.reports);
adminRoutes.get('/reports/:id/preview', requireDevMode, admin.reportPreview);
adminRoutes.post('/reports/:id/dismiss', requireDevMode, admin.dismissReport);
adminRoutes.post('/photos/:id/takedown', requireDevMode, admin.takedown);
adminRoutes.post('/users/:id/unsuspend', admin.unsuspend);
adminRoutes.get('/moderation', requireDevMode, admin.decisions);
adminRoutes.get('/moderation-status', requireDevMode, admin.moderationStatus);
adminRoutes.post('/moderation-status/relearn', requireDevMode, admin.relearnNow);
adminRoutes.get('/moderation/:id/preview', requireDevMode, admin.moderationPreview);
adminRoutes.get('/moderation/:id', requireDevMode, admin.decisionStatus);
adminRoutes.post('/moderation/:id', requireDevMode, admin.decide);
adminRoutes.get('/switches', admin.getSwitches);
adminRoutes.patch('/switches', admin.setSwitches);
adminRoutes.post('/sessions/revoke-all', admin.revokeAll);
