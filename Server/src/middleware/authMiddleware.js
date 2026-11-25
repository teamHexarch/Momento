import { User } from '../models/User.js';
import { readSession, rotateSession, ROTATE_MS, GRACE_MS, ACTIVE_EVERY_MS, ipPrefix } from '../utils/session.js';
import { HttpError } from '../utils/httpError.js';
import { isStaffPlan } from '../utils/plans.js';
import { switches } from '../services/switches.js';
import { config } from '../config/env.js';

// Puts the signed-in user on req.user (or null) for every request. Who someone is comes only from
// their signed login cookie and its record on the account, never from anything else in the request.
// A login doesn't count when:
// - it was made before the last password change (that's how a reset logs out every other device),
// - it was made before staff pressed "sign everyone out",
// - the account is being deleted,
// - it's an old token replaced more than 2 minutes ago (a copied token: that login is ended).
export async function loadUser(req, res, next) {
  req.user = null;
  const session = readSession(req);
  if (!session) return next();
  const now = new Date();
  // With the password hash, so routes can tell password accounts apart (it never leaves the server)
  const user = await User.findOne({
    _id: session.sub,
    sessions: { $elemMatch: { $or: [{ id: session.jti }, { prev: session.jti }], expiresAt: { $gt: now } } },
  }).select('+passwordHash +sessions +accepted +deletingAt');
  if (!user || user.deletingAt) return next();
  const changed = user.passwordChangedAt ? Math.floor(user.passwordChangedAt.getTime() / 1000) : 0;
  if (session.iat < changed) return next();
  const validAfter = (await switches()).sessionsValidAfter;
  // (in whole seconds, like the token's own time, so a login made the same second as "sign everyone
  // out" still works; every login record was deleted at that moment anyway)
  if (validAfter && session.iat < Math.floor(new Date(validAfter).getTime() / 1000)) return next();
  const record = user.sessions.find((s) => s.id === session.jti) || user.sessions.find((s) => s.prev === session.jti);
  if (record.id !== session.jti) {
    // The token before the latest swap: fine for a moment (requests already on their way), then it's a copy
    if (!record.rotatedAt || now - record.rotatedAt > GRACE_MS) {
      await User.updateOne({ _id: user._id }, { $pull: { sessions: { id: record.id } } });
      const { audit } = await import('../services/auditService.js');
      await audit('session.reuse', { req, actor: user._id, target: user._id, meta: { device: record.deviceName } });
      return next();
    }
  } else if (now - session.iat * 1000 > ROTATE_MS) {
    await rotateSession(res, user._id, session.jti);
  }
  // "Last active" for the device list, at most every 5 minutes
  if (!record.lastActiveAt || now - record.lastActiveAt > ACTIVE_EVERY_MS) {
    await User.updateOne({ _id: user._id, 'sessions.id': record.id },
      { $set: { 'sessions.$.lastActiveAt': now, 'sessions.$.ipPrefix': ipPrefix(req.ip) || record.ipPrefix } });
  }
  req.user = user;
  next();
}

// Staff only (moderation, takedowns, the emergency switches). Everyone else gets a plain 404, as if
// the address didn't exist. Staff are accounts on the 'staff' plan, set only on the server itself
// (scripts/setPlan.js), never through the API.
export function requireStaff(req, res, next) {
  if (!req.user || !isStaffPlan(req.user.plan) || !req.user.emailVerified) return next(new HttpError(404, 'Not found.'));
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
  [/^(POST|DELETE) \/api\/reviews/, 'review', 'Log in or sign up to write a review. It only takes a moment.'],
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
  // Suspended accounts (3 copyright strikes, or staff) can still log in to download or delete their data
  if (req.user.suspendedAt) {
    return next(new HttpError(403, 'This account is suspended. You can still download your data or delete your account in Settings. Reply to any Momento email if you think this is a mistake.', 'suspended'));
  }
  // When REQUIRE_CONSENT is on: the current Terms and Privacy Policy must be accepted first
  // (POST /api/auth/consent). Off by default, so the site keeps working until it asks for consent.
  if (config.policies.enforce && !hasAccepted(req.user)) {
    return next(new HttpError(403, 'Please read and accept the updated Terms and Privacy Policy to keep using Momento.', 'consent-required', { policies: currentPolicies() }));
  }
  next();
}

export const currentPolicies = () => ({ tos: config.policies.tos, privacy: config.policies.privacy });
export const hasAccepted = (user) => user.accepted?.tos === config.policies.tos && user.accepted?.privacy === config.policies.privacy;
