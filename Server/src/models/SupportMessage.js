import mongoose from 'mongoose';

// Messages sent with the "Send us a message" form (support.html). Kept here as well as emailed, so a
// message is never lost if the email can't be sent; removed after 180 days.
const supportMessageSchema = new mongoose.Schema({
  topic: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  message: { type: String, required: true },
  user: mongoose.Schema.Types.ObjectId,   // when sent while logged in
  emailed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, expires: 180 * 86400 },
});

export const SupportMessage = mongoose.model('SupportMessage', supportMessageSchema);
