import mongoose from 'mongoose';

// One row per person per album: the host gets one when they create it, guests when they join
const membershipSchema = new mongoose.Schema({
  album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['host', 'guest'], required: true },
  // 'group': a row kept only to remember what a friend-group member has hidden in a group album.
  // It never grants access on its own: that comes from being in the group, checked every time.
  via: { type: String, enum: ['group'] },
  // Photos this person has hidden from their own view of the album (Sort photos). Everyone else
  // still sees them; nothing is deleted
  hidden: { type: [mongoose.Schema.Types.ObjectId], default: [] },
}, { timestamps: true });

membershipSchema.index({ album: 1, user: 1 }, { unique: true });
membershipSchema.index({ user: 1, createdAt: -1 });

export const Membership = mongoose.model('Membership', membershipSchema);
