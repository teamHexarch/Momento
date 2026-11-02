import crypto from 'node:crypto';
import { config } from '../config/env.js';
import * as disk from './storage/diskStorage.js';

// Where photo files live. Everything outside this file only knows about storage keys
// ("<albumId>/<random>.jpg"), so drivers can change without touching routes.
// Cloudflare R2 when its four settings are filled in, otherwise this machine's disk.

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heif', 'image/gif': '.gif' };
export const ALLOWED_TYPES = Object.keys(EXT);

const { accountId, accessKeyId, secretAccessKey, bucket } = config.r2;
const useR2 = Boolean(accountId && accessKeyId && secretAccessKey && bucket);
// Loaded only when used, so local development needs no Cloudflare settings
const driver = useR2 ? await import('./storage/r2Storage.js') : disk;

export const storageName = driver.name;
export const initStorage = () => driver.init();

export async function savePhoto(albumId, buffer, mimeType) {
  const key = `${albumId}/${crypto.randomUUID()}${EXT[mimeType] || ''}`;
  await driver.save(key, buffer, mimeType);
  return key;
}

// Answers a request for the photo; false when the file is gone
export const sendPhoto = (res, key, mimeType) => driver.send(res, key, mimeType);

// A readable stream of the photo (for zip downloads)
export const openPhoto = (key) => driver.open(key);

export const deletePhoto = (key) => driver.remove(key);

// Deletes many photos, a few at a time, so a big album doesn't open hundreds of requests at once
export async function deletePhotos(keys) {
  for (let i = 0; i < keys.length; i += 10) {
    await Promise.all(keys.slice(i, i + 10).map(deletePhoto));
  }
}
