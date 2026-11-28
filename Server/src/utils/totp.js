// Time-based one-time codes (TOTP, RFC 6238): the 6-digit codes an authenticator app (Google Authenticator, 1Password,
// Microsoft Authenticator...) shows, new every 30 seconds. Used as the second step of the admin owners' login
// (services/adminStaffService.js). HMAC-SHA1, 6 digits, 30 s: what every authenticator app expects.
// The shared secret is kept encrypted (AES-256-GCM) with a key from ADMIN_TOTP_KEY, or from JWT_SECRET when that isn't
// set; changing that key means setting the app up again (node scripts/adminTeam.js totp <slot>).
import crypto from 'node:crypto';
import { config } from '../config/env.js';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function fromBase32(text) {
  const clean = String(text).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const c of clean) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error('not base32');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const STEP_SECONDS = 30;
export const newSecret = () => base32(crypto.randomBytes(20));
export const stepAt = (ms = Date.now()) => Math.floor(ms / 1000 / STEP_SECONDS);
export function codeAt(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = crypto.createHmac('sha1', fromBase32(secret)).update(counter).digest();
  const at = mac[mac.length - 1] & 15;
  return String((mac.readUInt32BE(at) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
// The step the code belongs to (this one, or one either side for a clock a little off), or null. lastStep: the step
// of the last code accepted, so the same code can't be used twice.
export function verifyCode(secret, code, lastStep = -1, now = Date.now()) {
  const given = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(given)) return null;
  const here = stepAt(now);
  for (const step of [here - 1, here, here + 1]) {
    if (step <= lastStep) continue;
    if (crypto.timingSafeEqual(Buffer.from(codeAt(secret, step)), Buffer.from(given))) return step;
  }
  return null;
}
// The link an authenticator app reads (usually as a QR code)
export const otpauthUrl = (secret, account, issuer = 'Momento admin') =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;

// ---- The secret, encrypted at rest ----
const key = () => crypto.createHash('sha256').update(process.env.ADMIN_TOTP_KEY || `${config.jwtSecret}:admin-totp`).digest();
export function sealSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `gcm$${iv.toString('base64')}$${cipher.getAuthTag().toString('base64')}$${data.toString('base64')}`;
}
export function openSecret(sealed) {
  const [kind, iv, tag, data] = String(sealed || '').split('$');
  if (kind !== 'gcm') return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch { return null; }
}
