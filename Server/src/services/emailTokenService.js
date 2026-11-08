import crypto from 'node:crypto';
import { EmailToken } from '../models/EmailToken.js';
import { User } from '../models/User.js';

// One-time links for emails. The raw token only ever exists in the email; the database
// keeps its SHA-256, so a leaked database can't be turned into working links.
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

// A new token for this purpose; any older ones for the same person and purpose stop working
// (extra carries anything the link needs later, such as newEmail for an email change)
export async function issueToken(user, purpose, minutes, extra = {}) {
  await EmailToken.deleteMany({ user: user._id, purpose });
  const token = crypto.randomBytes(32).toString('base64url');
  await EmailToken.create({ ...extra, user: user._id, purpose, tokenHash: hash(token), expiresAt: new Date(Date.now() + minutes * 60000) });
  return token;
}

// Uses up a token: returns its user if it was real, unused and unexpired, otherwise null
export async function redeemToken(token, purpose) {
  return (await redeemTokenRow(token, purpose))?.user || null;
}

// Looks a token up without using it (for showing what a link will do before anyone presses a button)
export async function peekTokenRow(token, purpose) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const row = await EmailToken.findOne({ tokenHash: hash(token), purpose, expiresAt: { $gt: new Date() } });
  const user = row && await User.findById(row.user);
  return user ? { row, user } : null;
}

// The same, also handing back the stored row (for its extra fields)
export async function redeemTokenRow(token, purpose) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const row = await EmailToken.findOneAndDelete({ tokenHash: hash(token), purpose, expiresAt: { $gt: new Date() } });
  const user = row && await User.findById(row.user).select('+passwordHash');
  return user ? { row, user } : null;
}
