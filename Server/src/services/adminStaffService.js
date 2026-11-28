// The admin team (models/AdminStaff.js): 6 people at most, each with their own 6-character code.
// To use /api/admin, a person signs in to their own Momento account (the email in their slot), then enters that
// email and their code (POST /api/admin/verify-code). That gives a signed pass, an httpOnly cookie valid for 4 hours,
// tied to their slot and account. Changing their code or revoking the slot ends every pass at once (tokenVersion).
// Codes: exactly 6 characters, A-Z and 0-9, at least one letter and one digit (H7X2M9); typed in any case, stored only
// as a salted scrypt hash, compared in constant time, and different for each person.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { AdminStaff, MAX_ADMIN_STAFF } from '../models/AdminStaff.js';
import { AdminAuditLog, ipPrefix } from '../models/AdminAuditLog.js';
import * as totp from '../utils/totp.js';

export { MAX_ADMIN_STAFF };
export const ADMIN_COOKIE = 'momento_admin';
export const PASS_HOURS = 4;
export const CODE_PATTERN = /^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{6}$/;
export const normaliseCode = (code) => String(code ?? '').toUpperCase().replace(/[\s-]/g, '');
export const normaliseEmail = (email) => String(email ?? '').trim().toLowerCase();

// ---- Codes ----
const scrypt = promisify(crypto.scrypt);
const KEYLEN = 32;
export async function hashCode(code) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(normaliseCode(code), salt, KEYLEN);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
export async function codeMatches(code, stored) {
  const [kind, saltHex, keyHex] = String(stored || '').split('$');
  const salt = kind === 'scrypt' && saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const expected = kind === 'scrypt' && keyHex ? Buffer.from(keyHex, 'hex') : crypto.randomBytes(KEYLEN);
  const got = await scrypt(normaliseCode(code), salt, KEYLEN);
  return got.length === expected.length && crypto.timingSafeEqual(got, expected) && kind === 'scrypt';
}
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export function generateCode() {
  for (;;) {
    const code = Array.from(crypto.randomBytes(6), (b) => ALPHABET[b % 36]).join('');   // 256 % 36: a tiny skew, irrelevant for 6 people
    if (CODE_PATTERN.test(code)) return code;
  }
}
// The code isn't anyone else's on the team (codes are hashed, so each one is checked)
async function codeIsFree(code, exceptId) {
  const others = await AdminStaff.find(exceptId ? { _id: { $ne: exceptId } } : {}).select('+codeHash');
  for (const s of others) if (await codeMatches(code, s.codeHash)) return false;
  return true;
}
export async function uniqueCode(exceptId) {
  for (;;) { const code = generateCode(); if (await codeIsFree(code, exceptId)) return code; }
}

// ---- The team ----
export class TeamError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }
const checkSlot = (slot) => {
  const n = Number(slot);
  if (!Number.isInteger(n) || n < 1 || n > MAX_ADMIN_STAFF) throw new TeamError(400, `Choose a slot from 1 to ${MAX_ADMIN_STAFF}.`, 'ADMIN_SLOT_INVALID');
  return n;
};
const checkPerson = ({ name, email, role }) => {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!n || n.length > 40) throw new TeamError(400, 'Give a name of up to 40 characters.', 'TEXT_TOO_LONG');
  const e = normaliseEmail(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || e.length > 254) throw new TeamError(400, 'Give a valid email address.', 'ADMIN_EMAIL_INVALID');
  const r = role === 'owner' ? 'owner' : 'moderator';
  return { name: n, email: e, role: r };
};
export const publicStaff = (s) => s && ({ slot: s.slot, name: s.name, email: s.email, role: s.role, isActive: s.isActive,
  lastLoginAt: s.lastLoginAt || null, codeRotatedAt: s.codeRotatedAt || null, totp: !!s.totpEnabledAt });

export async function listTeam() {
  const staff = await AdminStaff.find().sort({ slot: 1 }).lean();
  const bySlot = new Map(staff.map((s) => [s.slot, s]));
  return { max: MAX_ADMIN_STAFF, used: staff.length,
    slots: Array.from({ length: MAX_ADMIN_STAFF }, (_, i) => publicStaff(bySlot.get(i + 1)) || { slot: i + 1, empty: true }) };
}

// Puts a person in a slot (a new person, or replacing whoever was there) with a fresh code. Returns { staff, code }:
// the code is shown this once and never again. code: a chosen code (seeding from the env), otherwise a random one.
export async function assignSlot(slot, person, code) {
  const n = checkSlot(slot), p = checkPerson(person);
  const chosen = code == null ? null : normaliseCode(code);
  if (chosen != null && !CODE_PATTERN.test(chosen)) throw new TeamError(400, 'A code is 6 letters and numbers, with at least one of each.', 'ADMIN_CODE_INVALID');
  const current = await AdminStaff.findOne({ slot: n });
  const clash = await AdminStaff.findOne({ email: p.email, slot: { $ne: n } });
  if (clash) throw new TeamError(409, `${p.email} already has slot ${clash.slot}.`, 'ADMIN_EMAIL_TAKEN');
  if (current?.role === 'owner' && p.role !== 'owner' && !(await AdminStaff.exists({ role: 'owner', slot: { $ne: n } }))) {
    throw new TeamError(409, 'The team needs at least one owner.', 'ADMIN_LAST_OWNER');
  }
  const finalCode = chosen ?? await uniqueCode(current?._id);
  if (chosen && !(await codeIsFree(chosen, current?._id))) throw new TeamError(409, 'Someone else on the team has that code.', 'ADMIN_CODE_TAKEN');
  const codeHash = await hashCode(finalCode);
  let staff;
  if (current) {
    staff = await AdminStaff.findOneAndUpdate({ _id: current._id }, { $set: { ...p, codeHash, isActive: true, codeRotatedAt: new Date() },
      $inc: { tokenVersion: 1 }, $unset: { lastLoginAt: 1 } }, { returnDocument: 'after' });
  } else {
    try { staff = await AdminStaff.create({ slot: n, ...p, codeHash }); }
    catch (error) {
      if (error.code === 'ADMIN_TEAM_FULL') throw new TeamError(409, error.message, 'ADMIN_TEAM_FULL');
      if (error.code === 11000) throw new TeamError(409, 'That slot or email was just taken. Reload and try again.', 'ADMIN_SLOT_TAKEN');
      throw error;
    }
  }
  return { staff, code: finalCode };
}

export async function rotateCode(slot) {
  const n = checkSlot(slot);
  const current = await AdminStaff.findOne({ slot: n });
  if (!current) throw new TeamError(404, `Slot ${n} is empty.`, 'ADMIN_SLOT_EMPTY');
  const code = await uniqueCode(current._id);
  const staff = await AdminStaff.findOneAndUpdate({ _id: current._id }, { $set: { codeHash: await hashCode(code), codeRotatedAt: new Date() },
    $inc: { tokenVersion: 1 } }, { returnDocument: 'after' });
  return { staff, code };
}

export async function revokeSlot(slot, bySlot) {
  const n = checkSlot(slot);
  if (n === bySlot) throw new TeamError(409, 'You can’t remove yourself. Ask another owner.', 'ADMIN_SELF_REVOKE');
  const current = await AdminStaff.findOne({ slot: n });
  if (!current) throw new TeamError(404, `Slot ${n} is empty.`, 'ADMIN_SLOT_EMPTY');
  if (current.role === 'owner' && !(await AdminStaff.exists({ role: 'owner', slot: { $ne: n } }))) {
    throw new TeamError(409, 'The team needs at least one owner.', 'ADMIN_LAST_OWNER');
  }
  await AdminStaff.deleteOne({ _id: current._id });
  return current;
}

// ---- The second step for owners: an authenticator app (audit L3) ----
// Sets up (or replaces) the slot's authenticator secret. Returns { staff, secret, url }: the secret is shown this once
// (to type or scan into the app) and kept only encrypted. Every open pass for the slot ends (tokenVersion).
export async function setupTotp(slot) {
  const n = checkSlot(slot);
  const current = await AdminStaff.findOne({ slot: n });
  if (!current) throw new TeamError(404, `Slot ${n} is empty.`, 'ADMIN_SLOT_EMPTY');
  const secret = totp.newSecret();
  const staff = await AdminStaff.findOneAndUpdate({ _id: current._id }, { $set: { totpSecret: totp.sealSecret(secret), totpEnabledAt: new Date() },
    $unset: { totpLastStep: 1 }, $inc: { tokenVersion: 1 } }, { returnDocument: 'after' });
  return { staff, secret, url: totp.otpauthUrl(secret, staff.email) };
}
export async function removeTotp(slot) {
  const n = checkSlot(slot);
  const staff = await AdminStaff.findOneAndUpdate({ slot: n }, { $unset: { totpSecret: 1, totpEnabledAt: 1, totpLastStep: 1 }, $inc: { tokenVersion: 1 } },
    { returnDocument: 'after' });
  if (!staff) throw new TeamError(404, `Slot ${n} is empty.`, 'ADMIN_SLOT_EMPTY');
  return staff;
}
// Whether this team member must give an authenticator code: every owner who has one set up
export const needsTotp = (staff) => staff?.role === 'owner' && !!staff.totpEnabledAt;
// Checks the authenticator code, and uses it up (the same code can't open a second pass)
export async function totpMatches(staff, code) {
  const row = await AdminStaff.findById(staff._id).select('+totpSecret +totpLastStep').lean();
  const secret = totp.openSecret(row?.totpSecret);
  if (!secret) return false;
  const step = totp.verifyCode(secret, code, row.totpLastStep ?? -1);
  if (step === null) return false;
  const used = await AdminStaff.updateOne({ _id: staff._id, $or: [{ totpLastStep: { $exists: false } }, { totpLastStep: { $lt: step } }] },
    { $set: { totpLastStep: step } });
  return used.modifiedCount === 1;
}

// ---- Seeding from the env, at start-up: only empty slots are filled, so a changed code is never put back ----
// ADMIN_STAFF_JSON='[{"slot":1,"name":"Yusuf","email":"…","code":"H7X2M9","role":"owner"}, …]'
// or ADMIN_OWNER_EMAIL + ADMIN_OWNER_CODE (+ ADMIN_OWNER_NAME): the owner in slot 1
export async function seedFromEnv(env = process.env, log = console.log) {
  let people = [];
  if (env.ADMIN_STAFF_JSON) {
    try { people = JSON.parse(env.ADMIN_STAFF_JSON); if (!Array.isArray(people)) throw new Error('not a list'); }
    catch (error) { log(`Admin team: ADMIN_STAFF_JSON ignored (${error.message}).`); people = []; }
  } else if (env.ADMIN_OWNER_EMAIL && env.ADMIN_OWNER_CODE) {
    people = [{ slot: 1, name: env.ADMIN_OWNER_NAME || 'Owner', email: env.ADMIN_OWNER_EMAIL, code: env.ADMIN_OWNER_CODE, role: 'owner' }];
  }
  let added = 0;
  for (const p of people.slice(0, MAX_ADMIN_STAFF)) {
    try {
      if (await AdminStaff.exists({ $or: [{ slot: Number(p.slot) }, { email: normaliseEmail(p.email) }] })) continue;
      await assignSlot(p.slot, p, p.code);
      added++;
    } catch (error) { log(`Admin team: slot ${p?.slot} not added from the env (${error.message}).`); }
  }
  return added;
}

// ---- Checking a code, and the 4-hour pass ----
const DUMMY_HASH = 'scrypt$00$00';
// The active team member with this email and code, or null. The same scrypt work is done whether or not the email
// is on the team, so a wrong guess takes the same time either way.
export async function verifyStaff(email, code) {
  const staff = await AdminStaff.findOne({ email: normaliseEmail(email), isActive: true }).select('+codeHash');
  const ok = await codeMatches(code, staff?.codeHash || DUMMY_HASH);
  return ok && staff && CODE_PATTERN.test(normaliseCode(code)) ? staff : null;
}

const passSecret = () => crypto.createHmac('sha256', config.jwtSecret).update('momento-admin-pass').digest();
export function issuePass(staff, user) {
  const id = crypto.randomUUID();
  const token = jwt.sign({ typ: 'admin', sid: String(staff._id), slot: staff.slot, uid: String(user._id), v: staff.tokenVersion, jti: id },
    passSecret(), { expiresIn: `${PASS_HOURS}h`, algorithm: 'HS256' });
  return { token, id, expiresAt: new Date(Date.now() + PASS_HOURS * 3600000) };
}
export const cookieOptions = () => ({ httpOnly: true, secure: config.secureCookies, sameSite: 'strict', path: '/api', maxAge: PASS_HOURS * 3600000 });

// The team member a pass belongs to, or null (expired, tampered, code changed since, slot revoked, another account)
export async function readPass(token, user) {
  if (!token || !user) return null;
  let p;
  try { p = jwt.verify(token, passSecret(), { algorithms: ['HS256'] }); } catch { return null; }
  if (p.typ !== 'admin' || p.uid !== String(user._id)) return null;
  const staff = await AdminStaff.findOne({ _id: p.sid, isActive: true }).lean();
  if (!staff || staff.tokenVersion !== p.v || staff.email !== normaliseEmail(user.email)) return null;
  return { staff, passId: p.jti, expiresAt: new Date(p.exp * 1000) };
}

// The active team member for this signed-in account (by email), or null
export const staffForUser = (user) => (user?.email ? AdminStaff.findOne({ email: normaliseEmail(user.email), isActive: true }).lean() : null);

// ---- The per-person log ----
export async function logAdmin(action, { req, staff, target, meta } = {}) {
  const s = staff || req?.admin;
  try {
    await AdminAuditLog.create({ action, adminSlot: s?.slot, adminName: s?.name, adminEmail: s?.email,
      target: target == null ? undefined : String(target), meta, ipPrefix: ipPrefix(req?.ip) });
  } catch (error) { console.error(`Admin audit log failed (${action}): ${error.message}`); }
}
