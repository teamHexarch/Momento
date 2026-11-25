import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { config } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';
import { startSession } from '../utils/session.js';
import { isEmailConfigured, sendEmail } from './emailService.js';

const audience = 'momento-device-replacement';
const digest = value => crypto.createHmac('sha256', config.jwtSecret).update(value).digest('hex');
const expired = () => new HttpError(403, 'Verification has expired. Close this window and log in again.');

export function deviceLoginChallenge(user) {
  return jwt.sign({ sub: user.id, email: user.email, changed: user.passwordChangedAt?.getTime() ?? null,
    nonce: crypto.randomUUID() }, config.jwtSecret, { audience, expiresIn: '10m' });
}

function readChallenge(req) {
  let claim;
  try {
    claim = jwt.verify(req.body?.challenge, config.jwtSecret, { algorithms: ['HS256'], audience });
  } catch { throw expired(); }
  return { account: { _id: claim.sub, email: claim.email, passwordChangedAt: claim.changed },
    nonce: claim.nonce, expiresAt: new Date(claim.exp * 1000) };
}

export async function sendCode(req, res) {
  const { account, nonce, expiresAt } = readChallenge(req);
  if (!isEmailConfigured()) throw new HttpError(503, 'Email delivery is unavailable. Please try again later.');
  const code = String(crypto.randomInt(1000000)).padStart(6, '0');
  const codeHash = digest(nonce + code);
  const user = await User.findOneAndUpdate({ ...account, $or: [
    { 'deviceVerification.sentAt': null }, { 'deviceVerification.sentAt': { $lt: new Date(Date.now() - 60000) } },
  ] }, { $set: { deviceVerification: { challenge: nonce, expiresAt, codeHash, sentAt: new Date(), tries: 0 } } });
  if (!user) throw new HttpError(429, 'Wait a minute before requesting another code, or log in again.');
  try {
    await sendEmail({ to: user.email, subject: 'Verify your new Momento device',
      html: `<p>Enter <strong>${code}</strong> to choose a device to log out of Momento.</p><p>If you didn’t request this, you can ignore this email.</p>` });
  } catch (err) {
    await User.updateOne({ ...account, 'deviceVerification.codeHash': codeHash }, { $unset: { deviceVerification: 1 } });
    throw err;
  }
  res.json({ ok: true });
}

export async function verifyCode(req, res) {
  const { account, nonce } = readChallenge(req);
  const code = req.body?.code;
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new HttpError(400, 'Enter the six digits from your email.');
  const filter = { ...account, 'deviceVerification.challenge': nonce, 'deviceVerification.expiresAt': { $gt: new Date() } };
  const counted = await User.findOneAndUpdate({ ...filter, 'deviceVerification.tries': { $lt: 5 },
    'deviceVerification.codeHash': { $exists: true } }, { $inc: { 'deviceVerification.tries': 1 } }).select('+deviceVerification');
  if (!counted) throw new HttpError(403, 'Request a new code and try again.');
  const codeHash = counted.deviceVerification.codeHash;
  if (!crypto.timingSafeEqual(Buffer.from(digest(nonce + code)), Buffer.from(codeHash))) throw new HttpError(400, 'Incorrect code. Check the email and try again.');
  const ticket = crypto.randomBytes(32).toString('base64url');
  const verified = await User.findOneAndUpdate({ ...filter, 'deviceVerification.codeHash': codeHash },
    { $unset: { 'deviceVerification.codeHash': 1 }, $set: { 'deviceVerification.ticketHash': digest(ticket) } }).select('+sessions');
  if (!verified) throw expired();
  const devices = verified.sessions.filter(s => s.expiresAt > new Date()).map(s => ({
    id: s.id, name: s.deviceName || 'Previously signed-in device', loggedInAt: s.loggedInAt || null,
    expiresAt: s.expiresAt,
  }));
  res.set('Cache-Control', 'no-store').json({ ticket, devices });
}

export async function replaceDevice(req, res) {
  const { account, nonce } = readChallenge(req);
  const { ticket, deviceId } = req.body;
  if (typeof ticket !== 'string' || typeof deviceId !== 'string') throw expired();
  const filter = { ...account, 'deviceVerification.challenge': nonce, 'deviceVerification.ticketHash': digest(ticket),
    'deviceVerification.expiresAt': { $gt: new Date() } };
  const user = await User.findOne(filter).select('+passwordHash');
  if (!user) throw expired();
  await startSession(res, user, { filter, deviceId });
  res.json({ user: user.toPublic() });
}

// ---- Max 3 devices, with no dead end ----
// A 4th login with the right password gets 409 SESSION_LIMIT_REACHED with the 3 devices already logged in and a
// pendingLoginToken (10 minutes, one use). With it, POST /api/auth/devices/takeover signs out the oldest one
// ({ oldest: true }) or a chosen one ({ deviceId }) and finishes the login here, in one tap. (The emailed-code way
// above, with `challenge`, still works.)
const pendingAudience = 'momento-pending-login';
const usedPending = new Map();   // one use each: nonce → expiry (kept in memory until the token would expire anyway)
export function pendingLoginToken(user) {
  return jwt.sign({ sub: user.id, changed: user.passwordChangedAt?.getTime() ?? null, nonce: crypto.randomUUID() },
    config.jwtSecret, { audience: pendingAudience, expiresIn: '10m', algorithm: 'HS256' });
}
export async function sessionLimitReached(user) {
  const { deviceView, maxSessionsFor } = await import('../utils/session.js');
  const fresh = await User.findById(user.id).select('+sessions');
  const devices = (fresh?.sessions || []).filter((s) => s.expiresAt > new Date()).map((s) => deviceView(s))
    .sort((a, b) => new Date(a.lastActiveAt || 0) - new Date(b.lastActiveAt || 0));
  const max = maxSessionsFor(user.plan);
  return { code: 'SESSION_LIMIT_REACHED', error: `${max} devices are logged in. Sign one out to continue here.`,
    max, devices, pendingLoginToken: pendingLoginToken(user), challenge: deviceLoginChallenge(user) };
}

export async function takeover(req, res) {
  let claim;
  try { claim = jwt.verify(req.body?.pendingLoginToken, config.jwtSecret, { algorithms: ['HS256'], audience: pendingAudience }); }
  catch { throw new HttpError(403, 'This sign-in has expired. Log in again.', 'PENDING_LOGIN_EXPIRED'); }
  const now = Date.now();
  for (const [n, exp] of usedPending) if (exp < now) usedPending.delete(n);
  if (usedPending.has(claim.nonce)) throw new HttpError(403, 'This sign-in was already used. Log in again.', 'PENDING_LOGIN_EXPIRED');
  const user = await User.findById(claim.sub).select('+sessions +passwordHash');
  if (!user || user.deletingAt || (user.passwordChangedAt?.getTime() ?? null) !== claim.changed) {
    throw new HttpError(403, 'This sign-in has expired. Log in again.', 'PENDING_LOGIN_EXPIRED');
  }
  const live = user.sessions.filter((s) => s.expiresAt > new Date());
  const pick = req.body?.oldest === true
    ? live.slice().sort((a, b) => new Date(a.lastActiveAt || a.loggedInAt || 0) - new Date(b.lastActiveAt || b.loggedInAt || 0))[0]
    : live.find((s) => s.id === req.body?.deviceId);
  if (!pick) throw new HttpError(404, 'That device is no longer logged in. Try logging in again.', 'DEVICE_NOT_FOUND');
  usedPending.set(claim.nonce, claim.exp * 1000);
  await startSession(res, user, { filter: { _id: user._id }, deviceId: pick.id });
  const { audit } = await import('./auditService.js');
  await audit('session.replaced', { req, actor: user._id, target: user._id, meta: { replaced: pick.deviceName, oldest: req.body?.oldest === true } });
  // The password alone got past the limit here (no emailed code), so the owner hears about it at once
  const { describeDevice } = await import('../utils/session.js');
  const { deviceReplacedHtml } = await import('./emailTemplates.js');
  sendEmail({ to: user.email, subject: 'A new device signed in to Momento',
    html: deviceReplacedHtml(user, describeDevice(req.headers['user-agent']), pick.deviceName) })
    .catch((err) => console.error(`Device sign-in email failed: ${err.message}`));
  res.json({ user: user.toPublic(), signedOut: { id: pick.id, name: pick.deviceName || null } });
}

// ---- Settings → Active devices (signed in) ----
// GET /api/auth/devices · DELETE /api/auth/devices/:id · POST /api/auth/devices/sign-out-others
export async function listMine(req, res) {
  const { deviceView, readSession, maxSessionsFor } = await import('../utils/session.js');
  const current = readSession(req)?.jti;
  const devices = req.user.sessions.filter((s) => s.expiresAt > new Date()).map((s) => deviceView(s, current))
    .sort((a, b) => (b.current - a.current) || (new Date(b.lastActiveAt || 0) - new Date(a.lastActiveAt || 0)));
  const max = maxSessionsFor(req.user.plan);
  res.set('Cache-Control', 'no-store').json({ devices, max: Number.isFinite(max) ? max : null, count: devices.length });
}
export async function signOutDevice(req, res) {
  const { readSession } = await import('../utils/session.js');
  const current = readSession(req)?.jti;
  const target = req.user.sessions.find((s) => s.id === req.params.id);
  if (!target) throw new HttpError(404, 'That device is no longer logged in.', 'DEVICE_NOT_FOUND');
  if (target.id === current || target.prev === current) throw new HttpError(400, 'This is the device you’re using. Use Log out instead.', 'DEVICE_IS_CURRENT');
  await User.updateOne({ _id: req.user._id }, { $pull: { sessions: { id: target.id } } });
  const { audit } = await import('./auditService.js');
  await audit('session.signed-out-remotely', { req, target: req.user._id, meta: { device: target.deviceName } });
  res.json({ ok: true });
}
export async function signOutOthers(req, res) {
  const { readSession } = await import('../utils/session.js');
  const current = readSession(req)?.jti;
  const mine = req.user.sessions.find((s) => s.id === current || s.prev === current);
  const result = await User.updateOne({ _id: req.user._id }, { $pull: { sessions: { id: { $ne: mine?.id } } } });
  const { audit } = await import('./auditService.js');
  await audit('session.signed-out-others', { req, target: req.user._id });
  res.json({ ok: true, signedOut: result.modifiedCount ? req.user.sessions.length - 1 : 0 });
}
