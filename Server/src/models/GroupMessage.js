import mongoose from 'mongoose';

// The group's shared chat: one row per message. Only current members can read or write.
const groupMessageSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, trim: true, maxlength: 1000 },
}, { timestamps: true });

groupMessageSchema.index({ group: 1, createdAt: -1 });

export const GroupMessage = mongoose.model('GroupMessage', groupMessageSchema);
