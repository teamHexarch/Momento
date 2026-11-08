import mongoose from 'mongoose';
import { Photo } from '../models/Photo.js';
import { Membership } from '../models/Membership.js';
import { Comment } from '../models/Comment.js';
import { Album } from '../models/Album.js';
import { HttpError } from '../utils/httpError.js';
import { sendPhoto, deletePhoto, ensureThumbnail } from '../services/storageService.js';

// A photo plus the caller's membership of its album; anyone outside the album gets a 404
// (publicPreview: a small version may also be shown to anyone when the album is a public event)
async function photoFor(req, { publicPreview = false } = {}) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Photo not found.');
  const photo = await Photo.findById(req.params.id);
  const m = photo && await Membership.findOne({ album: photo.album, user: req.user._id });
  if (!m) {
    if (photo && publicPreview && await Album.exists({ _id: photo.album, visibility: 'public' })) return { photo, m: null };
    throw new HttpError(404, 'Photo not found.');
  }
  return { photo, m };
}

export async function file(req, res) {
  const { photo } = await photoFor(req, { publicPreview: req.query.size === 'thumb' || req.query.size === 'preview' });
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
  await Promise.all([photo.deleteOne(), Comment.deleteMany({ photo: photo._id })]);
  res.json({ ok: true });
}

const firstName = (name) => (name || '').trim().split(/\s+/)[0] || 'Someone';
const commentOut = (c, userId, isHost) => {
  const mine = !!c.user?._id?.equals(userId);
  return {
    id: c.id, parent: c.parent ? String(c.parent) : null, by: mine ? 'You' : firstName(c.user?.name), mine, canDelete: mine || isHost, text: c.text, at: c.createdAt,
    likes: Math.max(0, c.likeCount || 0), liked: (c.likes || []).some((id) => id.equals(userId)),
  };
};

// Like or unlike a photo. Body: { liked: true|false }. Counts change only when the state really does.
export async function like(req, res) {
  const { photo } = await photoFor(req);
  const uid = req.user._id;
  if (req.body?.liked === false) {
    await Photo.updateOne({ _id: photo._id, likes: uid }, { $pull: { likes: uid }, $inc: { likeCount: -1 } });
  } else {
    await Photo.updateOne({ _id: photo._id, likes: { $ne: uid } }, { $push: { likes: uid }, $inc: { likeCount: 1 } });
  }
  const now = await Photo.findById(photo._id, 'likes likeCount');
  res.json({ likes: Math.max(0, now.likeCount || 0), liked: now.likes.some((id) => id.equals(uid)) });
}

// The comments under a photo, oldest first
export async function comments(req, res) {
  const { photo, m } = await photoFor(req);
  const list = await Comment.find({ photo: photo._id }).sort({ createdAt: 1 }).limit(300).populate('user', 'name');
  res.json({ comments: list.map((c) => commentOut(c, req.user._id, m.role === 'host')) });
}

export async function addComment(req, res) {
  const { photo, m } = await photoFor(req);
  const text = String(req.body?.text ?? '').trim();
  if (!text) throw new HttpError(400, 'Write something first.');
  if (text.length > 500) throw new HttpError(400, 'Keep comments under 500 characters.');
  let parent = null;
  if (req.body?.replyTo != null) {
    if (!mongoose.isValidObjectId(req.body.replyTo)) throw new HttpError(404, 'That comment is gone.');
    const to = await Comment.findOne({ _id: req.body.replyTo, photo: photo._id }, 'parent');
    if (!to) throw new HttpError(404, 'That comment is gone.');
    parent = to.parent || to._id;
  }
  const c = await Comment.create({ photo: photo._id, album: photo.album, user: req.user._id, text, parent });
  await Photo.updateOne({ _id: photo._id }, { $inc: { commentCount: 1 } });
  c.user = req.user;
  res.status(201).json({ comment: commentOut(c, req.user._id, m.role === 'host') });
}

// The writer, or the album's host, can remove a comment
export async function removeComment(req, res) {
  const { photo, m } = await photoFor(req);
  if (!mongoose.isValidObjectId(req.params.commentId)) throw new HttpError(404, 'Comment not found.');
  const c = await Comment.findOne({ _id: req.params.commentId, photo: photo._id });
  if (!c) throw new HttpError(404, 'Comment not found.');
  if (!c.user.equals(req.user._id) && m.role !== 'host') throw new HttpError(403, 'Only the person who wrote it or the host can remove it.');
  const replies = c.parent ? 0 : (await Comment.deleteMany({ parent: c._id })).deletedCount;
  await c.deleteOne();
  const removed = 1 + replies;
  await Photo.updateOne({ _id: photo._id }, [{ $set: { commentCount: { $max: [0, { $subtract: [{ $ifNull: ['$commentCount', 0] }, removed] }] } } }]);
  res.json({ ok: true, removed });
}

// Like or unlike a comment. Body: { liked: true|false }
export async function likeComment(req, res) {
  const { photo } = await photoFor(req);
  if (!mongoose.isValidObjectId(req.params.commentId)) throw new HttpError(404, 'Comment not found.');
  const uid = req.user._id, where = { _id: req.params.commentId, photo: photo._id };
  if (!(await Comment.exists(where))) throw new HttpError(404, 'Comment not found.');
  if (req.body?.liked === false) await Comment.updateOne({ ...where, likes: uid }, { $pull: { likes: uid }, $inc: { likeCount: -1 } });
  else await Comment.updateOne({ ...where, likes: { $ne: uid } }, { $push: { likes: uid }, $inc: { likeCount: 1 } });
  const now = await Comment.findOne(where, 'likes likeCount');
  res.json({ likes: Math.max(0, now.likeCount || 0), liked: now.likes.some((id) => id.equals(uid)) });
}
