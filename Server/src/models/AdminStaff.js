import mongoose from 'mongoose';

// The admin team: at most 6 people (slots 1-6), each with their own 6-character code (letters and numbers, kept only
// as a salted scrypt hash). They all sign in to the one shared staff account (ADMIN_ACCOUNT_EMAIL, team@hexarch.org),
// and the code they enter says which of them it is, so every action is logged under their name
// (services/adminStaffService.js). Each person chooses their own code from a one-time link emailed to their own
// address (`email`, used only for that); nobody else ever sees it. Signing in to a Momento account with the slot's
// own email works too.
// A 7th person can't be added: the slot must be 1-6 and each slot holds one person (unique index).
export const MAX_ADMIN_STAFF = 6;

const schema = new mongoose.Schema({
  slot: { type: Number, required: true, min: 1, max: MAX_ADMIN_STAFF, validate: Number.isInteger },
  name: { type: String, required: true, trim: true, maxlength: 40 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  codeHash: { type: String, select: false },      // unset until the person chooses their code
  // The one-time link to choose (or change) the code: only its SHA-256 is kept, and it ends at setupExpires
  setupTokenHash: { type: String, select: false },
  setupExpires: Date,
  setupTries: { type: Number, default: 0 },
  role: { type: String, enum: ['owner', 'moderator'], default: 'moderator' },
  isActive: { type: Boolean, default: true },
  // Goes up when the code changes or the slot is revoked: every 4-hour pass issued before then stops working
  tokenVersion: { type: Number, default: 1 },
  codeRotatedAt: { type: Date, default: Date.now },
  // Second step (audit L3): an authenticator app's 6-digit code, after the 6-character code. Set up with
  // node scripts/adminTeam.js totp <slot>; required for every owner who has it set up (utils/totp.js).
  totpSecret: { type: String, select: false },   // encrypted (utils/totp.js sealSecret)
  totpEnabledAt: Date,
  totpLastStep: { type: Number, select: false },  // the last code used can't be used again
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
