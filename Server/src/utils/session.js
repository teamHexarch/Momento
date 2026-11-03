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

export async function startSession(res, user) {
  const id = crypto.randomUUID();
  const token = jwt.sign({ sub: user.id, jti: id }, config.jwtSecret, { expiresIn: `${config.sessionDays}d` });
  await User.updateOne({ _id: user.id }, { $pull: { sessions: { expiresAt: { $lte: new Date() } } } });
  // Check capacity and reserve a slot in the same atomic update, so concurrent
  // logins cannot both claim the final slot.
  const result = await User.updateOne({ _id: user.id, [`sessions.${MAX_SESSIONS - 1}`]: { $exists: false } }, {
    $push: { sessions: { id, expiresAt: new Date(jwt.decode(token).exp * 1000) } },
  });
  if (!result.matchedCount) throw new HttpError(409, 'This account already has 3 active logins. Log out on another device or browser, then try again.', 'session_limit');
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

// Short-lived cookie for one-off values such as the Apple sign-in nonce
export function setTempCookie(res, name, value, minutes = 10) {
  res.cookie(name, value, { ...cookieOptions(), signed: true, maxAge: minutes * 60000 });
}
export function clearTempCookie(res, name) {
  res.clearCookie(name, { ...cookieOptions(), signed: true });
}
