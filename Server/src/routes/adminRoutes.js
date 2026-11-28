import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { requireTeamAccount, requireAdminCode, requireOwner } from '../middleware/adminAccess.js';
import { logAdmin } from '../services/adminStaffService.js';
import * as admin from '../controllers/adminController.js';
import * as access from '../controllers/adminAccessController.js';

// The admin team only (at most 6 people, models/AdminStaff.js). Anyone else gets a plain 404 (requireTeamAccount).
// Everything except the session check and entering the code also needs the person's own code (requireAdminCode,
// 403 ADMIN_CODE_REQUIRED), so each action is logged against them.
export const adminRoutes = Router();
adminRoutes.use(requireTeamAccount);
adminRoutes.use(rateLimit({ windowMs: 10 * 60000, limit: 300, keyGenerator: (req) => 'staff:' + req.user.id, standardHeaders: 'draft-8', legacyHeaders: false }));

// Entering the code: 5 wrong tries in 15 minutes, per IP address and per email, locks it until the 15 minutes are up
const codeLock = (key) => rateLimit({
  windowMs: 15 * 60000, limit: 5, skipSuccessfulRequests: true, keyGenerator: key, standardHeaders: 'draft-8', legacyHeaders: false,
  handler: async (req, res) => {
    await logAdmin('code.locked-out', { req, staff: req.teamMember });
    res.status(429).json({ error: 'Too many wrong codes. Wait 15 minutes, then try again.', code: 'ADMIN_CODE_LOCKED' });
  },
});
const lockByIp = codeLock((req) => 'admin-code-ip:' + ipKeyGenerator(req.ip));
// (per account: on the shared staff account the whole team shares this one)
const lockByAccount = codeLock((req) => 'admin-code-account:' + req.user.id);

adminRoutes.get('/session', access.session);
adminRoutes.post('/verify-code', lockByIp, lockByAccount, access.verifyCode);
adminRoutes.post('/lock', access.lock);

adminRoutes.use(requireAdminCode);
// Moderation, reports and takedowns
adminRoutes.get('/reports', admin.reports);
adminRoutes.get('/reports/:id/preview', admin.reportPreview);
adminRoutes.post('/reports/:id/dismiss', admin.dismissReport);
adminRoutes.post('/photos/:id/takedown', admin.takedown);
// Legal hold (suspected CSAM or a police request): docs/legal/csam-procedure.md
adminRoutes.post('/photos/:id/legal-hold', admin.legalHoldPhoto);
adminRoutes.post('/moderation/:id/legal-hold', admin.legalHoldUpload);
adminRoutes.get('/legal-holds', admin.legalHolds);
// The beta's numbers (totals only): GET /api/admin/beta-numbers?days=7
adminRoutes.get('/beta-numbers', admin.betaNumbersView);
adminRoutes.post('/legal-holds/:id/reported', admin.legalHoldReported);
adminRoutes.post('/legal-holds/:id/release', requireOwner, admin.legalHoldRelease);
adminRoutes.delete('/comments/:id', admin.removeComment);
adminRoutes.post('/users/:id/unsuspend', admin.unsuspend);
adminRoutes.get('/moderation', admin.decisions);
adminRoutes.get('/moderation-status', admin.moderationStatus);
adminRoutes.get('/moderation/:id/preview', admin.moderationPreview);
adminRoutes.get('/moderation/:id', admin.decisionStatus);
adminRoutes.post('/moderation/:id', admin.decide);
adminRoutes.get('/switches', admin.getSwitches);
adminRoutes.patch('/switches', admin.setSwitches);
adminRoutes.post('/sessions/revoke-all', admin.revokeAll);
// The team (owners)
adminRoutes.get('/team', requireOwner, access.team);
adminRoutes.put('/team/:slot', requireOwner, access.assign);
adminRoutes.post('/team/:slot/rotate', requireOwner, access.rotate);
adminRoutes.delete('/team/:slot', requireOwner, access.revoke);
adminRoutes.get('/audit', requireOwner, access.auditLog);

// Choosing your own code from the emailed one-time link (no sign-in; mounted at /api/admin-setup in app.js).
// 20 requests in 15 minutes per IP address, on top of the link's own 5 tries.
export const adminSetupRoutes = Router();
adminSetupRoutes.use(rateLimit({ windowMs: 15 * 60000, limit: 20, keyGenerator: (req) => 'admin-setup:' + ipKeyGenerator(req.ip), standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Too many tries. Wait 15 minutes, then try again.' } }));
adminSetupRoutes.get('/:token', access.setupInfo);
adminSetupRoutes.post('/:token', access.setupChoose);
