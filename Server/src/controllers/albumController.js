import { once } from 'node:events';
import mongoose from 'mongoose';
import { ZipArchive } from 'archiver';
import { config } from '../config/env.js';
import { Album } from '../models/Album.js';
import { Membership } from '../models/Membership.js';
import { Photo } from '../models/Photo.js';
import { HttpError } from '../utils/httpError.js';
import { newAlbumCode, normaliseCode } from '../utils/albumCodes.js';
import { savePhoto, deletePhotos, openPhoto } from '../services/storageService.js';

const PREVIEW_PICS = 9;
// Absolute, because the pages may be on another address (hexarch.org) than this API
const photoUrl = (id) => `${config.publicUrl}/api/photos/${id}`;
const firstName = (name) => (name || '').trim().split(/\s+/)[0] || 'Someone';

// An album is "live" on the day of the event and the day after (parties run past midnight)
function isLive(date) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  return date === today || date === yesterday;
}

// The caller's membership of an album, or a 404 (not 403, so album ids can't be probed)
export async function membershipOf(req, albumId) {
  if (!mongoose.isValidObjectId(albumId)) throw new HttpError(404, 'Album not found.');
  const m = await Membership.findOne({ album: albumId, user: req.user._id }).populate('album');
  if (!m?.album) throw new HttpError(404, 'Album not found.');
  return m;
}

// Counts and the newest few photos for a set of albums, in two queries
async function statsFor(albumIds, userId) {
  const [photoStats, memberStats] = await Promise.all([
    Photo.aggregate([
      { $match: { album: { $in: albumIds } } },
      { $group: {
        _id: '$album',
        photos: { $sum: 1 },
        mine: { $sum: { $cond: [{ $eq: ['$uploader', userId] }, 1, 0] } },
        pics: { $topN: { n: PREVIEW_PICS, sortBy: { createdAt: -1 }, output: '$_id' } },
      } },
    ]),
    Membership.aggregate([
      { $match: { album: { $in: albumIds } } },
      { $group: { _id: '$album', guests: { $sum: 1 } } },
    ]),
  ]);
  const byAlbum = new Map(albumIds.map((id) => [String(id), { photos: 0, mine: 0, pics: [], guests: 0 }]));
  for (const s of photoStats) Object.assign(byAlbum.get(String(s._id)), { photos: s.photos, mine: s.mine, pics: s.pics.map(photoUrl) });
  for (const s of memberStats) byAlbum.get(String(s._id)).guests = s.guests;
  return byAlbum;
}

function summary(album, role, stats) {
  return {
    id: album.id,
    name: album.name,
    date: album.date,
    place: album.place,
    role,
    live: isLive(album.date),
    // Only the host sees the join code, to print or share
    code: role === 'host' ? album.displayCode : undefined,
    zone: album.zone?.radiusM ? album.zone : undefined,
    ...stats,
  };
}

function readAlbumFields(body) {
  const name = String(body?.name ?? '').trim();
  const date = String(body?.date ?? '').trim();
  const place = String(body?.place ?? '').trim();
  if (!name) throw new HttpError(400, 'Give the album a name.');
  if (name.length > 100) throw new HttpError(400, 'Keep the name under 100 characters.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new HttpError(400, 'Pick the date of the event.');
  if (place.length > 120) throw new HttpError(400, 'Keep the place under 120 characters.');
  let zone;
  const z = body?.zone;
  if (z && z.lat != null && z.lng != null) {
    const lat = Number(z.lat), lng = Number(z.lng), radiusM = Number(z.radiusM) || 150;
    if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && radiusM >= 10 && radiusM <= 5000)) throw new HttpError(400, 'That sharing zone isn’t valid.');
    zone = { lat, lng, radiusM };
  }
  return { name, date, place, zone };
}

// ---- Listing, creating, joining ----

export async function list(req, res) {
  const memberships = await Membership.find({ user: req.user._id }).populate('album');
  const mine = memberships.filter((m) => m.album);
  const ids = mine.map((m) => m.album._id);
  const [stats, recent] = await Promise.all([
    statsFor(ids, req.user._id),
    Photo.find({ album: { $in: ids } }).sort({ createdAt: -1 }).limit(12).populate('uploader', 'name'),
  ]);
  const albums = mine
    .map((m) => summary(m.album, m.role, stats.get(String(m.album._id))))
    .sort((a, b) => b.date.localeCompare(a.date));
  res.json({
    albums,
    recent: recent.map((p) => ({
      albumId: String(p.album),
      photoId: p.id,
      url: photoUrl(p.id),
      by: p.uploader?._id.equals(req.user._id) ? 'You' : firstName(p.uploader?.name),
      at: p.createdAt,
    })),
  });
}

export async function create(req, res) {
  const fields = readAlbumFields(req.body);
  let album;
  // Codes are random; on the rare clash with an existing one, draw again
  for (let tries = 0; !album; tries++) {
    try {
      album = await Album.create({ ...fields, code: newAlbumCode(), host: req.user._id });
    } catch (err) {
      if (err.code !== 11000 || tries >= 5) throw err;
    }
  }
  await Membership.create({ album: album._id, user: req.user._id, role: 'host' });
  res.status(201).json({ album: summary(album, 'host', { photos: 0, mine: 0, pics: [], guests: 1 }) });
}

export async function join(req, res) {
  const code = normaliseCode(req.body?.code);
  if (code.length !== 7) throw new HttpError(400, 'Codes are 7 letters and numbers, like K7Q-48DM.');
  const album = await Album.findOne({ code });
  if (!album) throw new HttpError(404, 'No album has that code. Check it against the host’s card.');
  // The sharing zone (album.zone) is stored but not enforced yet
  let m = await Membership.findOne({ album: album._id, user: req.user._id });
  const already = !!m;
  if (!m) {
    try {
      m = await Membership.create({ album: album._id, user: req.user._id, role: 'guest' });
    } catch (err) {
      if (err.code !== 11000) throw err;   // a double tap joined twice at once
      m = await Membership.findOne({ album: album._id, user: req.user._id });
    }
  }
  const stats = await statsFor([album._id], req.user._id);
  res.status(already ? 200 : 201).json({ already, album: summary(album, m.role, stats.get(String(album._id))) });
}

// ---- One album ----

export async function show(req, res) {
  const m = await membershipOf(req, req.params.id);
  const [stats, photos] = await Promise.all([
    statsFor([m.album._id], req.user._id),
    Photo.find({ album: m.album._id }).sort({ createdAt: -1 }).populate('uploader', 'name'),
  ]);
  res.json({
    album: summary(m.album, m.role, stats.get(String(m.album._id))),
    photos: photos.map((p) => {
      const mine = p.uploader?._id.equals(req.user._id);
      return { id: p.id, url: photoUrl(p.id), by: mine ? 'You' : firstName(p.uploader?.name), mine, at: p.createdAt };
    }),
  });
}

export async function update(req, res) {
  const m = await membershipOf(req, req.params.id);
  if (m.role !== 'host') throw new HttpError(403, 'Only the host can change the album.');
  const fields = readAlbumFields({ name: m.album.name, date: m.album.date, place: m.album.place, zone: m.album.zone, ...req.body });
  Object.assign(m.album, fields);
  await m.album.save();
  const stats = await statsFor([m.album._id], req.user._id);
  res.json({ album: summary(m.album, 'host', stats.get(String(m.album._id))) });
}

export async function remove(req, res) {
  const m = await membershipOf(req, req.params.id);
  if (m.role !== 'host') throw new HttpError(403, 'Only the host can delete the album.');
  const photos = await Photo.find({ album: m.album._id }, 'storageKey');
  await deletePhotos(photos.map((p) => p.storageKey));
  await Promise.all([
    Photo.deleteMany({ album: m.album._id }),
    Membership.deleteMany({ album: m.album._id }),
    m.album.deleteOne(),
  ]);
  res.json({ ok: true });
}

// Guests can leave; the host deletes the album instead
export async function leave(req, res) {
  const m = await membershipOf(req, req.params.id);
  if (m.role === 'host') throw new HttpError(400, 'You’re the host. Delete the album instead.');
  await m.deleteOne();
  res.json({ ok: true });
}

// ---- Photos ----

// Runs before the upload is read, so non-members are turned away without receiving any file data
export async function checkMember(req, res, next) {
  req.membership = await membershipOf(req, req.params.id);
  next();
}

export async function addPhotos(req, res) {
  const files = req.files || [];
  if (!files.length) throw new HttpError(400, 'Choose at least one photo.');
  const album = req.membership.album;
  const saved = [];
  for (const f of files) {
    const storageKey = await savePhoto(album.id, f.buffer, f.mimetype);
    const p = await Photo.create({
      album: album._id, uploader: req.user._id, storageKey,
      originalName: f.originalname.slice(0, 200), mimeType: f.mimetype, size: f.size,
    });
    saved.push({ id: p.id, url: photoUrl(p.id), by: 'You', mine: true, at: p.createdAt });
  }
  res.status(201).json({ photos: saved });
}

export async function download(req, res) {
  const m = await membershipOf(req, req.params.id);
  const photos = await Photo.find({ album: m.album._id }).sort({ createdAt: 1 });
  if (!photos.length) throw new HttpError(404, 'This album has no photos yet.');
  const safeName = m.album.name.replace(/[^\w\- ]+/g, '').trim() || 'album';
  res.attachment(`${safeName}.zip`);
  const zip = new ZipArchive({ store: true });   // photos are already compressed
  zip.on('error', (err) => res.destroy(err));
  zip.pipe(res);
  try {
    // One photo at a time: each is fetched (from disk or R2) only when the zip is ready for it
    for (const [i, p] of photos.entries()) {
      const ext = p.storageKey.slice(p.storageKey.lastIndexOf('.'));
      zip.append(await openPhoto(p.storageKey), { name: `${String(i + 1).padStart(4, '0')}${ext}` });
      await once(zip, 'entry');
    }
    await zip.finalize();
  } catch (err) {
    // The download has already started, so the only way to report a failure is to cut it off
    console.error(`Zip of album ${m.album.id} failed: ${err.message}`);
    res.destroy(err);
  }
}
