import crypto from 'node:crypto';
import { Takedown } from '../models/Takedown.js';
import { HttpError } from '../utils/httpError.js';

// Files staff took down (copyright or abuse) can't come back: their SHA-256 is kept, and the same
// file uploaded again is refused, anywhere on Momento (album photos, covers, profile photos).
export const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
export const isBanned = async (hash) => Boolean(await Takedown.exists({ hash }));
export const BANNED_MESSAGE = 'This photo was removed from Momento after a complaint, so it can’t be added again.';
export async function assertNotBanned(buffer) {
  if (await isBanned(sha256(buffer))) throw new HttpError(422, BANNED_MESSAGE, 'removed-content');
}
