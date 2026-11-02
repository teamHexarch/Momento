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
  // Logins issued before this moment are refused (set when the password is reset)
  passwordChangedAt: Date,
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
    providers: [this.googleId && 'google', this.appleId && 'apple'].filter(Boolean),
  };
};

export const User = mongoose.model('User', userSchema);
