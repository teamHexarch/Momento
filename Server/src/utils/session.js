import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { config } from '../config/env.js';
import { HttpError } from './httpError.js';
import { ADMIN_PLANS } from './plans.js';

// Logins live in an httpOnly cookie holding a signed JWT, so page scripts never touch the token.
// Every login also has a record on the account (sessions[]), checked on every request, so logging
// out, resetting the password or "sign everyone out" ends it at once on the server.
//
// Rotation: while someone uses the site, their token is swapped for a fresh one every 12 hours (same
// login, new id); a token lives TOKEN_DAYS (7 unless set) from its last swap, so a login that isn't
// used for a week ends. The previous token keeps working for 2 minutes (requests already on their way),
// after which presenting it again means it was copied: that login is ended and staff are alerted.
export const SESSION_COOKIE = 'momento_session';
export const MAX_SESSIONS = 3;
// Accounts on the 'admin' plan (every account since 2026-11-10) and 'staff' have no device limit. Unused logins
// still end after TOKEN_DAYS, and "sign everyone out" / a password reset ends them all.
export const maxSessionsFor = (plan) => (ADMIN_PLANS.includes(plan) ? Infinity : MAX_SESSIONS);
const ISSUER = 'momento-api', AUDIENCE = 'momento-session';
export const ROTATE_MS = 12 * 3600000;
export const GRACE_MS = 2 * 60000;
const tokenMs = () => config.tokenDays * 86400000;

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.secureCookies,
  // Lax, not Strict: email links (confirm your email, approve an email change) open a page on this
  // server from the mail app, and need the login to come along. Writes from other sites are refused
  // anyway (sameOriginWrites checks the Origin of every change).
  sameSite: 'lax',
  path: '/',
});

// "iPhone • Safari", "Windows • Chrome": what the device list shows
export function describeDevice(agent = '') {
  const browser = /Edg/i.test(agent) ? 'Edge' : /Firefox|FxiOS/i.test(agent) ? 'Firefox'
    : /Chrome|CriOS/i.test(agent) ? 'Chrome' : /Safari/i.test(agent) ? 'Safari' : 'Browser';
  const platform = ['iPad', 'iPhone', 'Android', 'Windows', 'Mac', 'Linux'].find(name => agent.includes(name));
  return platform ? platform + ' • ' + browser : browser;
}
// Only the start of the IP address is kept with a login ("203.0.113.x"), to help tell devices apart
export function ipPrefix(ip) {
  const s = String(ip || '').replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) return s.split('.').slice(0, 3).join('.') + '.x';
  if (s.includes(':')) return s.split(':').slice(0, 3).join(':') + '::x';
  return undefined;
}
// "Last active" is saved at most every 5 minutes per login (loadUser), so busy pages don't write on every request
export const ACTIVE_EVERY_MS = 5 * 60000;
// One login as the device list shows it (never the token)
export const deviceView = (s, currentId) => ({
  id: s.id, name: s.deviceName || 'Previously signed-in device', ipPrefix: s.ipPrefix || null,
  loggedInAt: s.loggedInAt || null, lastActiveAt: s.lastActiveAt || s.loggedInAt || null, expiresAt: s.expiresAt,
  current: !!currentId && (s.id === currentId || s.prev === currentId),
});

function sign(userId, jti) {
  const token = jwt.sign({ sub: String(userId), jti }, config.jwtSecret, { algorithm: 'HS256', expiresIn: Math.floor(tokenMs() / 1000), issuer: ISSUER, audience: AUDIENCE });
  return { token, expiresAt: new Date(jwt.decode(token).exp * 1000) };
}
const setCookie = (res, token) => res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: tokenMs() });

export async function startSession(res, user, replacement) {
  const id = crypto.randomUUID();
  const { token, expiresAt } = sign(user.id, id);
  const now = new Date();
  const session = { id, deviceName: describeDevice(res.req?.headers['user-agent']), ipPrefix: ipPrefix(res.req?.ip),
    loggedInAt: now, lastActiveAt: now, expiresAt };
  if (replacement) {
    const result = await User.updateOne({
      ...replacement.filter, sessions: { $elemMatch: { id: replacement.deviceId, expiresAt: { $gt: new Date() } } },
    }, { $set: { 'sessions.$': session, lastLoginAt: session.loggedInAt }, $unset: { deviceVerification: 1 } });
    if (!result.modifiedCount) throw new HttpError(409, 'This device or verification has changed. Log in again.');
  } else {
    await User.updateOne({ _id: user.id }, { $pull: { sessions: { expiresAt: { $lte: new Date() } } } });
    // Check capacity and reserve a slot in the same atomic update, so concurrent
    // logins cannot both claim the final slot.
    const result = await User.updateOne({
      _id: user.id,
      $or: [
        { plan: { $in: ADMIN_PLANS } },
        { plan: { $nin: ADMIN_PLANS }, [`sessions.${MAX_SESSIONS - 1}`]: { $exists: false } },
      ],
    }, {
      $push: { sessions: session },
    });
    if (!result.matchedCount) throw new HttpError(409, `This account already has ${maxSessionsFor(user.plan)} active logins. Log out on another device or browser, then try again.`, 'session_limit');
  }
  setCookie(res, token);
}

// A fresh token for the same login (see "Rotation" above). Only one of several requests arriving
// together does the swap (the update only matches while the old id is still current).
export async function rotateSession(res, userId, oldId) {
  const id = crypto.randomUUID();
  const { token, expiresAt } = sign(userId, id);
  const done = await User.updateOne(
    { _id: userId, sessions: { $elemMatch: { id: oldId, expiresAt: { $gt: new Date() } } } },
    { $set: { 'sessions.$.id': id, 'sessions.$.prev': oldId, 'sessions.$.rotatedAt': new Date(), 'sessions.$.expiresAt': expiresAt } },
  );
  if (done.modifiedCount) setCookie(res, token);
  return done.modifiedCount === 1;
}

export async function endSession(req, res) {
  const payload = readSession(req);
  if (payload?.jti) await User.updateOne({ _id: payload.sub }, { $pull: { sessions: { $or: [{ id: payload.jti }, { prev: payload.jti }] } } });
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

// The cookie's signed payload ({ sub: user id, jti: login id, iat: issued-at seconds }), or null when
// there is no valid one. Only HS256, and only tokens made for logins here (issuer and audience).
// (Old-style tokens without an issuer and audience are no longer accepted: every one of them expired long ago.)
export function readSession(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token || typeof token !== 'string' || token.length > 2000) return null;
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
  } catch {
    return null;
  }
  return typeof payload.sub === 'string' && typeof payload.jti === 'string' ? payload : null;
}
