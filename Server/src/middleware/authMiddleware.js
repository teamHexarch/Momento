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

// Visitors can look around without an account (album previews, events nearby). The moment they
// try to do something (join, add photos, like, comment, create), they get a 401 with
// code 'login-required', an 'action' the page can pick up again after they log in, and a friendly
// line to show on the log-in / sign-up popup.
const ACTIONS = [
  [/^POST \/api\/albums\/join$|^POST \/api\/events\/[^/]+\/join$/, 'join', 'Log in or sign up to join this album. It only takes a moment.'],
  [/^POST \/api\/albums\/[^/]+\/photos$/, 'upload', 'Log in or sign up to add your photos to this album.'],
  [/^POST \/api\/photos\/[^/]+\/(like|comments)/, 'react', 'Log in or sign up to like and comment on photos.'],
  [/^POST \/api\/albums$/, 'create', 'Log in or sign up to create your album. It’s free.'],
  [/^(POST|PATCH|DELETE) \/api\/groups/, 'groups', 'Log in or sign up to share albums with your friends.'],
  [/^GET \/api\/(photos|albums)\//, 'view', 'Log in or sign up to see the photos in this album.'],
];
export function loginRequired(req) {
  const key = `${req.method} ${req.originalUrl.split('?')[0]}`;
  const [, action, message] = ACTIONS.find(([re]) => re.test(key)) || [null, 'continue', 'Log in or sign up to continue.'];
  return new HttpError(401, message, 'login-required', { action });
}

export function requireUser(req, res, next) {
  if (!req.user) return next(loginRequired(req));
  next();
}

// Albums and photos are only for people who have confirmed their email. Until then they can still
// log in and out, ask for a new confirm link, fix a mistyped address, delete the account and
// contact support (those routes use requireUser only).
export function requireVerified(req, res, next) {
  if (!req.user) return next(loginRequired(req));
  if (!req.user.emailVerified) {
    return next(new HttpError(403, `Confirm your email to start using Momento. We sent a link to ${req.user.email}.`, 'unverified'));
  }
  next();
}
