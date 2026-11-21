import mongoose from 'mongoose';

// Something that happened to you: someone reacted to your photo, added photos to your album, joined or
// asked to join an album you host, the host let you in, someone invited you to a group, or an album
// you're in is about to stop taking photos. One reaction per person per photo (changing it updates it).
// Read ones stay in the inbox until cleared; everything goes after 90 days.
// ('like' is from before likes became private bookmarks: no new ones are made and old ones aren't shown.)
const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['like', 'reaction', 'joined', 'request', 'approved', 'photos', 'invite', 'closing', 'review-approved', 'review-declined'], required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album' },
  photo: { type: mongoose.Schema.Types.ObjectId, ref: 'Photo' },
  // For 'invite': the group they were invited to
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
  // For 'photos': the photos added since they last read it (the newest 60), so tapping it shows just those
  photos: { type: [mongoose.Schema.Types.ObjectId], default: undefined },
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
