import mongoose from 'mongoose';

// The Dev Mode session slots: exactly config.devMode.maxSessions (6) documents, _id 1..6. A slot is taken by one
// session (one person, one browser) and freed by "Exit Dev Mode", by an idle timeout, or when its admin login ends.
// Taking a slot is one atomic update on a free (or idle) slot, so even simultaneous attempts can't make a 7th session.
// The browser holds a random token; only its SHA-256 is kept here.
const slotSchema = new mongoose.Schema({
  _id: Number,
  // Empty when the slot is free
  sessionId: String,      // public id for the logs (not a secret)
  tokenHash: String,
  admin: mongoose.Schema.Types.ObjectId,   // the shared admin account
  reviewer: mongoose.Schema.Types.ObjectId,
  reviewerLabel: String,
  createdAt: Date,
  lastActiveAt: Date,     // the reviewer last used the page (idle limit)
  lastSeenAt: Date,       // the page last said it is still open (closed pages end their session)
}, { versionKey: false });

slotSchema.index({ tokenHash: 1 });
// One code, one device: a reviewer can hold only one slot at a time (free slots have reviewer null)
slotSchema.index({ reviewer: 1 }, { unique: true, partialFilterExpression: { reviewer: { $type: 'objectId' } } });

export const DevSlot = mongoose.model('DevSlot', slotSchema);
