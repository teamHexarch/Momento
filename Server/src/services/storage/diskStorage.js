import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config/env.js';

// Photos in a folder on this machine (UPLOAD_DIR). Used locally, whenever S3_BUCKET isn't set.

const fullPath = (key) => {
  const p = path.resolve(config.uploadDir, key);
  if (!p.startsWith(config.uploadDir + path.sep)) throw new Error('Bad storage key');
  return p;
};

export const name = 'disk';

export async function init() {
  await fsp.mkdir(config.uploadDir, { recursive: true });
}

export async function save(key, buffer) {
  const file = fullPath(key);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, buffer);
}

// A big file (a background zip) written as it's made
export async function saveStream(key, stream) {
  const file = fullPath(key);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const { pipeline } = await import('node:stream/promises');
  await pipeline(stream, fs.createWriteStream(file));
}

// Answers the browser's request for the photo with the file itself; false if it's missing
export async function send(res, key, mimeType, { filename } = {}) {
  const file = fullPath(key);
  if (!(await fsp.access(file).then(() => true, () => false))) return false;
  res.set('Cache-Control', 'private, max-age=86400');
  if (filename) res.attachment(filename);
  res.type(mimeType);
  res.sendFile(file);
  return true;
}

export async function open(key) {
  return fs.createReadStream(fullPath(key));
}

export async function folders(prefix) {
  const dir = fullPath(prefix.replace(/\/$/, '') + '/x').slice(0, -2);
  const names = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  return names.filter((d) => d.isDirectory()).map((d) => `${prefix}${d.name}/`);
}

export async function removePrefix(prefix) {
  await fsp.rm(fullPath(prefix.replace(/\/$/, '') + '/x').slice(0, -2), { recursive: true, force: true });
}

export async function remove(key) {
  const file = fullPath(key);
  await fsp.rm(file, { force: true });
  // Tidy the album's folder away once its last photo is gone (rmdir refuses if anything is left)
  await fsp.rmdir(path.dirname(file)).catch(() => {});
}

export async function removeMany(keys) {
  for (const key of keys) await remove(key);
}

// ---- Direct uploads on this computer (local development and tests only; the live server uses S3) ----
// The same shape as S3's: a signed link the browser PUTs the file to (PUT /api/uploads/local/:token, app.js), which
// checks the SHA-256 like S3 does.
export async function presignPut(key, { sha256Base64 }, seconds = 900) {
  const { signLocalPut } = await import('../directUploads.js');
  const headers = { 'Content-Type': 'application/octet-stream', 'x-amz-checksum-sha256': sha256Base64 };
  return { url: `${config.publicUrl}/api/uploads/local/${signLocalPut(key, sha256Base64, seconds)}`, method: 'PUT', headers };
}
export async function head(key) {
  const { createHash } = await import('node:crypto');
  try {
    const file = fullPath(key);
    const { size } = await fsp.stat(file);
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    return { size, sha256Base64: hash.digest('base64') };
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}
