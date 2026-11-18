import mongoose from 'mongoose';

// A browser or phone that asked for push notifications (Web Push: free, no app needed). One per device.
const pushSubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  endpoint: { type: String, required: true, unique: true, maxlength: 1000 },
  keys: { p256dh: { type: String, maxlength: 200 }, auth: { type: String, maxlength: 100 } },
}, { timestamps: true });

export const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema);
