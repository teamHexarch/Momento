import crypto from 'node:crypto';
import sharp from 'sharp';
import { config } from '../config/env.js';
import { saveFile, removeFile } from './storageService.js';
import { HttpError } from '../utils/httpError.js';
import { assertAllowed } from './nsfwService.js';
import { assertNotBanned } from './contentSafety.js';
import { readableImage } from './imageService.js';

// An album's cover picture, chosen by its host. The upload is decoded and re-encoded (so only the
// picture is kept: no location or camera details), as a large WebP and a small one for cards.
// Its address carries a random token, so the picture can show on the invite, the Events map and
// the albums list without logging in, but can't be found by guessing album ids.

export async function saveCover(album, upload) {
  // An iPhone HEIC is turned into a JPEG first (sharp and the photo check can't read HEIC)
  const buffer = await readableImage(upload);
  await assertNotBanned(buffer);
  await assertAllowed(buffer, 'This cover', { user: album.host, album: album._id, kind: 'cover' });
  let big, small;
  try {
    const img = sharp(buffer, { limitInputPixels: 100_000_000, failOn: 'error' }).autoOrient();
    big = await img.clone().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    small = await img.clone().resize(640, 640, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  } catch {
    throw new HttpError(400, 'That file isn’t a photo Momento can read. Try a JPEG, PNG, HEIC or WebP.');
  }
  const token = crypto.randomBytes(12).toString('hex');
  const key = `covers/${album.id}/${token}.webp`, thumbKey = `covers/${album.id}/${token}.thumb.webp`;
  await saveFile(key, big, 'image/webp');
  await saveFile(thumbKey, small, 'image/webp');
  const old = album.cover?.key ? [album.cover.key, album.cover.thumbKey] : [];
  album.cover = { key, thumbKey, token, at: new Date() };
  await album.save();
  await removeCoverFiles(old);
}

export async function removeCover(album) {
  const old = album.cover?.key ? [album.cover.key, album.cover.thumbKey] : [];
  album.cover = undefined;
  album.keepHostCover = false;
  await album.save();
  await removeCoverFiles(old);
}

export async function removeCoverFiles(keys) {
  await Promise.all(keys.filter(Boolean).map((k) => removeFile(k).catch(() => {})));
}

// The host's picture, as the pages use it
export function hostCover(album) {
  if (!album.cover?.key) return null;
  const base = `${config.publicUrl}/api/albums/${album.id}/cover/${album.cover.token}`;
  return { source: 'host', url: base, thumbUrl: `${base}?size=thumb` };
}
