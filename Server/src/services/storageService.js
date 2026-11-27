import crypto from 'node:crypto';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { config } from '../config/env.js';
import * as disk from './storage/diskStorage.js';
import { sanitizePhoto } from './imageService.js';

// Where photo files live. Everything outside this file only knows about storage keys
// ("<albumId>/<random>.jpg"), so drivers can change without touching routes.
// Amazon S3 when S3_BUCKET is set, otherwise this machine's disk (local development).

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heif', 'image/avif': '.avif', 'image/gif': '.gif' };

// Loaded only when used, so local development needs no AWS settings
const driver = config.aws.s3Bucket ? await import('./storage/s3Storage.js') : disk;

export const storageName = driver.name;
export const initStorage = () => driver.init();

export async function savePhoto(albumId, inputBuffer, opts) {
  return storePhoto(albumId, await sanitizePhoto(inputBuffer, opts));
}

// Stores a photo sanitizePhoto has already checked: the original, its thumbnail and its preview, all at once
export async function storePhoto(albumId, { buffer, mimeType, size, thumbnail, mini, preview, previewMimeType, ext }) {
  const key = `${albumId}/${crypto.randomUUID()}${ext || EXT[mimeType] || ''}`;
  const thumbnailKey = `${key}.thumb.webp`;
  const miniKey = mini ? `${key}.mini.webp` : undefined;
  const previewKey = `${key}.preview${EXT[previewMimeType]}`;
  try {
    await Promise.all([
      driver.save(key, buffer, mimeType, { tier: true }),
      driver.save(thumbnailKey, thumbnail, 'image/webp'),
      miniKey && driver.save(miniKey, mini, 'image/webp'),
      driver.save(previewKey, preview, previewMimeType),
    ]);
  } catch (err) {
    await Promise.allSettled([driver.remove(key), driver.remove(thumbnailKey), miniKey && driver.remove(miniKey), driver.remove(previewKey)]);
    throw err;
  }
  return { storageKey: key, thumbnailKey, miniKey, previewKey, previewMimeType, mimeType, size };
}

// Makes the 320px mini for a photo from before minis existed (the backfill job, scripts/makeMinis.js):
// from its preview when it has one (already upright, no metadata), otherwise from the original
export async function addMini(photo) {
  const { makeMini } = await import('./imageService.js');
  const stream = await driver.open(photo.previewKey || photo.storageKey);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const mini = await makeMini(Buffer.concat(chunks));
  const key = `${photo.storageKey}.mini.webp`;
  await driver.save(key, mini, 'image/webp');
  await photo.constructor.updateOne({ _id: photo._id }, { $set: { miniKey: key } });
  return key;
}

// Any other file (profile photos): saved and removed by key
export const saveFile = (key, buffer, mimeType) => driver.save(key, buffer, mimeType);
export const removeFile = (key) => driver.remove(key);
// Folders under a prefix, and removing a whole folder (old backups)
export const listFolders = (prefix) => driver.folders(prefix);
export const removePrefix = (prefix) => driver.removePrefix(prefix);

// Answers a request for the photo; false when the file is gone
export const sendPhoto = (res, key, mimeType, opts) => driver.send(res, key, mimeType, opts);
// A big file written as it's made (background zips)
export const saveStream = (key, stream, mimeType) => driver.saveStream(key, stream, mimeType);

// A readable stream of the photo (for zip downloads)
export const openPhoto = (key) => driver.open(key);

// Deterministic keys let old uploads gain compressed thumbnails on first use.
const thumbnailJobs = new Map();
export function ensureThumbnail(photo) {
  if (photo.thumbnailKey) return Promise.resolve(photo.thumbnailKey);
  if (thumbnailJobs.has(photo.storageKey)) return thumbnailJobs.get(photo.storageKey);
  const job = (async () => {
    const stream = await driver.open(photo.storageKey);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const thumbnail = await sharp(Buffer.concat(chunks), { limitInputPixels: 100_000_000 })
      .autoOrient().resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 }).toBuffer();
    const key = `${photo.storageKey}.thumb.webp`;
    await driver.save(key, thumbnail, 'image/webp');
    await photo.constructor.updateOne({ _id: photo._id }, { $set: { thumbnailKey: key } });
    return key;
  })().finally(() => thumbnailJobs.delete(photo.storageKey));
  thumbnailJobs.set(photo.storageKey, job);
  return job;
}

// Every file one photo has in storage: the original, its thumbnail, mini and preview
export const filesOf = (key) => [`${key}.thumb.webp`, `${key}.mini.webp`, `${key}.preview.jpg`, `${key}.preview.webp`, key];
export const deletePhoto = (key) => driver.removeMany(filesOf(key));

// Deletes many photos' files with as few requests as possible (S3: 1,000 files per request)
export async function deletePhotos(keys) {
  await driver.removeMany(keys.flatMap(filesOf));
}

// ---- Deleting files in the background (audit B4) ----
// A big album has thousands of files. Instead of deleting them while the person waits (which could outlast the
// proxy's 5-minute timeout), their keys are written down (PendingDelete, 1,000 per row) and deleted right after the
// answer is sent. If the server restarts halfway, the hourly tidy job finishes the rest (drainDeletes).
const PendingDelete = mongoose.models.PendingDelete || mongoose.model('PendingDelete',
  new mongoose.Schema({ keys: [String], at: { type: Date, default: Date.now }, tries: { type: Number, default: 0 } }, { versionKey: false }));
export async function deletePhotosLater(storageKeys) {
  const keys = storageKeys.filter(Boolean).flatMap(filesOf);
  for (let i = 0; i < keys.length; i += 1000) await PendingDelete.create({ keys: keys.slice(i, i + 1000) });
  if (keys.length) setImmediate(() => { if (mongoose.connection.readyState === 1) drainDeletes().catch((err) => { if (mongoose.connection.readyState === 1) console.error(`Background delete: ${err.message}`); }); });
}
let draining = null;
export function drainDeletes() {
  draining ||= (async () => {
    let files = 0;
    for (;;) {
      const row = await PendingDelete.findOne({ tries: { $lt: 20 } }).sort({ at: 1 });
      if (!row) break;
      try { await driver.removeMany(row.keys); files += row.keys.length; await row.deleteOne(); }
      catch (err) { await PendingDelete.updateOne({ _id: row._id }, { $inc: { tries: 1 } }); console.error(`Background delete failed (will retry): ${err.message}`); break; }
    }
    return { files };
  })().finally(() => { draining = null; });
  return draining;
}
