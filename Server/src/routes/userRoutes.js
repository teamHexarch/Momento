import { Router } from 'express';
import mongoose from 'mongoose';
import { requireUser } from '../middleware/authMiddleware.js';
import { User } from '../models/User.js';
import { sendPhoto } from '../services/storageService.js';
import { HttpError } from '../utils/httpError.js';

// Profile photos, for people who are logged in (they show beside names in groups, chat and albums)
export const userRoutes = Router();
userRoutes.use(requireUser);

userRoutes.get('/:id/avatar', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'No photo.');
  const user = await User.findById(req.params.id, 'avatarKey');
  if (!user?.avatarKey || !(await sendPhoto(res, user.avatarKey, 'image/webp'))) throw new HttpError(404, 'No photo.');
});
