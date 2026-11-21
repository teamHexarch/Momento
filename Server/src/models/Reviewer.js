import mongoose from 'mongoose';

// One person allowed to use Dev Mode (photo moderation) on the shared admin account. Everyone signs in with that
// one admin email; their own static access code says who they are, so every session and decision is theirs.
// Only a bcrypt hash of the code is kept. Made and revoked with scripts/reviewerCodes.js, never through the API.
const reviewerSchema = new mongoose.Schema({
  // Short identifier shown in the header and the logs, e.g. 'Reviewer_A'
  label: { type: String, required: true, unique: true, trim: true, maxlength: 40 },
  name: { type: String, trim: true, maxlength: 80 },
  // The shared admin account this code unlocks (DEV_MODE_ADMIN_EMAIL)
  adminEmail: { type: String, required: true, lowercase: true, trim: true },
  codeHash: { type: String, required: true, select: false },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  lastUsedAt: Date,
  revokedAt: Date,
}, { versionKey: false });

reviewerSchema.index({ adminEmail: 1, active: 1 });

export const Reviewer = mongoose.model('Reviewer', reviewerSchema);
