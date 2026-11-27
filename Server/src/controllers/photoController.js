import { isEmoji } from '../utils/emoji.js';
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
import { PhotoComment, MAX_COMMENTS_PER_PHOTO } from '../models/PhotoComment.js';
import { cleanText, LIMITS } from '../utils/text.js';

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
  // A photo in the bin: its album's host still sees it, and so does the person who added and deleted it (both can
  // recover it from Recently deleted); nobody can react to it. A photo hidden by reports (flagged) stays hidden.
  const binOwner = photo?.deletedAt && !photo.flaggedAt && photo.uploader?.equals(req.user._id) && photo.deletedBy?.equals(req.user._id);
  if (!m || photo.auditHidden || (photo.deletedAt && ((m.role !== 'host' && !binOwner) || react))) {
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

// Deleting for good straight away: the album's host, or the person who added it (the pages use the bin, /api/trash)
export async function remove(req, res) {
  const { photo, m } = await photoFor(req);
  if (m.role !== 'host' && !photo.uploader?.equals(req.user._id)) throw new HttpError(403, 'You can delete the photos you added; the host can delete any photo in their album.');
  await deletePhoto(photo.storageKey);
  await photo.deleteOne();
  // Its comments and reports go with it (audit B3)
  const [{ PhotoComment }, { Report }] = await Promise.all([import('../models/PhotoComment.js'), import('../models/Report.js')]);
  await Promise.all([PhotoComment.deleteMany({ photo: photo._id }), Report.deleteMany({ photo: photo._id })]);
  res.json({ ok: true });
}

const firstName = (name) => (name || '').trim().split(/\s+/)[0] || 'Someone';
// Like or unlike a photo. Body: { liked: true|false }. Counts change only when the state really does.
// ---- POST /api/photos/:id/report  { reason, note } ----
// The reporter stops seeing the photo at once. When REPORTS_TO_HIDE (3) different people report it, it's
// hidden from everyone (into the host's bin, where the host can't restore it) until staff decide.
const REPORTS_TO_HIDE = Number(process.env.REPORTS_TO_HIDE) || 3;
const REPORTS_PER_DAY = Number(process.env.REPORTS_PER_DAY) || 10;
// Reports that count towards hiding a photo from everyone: from the host, from someone who joined the album more than
// 24 hours ago, or from someone who has added photos to it. Three accounts made a minute ago can't hide anyone's photo
// (they still stop seeing it themselves, and staff still get every report).
async function countedReporters(photo, rows) {
  const ids = rows.map((r) => r.reporter).filter(Boolean);
  if (!ids.length) return 0;
  const dayAgo = new Date(Date.now() - 86400000);
  const [settled, uploaders] = await Promise.all([
    Membership.find({ album: photo.album, user: { $in: ids }, $or: [{ role: 'host' }, { createdAt: { $lte: dayAgo } }] }, 'user').lean(),
    Photo.distinct('uploader', { album: photo.album, uploader: { $in: ids } }),
  ]);
  return new Set([...settled.map((m) => String(m.user)), ...uploaders.map(String)]).size;
}
export async function report(req, res) {
  const { photo } = await photoFor(req, { react: true });
  const reason = ['nudity', 'abuse', 'privacy', 'copyright', 'other'].includes(req.body?.reason) ? req.body.reason : null;
  if (!reason) throw new HttpError(400, 'Choose why you’re reporting this photo.');
  const note = String(req.body?.note ?? '').trim().slice(0, 1000);
  const { Report } = await import('../models/Report.js');
  // At most REPORTS_PER_DAY new reports per account a day (audit M2: report brigading)
  const isNew = !await Report.exists({ photo: photo._id, reporter: req.user._id });
  if (isNew && await Report.countDocuments({ reporter: req.user._id, createdAt: { $gt: new Date(Date.now() - 86400000) } }) >= REPORTS_PER_DAY) {
    throw new HttpError(429, 'You’ve reported a lot of photos today. You can still hide photos from your own view; try reporting again tomorrow.', 'report-limit');
  }
  await Report.updateOne({ photo: photo._id, reporter: req.user._id }, { $set: { reason, note, status: 'open', album: photo.album } }, { upsert: true });
  // Out of the reporter's own view straight away
  await Membership.updateOne({ album: photo.album, user: req.user._id }, { $addToSet: { hidden: photo._id }, $setOnInsert: { role: 'guest', via: 'group' } }, { upsert: true });
  const reports = await Report.countDocuments({ photo: photo._id, status: 'open' });
  const counted = await countedReporters(photo, await Report.find({ photo: photo._id, status: 'open' }, 'reporter').lean());
  let hiddenForEveryone = false;
  if (counted >= REPORTS_TO_HIDE) {
    const r = await Photo.updateOne({ _id: photo._id, flaggedAt: null }, { $set: { flaggedAt: new Date(), deletedAt: new Date() } });
    hiddenForEveryone = r.modifiedCount === 1;
  }
  const { audit } = await import('../services/auditService.js');
  await audit('photo.reported', { req, target: photo._id, meta: { reason, reports, counted, hiddenForEveryone } });
  // The team hears about every report (user input), with the reason on the data line for the feedback sheet
  const REASONS = { nudity: 'Nudity or sexual content', abuse: 'Abuse, hate or violence', privacy: 'Privacy: a photo of me I didn’t agree to', copyright: 'Copyright', other: 'Something else' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const { sendTeamMail } = await import('../services/teamMail.js');
  sendTeamMail({
    kind: 'report',
    title: `Photo report · ${REASONS[reason]}${hiddenForEveryone ? ' · now hidden from everyone' : ''}`,
    html: `<p>A photo was reported: <b>${esc(REASONS[reason])}</b>.</p>
      ${note ? `<blockquote style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #6C5FC7;background:#F6F4FA;white-space:pre-wrap">${esc(note)}</blockquote>` : '<p>No note.</p>'}
      <p>Open reports on this photo: <b>${reports}</b>, of which <b>${counted}</b> from established members (hidden from everyone at ${REPORTS_TO_HIDE}).</p>
      <p style="color:#5C596B;font-size:13px">Photo ${photo.id}, album ${photo.album}. Reporter's account ${req.user.id}. Decide on the staff review page.</p>`,
    data: { reason, reports, hiddenForEveryone, text: note },
  }).catch((err) => console.error(`Report on ${photo.id} saved but not emailed: ${err.message}`));
  // What really happens: it's gone from the reporter's view now, and from everyone's once REPORTS_TO_HIDE people report it
  // (no promise of a review here)
  res.status(201).json({ reported: true, hidden: true, message: 'Thanks for telling us. You won’t see this photo any more.' });
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

// The quick picks on the album page; any other single emoji is accepted too (isEmoji)
export const REACTIONS = ['😍', '😂', '🔥', '👏', '🥹', '😮', '🎉', '🥳', '❤️', '🙌', '✨', '🤩'];
export function reactionCounts(photo) {
  const counts = {};
  for (const r of photo.reactions || []) if (isEmoji(r.emoji)) counts[r.emoji] = (counts[r.emoji] || 0) + 1;
  return counts;
}
export const myReaction = (photo, userId) => (photo.reactions || []).find((r) => r.user?.equals(userId))?.emoji || null;

// POST /api/photos/:id/reaction  { emoji: '😍' } sets or switches yours; { emoji: null } takes it back
export async function react(req, res) {
  const { photo } = await photoFor(req, { react: true });
  const want = req.body?.emoji ?? null;
  if (want !== null && !isEmoji(want)) throw new HttpError(400, 'Pick one emoji to react with.');
  const uid = req.user._id;
  await Photo.updateOne({ _id: photo._id }, { $pull: { reactions: { user: uid } } });
  if (want) await Photo.updateOne({ _id: photo._id }, { $push: { reactions: { user: uid, emoji: want, at: new Date() } } });
  const who = { user: photo.uploader, actor: uid, album: photo.album, photo: photo._id, type: 'reaction' };
  if (want) await notify({ ...who, emoji: want }); else await unnotify(who);
  const now = await Photo.findById(photo._id, 'reactions');
  res.json({ reactions: reactionCounts(now), reaction: myReaction(now, uid) });
}

// GET /api/photos/:id/reactions  Who reacted with what and when (yours first, then the newest)
export async function reactions(req, res) {
  const { photo } = await photoFor(req, { react: true });
  await photo.populate({ path: 'reactions.user', model: 'User', select: AVATAR_FIELDS });
  const people = (photo.reactions || []).filter((r) => r.user && isEmoji(r.emoji)).map((r) => {
    const mine = r.user._id.equals(req.user._id);
    return { by: mine ? 'You' : firstName(r.user.name), emoji: r.emoji, mine, avatarUrl: avatarOf(r.user), at: r.at || null };
  }).sort((a, b) => (b.mine - a.mine) || (new Date(b.at || 0) - new Date(a.at || 0)));
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

// ---- Comments: GET/POST /api/photos/:id/comments · DELETE /api/photos/:id/comments/:commentId ----
// Anyone in the album can read and write them (not on photos in the bin). Up to 50 characters, at most 50 per photo
// (the photo's commentCount is reserved first, so two people can't both take the 50th). The author, the album's host,
// or the admin team (DELETE /api/admin/comments/:id) can delete one. The host can turn comments off (allowComments).

const commentView = (c, userId, canDelete) => ({
  id: String(c._id), text: c.text, by: c.author?.equals?.(userId) ? 'You' : (c.authorName || 'Someone'),
  mine: !!c.author?.equals?.(userId), at: c.createdAt, canDelete,
});

export async function comments(req, res) {
  const { photo, m } = await photoFor(req, { react: true });
  const [rows, album] = await Promise.all([
    PhotoComment.find({ photo: photo._id }).sort({ createdAt: 1 }).limit(MAX_COMMENTS_PER_PHOTO).lean(),
    Album.findById(photo.album, 'allowComments').lean(),
  ]);
  const host = m.role === 'host';
  res.json({
    comments: rows.map((c) => commentView({ ...c, author: c.author }, req.user._id, host || c.author.equals(req.user._id))),
    count: rows.length, max: MAX_COMMENTS_PER_PHOTO, allowComments: album?.allowComments !== false, maxLength: LIMITS.comment,
  });
}

export async function addComment(req, res) {
  const { photo, m } = await photoFor(req, { react: true });
  const album = await Album.findById(photo.album, 'allowComments').lean();
  if (album?.allowComments === false) throw new HttpError(403, 'The host has turned comments off for this album.', 'COMMENTS_OFF');
  const text = cleanText(req.body?.text, { max: LIMITS.comment, what: 'Your comment', required: true, multiline: true });
  const reserved = await Photo.updateOne({ _id: photo._id, deletedAt: null, commentCount: { $lt: MAX_COMMENTS_PER_PHOTO } }, { $inc: { commentCount: 1 } });
  if (!reserved.modifiedCount) throw new HttpError(409, `This photo already has ${MAX_COMMENTS_PER_PHOTO} comments.`, 'COMMENT_LIMIT');
  let c;
  try {
    c = await PhotoComment.create({ photo: photo._id, album: photo.album, author: req.user._id, authorName: (req.user.name || '').trim().split(/\s+/)[0] || 'Someone', text });
  } catch (error) {
    await Photo.updateOne({ _id: photo._id, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1 } });
    throw error;
  }
  const count = (await Photo.findById(photo._id, 'commentCount').lean())?.commentCount ?? 0;
  res.status(201).json({ comment: commentView(c, req.user._id, true), commentCount: count, host: m.role === 'host' });
}

export async function removeComment(req, res) {
  const { photo, m } = await photoFor(req);
  if (!mongoose.isValidObjectId(req.params.commentId)) throw new HttpError(404, 'Comment not found.', 'COMMENT_NOT_FOUND');
  const c = await PhotoComment.findOne({ _id: req.params.commentId, photo: photo._id });
  if (!c) throw new HttpError(404, 'Comment not found.', 'COMMENT_NOT_FOUND');
  if (m.role !== 'host' && !c.author.equals(req.user._id)) throw new HttpError(403, 'You can delete your own comments; the host can delete any.', 'COMMENT_NOT_YOURS');
  if ((await PhotoComment.deleteOne({ _id: c._id })).deletedCount) {
    await Photo.updateOne({ _id: photo._id, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1 } });
  }
  const count = (await Photo.findById(photo._id, 'commentCount').lean())?.commentCount ?? 0;
  res.json({ ok: true, commentCount: count });
}
