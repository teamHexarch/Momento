// ---- Direct uploads (audit B3): the phone sends each photo straight to S3, not through this server ----
//   1. POST /api/albums/:id/uploads { files: [{ name, size, sha256 }] }: the server checks the album, the upload
//      agreement, the sizes and the 5 GB a day quota, and answers each file with a signed PUT link into the private
//      quarantine/direct/ area of the bucket (good for 15 minutes) and a ticket.
//   2. The browser PUTs each file to its link. S3 itself checks the file's SHA-256 against the one signed into the
//      link, so the server never has to read a file to know its fingerprint.
//   3. POST /api/albums/:id/uploads/process { tickets }: the server checks each file arrived (same size and SHA-256)
//      and queues it for the photo check exactly as an ordinary upload. The check reads it from S3 once.
// The old way (POST /api/albums/:id/photos, the file through this server) still works, and the page falls back to
// it whenever direct uploads are off or fail.
// On: S3 storage and DIRECT_UPLOADS=on (the bucket needs a CORS rule letting the site PUT; see README). Locally (no
// S3) it works through PUT /api/uploads/local/:token, so it can be tried and tested.
// Files sent but never processed stay under quarantine/direct/: an S3 lifecycle rule expiring that prefix after
// 2 days removes them (README).
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { storageName } from './storageService.js';

export const DIRECT_PREFIX = 'quarantine/direct/';
export const LINK_SECONDS = 15 * 60;
const TICKET_SECONDS = 3600;
export const directUploadsOn = () => storageName === 'disk' ? !config.isProduction : process.env.DIRECT_UPLOADS === 'on';

const secret = (what) => crypto.createHmac('sha256', config.jwtSecret).update(`momento-direct-upload:${what}`).digest();
export const hexToBase64 = (hex) => Buffer.from(hex, 'hex').toString('base64');

// The ticket for one file: which key, whose, for which album, its name, size and SHA-256 (hex). Only the person the
// ticket was made for can process it, only into that album, within the hour.
export function issueTicket({ key, userId, albumId, name, size, sha256 }) {
  return jwt.sign({ k: key, u: String(userId), a: String(albumId), n: name, s: size, h: sha256 }, secret('ticket'),
    { expiresIn: TICKET_SECONDS, algorithm: 'HS256' });
}
export function readTicket(token, { userId, albumId }) {
  let t;
  try { t = jwt.verify(String(token), secret('ticket'), { algorithms: ['HS256'] }); } catch { return null; }
  if (t.u !== String(userId) || t.a !== String(albumId) || typeof t.k !== 'string' || !t.k.startsWith(DIRECT_PREFIX)) return null;
  return { key: t.k, name: t.n, size: t.s, sha256: t.h };
}
export const newKey = (userId) => `${DIRECT_PREFIX}${userId}/${crypto.randomUUID()}`;

// ---- The local stand-in for S3 (disk storage only, never in production) ----
export function signLocalPut(key, sha256Base64, size, seconds) {
  return jwt.sign({ k: key, h: sha256Base64, s: size }, secret('local-put'), { expiresIn: seconds, algorithm: 'HS256' });
}
export function readLocalPut(token) {
  try { const t = jwt.verify(String(token), secret('local-put'), { algorithms: ['HS256'] }); return { key: t.k, sha256Base64: t.h, size: t.s }; }
  catch { return null; }
}
