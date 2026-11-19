import mongoose from 'mongoose';

// Proof that someone accepted a version of the Terms or the Privacy Policy: who, which policy and
// version, when, and a salted hash of their IP (never the IP itself). One row per acceptance, so a
// new policy version adds a row and the history stays. Deleted with the account.
const consentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  policy: { type: String, enum: ['tos', 'privacy'], required: true },
  version: { type: String, required: true, maxlength: 40 },
  at: { type: Date, default: Date.now },
  ipHash: String,
  // How it was given: the sign-up form, Google sign-in, or accepting an updated policy
  via: { type: String, enum: ['signup', 'google', 'update'], default: 'update' },
}, { versionKey: false });

consentSchema.index({ user: 1, policy: 1, version: 1 }, { unique: true });

export const Consent = mongoose.model('Consent', consentSchema);
