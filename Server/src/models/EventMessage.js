import mongoose from 'mongoose';

// An event album's chat, like a friend group's: one row per message. Only current members of the
// album can read or write, and only while the host has the chat switched on.
const eventMessageSchema = new mongoose.Schema({
  album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, trim: true, maxlength: 1000 },
}, { timestamps: true });

eventMessageSchema.index({ album: 1, createdAt: -1 });

export const EventMessage = mongoose.model('EventMessage', eventMessageSchema);
