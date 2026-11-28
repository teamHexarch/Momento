import { HttpError } from '../utils/httpError.js';
import { audit } from '../services/auditService.js';
import { AdminStaff } from '../models/AdminStaff.js';
import {
  ADMIN_COOKIE, PASS_HOURS, MAX_ADMIN_STAFF, cookieOptions, issuePass, readPass, staffByCode, normaliseEmail, normaliseCode,
  listTeam, inviteSlot, reinviteSlot, revokeSlot, publicStaff, logAdmin, TeamError, needsTotp, totpMatches, isSharedAccount,
  peekSetup, chooseCode,
} from '../services/adminStaffService.js';

const teamError = (error) => { throw error instanceof TeamError ? new HttpError(error.status, error.message, error.code) : error; };

// GET /api/admin/session: whether a code has been entered on this browser, and whose (no code needed). On the shared
// staff account nobody is known until a code is entered (staff: null, shared: true).
export async function session(req, res) {
  const pass = await readPass(req.cookies?.[ADMIN_COOKIE], req.user);
  const s = pass?.staff || (req.teamMember.shared ? null : req.teamMember);
  res.json({ staff: s && { slot: s.slot, name: s.name, email: s.email, role: s.role }, shared: !!req.teamMember.shared, verified: !!pass,
    expiresAt: pass?.expiresAt || null, maxStaff: MAX_ADMIN_STAFF, codeLength: 6, totpRequired: needsTotp(s) });
}

// POST /api/admin/verify-code  { code, totp? }: the person's own code (it says who they are), and for an owner with an
// authenticator app set up, its 6-digit code too (totp). On an account with a slot's own email, only that slot's code
// works. 5 wrong tries in 15 minutes (per IP address, and per account) lock it for the rest of those 15 minutes
// (routes/adminRoutes.js). ({ email } from older pages is ignored.)
export async function verifyCode(req, res) {
  const code = normaliseCode(req.body?.code);
  const found = await staffByCode(code);
  const staff = found && (isSharedAccount(req.user) || found.email === normaliseEmail(req.user.email)) ? found : null;
  if (!staff) {
    await logAdmin('code.failed', { req, staff: req.teamMember });
    await audit('admin.code-failed', { req, meta: { slot: req.teamMember.slot } });
    throw new HttpError(401, 'That code isn’t right. Check it and try again.', 'ADMIN_CODE_WRONG');
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

// ---- The team (owners only): GET /api/admin/team · PUT /api/admin/team/:slot { name, email, role } ·
// POST /api/admin/team/:slot/rotate · DELETE /api/admin/team/:slot. Putting someone in a slot, or "rotate" (a forgotten
// code), emails them a one-time link to choose their own code; no code is ever in an answer.
export async function team(req, res) {
  res.json(await listTeam());
}
export async function assign(req, res) {
  const { staff } = await inviteSlot(req.params.slot, req.body || {}).catch(teamError);
  await logAdmin('team.assigned', { req, target: `slot:${staff.slot}`, meta: { name: staff.name, email: staff.email, role: staff.role } });
  await audit('admin.team-assigned', { req, target: `slot:${staff.slot}`, meta: { email: staff.email, role: staff.role } });
  res.json({ staff: publicStaff(staff), emailed: true, team: await listTeam() });
}
export async function rotate(req, res) {
  const { staff } = await reinviteSlot(req.params.slot).catch(teamError);
  await logAdmin('team.code-rotated', { req, target: `slot:${staff.slot}`, meta: { name: staff.name } });
  await audit('admin.code-rotated', { req, target: `slot:${staff.slot}` });
  // A new link for your own slot ends your own pass too
  if (staff.slot === req.admin.slot) res.clearCookie(ADMIN_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.json({ staff: publicStaff(staff), emailed: true });
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

// ---- Choosing your own code from the emailed link (no sign-in: the link is the key) ----
// GET /api/admin-setup/:token → { name, slot, role, expiresAt } · POST /api/admin-setup/:token { code } → { ok, name }
export async function setupInfo(req, res) {
  res.set('Cache-Control', 'no-store');
  const info = await peekSetup(req.params.token);
  if (!info) throw new HttpError(410, 'This link has expired or was already used. Ask an owner to send a new one.', 'ADMIN_SETUP_EXPIRED');
  res.json(info);
}
export async function setupChoose(req, res) {
  res.set('Cache-Control', 'no-store');
  const staff = await chooseCode(req.params.token, req.body?.code).catch(teamError);
  await logAdmin('code.chosen', { req, staff, target: `slot:${staff.slot}` });
  res.json({ ok: true, name: staff.name });
}
