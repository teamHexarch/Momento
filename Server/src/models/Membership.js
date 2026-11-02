import mongoose from 'mongoose';

// One row per person per album: the host gets one when they create it, guests when they join
const membershipSchema = new mongoose.Schema({
  album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['host', 'guest'], required: true },
}, { timestamps: true });

membershipSchema.index({ album: 1, user: 1 }, { unique: true });
membershipSchema.index({ user: 1, createdAt: -1 });

export const Membership = mongoose.model('Membership', membershipSchema);
