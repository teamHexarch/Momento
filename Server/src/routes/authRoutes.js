import { Router } from 'express';
import rateLimit from 'express-rate-limit';
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

// The code and new-password steps: counted per account (each code also dies after 5 wrong tries)
const passwordStepLimit = rateLimit({ windowMs: 15 * 60000, limit: 30, keyGenerator: (req) => 'user:' + req.user.id, standardHeaders: 'draft-8', legacyHeaders: false, message: tooMany(15) });

// Each code is a real email: at most 5 an hour per account (on top of the per-address email limit)
const codeSendLimit = rateLimit({ windowMs: 60 * 60000, limit: 5, keyGenerator: (req) => 'user:' + req.user.id, standardHeaders: 'draft-8', legacyHeaders: false, message: tooMany(60) });
export const authRoutes = Router();

authRoutes.post('/signup', signInLimit, auth.signup);
authRoutes.post('/login', signInLimit, auth.login);
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

authRoutes.post('/password/forgot', emailLimit, auth.forgotPassword);
authRoutes.post('/password/reset', signInLimit, auth.resetPassword);

authRoutes.post('/google', signInLimit, auth.google);

// Profile photo: one image up to 10 MB, re-encoded small on the server. 30 changes an hour at most
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const avatarLimit = rateLimit({ windowMs: 60 * 60000, limit: 30, keyGenerator: (req) => 'user:' + req.user.id, standardHeaders: 'draft-8', legacyHeaders: false, message: tooMany(60) });
authRoutes.post('/avatar', requireUser, avatarLimit, avatarUpload.single('avatar'), auth.uploadAvatar);
authRoutes.delete('/avatar', requireUser, avatarLimit, auth.deleteAvatar);
