import mongoose from 'mongoose';
import { LIMITS } from '../utils/text.js';

// Comments on album photos (routes: /api/photos/:id/comments). At most 50 per photo; each photo keeps a running
// commentCount so album grids show the badge without counting. Removed with their photo (models/Photo.js hooks) and
// with their author's account (services/accountService.js).
export const MAX_COMMENTS_PER_PHOTO = 50;

const schema = new mongoose.Schema({
  photo: { type: mongoose.Schema.Types.ObjectId, ref: 'Photo', required: true },
  album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Their name when they wrote it (shown even if they later change it)
  authorName: { type: String, maxlength: LIMITS.displayName + 40, default: '' },
  text: { type: String, required: true, maxlength: LIMITS.comment },
}, { collection: 'photo_comments', timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

schema.index({ photo: 1, createdAt: 1 });
schema.index({ author: 1 });
schema.index({ album: 1 });

export const PhotoComment = mongoose.model('PhotoComment', schema);
