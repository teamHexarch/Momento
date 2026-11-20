import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { Album } from '../models/Album.js';
import { Membership } from '../models/Membership.js';
import { Photo } from '../models/Photo.js';
import { HttpError } from '../utils/httpError.js';
import { hasGroupAccess } from '../services/groupAccess.js';
import { deletePhotos } from '../services/storageService.js';

// "Recently deleted" (My albums): deleting moves a photo to the bin (deletedAt is set) where it
// waits 30 days before it's removed for good. Only the host of an album can delete, recover or
// purge its photos. Guests hide other people's photos from their own view instead ("Hidden by you").
// Spec: Client/SERVER-TRASH-API.md

export const KEEP_DAYS = 30;
const DAY = 86400000;
const photoUrl = (id) => `${config.publicUrl}/api/photos/${id}`;
const firstName = (name) => (name || '').trim().split(/\s+/)[0] || 'Someone';
const rowOf = (p, albumName) => ({
  id: p.id, albumId: String(p.album), albumName,
  url: photoUrl(p.id), thumbnailUrl: `${photoUrl(p.id)}?size=thumb`, ...(p.miniKey && { miniUrl: `${photoUrl(p.id)}?size=mini` }), downloadUrl: `${photoUrl(p.id)}/download`,
});
const readIds = (body) => {
  const raw = Array.isArray(body?.photoIds) ? body.photoIds : [];
  if (raw.length > 500) throw new HttpError(400, 'Choose up to 500 photos at a time.');
  return raw.filter((id) => mongoose.isValidObjectId(id));
};

// The albums this person hosts (all of them, or the one asked for), with their names
async function hosted(userId, only) {
  if (only && !mongoose.isValidObjectId(only)) return new Map();
  const albums = await Album.find({ host: userId, ...(only && { _id: only }) }, 'name');
  return new Map(albums.map((a) => [String(a._id), a.name]));
}

// The photos a restore or purge applies to: the ones listed, or all of them ({ all: true }, optionally
// in one album), always only in the bin of albums this person hosts
async function picked(req) {
  const names = await hosted(req.user._id, req.body?.album);
  const filter = { album: { $in: [...names.keys()] }, deletedAt: { $ne: null } };
  if (req.body?.all !== true) filter._id = { $in: readIds(req.body) };
  return Photo.find(filter, 'storageKey');
}

// POST /api/trash  { photoIds }  → { moved, skipped }
export async function moveToTrash(req, res) {
  const ids = readIds(req.body);
  const photos = await Photo.find({ _id: { $in: ids }, deletedAt: null }, 'album');
  const names = await hosted(req.user._id);
  const mine = photos.filter((p) => names.has(String(p.album))).map((p) => p._id);
  const skipped = (Array.isArray(req.body?.photoIds) ? req.body.photoIds.length : 0) - mine.length;
  if (!mine.length && skipped) throw new HttpError(403, 'Only the host of an album can delete its photos.');
  const r = await Photo.updateMany({ _id: { $in: mine }, deletedAt: null }, { $set: { deletedAt: new Date(), deletedBy: req.user._id } });
  res.json({ moved: r.modifiedCount, skipped });
}

// GET /api/trash[?album=]  → photos in the bin, newest deleted first
export async function listTrash(req, res) {
  const names = await hosted(req.user._id, req.query.album);
  const photos = await Photo.find({ album: { $in: [...names.keys()] }, deletedAt: { $ne: null } }).sort({ deletedAt: -1 }).limit(1000);
  res.json({ photos: photos.map((p) => ({
    ...rowOf(p, names.get(String(p.album))),
    deletedAt: p.deletedAt, purgeAt: new Date(p.deletedAt.getTime() + KEEP_DAYS * DAY),
  })) });
}

// POST /api/trash/restore  { photoIds } | { all: true[, album] }  → { restored }
export async function restore(req, res) {
  const photos = await picked(req);
  // Photos hidden by reports stay hidden until staff decide
  const r = await Photo.updateMany({ _id: { $in: photos.map((p) => p._id) }, flaggedAt: null }, { $unset: { deletedAt: 1, deletedBy: 1 } });
  res.json({ restored: r.modifiedCount });
}

// POST /api/trash/purge  { photoIds } | { all: true[, album] }  → { purged }  (for good, files too)
export async function purge(req, res) {
  const photos = await picked(req);
  await deletePhotos(photos.map((p) => p.storageKey));
  const r = await Photo.deleteMany({ _id: { $in: photos.map((p) => p._id) } });
  res.json({ purged: r.deletedCount });
}

// Removes photos that have been in the bin for more than 30 days (run by the server every few hours)
export async function purgeExpired() {
  const old = await Photo.find({ deletedAt: { $lt: new Date(Date.now() - KEEP_DAYS * DAY) } }, 'storageKey').limit(500);
  if (!old.length) return 0;
  await deletePhotos(old.map((p) => p.storageKey));
  await Photo.deleteMany({ _id: { $in: old.map((p) => p._id) } });
  return old.length;
}

// GET /api/hidden[?album=]  → the photos you hid from your own view, in every album (or one)
export async function listHidden(req, res) {
  const only = req.query.album;
  if (only && !mongoose.isValidObjectId(only)) return res.json({ photos: [] });
  const rows = await Membership.find({ user: req.user._id, 'hidden.0': { $exists: true }, ...(only && { album: only }) }, 'album hidden via')
    .populate('album', 'name group');
  const out = [];
  for (const m of rows) {
    if (!m.album) continue;
    // A friend-group row only counts while they're still in the group
    if (m.via === 'group' && !(await hasGroupAccess(req.user._id, m.album))) continue;
    const photos = await Photo.find({ _id: { $in: m.hidden }, deletedAt: null }).sort({ createdAt: -1 }).populate('uploader', 'name');
    for (const p of photos) out.push({ ...rowOf(p, m.album.name), by: p.uploader?._id.equals(req.user._id) ? 'You' : firstName(p.uploader?.name) });
  }
  res.json({ photos: out });
}
