import mongoose from 'mongoose';

// A friend group: everyone in it can see and add to every album shared with it, including albums
// shared later. Who is in it lives in GroupMember; the owner made it and is the only one who can
// rename it, remove people or delete it.
const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // The invite link and QR code (events.html?group=CODE): anyone with it can join. 10 characters from 31
  // (about 50 bits), shown only to members; the owner can make a new one, which stops the old link working.
  inviteCode: { type: String, unique: true, sparse: true },
}, { timestamps: true });

export const Group = mongoose.model('Group', groupSchema);
