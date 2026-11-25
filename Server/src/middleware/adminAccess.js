import { HttpError } from '../utils/httpError.js';
import { ADMIN_COOKIE, readPass, staffForUser } from '../services/adminStaffService.js';

// /api/admin is for the admin team only (models/AdminStaff.js: at most 6 people).
// 1. requireTeamAccount: signed in, email confirmed, and that email has an active slot. Anyone else gets a plain 404,
//    so these addresses don't even appear to exist.
// 2. requireAdminCode: a valid 4-hour pass from entering their own code (POST /api/admin/verify-code), else
//    403 ADMIN_CODE_REQUIRED. Puts the person on req.admin ({ slot, name, email, role }) so every action is logged
//    against them (services/auditService.js, models/AdminAuditLog.js). Responses are never cached.
// 3. requireOwner: owners only (managing the team).
export async function requireTeamAccount(req, res, next) {
  res.set('Cache-Control', 'private, no-store');
  if (!req.user?.emailVerified) return next(new HttpError(404, 'Not found.'));
  const staff = await staffForUser(req.user);
  if (!staff) return next(new HttpError(404, 'Not found.'));
  req.teamMember = staff;
  next();
}

export async function requireAdminCode(req, res, next) {
  const pass = await readPass(req.cookies?.[ADMIN_COOKIE], req.user);
  if (!pass) {
    if (req.cookies?.[ADMIN_COOKIE]) res.clearCookie(ADMIN_COOKIE, { path: '/api' });
    return next(new HttpError(403, 'Enter your 6-character admin code to continue.', 'ADMIN_CODE_REQUIRED'));
  }
  const { staff } = pass;
  req.admin = { slot: staff.slot, name: staff.name, email: staff.email, role: staff.role, passId: pass.passId, expiresAt: pass.expiresAt };
  // Older code reads the person from req.dev (the earlier Dev Mode): same person, same session id
  req.dev = { reviewerLabel: staff.name, sessionId: pass.passId, reviewerId: staff._id };
  next();
}

export function requireOwner(req, res, next) {
  if (req.admin?.role !== 'owner') return next(new HttpError(403, 'Only an owner can manage the admin team.', 'ADMIN_OWNER_ONLY'));
  next();
}
