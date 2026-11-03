import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 80, default: '' },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254, unique: true },
  // Absent for people who only ever used Google or Apple
  passwordHash: { type: String, select: false },
  avatarUrl: { type: String, default: '' },
  // Google and Apple vouch for the address; email/password signups start unverified
  emailVerified: { type: Boolean, default: false },
  plan: { type: String, enum: ['free', 'plus'], default: 'free' },
  googleId: { type: String, unique: true, sparse: true },
  appleId: { type: String, unique: true, sparse: true },
  lastLoginAt: Date,
  // One record per login. Never apply a TTL index here: that would delete users.
  sessions: {
    type: [{ _id: false, id: { type: String, required: true }, expiresAt: { type: Date, required: true } }],
    default: [],
    select: false,
  },
  // Logins issued before this moment are refused (set when the password is reset)
  passwordChangedAt: Date,
  // Which emails they want (only the choice is stored; sending them comes later)
  notify: {
    photos: { type: Boolean, default: true },    // someone adds photos to an album I'm in
    closing: { type: Boolean, default: true },   // an album is about to close
    recap: { type: Boolean, default: false },    // weekly recap
  },
}, { timestamps: true });

// What the client is allowed to see
userSchema.methods.toPublic = function () {
  return {
    id: this.id,
    name: this.name,
    email: this.email,
    avatarUrl: this.avatarUrl,
    emailVerified: this.emailVerified,
    plan: this.plan,
    hasPassword: !!this.passwordHash,
    notify: { photos: this.notify?.photos ?? true, closing: this.notify?.closing ?? true, recap: this.notify?.recap ?? false },
    providers: [this.googleId && 'google', this.appleId && 'apple'].filter(Boolean),
  };
};

export const User = mongoose.model('User', userSchema);
