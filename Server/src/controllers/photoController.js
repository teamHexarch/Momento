import mongoose from 'mongoose';
import { Photo } from '../models/Photo.js';
import { Membership } from '../models/Membership.js';
import { Album } from '../models/Album.js';
import { HttpError } from '../utils/httpError.js';
import { hasGroupAccess } from '../services/groupAccess.js';
import { avatarOf, AVATAR_FIELDS } from '../services/avatarService.js';
import { config } from '../config/env.js';
import { sendPhoto, deletePhoto, ensureThumbnail } from '../services/storageService.js';

// A photo plus the caller's membership of its album; anyone outside the album gets a 404
// (publicPreview: a small version may also be shown to anyone when the album is a public event)
async function photoFor(req, { react = false } = {}) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Photo not found.');
  const photo = await Photo.findById(req.params.id);
  let m = photo && await Membership.findOne({ album: photo.album, user: req.user._id });
  // Friend-group members: checked live on every photo, so leaving the group ends access at once
  if (photo && (!m || m.via === 'group')) {
    const album = await Album.findById(photo.album, 'group');
    m = await hasGroupAccess(req.user._id, album) ? (m || { role: 'guest', via: 'group' }) : null;
  }
  // A photo in the bin: only its album's host still sees it (to recover it), and nobody can react
  if (!m || (photo.deletedAt && (m.role !== 'host' || react))) {
    throw new HttpError(404, 'Photo not found.');
  }
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

// Deleting for good straight away: the album's host only (the pages use the bin, /api/trash)
export async function remove(req, res) {
  const { photo, m } = await photoFor(req);
  if (m.role !== 'host') throw new HttpError(403, 'Only the host of an album can delete its photos.');
  await deletePhoto(photo.storageKey);
  await photo.deleteOne();
  res.json({ ok: true });
}

const firstName = (name) => (name || '').trim().split(/\s+/)[0] || 'Someone';
// Like or unlike a photo. Body: { liked: true|false }. Counts change only when the state really does.
export async function like(req, res) {
  const { photo } = await photoFor(req, { react: true });
  const uid = req.user._id;
  if (req.body?.liked === false) {
    await Photo.updateOne({ _id: photo._id, likes: uid }, { $pull: { likes: uid, likeLog: { user: uid } }, $inc: { likeCount: -1 } });
  } else {
    await Photo.updateOne({ _id: photo._id, likes: { $ne: uid } }, { $push: { likes: uid, likeLog: { user: uid, at: new Date() } }, $inc: { likeCount: 1 } });
  }
  const now = await Photo.findById(photo._id, 'likes likeCount');
  res.json({ likes: Math.max(0, now.likeCount || 0), liked: now.likes.some((id) => id.equals(uid)) });
}

export async function likes(req, res) {
  const { photo } = await photoFor(req, { react: true });
  await photo.populate({ path: 'likes', model: 'User', select: AVATAR_FIELDS });
  const people = photo.likes.map((user) => {
    const mine = user._id.equals(req.user._id);
    return { by: mine ? 'You' : firstName(user.name), mine, avatarUrl: avatarOf(user) };
  }).sort((a, b) => b.mine - a.mine);
  res.json({ people });
}

export const REACTIONS = ['😍', '😂', '🔥', '👏', '🥹', '😮', '🎉', '🥳', '❤️', '🙌', '✨', '🤩'];
export function reactionCounts(photo) {
  const counts = {};
  for (const r of photo.reactions || []) if (REACTIONS.includes(r.emoji)) counts[r.emoji] = (counts[r.emoji] || 0) + 1;
  return counts;
}
export const myReaction = (photo, userId) => (photo.reactions || []).find((r) => r.user?.equals(userId))?.emoji || null;

// POST /api/photos/:id/reaction  { emoji: '😍' } sets or switches yours; { emoji: null } takes it back
export async function react(req, res) {
  const { photo } = await photoFor(req, { react: true });
  const want = req.body?.emoji ?? null;
  if (want !== null && !REACTIONS.includes(want)) throw new HttpError(400, 'Pick one of the reactions.');
  const uid = req.user._id;
  await Photo.updateOne({ _id: photo._id }, { $pull: { reactions: { user: uid } } });
  if (want) await Photo.updateOne({ _id: photo._id }, { $push: { reactions: { user: uid, emoji: want } } });
  const now = await Photo.findById(photo._id, 'reactions');
  res.json({ reactions: reactionCounts(now), reaction: myReaction(now, uid) });
}

// GET /api/photos/:id/reactions  Who reacted with what (yours first)
export async function reactions(req, res) {
  const { photo } = await photoFor(req, { react: true });
  await photo.populate({ path: 'reactions.user', model: 'User', select: AVATAR_FIELDS });
  const people = (photo.reactions || []).filter((r) => r.user && REACTIONS.includes(r.emoji)).map((r) => {
    const mine = r.user._id.equals(req.user._id);
    return { by: mine ? 'You' : firstName(r.user.name), emoji: r.emoji, mine, avatarUrl: avatarOf(r.user) };
  }).sort((a, b) => b.mine - a.mine);
  res.json({ people });
}

// ---- GET /api/photos/liked  The photos you liked (Liked tab), newest like first ----
// Only photos still in albums you can open, and not in the bin
export async function liked(req, res) {
  const { albumIdsOf } = await import('./albumController.js');
  const ids = await albumIdsOf(req.user._id);
  const photos = await Photo.find({ 'likeLog.user': req.user._id, album: { $in: ids }, deletedAt: null }, 'album uploader likeLog')
    .populate('album', 'name').populate('uploader', 'name').limit(500);
  const url = (id) => `${config.publicUrl}/api/photos/${id}`;
  const out = photos.filter((p) => p.album).map((p) => ({
    id: p.id, albumId: p.album.id, albumName: p.album.name,
    url: url(p.id), thumbnailUrl: `${url(p.id)}?size=thumb`,
    by: p.uploader?._id.equals(req.user._id) ? 'You' : firstName(p.uploader?.name),
    likedAt: p.likeLog.find((l) => l.user?.equals(req.user._id))?.at,
  })).sort((a, b) => (b.likedAt || 0) - (a.likedAt || 0));
  res.json({ photos: out });
}
