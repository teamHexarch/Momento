// Dev Mode: photo moderation on one shared admin account (DEV_MODE_ADMIN_EMAIL), unlocked per person with their own
// static access code (models/Reviewer.js, scripts/reviewerCodes.js). Each unlock takes one of the 6 session slots
// (models/DevSlot.js) and gets its own random token in an httpOnly cookie. A slot is freed by "Exit Dev Mode" (that
// session only), by DEV_MODE_IDLE_MINUTES without use, or when that browser logs out of the admin account.
// Every login, logout, timeout and failed code is in the audit log with the reviewer's label and the session id.
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config/env.js';
import { DevSlot } from '../models/DevSlot.js';
import { Reviewer } from '../models/Reviewer.js';
import { isStaffPlan } from '../utils/plans.js';
import { audit } from './auditService.js';

export const DEV_COOKIE = 'momento_dev';
const sha = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
export const idleMs = () => config.devMode.idleMinutes * 60000;
const slotIds = () => ({ $gte: 1, $lte: config.devMode.maxSessions });
// Busy pages call the API often; recording "still here" at most every 30 seconds is plenty
const TOUCH_MS = 30000;

export const devModeEnabled = () => !!config.devMode.adminEmail;
// The shared admin account: that email, a staff account, email confirmed
export const isAdminAccount = (user) => devModeEnabled() && !!user && user.email === config.devMode.adminEmail
  && isStaffPlan(user.plan) && !!user.emailVerified;

export const cookieOptions = () => ({ httpOnly: true, secure: config.secureCookies, sameSite: 'strict', path: '/api' });

// The 6 slots exist from the start (free); called at server start and before a slot is taken
export async function ensureSlots() {
  await Promise.all(Array.from({ length: config.devMode.maxSessions }, (_, i) =>
    DevSlot.updateOne({ _id: i + 1 }, { $setOnInsert: { sessionId: null } }, { upsert: true })));
}

// Bcrypt hash for a new access code (scripts/reviewerCodes.js)
export const hashCode = (code) => bcrypt.hash(normalise(code), 10);
// Codes are shown in groups (ABCD-EFGH-JKLM); spaces, dashes and case don't matter when typed
const normalise = (code) => String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
const DUMMY = bcrypt.hashSync('not-a-real-code', 10);

// The active reviewer whose code this is, or null. Every active code is checked (a handful of people), so a wrong
// code takes the same time whoever it was meant for; with no reviewers at all a dummy hash is still checked.
export async function verifyCode(code) {
  const typed = normalise(code);
  const reviewers = await Reviewer.find({ adminEmail: config.devMode.adminEmail, active: true }).select('+codeHash');
  let match = null;
  for (const r of reviewers) if (await bcrypt.compare(typed, r.codeHash) && !match) match = r;
  if (!reviewers.length) await bcrypt.compare(typed, DUMMY);
  return typed ? match : null;
}

// Takes a free slot (or one idle past the limit, whose session is then logged as timed out) for this reviewer.
// { token, sessionId, slot } or null when all 6 are in use. One atomic update: never more than 6 sessions.
export async function claimSlot({ admin, reviewer, req }) {
  await ensureSlots();
  const now = new Date();
  const token = crypto.randomBytes(32).toString('base64url');
  const sessionId = crypto.randomUUID();
  const before = await DevSlot.findOneAndUpdate(
    { _id: slotIds(), $or: [{ sessionId: null }, { lastActiveAt: { $lt: new Date(now - idleMs()) } }] },
    { $set: { sessionId, tokenHash: sha(token), admin, reviewer: reviewer._id, reviewerLabel: reviewer.label, createdAt: now, lastActiveAt: now } },
    { sort: { _id: 1 }, returnDocument: 'before' },
  ).lean();
  if (!before) return null;
  if (before.sessionId) await logEnd(before, 'timeout');
  await audit('devmode.login', { req, reviewer: reviewer.label, devSession: sessionId, meta: { slot: before._id } });
  await Reviewer.updateOne({ _id: reviewer._id }, { $set: { lastUsedAt: now } });
  return { token, sessionId, slot: before._id };
}

const logEnd = (slot, reason, req) => audit(`devmode.${reason}`, {
  req, actor: slot.admin, reviewer: slot.reviewerLabel, devSession: slot.sessionId,
  meta: { slot: slot._id, startedAt: slot.createdAt, lastActiveAt: slot.lastActiveAt },
});

// The slot holding this browser's token, or null
export async function findSession(token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  return DevSlot.findOne({ _id: slotIds(), tokenHash: sha(token), sessionId: { $ne: null } }).lean();
}

export const isIdle = (slot, now = Date.now()) => !slot.lastActiveAt || now - slot.lastActiveAt.getTime() > idleMs();

// Frees exactly this session's slot (no other session is touched) and logs why: 'logout' or 'timeout'
export async function endSession(slot, reason, req) {
  const freed = await DevSlot.updateOne({ _id: slot._id, sessionId: slot.sessionId },
    { $set: { sessionId: null, tokenHash: null, admin: null, reviewer: null, reviewerLabel: null, createdAt: null, lastActiveAt: null } });
  if (freed.modifiedCount) await logEnd(slot, reason, req);
  return freed.modifiedCount > 0;
}

// "Still here": recorded at most every 30 seconds
export async function touch(slot) {
  const now = new Date();
  if (now - slot.lastActiveAt < TOUCH_MS) return;
  await DevSlot.updateOne({ _id: slot._id, sessionId: slot.sessionId }, { $set: { lastActiveAt: now } });
}

// Ends every session idle past the limit (run every minute by server.js), so abandoned tabs free their slot
export async function sweepIdle() {
  const idle = await DevSlot.find({ _id: slotIds(), sessionId: { $ne: null }, lastActiveAt: { $lt: new Date(Date.now() - idleMs()) } }).lean();
  for (const slot of idle) await endSession(slot, 'timeout');
  return idle.length;
}

export const activeCount = async () => DevSlot.countDocuments({
  _id: slotIds(), sessionId: { $ne: null }, lastActiveAt: { $gte: new Date(Date.now() - idleMs()) },
});

// What the page needs to show about this session
export const describe = (slot) => ({
  sessionId: slot.sessionId, reviewer: slot.reviewerLabel, startedAt: slot.createdAt,
  expiresAt: new Date(new Date(slot.lastActiveAt).getTime() + idleMs()), idleMinutes: config.devMode.idleMinutes,
});
