import mongoose from 'mongoose';
import { Photo } from '../models/Photo.js';
import { Membership } from '../models/Membership.js';
import { Album } from '../models/Album.js';
import { HttpError } from '../utils/httpError.js';
import { hasGroupAccess } from '../services/groupAccess.js';
import { avatarOf, AVATAR_FIELDS } from '../services/avatarService.js';
import { config } from '../config/env.js';
import { notify, unnotify } from '../services/notifyService.js';
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
  // Seeing a photo means its preview (up to 2500 px, a few hundred KB) unless ?size=original is asked for:
  // the original can be tens of MB (or a camera RAW no browser can show), which made the viewer slow.
  // "Download" (/download) always gives the original.
  // ?size=mini: the 320px grid picture (a photo without one yet gets its thumbnail instead)
  if (req.query.size === 'mini' && photo.miniKey) {
    if (!(await sendPhoto(res, photo.miniKey, 'image/webp'))) throw new HttpError(404, 'Photo file is missing.');
    return;
  }
  const thumbnail = (req.query.size === 'thumb' || req.query.size === 'mini') && await ensureThumbnail(photo);
  const preview = req.query.size !== 'original' && photo.previewKey;
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
// ---- POST /api/photos/:id/report  { reason, note } ----
// The reporter stops seeing the photo at once. When REPORTS_TO_HIDE (3) different people report it, it's
// hidden from everyone (into the host's bin, where the host can't restore it) until staff decide.
const REPORTS_TO_HIDE = Number(process.env.REPORTS_TO_HIDE) || 3;
export async function report(req, res) {
  const { photo } = await photoFor(req, { react: true });
  const reason = ['nudity', 'abuse', 'privacy', 'copyright', 'other'].includes(req.body?.reason) ? req.body.reason : null;
  if (!reason) throw new HttpError(400, 'Choose why you’re reporting this photo.');
  const note = String(req.body?.note ?? '').trim().slice(0, 1000);
  const { Report } = await import('../models/Report.js');
  await Report.updateOne({ photo: photo._id, reporter: req.user._id }, { $set: { reason, note, status: 'open', album: photo.album } }, { upsert: true });
  // Out of the reporter's own view straight away
  await Membership.updateOne({ album: photo.album, user: req.user._id }, { $addToSet: { hidden: photo._id }, $setOnInsert: { role: 'guest', via: 'group' } }, { upsert: true });
  const reports = await Report.countDocuments({ photo: photo._id, status: 'open' });
  let hiddenForEveryone = false;
  if (reports >= REPORTS_TO_HIDE) {
    const r = await Photo.updateOne({ _id: photo._id, flaggedAt: null }, { $set: { flaggedAt: new Date(), deletedAt: new Date() } });
    hiddenForEveryone = r.modifiedCount === 1;
  }
  const { audit } = await import('../services/auditService.js');
  await audit('photo.reported', { req, target: photo._id, meta: { reason, reports, hiddenForEveryone } });
  res.status(201).json({ reported: true, hidden: true, message: 'Thanks for telling us. You won’t see this photo any more, and we’ll take a look.' });
}

// ---- Bookmarks: private, just for you (they replaced likes; reactions show love in public now) ----
// They're kept where likes were, so photos liked before count as bookmarked. Nobody else is told or
// sees a count, and they don't make a photo the album's cover.
async function setBookmark(req, on) {
  const { photo } = await photoFor(req, { react: true });
  const uid = req.user._id;
  if (on) await Photo.updateOne({ _id: photo._id, likes: { $ne: uid } }, { $push: { likes: uid, likeLog: { user: uid, at: new Date() } }, $inc: { likeCount: 1 } });
  else await Photo.updateOne({ _id: photo._id, likes: uid }, { $pull: { likes: uid, likeLog: { user: uid } }, $inc: { likeCount: -1 } });
  // A "liked your photo" from before bookmarks goes too
  if (!on) await unnotify({ user: photo.uploader, type: 'like', actor: uid, photo: photo._id });
  const now = await Photo.findById(photo._id, 'likes');
  return now.likes.some((id) => id.equals(uid));
}
// POST /api/photos/:id/bookmark  { bookmarked: true|false }
export async function bookmark(req, res) {
  res.json({ bookmarked: await setBookmark(req, req.body?.bookmarked !== false) });
}
// The old address for the same thing ({ liked }), for pages from before bookmarks
export async function like(req, res) {
  res.json({ liked: await setBookmark(req, req.body?.liked !== false), likes: 0 });
}
// Who bookmarked it: private, so only ever you
export async function likes(req, res) {
  const { photo } = await photoFor(req, { react: true });
  if (!photo.likes.some((id) => id.equals(req.user._id))) return res.json({ people: [] });
  res.json({ people: [{ by: 'You', mine: true, avatarUrl: avatarOf(req.user) }] });
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
  const who = { user: photo.uploader, actor: uid, album: photo.album, photo: photo._id, type: 'reaction' };
  if (want) await notify({ ...who, emoji: want }); else await unnotify(who);
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

// ---- GET /api/photos/bookmarked  The photos you bookmarked (Bookmarked tab), newest first ----
// (GET /api/photos/liked is the old address: the same list, with likedAt)
// Only photos still in albums you can open, and not in the bin
export async function liked(req, res) {
  const { albumIdsOf } = await import('./albumController.js');
  const ids = await albumIdsOf(req.user._id);
  const photos = await Photo.find({ 'likeLog.user': req.user._id, album: { $in: ids }, deletedAt: null }, 'album uploader likeLog miniKey')
    .populate('album', 'name').populate('uploader', 'name').limit(500);
  const url = (id) => `${config.publicUrl}/api/photos/${id}`;
  const out = photos.filter((p) => p.album).map((p) => ({
    id: p.id, albumId: p.album.id, albumName: p.album.name,
    url: url(p.id), thumbnailUrl: `${url(p.id)}?size=thumb`, ...(p.miniKey && { miniUrl: `${url(p.id)}?size=mini` }),
    by: p.uploader?._id.equals(req.user._id) ? 'You' : firstName(p.uploader?.name),
    bookmarkedAt: p.likeLog.find((l) => l.user?.equals(req.user._id))?.at,
  })).sort((a, b) => (b.bookmarkedAt || 0) - (a.bookmarkedAt || 0));
  res.json({ photos: req.path.endsWith('/liked') ? out.map(({ bookmarkedAt, ...p }) => ({ ...p, likedAt: bookmarkedAt })) : out });
}
