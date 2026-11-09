import mongoose from 'mongoose';

// A group member asking someone, by email address, to join a group. It waits on that person's
// Groups page (once they have a confirmed account with that address) until they accept or
// decline it. Unused invites expire.
const groupInviteSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

groupInviteSchema.index({ group: 1, email: 1 }, { unique: true });
groupInviteSchema.index({ email: 1 });

export const GroupInvite = mongoose.model('GroupInvite', groupInviteSchema);
