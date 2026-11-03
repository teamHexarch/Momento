import { User } from '../models/User.js';
import { readSession } from '../utils/session.js';
import { HttpError } from '../utils/httpError.js';

// Puts the signed-in user on req.user (or null) for every request. A login from before the
// last password reset no longer counts, which is how a reset logs out every other device.
export async function loadUser(req, res, next) {
  const session = readSession(req);
  // With the password hash, so routes can tell password accounts apart (it never leaves the server)
  const user = session ? await User.findOne({
    _id: session.sub,
    sessions: { $elemMatch: { id: session.jti, expiresAt: { $gt: new Date() } } },
  }).select('+passwordHash') : null;
  const changed = user?.passwordChangedAt ? Math.floor(user.passwordChangedAt.getTime() / 1000) : 0;
  req.user = user && session.iat >= changed ? user : null;
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Log in to continue.'));
  next();
}

// Albums and photos are only for people who have confirmed their email. Until then they can still
// log in and out, ask for a new confirm link, fix a mistyped address, delete the account and
// contact support (those routes use requireUser only).
export function requireVerified(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Log in to continue.'));
  if (!req.user.emailVerified) {
    return next(new HttpError(403, `Confirm your email to start using Momento. We sent a link to ${req.user.email}.`, 'unverified'));
  }
  next();
}
