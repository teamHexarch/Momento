import mongoose from 'mongoose';
import { avatarOf } from '../services/avatarService.js';
import { PLANS } from '../utils/plans.js';

const userSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 80, default: '' },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254, unique: true },
  // Absent for people who only ever used Google
  passwordHash: { type: String, select: false },
  // Their Google photo, until they upload their own
  avatarUrl: { type: String, default: '' },
  // A profile photo they uploaded (storage key; served by /api/users/:id/avatar)
  avatarKey: String,
  // Google vouches for the address; email/password signups start unverified
  emailVerified: { type: Boolean, default: false },
  // Limits and powers (utils/plans.js). Every new account starts as free (set 2026-11-21; was 'admin' from 2026-11-10).
  // 'staff' = admin + the staff tools. Only ever set on the server (scripts/setPlan.js), never through the API.
  plan: { type: String, enum: PLANS, default: 'free' },
  // Copyright strikes from takedowns; at 3 the account is suspended (suspendedAt)
  strikes: { type: Number, default: 0 },
  suspendedAt: Date,
  suspendedReason: String,
  // Ages 13 to 17 (from the age check at sign-up): kept out of public places such as the Events map
  isMinor: { type: Boolean, default: false },
  // When they confirmed their age at sign-up (the birth date itself is never stored)
  ageConfirmedAt: Date,
  // The latest Terms and Privacy Policy versions they accepted (the proof is in the Consent collection)
  accepted: { type: new mongoose.Schema({ tos: String, privacy: String }, { _id: false }), select: false },
  // Set while the account is being deleted: no login works, and a job finishes it if it stops halfway
  deletingAt: { type: Date, select: false },
  googleId: { type: String, unique: true, sparse: true },
  lastLoginAt: Date,
  verificationResendAt: Date,
  // The album code from the invite link they signed up through. Joined (and cleared) once they
  // confirm their email, so the confirm link takes them into the album on any device
  pendingJoin: { type: String, maxlength: 7, select: false },
  // Wrong passwords in a row, and (after 5) when logging in is allowed again
  loginFails: { type: Number, default: 0, select: false },
  // When the last weekly recap went out
  recapAt: { type: Date, default: null },
  lockedUntil: { type: Date, select: false },
  // Albums they saved (the bookmark on My albums; shown under Liked)
  savedAlbums: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  // One record per login. Never apply a TTL index here: that would delete users.
  deviceVerification: {
    type: new mongoose.Schema({ challenge: String, codeHash: String, ticketHash: String, expiresAt: Date, sentAt: Date, tries: Number }, { _id: false }),
    select: false,
  },
  sessions: {
    // prev/rotatedAt: the token this login had before its latest swap (see utils/session.js)
    // deviceName: "iPhone • Safari"; ipPrefix: only the start of the IP ("203.0.113.x"); lastActiveAt: saved at most every 5 minutes
    type: [{ _id: false, id: { type: String, required: true }, prev: String, rotatedAt: Date, deviceName: String, ipPrefix: String,
      loggedInAt: Date, lastActiveAt: Date, expiresAt: { type: Date, required: true } }],
    default: [],
    select: false,
  },
  // Logins issued before this moment are refused (set when the password is reset)
  passwordChangedAt: Date,
  // Changing the password from Settings, in steps: the current password emails a 6-digit code
  // (stored only as a hash), the right code gives a short-lived ticket, and the ticket lets the
  // new password be set. Cleared once the password changes.
  passwordChange: {
    type: new mongoose.Schema({
      codeHash: String,
      codeExpiresAt: Date,
      tries: { type: Number, default: 0 },
      ticketHash: String,
      ticketExpiresAt: Date,
    }, { _id: false }),
    select: false,
  },
  // Which emails they want. None is marketing; the weekly recap is off unless they turn it on, and
  // every email that isn't about their account has a one-click unsubscribe link
  notify: {
    photos: { type: Boolean, default: true },    // someone adds photos to an album I'm in
    closing: { type: Boolean, default: true },   // an album is about to close
    recap: { type: Boolean, default: false },    // weekly recap
    activity: { type: Boolean, default: true },  // inbox: joins and new photos in my public albums
  },
}, { timestamps: true });

// What the client is allowed to see
userSchema.methods.toPublic = function () {
  return {
    id: this.id,
    name: this.name,
    email: this.email,
    avatarUrl: avatarOf(this),
    hasAvatar: !!this.avatarKey,
    emailVerified: this.emailVerified,
    verificationResendAt: this.verificationResendAt || null,
    plan: this.plan,
    hasPassword: !!this.passwordHash,
    notify: { photos: this.notify?.photos ?? true, closing: this.notify?.closing ?? true, recap: this.notify?.recap ?? false, activity: this.notify?.activity ?? true },
    providers: this.googleId ? ['google'] : [],
  };
};

export const User = mongoose.model('User', userSchema);
