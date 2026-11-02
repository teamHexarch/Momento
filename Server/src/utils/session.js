import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

// Logins live in an httpOnly cookie holding a signed JWT, so page scripts never touch the token
export const SESSION_COOKIE = 'momento_session';

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.secureCookies,
  sameSite: 'lax',
  path: '/',
});

export function startSession(res, user) {
  const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: `${config.sessionDays}d` });
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: config.sessionDays * 86400000 });
}

export function endSession(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

// The cookie's signed payload ({ sub: user id, iat: issued-at seconds }), or null when there is no valid session
export function readSession(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  try {
    return jwt.verify(token, config.jwtSecret);
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
