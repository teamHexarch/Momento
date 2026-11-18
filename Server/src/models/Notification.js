import mongoose from 'mongoose';

// Something that happened to you: someone liked or reacted to your photo, joined or asked to join an
// album you host, or the host let you in. One like or reaction per person per photo (changing your
// reaction updates it). Read ones stay in the inbox; everything goes after 90 days.
const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['like', 'reaction', 'joined', 'request', 'approved', 'photos'], required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album' },
  photo: { type: mongoose.Schema.Types.ObjectId, ref: 'Photo' },
  emoji: String,
  // For 'photos': how many were added since they last read it
  count: Number,
  read: { type: Boolean, default: false },
  at: { type: Date, default: Date.now },
}, { timestamps: false });

notificationSchema.index({ user: 1, at: -1 });
notificationSchema.index({ user: 1, read: 1 });
notificationSchema.index({ at: 1 }, { expireAfterSeconds: 90 * 86400 });

export const Notification = mongoose.model('Notification', notificationSchema);
