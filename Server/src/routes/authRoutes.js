import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireUser } from '../middleware/authMiddleware.js';
import * as auth from '../controllers/authController.js';

const tooMany = (minutes) => ({ error: `Too many attempts. Wait ${minutes} minutes and try again.` });

// Slows down password guessing: 20 attempts per 15 minutes per IP across signup, login and social
const signInLimit = rateLimit({ windowMs: 15 * 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: tooMany(15) });
// Each resend is a real email, so it gets a tighter limit
const emailLimit = rateLimit({ windowMs: 60 * 60000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: tooMany(60) });
// The email-change approval page: links can't be guessed, but this still caps anyone trying
const approveLimit = rateLimit({ windowMs: 15 * 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: tooMany(15) });

export const authRoutes = Router();

authRoutes.post('/signup', signInLimit, auth.signup);
authRoutes.post('/login', signInLimit, auth.login);
authRoutes.post('/logout', auth.logout);
authRoutes.get('/me', auth.me);
authRoutes.patch('/me', requireUser, auth.updateMe);
authRoutes.delete('/me', requireUser, signInLimit, auth.deleteMe);
authRoutes.post('/email', requireUser, emailLimit, auth.requestEmailChange);
authRoutes.post('/password', requireUser, signInLimit, auth.changePassword);
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
