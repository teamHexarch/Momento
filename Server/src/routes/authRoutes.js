import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireUser } from '../middleware/authMiddleware.js';
import * as auth from '../controllers/authController.js';

const tooMany = (minutes) => ({ error: `Too many attempts. Wait ${minutes} minutes and try again.` });

// Slows down password guessing: 20 attempts per 15 minutes per IP across signup, login and social
const signInLimit = rateLimit({ windowMs: 15 * 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: tooMany(15) });
// Each resend is a real email, so it gets a tighter limit
const emailLimit = rateLimit({ windowMs: 60 * 60000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: tooMany(60) });

export const authRoutes = Router();

authRoutes.post('/signup', signInLimit, auth.signup);
authRoutes.post('/login', signInLimit, auth.login);
authRoutes.post('/logout', auth.logout);
authRoutes.get('/me', auth.me);
authRoutes.patch('/me', requireUser, auth.updateMe);

authRoutes.get('/verify-email', auth.verifyEmail);
authRoutes.post('/verify-email/resend', requireUser, emailLimit, auth.resendVerification);

authRoutes.post('/password/forgot', emailLimit, auth.forgotPassword);
authRoutes.post('/password/reset', signInLimit, auth.resetPassword);

authRoutes.post('/google', signInLimit, auth.google);
authRoutes.get('/apple/start', auth.appleStart);
authRoutes.post('/apple', signInLimit, auth.apple);
