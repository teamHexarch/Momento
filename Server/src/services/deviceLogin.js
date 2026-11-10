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
