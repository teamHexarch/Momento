import mongoose from 'mongoose';

// A host asking someone, by email address, to join an album. It shows on that person's albums
// page (once they have an account with that address) until they join. Unused invites expire.
const inviteSchema = new mongoose.Schema({
  album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

inviteSchema.index({ album: 1, email: 1 }, { unique: true });
inviteSchema.index({ email: 1 });

export const Invite = mongoose.model('Invite', inviteSchema);
