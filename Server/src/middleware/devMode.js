import { HttpError } from '../utils/httpError.js';
import { DEV_COOKIE, cookieOptions, devModeEnabled, endSession, findSession, isAdminAccount, isIdle, touch } from '../services/devModeService.js';

// Moderation (unblurred photos waiting for review, approve/reject, reports, takedowns) needs an active Dev Mode
// session on top of the staff login: the shared admin account, unlocked with a personal access code
// (services/devModeService.js). Puts { sessionId, reviewerLabel, reviewerId, slot } on req.dev, so every audit entry
// and decision names the person. Responses are never cached.
export async function requireDevMode(req, res, next) {
  res.set('Cache-Control', 'private, no-store');
  if (!devModeEnabled()) return next(new HttpError(403, 'Dev Mode isn’t set up on this server yet.', 'dev-mode-off'));
  if (!isAdminAccount(req.user)) return next(new HttpError(403, 'Dev Mode is only for the Momento admin account.', 'dev-mode-admin-only'));
  const slot = await findSession(req.cookies?.[DEV_COOKIE]);
  if (!slot || String(slot.admin) !== String(req.user._id)) {
    return next(new HttpError(401, 'Enter your access code to use Dev Mode.', 'dev-mode-required'));
  }
  if (isIdle(slot)) {
    await endSession(slot, 'timeout', req);
    res.clearCookie(DEV_COOKIE, cookieOptions());
    return next(new HttpError(401, 'Your Dev Mode session ended after a while without use. Enter your access code again.', 'dev-mode-expired'));
  }
  await touch(slot);
  req.dev = { sessionId: slot.sessionId, reviewerLabel: slot.reviewerLabel, reviewerId: slot.reviewer, slot: slot._id };
  next();
}
