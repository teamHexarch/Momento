import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as support from '../controllers/supportController.js';

// Each message is a real email to the team: 5 an hour per IP
const supportLimit = rateLimit({
  windowMs: 60 * 60000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'You’ve sent a few messages already. Wait a little, or email us directly.' },
});

export const supportRoutes = Router();
supportRoutes.post('/', supportLimit, support.send);
