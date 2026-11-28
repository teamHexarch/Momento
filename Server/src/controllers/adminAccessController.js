import { HttpError } from '../utils/httpError.js';
import { audit } from '../services/auditService.js';
import { AdminStaff } from '../models/AdminStaff.js';
import {
  ADMIN_COOKIE, PASS_HOURS, MAX_ADMIN_STAFF, cookieOptions, issuePass, readPass, verifyStaff, normaliseEmail, normaliseCode,
  listTeam, assignSlot, rotateCode, revokeSlot, publicStaff, logAdmin, TeamError, needsTotp, totpMatches,
} from '../services/adminStaffService.js';

const teamError = (error) => { throw error instanceof TeamError ? new HttpError(error.status, error.message, error.code) : error; };

// GET /api/admin/session: who this account is on the team, and whether its code has been entered (no code needed)
export async function session(req, res) {
  const pass = await readPass(req.cookies?.[ADMIN_COOKIE], req.user);
  const s = req.teamMember;
  res.json({ staff: { slot: s.slot, name: s.name, email: s.email, role: s.role }, verified: !!pass,
    expiresAt: pass?.expiresAt || null, maxStaff: MAX_ADMIN_STAFF, codeLength: 6, totpRequired: needsTotp(s) });
}

// POST /api/admin/verify-code  { email, code, totp? }: the signed-in account's own email and code, and for an owner with
// an authenticator app set up, its 6-digit code too (totp). 5 wrong tries in 15 minutes (per IP address, and per
// email) lock it for the rest of those 15 minutes (routes/adminRoutes.js).
export async function verifyCode(req, res) {
  const email = normaliseEmail(req.body?.email), code = normaliseCode(req.body?.code);
  const staff = email === normaliseEmail(req.user.email) ? await verifyStaff(email, code) : (await verifyStaff('', code), null);
  if (!staff) {
    await logAdmin('code.failed', { req, staff: req.teamMember, meta: { emailMatchesAccount: email === normaliseEmail(req.user.email) } });
    await audit('admin.code-failed', { req, meta: { slot: req.teamMember.slot } });
    throw new HttpError(401, 'That email and code don’t match. Check them and try again.', 'ADMIN_CODE_WRONG');
  }
  // The second step: an owner's authenticator code (audit L3)
  if (needsTotp(staff)) {
    if (!String(req.body?.totp ?? '').trim()) {
      throw new HttpError(401, 'Enter the 6-digit code from your authenticator app.', 'ADMIN_TOTP_REQUIRED');
    }
    if (!await totpMatches(staff, req.body.totp)) {
      await logAdmin('totp.failed', { req, staff });
      await audit('admin.totp-failed', { req, meta: { slot: staff.slot } });
      throw new HttpError(401, 'That authenticator code isn’t right (or was already used). Wait for the next one and try again.', 'ADMIN_TOTP_WRONG');
    }
  }
  const pass = issuePass(staff, req.user);
  await AdminStaff.updateOne({ _id: staff._id }, { $set: { lastLoginAt: new Date() } });
  res.cookie(ADMIN_COOKIE, pass.token, cookieOptions());
  await logAdmin('code.verified', { req, staff, meta: { passId: pass.id, hours: PASS_HOURS } });
  await audit('admin.code-verified', { req, meta: { slot: staff.slot }, reviewer: staff.name, devSession: pass.id });
  res.json({ staff: { slot: staff.slot, name: staff.name, email: staff.email, role: staff.role }, verified: true, expiresAt: pass.expiresAt });
}

// POST /api/admin/lock: ends this browser's pass (the code is needed again)
export async function lock(req, res) {
  const pass = await readPass(req.cookies?.[ADMIN_COOKIE], req.user);
  if (pass) await logAdmin('code.locked', { req, staff: pass.staff, meta: { passId: pass.passId } });
  res.clearCookie(ADMIN_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
}

// ---- The team (owners only): GET /api/admin/team · PUT /api/admin/team/:slot · POST /api/admin/team/:slot/rotate ·
// DELETE /api/admin/team/:slot. A new or changed code is in the answer once ({ code }) and never shown again.
export async function team(req, res) {
  res.json(await listTeam());
}
export async function assign(req, res) {
  const { staff, code } = await assignSlot(req.params.slot, req.body || {}).catch(teamError);
  await logAdmin('team.assigned', { req, target: `slot:${staff.slot}`, meta: { name: staff.name, email: staff.email, role: staff.role } });
  await audit('admin.team-assigned', { req, target: `slot:${staff.slot}`, meta: { email: staff.email, role: staff.role } });
  res.json({ staff: publicStaff(staff), code, team: await listTeam() });
}
export async function rotate(req, res) {
  const { staff, code } = await rotateCode(req.params.slot).catch(teamError);
  await logAdmin('team.code-rotated', { req, target: `slot:${staff.slot}`, meta: { name: staff.name } });
  await audit('admin.code-rotated', { req, target: `slot:${staff.slot}` });
  // Rotating your own code ends your own pass too
  if (staff.slot === req.admin.slot) res.clearCookie(ADMIN_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.json({ staff: publicStaff(staff), code });
}
export async function revoke(req, res) {
  const gone = await revokeSlot(req.params.slot, req.admin.slot).catch(teamError);
  await logAdmin('team.revoked', { req, target: `slot:${gone.slot}`, meta: { name: gone.name, email: gone.email } });
  await audit('admin.team-revoked', { req, target: `slot:${gone.slot}`, meta: { email: gone.email } });
  res.json({ ok: true, team: await listTeam() });
}

// GET /api/admin/audit?slot=&limit=: the team's log, newest first (owners only)
export async function auditLog(req, res) {
  const { AdminAuditLog } = await import('../models/AdminAuditLog.js');
  const slot = Number(req.query.slot);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const rows = await AdminAuditLog.find(Number.isInteger(slot) && slot >= 1 && slot <= MAX_ADMIN_STAFF ? { adminSlot: slot } : {})
    .sort({ at: -1 }).limit(limit).lean();
  res.json({ entries: rows.map(({ _id, ...r }) => ({ id: String(_id), ...r })) });
}
