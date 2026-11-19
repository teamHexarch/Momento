import mongoose from 'mongoose';

// Emergency switches staff can flip during an attack (one row, id 'switches'):
// - signupsPaused: no new accounts (email or Google)
// - uploadsPaused: no new photos, covers or profile photos
// - joinsPaused: nobody joins albums
// - sessionsValidAfter: every login made before this moment stops working (sign everyone out)
const settingSchema = new mongoose.Schema({
  _id: { type: String, default: 'switches' },
  signupsPaused: { type: Boolean, default: false },
  uploadsPaused: { type: Boolean, default: false },
  joinsPaused: { type: Boolean, default: false },
  sessionsValidAfter: Date,
  updatedBy: mongoose.Schema.Types.ObjectId,
}, { timestamps: true, versionKey: false });

export const SecuritySetting = mongoose.model('SecuritySetting', settingSchema);
