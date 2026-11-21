import { HttpError } from '../utils/httpError.js';
import { config } from '../config/env.js';
import { audit } from '../services/auditService.js';
import {
  DEV_COOKIE, PRESENCE_MS, activeCount, claimSlot, cookieOptions, describe, devModeEnabled, endSession, expiry, findSession,
  isAdminAccount, verifyCode,
} from '../services/devModeService.js';

// This browser's live Dev Mode session (slot), or null; one that is over (idle, or its page closed) is ended on the way
async function current(req, res) {
  const slot = await findSession(req.cookies?.[DEV_COOKIE]);
  if (!slot || String(slot.admin) !== String(req.user._id)) return null;
  const over = expiry(slot);
  if (over) {
    await endSession(slot, 'timeout', req, over);
    res.clearCookie(DEV_COOKIE, cookieOptions());
    return null;
  }
  return slot;
}

// GET /api/dev/status  Whether this account may use Dev Mode, and this browser's session if it has one
export async function status(req, res) {
  res.set('Cache-Control', 'private, no-store');
  const allowed = isAdminAccount(req.user);
  const slot = allowed ? await current(req, res) : null;
  res.json({
    enabled: devModeEnabled(), adminAccount: allowed, email: req.user.email,
    maxSessions: config.devMode.maxSessions, idleMinutes: config.devMode.idleMinutes, presenceSeconds: PRESENCE_MS / 1000,
    activeSessions: allowed ? await activeCount() : null,
    session: slot ? describe(slot) : null,
  });
}

// POST /api/dev/enter { code }  Unlocks Dev Mode with a personal access code. Takes one of the 6 slots. Refused (nobody
// already working is pushed out) when all 6 are in use, or when this code is already in use on another device.
export async function enter(req, res) {
  res.set('Cache-Control', 'private, no-store');
  if (!devModeEnabled()) throw new HttpError(403, 'Dev Mode isn’t set up on this server yet.', 'dev-mode-off');
  if (!isAdminAccount(req.user)) throw new HttpError(403, 'Dev Mode is only for the Momento admin account.', 'dev-mode-admin-only');
  const code = req.body?.code;
  if (typeof code !== 'string' || !code.trim() || code.length > 64) throw new HttpError(400, 'Enter your access code.');
  // Already unlocked in this browser: keep that session (no second slot)
  const existing = await current(req, res);
  if (existing) return res.json({ session: describe(existing) });
  const reviewer = await verifyCode(code);
  if (!reviewer) {
    await audit('devmode.code-failed', { req });
    throw new HttpError(401, 'That access code isn’t right.', 'dev-mode-code');
  }
  const claimed = await claimSlot({ admin: req.user._id, reviewer, req });
  if (claimed?.inUse) {
    await audit('devmode.in-use', { req, reviewer: reviewer.label });
    throw new HttpError(409, `${reviewer.label} is already in Dev Mode on another device. Exit Dev Mode or close the review page there first `
      + `(a closed page frees it within ${PRESENCE_MS / 60000} minutes).`, 'dev-mode-in-use');
  }
  if (!claimed) {
    await audit('devmode.full', { req, reviewer: reviewer.label });
    throw new HttpError(409, `Maximum of ${config.devMode.maxSessions} active Dev Mode sessions reached for this admin account. Please wait for another session to end.`, 'dev-mode-full');
  }
  res.cookie(DEV_COOKIE, claimed.token, cookieOptions());
  const slot = await findSession(claimed.token);
  res.json({ session: describe(slot) });
}

// POST /api/dev/heartbeat { active }  The open page says "still open" every 30 seconds, and whether the reviewer has
// been using it (requireDevMode records both)
export function heartbeat(req, res) {
  res.json({ ok: true });
}

// POST /api/dev/exit[?reason=closed]  Ends this session only and frees its slot; the other sessions carry on. The page
// sends this itself, with reason=closed, as it is closed or left.
export async function exit(req, res) {
  res.set('Cache-Control', 'private, no-store');
  const slot = await findSession(req.cookies?.[DEV_COOKIE]);
  if (slot && String(slot.admin) === String(req.user._id)) await endSession(slot, 'logout', req, req.query.reason === 'closed' ? 'page closed' : 'exit');
  res.clearCookie(DEV_COOKIE, cookieOptions());
  res.json({ ok: true });
}
