import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { config } from '../config/env.js';
import { HttpError } from './httpError.js';

// Logins live in an httpOnly cookie holding a signed JWT, so page scripts never touch the token
export const SESSION_COOKIE = 'momento_session';
export const MAX_SESSIONS = 3;

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.secureCookies,
  sameSite: 'lax',
  path: '/',
});

function describeDevice(agent = '') {
  const browser = /Edg/i.test(agent) ? 'Edge' : /Firefox|FxiOS/i.test(agent) ? 'Firefox'
    : /Chrome|CriOS/i.test(agent) ? 'Chrome' : /Safari/i.test(agent) ? 'Safari' : 'Browser';
  const platform = ['iPad', 'iPhone', 'Android', 'Windows', 'Mac', 'Linux'].find(name => agent.includes(name));
  return platform ? browser + ' on ' + platform : browser;
}

export async function startSession(res, user, replacement) {
  const id = crypto.randomUUID();
  const token = jwt.sign({ sub: user.id, jti: id }, config.jwtSecret, { expiresIn: `${config.sessionDays}d` });
  const session = { id, deviceName: describeDevice(res.req?.headers['user-agent']), loggedInAt: new Date(), expiresAt: new Date(jwt.decode(token).exp * 1000) };
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
      $or: [{ plan: 'admin' }, { [`sessions.${MAX_SESSIONS - 1}`]: { $exists: false } }],
    }, {
      $push: { sessions: session },
    });
    if (!result.matchedCount) throw new HttpError(409, 'This account already has 3 active logins. Log out on another device or browser, then try again.', 'session_limit');
  }
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: config.sessionDays * 86400000 });
}

export async function endSession(req, res) {
  const payload = readSession(req);
  if (payload?.jti) await User.updateOne({ _id: payload.sub }, { $pull: { sessions: { id: payload.jti } } });
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

// The cookie's signed payload ({ sub: user id, iat: issued-at seconds }), or null when there is no valid session
export function readSession(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    // Legacy tokens have no server record and require a fresh login.
    return typeof payload.sub === 'string' && typeof payload.jti === 'string' ? payload : null;
  } catch {
    return null;
  }
}
