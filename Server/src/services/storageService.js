import crypto from 'node:crypto';
import { config } from '../config/env.js';
import * as disk from './storage/diskStorage.js';
import { sanitizePhoto } from './imageService.js';

// Where photo files live. Everything outside this file only knows about storage keys
// ("<albumId>/<random>.jpg"), so drivers can change without touching routes.
// Cloudflare R2 when its four settings are filled in, otherwise this machine's disk.

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heif', 'image/gif': '.gif' };

const { accountId, accessKeyId, secretAccessKey, bucket } = config.r2;
const useR2 = Boolean(accountId && accessKeyId && secretAccessKey && bucket);
// Loaded only when used, so local development needs no Cloudflare settings
const driver = useR2 ? await import('./storage/r2Storage.js') : disk;

export const storageName = driver.name;
export const initStorage = () => driver.init();

export async function savePhoto(albumId, inputBuffer) {
  const { buffer, mimeType, size, thumbnail, preview, previewMimeType } = await sanitizePhoto(inputBuffer);
  const key = `${albumId}/${crypto.randomUUID()}${EXT[mimeType] || ''}`;
  const thumbnailKey = `${key}.thumb.webp`;
  const previewKey = `${key}.preview${EXT[previewMimeType]}`;
  try {
    await driver.save(key, buffer, mimeType);
    await driver.save(thumbnailKey, thumbnail, 'image/webp');
    await driver.save(previewKey, preview, previewMimeType);
  } catch (err) {
    await Promise.allSettled([driver.remove(key), driver.remove(thumbnailKey), driver.remove(previewKey)]);
    throw err;
  }
  return { storageKey: key, thumbnailKey, previewKey, previewMimeType, mimeType, size };
}

// Answers a request for the photo; false when the file is gone
export const sendPhoto = (res, key, mimeType) => driver.send(res, key, mimeType);

// A readable stream of the photo (for zip downloads)
export const openPhoto = (key) => driver.open(key);

export const deletePhoto = async (key) => {
  await driver.remove(`${key}.thumb.webp`);
  await driver.remove(`${key}.preview.jpg`);
  await driver.remove(`${key}.preview.webp`);
  await driver.remove(key);
};

// Deletes many photos, a few at a time, so a big album doesn't open hundreds of requests at once
export async function deletePhotos(keys) {
  for (let i = 0; i < keys.length; i += 10) {
    await Promise.all(keys.slice(i, i + 10).map(deletePhoto));
  }
}
