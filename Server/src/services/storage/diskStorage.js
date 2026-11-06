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

// Answers the browser's request for the photo with the file itself; false if it's missing
export async function send(res, key, mimeType) {
  const file = fullPath(key);
  if (!(await fsp.access(file).then(() => true, () => false))) return false;
  res.set('Cache-Control', 'private, max-age=86400');
  res.type(mimeType);
  res.sendFile(file);
  return true;
}

export async function open(key) {
  return fs.createReadStream(fullPath(key));
}

export async function remove(key) {
  const file = fullPath(key);
  await fsp.rm(file, { force: true });
  // Tidy the album's folder away once its last photo is gone (rmdir refuses if anything is left)
  await fsp.rmdir(path.dirname(file)).catch(() => {});
}
