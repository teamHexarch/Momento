// Dev Mode: photo moderation on one shared admin account (DEV_MODE_ADMIN_EMAIL), unlocked per person with their own
// static access code (models/Reviewer.js, scripts/reviewerCodes.js). Each unlock takes one of the 6 session slots
// (models/DevSlot.js) and gets its own random token in an httpOnly session cookie.
// - One code, one device: a code already in use on another device is refused until that session ends.
// - A session ends with "Exit Dev Mode", when its page is closed (the page says so as it closes, and a page that stops
//   saying "still open" for PRESENCE_MS is taken as closed), after DEV_MODE_IDLE_MINUTES without use, or when that
//   browser logs out of the admin account. Opening the review page again then needs the code again.
// Every login, logout, timeout, refusal and failed code is in the audit log with the reviewer's label and session id.
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
// An open review page says "still open" every 30 seconds (browsers slow background tabs to about once a minute);
// 3 minutes without it means the page was closed
export const PRESENCE_MS = 3 * 60000;
const slotIds = () => ({ $gte: 1, $lte: config.devMode.maxSessions });
// Busy pages call the API often; recording it at most every 20 seconds is plenty
const TOUCH_MS = 20000;

export const devModeEnabled = () => !!config.devMode.adminEmail;
// The shared admin account: that email, a staff account, email confirmed
export const isAdminAccount = (user) => devModeEnabled() && !!user && user.email === config.devMode.adminEmail
  && isStaffPlan(user.plan) && !!user.emailVerified;

// A session cookie (no expiry date): the browser drops it when it closes
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

// Why a session is over, or null while it is live: 'idle' (unused too long) or 'closed' (its page went away)
export function expiry(slot, now = Date.now()) {
  if (!slot.lastActiveAt || now - new Date(slot.lastActiveAt).getTime() > idleMs()) return 'idle';
  const seen = slot.lastSeenAt || slot.lastActiveAt;
  if (now - new Date(seen).getTime() > PRESENCE_MS) return 'closed';
  return null;
}
export const isExpired = (slot, now) => expiry(slot, now) !== null;
// The same as a query: slots whose session is over (or free)
const overQuery = (now = Date.now()) => ({ $or: [
  { sessionId: null },
  { lastActiveAt: { $lt: new Date(now - idleMs()) } },
  { lastSeenAt: { $lt: new Date(now - PRESENCE_MS) } },
] });

// Takes a free slot (or one whose session is over, logged as timed out) for this reviewer.
// { token, sessionId, slot } · { inUse: true } when this code is live on another device · null when all 6 are in use.
// Never more than 6 sessions (one atomic update per slot) and never two for one code (a unique index on the reviewer).
export async function claimSlot({ admin, reviewer, req }) {
  await ensureSlots();
  // This code's own sessions that are over are ended first, so they don't block it
  for (const old of await DevSlot.find({ _id: slotIds(), reviewer: reviewer._id, sessionId: { $ne: null } }).lean()) {
    if (isExpired(old)) await endSession(old, 'timeout');
  }
  if (await DevSlot.exists({ _id: slotIds(), reviewer: reviewer._id, sessionId: { $ne: null } })) return { inUse: true };
  const now = new Date();
  const token = crypto.randomBytes(32).toString('base64url');
  const sessionId = crypto.randomUUID();
  let before;
  try {
    before = await DevSlot.findOneAndUpdate(
      { _id: slotIds(), ...overQuery(now.getTime()) },
      { $set: { sessionId, tokenHash: sha(token), admin, reviewer: reviewer._id, reviewerLabel: reviewer.label, createdAt: now, lastActiveAt: now, lastSeenAt: now } },
      { sort: { _id: 1 }, returnDocument: 'before' },
    ).lean();
  } catch (err) {
    if (err?.code === 11000) return { inUse: true };   // the same code, at the same moment, on another device
    throw err;
  }
  if (!before) return null;
  if (before.sessionId) await logEnd(before, 'timeout', null, expiry(before, now.getTime()) || 'idle');
  await audit('devmode.login', { req, reviewer: reviewer.label, devSession: sessionId, meta: { slot: before._id } });
  await Reviewer.updateOne({ _id: reviewer._id }, { $set: { lastUsedAt: now } });
  return { token, sessionId, slot: before._id };
}

const logEnd = (slot, event, req, why) => audit(`devmode.${event}`, {
  req, actor: slot.admin, reviewer: slot.reviewerLabel, devSession: slot.sessionId,
  meta: { slot: slot._id, startedAt: slot.createdAt, lastActiveAt: slot.lastActiveAt, ...(why && { why }) },
});

// The slot holding this browser's token, or null
export async function findSession(token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  return DevSlot.findOne({ _id: slotIds(), tokenHash: sha(token), sessionId: { $ne: null } }).lean();
}

// Frees exactly this session's slot (no other session is touched) and logs it: event 'logout' or 'timeout', with why
// ('exit', 'page closed', 'account logout', 'idle', 'closed', 'revoked')
export async function endSession(slot, event, req, why = event === 'timeout' ? expiry(slot) || 'idle' : 'exit') {
  const freed = await DevSlot.updateOne({ _id: slot._id, sessionId: slot.sessionId },
    { $set: { sessionId: null, tokenHash: null, admin: null, reviewer: null, reviewerLabel: null, createdAt: null, lastActiveAt: null, lastSeenAt: null } });
  if (freed.modifiedCount) await logEnd(slot, event, req, why);
  return freed.modifiedCount > 0;
}

// The page is open (seen) and, when active, the reviewer is using it. Recorded at most every 20 seconds.
export async function touch(slot, { active = true } = {}) {
  const now = new Date();
  const $set = {};
  if (now - new Date(slot.lastSeenAt || 0) >= TOUCH_MS) $set.lastSeenAt = now;
  if (active && now - new Date(slot.lastActiveAt || 0) >= TOUCH_MS) $set.lastActiveAt = now;
  if (Object.keys($set).length) await DevSlot.updateOne({ _id: slot._id, sessionId: slot.sessionId }, { $set });
}

// Ends every session that is over (run every minute by server.js), so closed or forgotten pages free their slot
export async function sweepIdle() {
  const now = Date.now();
  const over = await DevSlot.find({ _id: slotIds(), sessionId: { $ne: null }, ...overQuery(now) }).lean();
  for (const slot of over) await endSession(slot, 'timeout', null, expiry(slot, now) || 'idle');
  return over.length;
}

export const activeCount = async () => {
  const now = Date.now();
  return DevSlot.countDocuments({ _id: slotIds(), sessionId: { $ne: null }, lastActiveAt: { $gte: new Date(now - idleMs()) },
    $or: [{ lastSeenAt: { $gte: new Date(now - PRESENCE_MS) } }, { lastSeenAt: null }] });
};

// What the page needs to show about this session
export const describe = (slot) => ({
  sessionId: slot.sessionId, reviewer: slot.reviewerLabel, startedAt: slot.createdAt,
  expiresAt: new Date(new Date(slot.lastActiveAt).getTime() + idleMs()), idleMinutes: config.devMode.idleMinutes,
});
