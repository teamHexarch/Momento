import mongoose from 'mongoose';

// The admin team: at most 6 people (slots 1-6), each with their own 6-character code (letters and numbers, kept only
// as a salted scrypt hash). They open /api/admin (photo moderation, reports, thresholds, the team itself) by signing in
// to their own Momento account (the slot's email) and entering their code (services/adminStaffService.js).
// A 7th person can't be added: the slot must be 1-6 and each slot holds one person (unique index).
export const MAX_ADMIN_STAFF = 6;

const schema = new mongoose.Schema({
  slot: { type: Number, required: true, min: 1, max: MAX_ADMIN_STAFF, validate: Number.isInteger },
  name: { type: String, required: true, trim: true, maxlength: 40 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  codeHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['owner', 'moderator'], default: 'moderator' },
  isActive: { type: Boolean, default: true },
  // Goes up when the code changes or the slot is revoked: every 4-hour pass issued before then stops working
  tokenVersion: { type: Number, default: 1 },
  codeRotatedAt: { type: Date, default: Date.now },
  lastLoginAt: Date,
}, { collection: 'admin_staff', timestamps: true, versionKey: false });

schema.index({ slot: 1 }, { unique: true });
schema.index({ email: 1 }, { unique: true });

// Belt and braces for the cap (the slot range and unique index already make a 7th record impossible)
schema.pre('save', async function () {
  if (!this.isNew) return;
  const used = await this.constructor.countDocuments({ _id: { $ne: this._id } });
  if (used >= MAX_ADMIN_STAFF) throw Object.assign(new Error(`The admin team is full (${MAX_ADMIN_STAFF} of ${MAX_ADMIN_STAFF}).`), { code: 'ADMIN_TEAM_FULL' });
});

export const AdminStaff = mongoose.model('AdminStaff', schema);
