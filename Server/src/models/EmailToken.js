import mongoose from 'mongoose';

// One-time links sent by email. Only a SHA-256 of the token is stored, so a database leak
// can't be turned into working links. MongoDB deletes each row once it expires.
const emailTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // 'verify' now; 'reset' is ready for password reset
  purpose: { type: String, enum: ['verify', 'reset'], required: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

export const EmailToken = mongoose.model('EmailToken', emailTokenSchema);
