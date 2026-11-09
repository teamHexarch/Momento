import mongoose from 'mongoose';

// One row per person per group (the owner has one too). Access to group albums is worked out
// from these rows on every request, so leaving or being removed takes effect straight away.
const groupMemberSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['owner', 'member'], required: true },
  // When they last read the group chat: newer messages from others count as unread
  lastReadAt: Date,
}, { timestamps: true });

// One membership per person per group, so accepting an invite twice can't make a second one
groupMemberSchema.index({ group: 1, user: 1 }, { unique: true });
groupMemberSchema.index({ user: 1 });

export const GroupMember = mongoose.model('GroupMember', groupMemberSchema);
