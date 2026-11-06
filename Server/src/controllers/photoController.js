import mongoose from 'mongoose';
import { Photo } from '../models/Photo.js';
import { Membership } from '../models/Membership.js';
import { HttpError } from '../utils/httpError.js';
import { sendPhoto, deletePhoto, ensureThumbnail } from '../services/storageService.js';

// A photo plus the caller's membership of its album; anyone outside the album gets a 404
async function photoFor(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Photo not found.');
  const photo = await Photo.findById(req.params.id);
  const m = photo && await Membership.findOne({ album: photo.album, user: req.user._id });
  if (!m) throw new HttpError(404, 'Photo not found.');
  return { photo, m };
}

export async function file(req, res) {
  const { photo } = await photoFor(req);
  // From disk: the file itself. From S3: a short-lived link straight to the bucket.
  const thumbnail = req.query.size === 'thumb' && await ensureThumbnail(photo);
  const preview = req.query.size === 'preview' && photo.previewKey;
  if (!(await sendPhoto(res, thumbnail || preview || photo.storageKey, thumbnail ? 'image/webp' : preview ? photo.previewMimeType : photo.mimeType))) throw new HttpError(404, 'Photo file is missing.');
}

export async function download(req, res) {
  const { photo } = await photoFor(req);
  const { openPhoto } = await import('../services/storageService.js');
  const stream = await openPhoto(photo.storageKey);
  res.attachment(`photo-${photo.id}${photo.storageKey.slice(photo.storageKey.lastIndexOf('.'))}`);
  res.type(photo.mimeType);
  stream.on('error', (err) => res.destroy(err));
  stream.pipe(res);
}

// The person who added a photo, or the host, can take it down
export async function remove(req, res) {
  const { photo, m } = await photoFor(req);
  if (!photo.uploader.equals(req.user._id) && m.role !== 'host') throw new HttpError(403, 'Only the person who added it or the host can remove it.');
  await deletePhoto(photo.storageKey);
  await photo.deleteOne();
  res.json({ ok: true });
}
