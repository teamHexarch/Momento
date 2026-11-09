import crypto from 'node:crypto';
import sharp from 'sharp';
import { config } from '../config/env.js';
import { saveFile, removeFile } from './storageService.js';
import { HttpError } from '../utils/httpError.js';

// Profile photos. An uploaded photo is decoded and re-encoded as a 256 x 256 WebP (so nothing but
// the picture is kept: no location or camera data), stored under avatars/<userId>/, and served
// by GET /api/users/:id/avatar to people who are logged in.
// People who signed up with Google start with their Google photo (avatarUrl) until they upload one.

// The fields a populate() needs for avatarOf()
export const AVATAR_FIELDS = 'name avatarKey avatarUrl';

// The picture to show for a user ('' when there is none: the site shows their initials)
export function avatarOf(user) {
  if (!user) return '';
  if (user.avatarKey) {
    // The key changes with every upload, so the version makes browsers fetch the new picture
    const v = user.avatarKey.slice(-12, -5);
    return `${config.publicUrl}/api/users/${user._id}/avatar?v=${v}`;
  }
  return user.avatarUrl || '';
}

export async function saveAvatar(user, buffer) {
  let webp;
  try {
    webp = await sharp(buffer, { limitInputPixels: 50_000_000 })
      .autoOrient()
      .resize(256, 256, { fit: 'cover', position: 'attention' })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new HttpError(400, 'That file isn’t a photo Momento can read. Try a JPEG, PNG, HEIC or WebP.');
  }
  const key = `avatars/${user.id}/${crypto.randomUUID()}.webp`;
  await saveFile(key, webp, 'image/webp');
  const old = user.avatarKey;
  user.avatarKey = key;
  await user.save();
  if (old) await removeFile(old).catch(() => {});
}

export async function removeAvatar(user) {
  const old = user.avatarKey;
  user.avatarKey = undefined;
  user.avatarUrl = '';
  await user.save();
  if (old) await removeFile(old).catch(() => {});
}
