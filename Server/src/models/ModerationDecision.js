import mongoose from 'mongoose';

// Every upload the automatic nudity check refused: which model and threshold decided, its scores,
// and when. The photo itself is never kept (only its SHA-256), so a refused picture isn't stored.
// The person can ask for a human to look again ("review requested"); if staff allow it, that same
// file is let through next time it's uploaded.
const decisionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  album: mongoose.Schema.Types.ObjectId,
  kind: { type: String, enum: ['photo', 'cover', 'avatar'], required: true },
  hash: { type: String, required: true },
  model: { type: String, required: true },
  threshold: Number,
  scores: { type: mongoose.Schema.Types.Mixed },
  // AWS Rekognition's level for it (0/25/50/75/85/95/100, services/rekognitionService.js). Level 100 is never published.
  autoLevel: Number,
  decision: { type: String, enum: ['blocked'], default: 'blocked' },
  reason: { type: String, default: 'Looks like it contains nudity' },
  status: { type: String, enum: ['final', 'review-requested', 'allowed', 'upheld'], default: 'final' },
  reviewedBy: mongoose.Schema.Types.ObjectId,
  // Dev Mode: the person who decided (their access code's label) and their session, as the account is shared
  reviewer: String,
  reviewerSession: String,
  reviewedAt: Date,
  // Staff's content level when reviewing (0/25/50/75/85/95/100; 15 on older reviews), which Rekognition learns from
  severity: Number,
  // Why staff chose that level: tick boxes on review.html (utils/reviewReasons.js), e.g. ['clothed', 'touching']
  reasons: { type: [String], default: undefined },
  // When the uploader asked for a review, the day it's due (2 working days after the upload, utils/workingDays.js),
  // and the reminders staff have had about it (each sent once)
  requestedAt: Date,
  dueDay: String,
  oneDayReminderSent: Boolean,
  dueTodayReminderSent: Boolean,
  at: { type: Date, default: Date.now },
}, { versionKey: false });

decisionSchema.index({ user: 1, at: -1 });
decisionSchema.index({ status: 1, at: -1 });
decisionSchema.index({ hash: 1, status: 1 });
// Kept a year
decisionSchema.index({ at: 1 }, { expireAfterSeconds: 365 * 86400 });

export const ModerationDecision = mongoose.model('ModerationDecision', decisionSchema);
