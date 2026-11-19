import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { whenOpen } from '../services/switches.js';
import { uploadBudget } from '../middleware/uploadBudget.js';
import * as privacy from '../controllers/privacyController.js';
import multer from 'multer';
import { requireUser } from '../middleware/authMiddleware.js';
import * as devices from '../services/deviceLogin.js';
import * as auth from '../controllers/authController.js';

const tooMany = (minutes) => ({ error: `Too many attempts. Wait ${minutes} minutes and try again.` });

// Slows down password guessing: 20 attempts per 15 minutes per IP across signup, login and social
const signInLimit = rateLimit({ windowMs: 15 * 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: tooMany(15) });
// Each resend is a real email, so it gets a tighter limit
const emailLimit = rateLimit({ windowMs: 60 * 60000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: tooMany(60) });
// The email-change approval page: links can't be guessed, but this still caps anyone trying
const approveLimit = rateLimit({ windowMs: 15 * 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: tooMany(15) });

// Per account as well as per IP: 10 logins per 15 minutes for one email address (from anywhere), and
// 3 reset emails an hour. The address is only kept as a hash inside the limiter.
const byEmail = (req) => 'acct:' + crypto.createHash('sha256').update(String(req.body?.email ?? '').trim().toLowerCase()).digest('hex').slice(0, 32);
const loginPerAccount = rateLimit({ windowMs: 15 * 60000, limit: 10, keyGenerator: byEmail, standardHeaders: 'draft-8', legacyHeaders: false, message: tooMany(15) });
const resetPerAccount = rateLimit({ windowMs: 60 * 60000, limit: 3, keyGenerator: byEmail, standardHeaders: 'draft-8', legacyHeaders: false, message: tooMany(60) });
// A full data export is heavy: 3 an hour
const exportLimit = rateLimit({ windowMs: 60 * 60000, limit: 3, keyGenerator: (req) => 'user:' + req.user.id, standardHeaders: 'draft-8', legacyHeaders: false, message: tooMany(60) });

// The code and new-password steps: counted per account (each code also dies after 5 wrong tries)
const passwordStepLimit = rateLimit({ windowMs: 15 * 60000, limit: 30, keyGenerator: (req) => 'user:' + req.user.id, standardHeaders: 'draft-8', legacyHeaders: false, message: tooMany(15) });

// Each code is a real email: at most 5 an hour per account (on top of the per-address email limit)
const codeSendLimit = rateLimit({ windowMs: 60 * 60000, limit: 5, keyGenerator: (req) => 'user:' + req.user.id, standardHeaders: 'draft-8', legacyHeaders: false, message: tooMany(60) });
export const authRoutes = Router();

authRoutes.post('/signup', signInLimit, whenOpen('signups'), auth.signup);
authRoutes.post('/login', signInLimit, loginPerAccount, auth.login);
authRoutes.post('/devices/code', emailLimit, devices.sendCode);
authRoutes.post('/devices/verify', approveLimit, devices.verifyCode);
authRoutes.post('/devices/replace', approveLimit, devices.replaceDevice);
authRoutes.post('/logout', auth.logout);
authRoutes.get('/me', auth.me);
authRoutes.patch('/me', requireUser, auth.updateMe);
authRoutes.delete('/me', requireUser, signInLimit, auth.deleteMe);
authRoutes.post('/email', requireUser, emailLimit, auth.requestEmailChange);
// Changing the password from Settings: current password → emailed code → new password
authRoutes.post('/password/code', requireUser, emailLimit, codeSendLimit, auth.startPasswordChange);
authRoutes.post('/password/code/verify', requireUser, passwordStepLimit, auth.verifyPasswordCode);
authRoutes.post('/password', requireUser, passwordStepLimit, auth.changePassword);
authRoutes.get('/email/confirm', auth.confirmEmailChange);
// The approval page (opened from the email sent to the current address): no login needed, the token is the proof
authRoutes.get('/email/approve-info', approveLimit, auth.emailApproveInfo);
authRoutes.post('/email/approve', approveLimit, auth.approveEmail);
authRoutes.post('/email/cancel', approveLimit, auth.cancelEmail);

authRoutes.get('/verify-email', auth.verifyEmail);
authRoutes.post('/verify-email/resend', requireUser, emailLimit, auth.resendVerification);

authRoutes.post('/password/forgot', emailLimit, resetPerAccount, auth.forgotPassword);
authRoutes.post('/password/reset', signInLimit, auth.resetPassword);

authRoutes.post('/google', signInLimit, auth.google);

// Profile photo: one image up to 10 MB, re-encoded small on the server. 30 changes an hour at most
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const avatarLimit = rateLimit({ windowMs: 60 * 60000, limit: 30, keyGenerator: (req) => 'user:' + req.user.id, standardHeaders: 'draft-8', legacyHeaders: false, message: tooMany(60) });
authRoutes.post('/avatar', requireUser, avatarLimit, whenOpen('uploads'), uploadBudget, avatarUpload.single('avatar'), auth.uploadAvatar);

// Your data: download all of it; the Terms and Privacy Policy you accepted
authRoutes.get('/me/export', requireUser, exportLimit, privacy.exportData);
authRoutes.get('/consent', requireUser, privacy.consentStatus);
authRoutes.post('/consent', requireUser, privacy.acceptPolicies);
// One-click unsubscribe from an email (the link is signed; mail apps may POST it)
authRoutes.get('/unsubscribe', approveLimit, privacy.unsubscribe);
authRoutes.post('/unsubscribe', approveLimit, privacy.unsubscribe);
// Ask a person to look at an upload the automatic nudity check refused
authRoutes.post('/moderation/:id/review', requireUser, approveLimit, privacy.requestReview);
authRoutes.delete('/avatar', requireUser, avatarLimit, auth.deleteAvatar);
