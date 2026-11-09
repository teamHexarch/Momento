import mongoose from 'mongoose';

// A friend group: everyone in it can see and add to every album shared with it, including albums
// shared later. Who is in it lives in GroupMember; the owner made it and is the only one who can
// rename it, remove people or delete it.
const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, { timestamps: true });

export const Group = mongoose.model('Group', groupSchema);
