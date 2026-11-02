import { User } from '../models/User.js';
import { readSession } from '../utils/session.js';
import { HttpError } from '../utils/httpError.js';

// Puts the signed-in user on req.user (or null) for every request. A login from before the
// last password reset no longer counts, which is how a reset logs out every other device.
export async function loadUser(req, res, next) {
  const session = readSession(req);
  // With the password hash, so routes can tell password accounts apart (it never leaves the server)
  const user = session?.sub ? await User.findById(session.sub).select('+passwordHash').catch(() => null) : null;
  const changed = user?.passwordChangedAt ? Math.floor(user.passwordChangedAt.getTime() / 1000) : 0;
  req.user = user && session.iat >= changed ? user : null;
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Log in to continue.'));
  next();
}
