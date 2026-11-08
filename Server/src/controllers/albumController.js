import { once } from 'node:events';
import mongoose from 'mongoose';
import { ZipArchive } from 'archiver';
import { config } from '../config/env.js';
import { Album } from '../models/Album.js';
import { Membership } from '../models/Membership.js';
import { Photo } from '../models/Photo.js';
import { Comment } from '../models/Comment.js';
import { Invite } from '../models/Invite.js';
import { User } from '../models/User.js';
import { sendEmail } from '../services/emailService.js';
import { reminderHtml, inviteHtml } from '../services/emailTemplates.js';
import { HttpError } from '../utils/httpError.js';
import { newAlbumCode, normaliseCode } from '../utils/albumCodes.js';
import { savePhoto, deletePhotos, openPhoto } from '../services/storageService.js';

const PREVIEW_PICS = 9;
// Absolute, because the pages may be on another address (hexarch.org) than this API
const photoUrl = (id) => `${config.publicUrl}/api/photos/${id}`;
const thumbnailUrl = (id) => `${photoUrl(id)}?size=thumb`;
const firstName = (name) => (name || '').trim().split(/\s+/)[0] || 'Someone';

// An album's life: 'upcoming' before the day, 'live' around the day itself and the day after
// (parties run past midnight), 'wrapping' until it closes OPEN_DAYS after the event, then 'kept':
// still there to look at and download, but no longer taking photos.
// The date is the host's local day (YYYY-MM-DD) and the server doesn't know their time zone, so
// "live" runs from the UTC day before to two UTC days after: that covers the event day and the
// morning after anywhere from UTC-12 to UTC+14.
export const OPEN_DAYS = 30;
const day = (ms) => new Date(ms).toISOString().slice(0, 10);
export function lifecycle(date) {
  const now = Date.now(), today = day(now);
  const closes = day(Date.parse(`${date}T00:00:00Z`) + OPEN_DAYS * 86400000);
  const status = date > day(now + 86400000) ? 'upcoming'
    : date >= day(now - 2 * 86400000) ? 'live'
    : today <= closes ? 'wrapping' : 'kept';
  return { status, closes, open: status !== 'kept' };
}
// Albums with event times: photos can be added from uploadLeadMin before the start until the end,
// then the album is kept (still there to look at and download).
export function albumLifecycle(album, now = Date.now()) {
  if (!album.startsAt || !album.endsAt) return lifecycle(album.date);
  const opensAt = album.startsAt.getTime() - (album.uploadLeadMin || 0) * 60000;
  const endsAt = album.endsAt.getTime();
  const status = now < opensAt ? 'upcoming' : now <= endsAt ? 'live' : 'kept';
  return { status, closes: day(endsAt), open: status === 'live', opensAt: new Date(opensAt).toISOString() };
}
const closesLabel = (closes) => new Date(`${closes}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

// The caller's membership of an album, or a 404 (not 403, so album ids can't be probed)
export async function membershipOf(req, albumId) {
  if (!mongoose.isValidObjectId(albumId)) throw new HttpError(404, 'Album not found.');
  const m = await Membership.findOne({ album: albumId, user: req.user._id }).populate('album');
  if (!m?.album) throw new HttpError(404, 'Album not found.');
  return m;
}

// Counts and the newest few photos for a set of albums, in two queries
// hidden: photo ids this person has hidden (left out of their counts and previews)
async function statsFor(albumIds, userId, hidden = []) {
  const [photoStats, memberStats, hosts] = await Promise.all([
    Photo.aggregate([
      { $match: { album: { $in: albumIds }, _id: { $nin: hidden } } },
      { $group: {
        _id: '$album',
        photos: { $sum: 1 },
        mine: { $sum: { $cond: [{ $eq: ['$uploader', userId] }, 1, 0] } },
        // Most liked first, so the album's cover is its favourite photo (newest first among equals)
        pics: { $topN: { n: PREVIEW_PICS, sortBy: { likeCount: -1, createdAt: -1 }, output: '$_id' } },
      } },
    ]),
    Membership.aggregate([
      { $match: { album: { $in: albumIds } } },
      { $group: { _id: '$album', guests: { $sum: 1 } } },
    ]),
    // Who hosts each album, so everyone in it can see it clearly
    Membership.find({ album: { $in: albumIds }, role: 'host' }, 'album user').populate('user', 'name'),
  ]);
  const byAlbum = new Map(albumIds.map((id) => [String(id), { photos: 0, mine: 0, pics: [], guests: 0, hostName: '', hostIsYou: false }]));
  for (const s of photoStats) Object.assign(byAlbum.get(String(s._id)), { photos: s.photos, mine: s.mine, pics: s.pics.map(thumbnailUrl) });
  for (const s of memberStats) byAlbum.get(String(s._id)).guests = s.guests;
  for (const h of hosts) {
    const name = (h.user?.name || '').trim() || 'The host';
    Object.assign(byAlbum.get(String(h.album)), { hostName: name, hostIsYou: !!h.user?._id.equals(userId) });
  }
  return byAlbum;
}

function summary(album, role, stats) {
  return {
    id: album.id,
    name: album.name,
    date: album.date,
    place: album.place,
    venue: album.venue?.address || album.venue?.placeId ? { address: album.venue.address, placeId: album.venue.placeId } : undefined,
    startsAt: album.startsAt || undefined,
    endsAt: album.endsAt || undefined,
    uploadLeadMin: album.startsAt ? album.uploadLeadMin || 0 : undefined,
    role,
    ...albumLifecycle(album),
    live: albumLifecycle(album).status === 'live',
    // Only the host sees the join code, to print or share
    code: role === 'host' ? album.displayCode : undefined,
    zone: album.zone?.radiusM ? album.zone : undefined,
    visibility: album.visibility || 'invite',
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
    if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && radiusM >= 10 && radiusM <= 10000)) throw new HttpError(400, 'That sharing zone isn’t valid.');
    zone = { lat, lng, radiusM };
  }
  return { name, date, place, zone };
}

// A new album's event: start and end times, how early uploads open, the venue and a 1 to 10 km zone
function readEventFields(body) {
  const startsAt = new Date(body?.startsAt), endsAt = new Date(body?.endsAt);
  if (Number.isNaN(startsAt.getTime())) throw new HttpError(400, 'Pick the time the event starts.');
  if (Number.isNaN(endsAt.getTime())) throw new HttpError(400, 'Pick the time the event ends.');
  if (endsAt <= startsAt) throw new HttpError(400, 'The event has to end after it starts.');
  if (endsAt - startsAt > 7 * 86400000) throw new HttpError(400, 'Keep the event under a week long.');
  if (endsAt < Date.now()) throw new HttpError(400, 'That event has already finished. Check the date and times.');
  const uploadLeadMin = Math.round(Number(body?.uploadLeadMin ?? 0));
  if (!(uploadLeadMin >= 0 && uploadLeadMin <= 1440)) throw new HttpError(400, 'Uploads can open up to 24 hours before the event.');
  const z = body?.zone || {};
  const lat = Number(z.lat), lng = Number(z.lng), radiusM = Number(z.radiusM);
  if (z.lat == null || z.lng == null || !(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) throw new HttpError(400, 'Choose the venue on the map.');
  if (!(Number.isInteger(radiusM) && radiusM >= 1000 && radiusM <= 10000)) throw new HttpError(400, 'Choose a zone between 1 km and 10 km.');
  const address = String(body?.venue?.address ?? '').trim().slice(0, 300);
  const placeId = String(body?.venue?.placeId ?? '').trim().slice(0, 300);
  return { startsAt, endsAt, uploadLeadMin, zone: { lat, lng, radiusM }, venue: { address, placeId } };
}

// Metres between two points (haversine)
export function distanceM(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const kmLabel = (m) => `${+(m / 1000).toFixed(1)} km`;

// ---- Listing, creating, joining ----

// Photos added by one person to one album within a few minutes of each other count as one batch
const BATCH_GAP_MS = 10 * 60000;
function batches(photos, userId) {
  const out = [];
  for (const p of photos) {   // newest first
    const last = out[out.length - 1];
    const by = p.uploader?._id;
    if (last && String(last.albumId) === String(p.album) && String(last.uploaderId) === String(by) && last.oldest - p.createdAt < BATCH_GAP_MS) {
      last.n++; last.oldest = p.createdAt;
      if (last.pics.length < 6) last.pics.push(thumbnailUrl(p.id));
      continue;
    }
    out.push({ albumId: String(p.album), uploaderId: by, by: by?.equals(userId) ? 'You' : firstName(p.uploader?.name), n: 1, pics: [thumbnailUrl(p.id)], at: p.createdAt, oldest: p.createdAt });
  }
  return out.map(({ uploaderId, oldest, ...b }) => b);
}

// For albums someone hosts: how many guests haven't added a photo yet (for the reminder nudge)
async function waitingGuests(albumIds) {
  if (!albumIds.length) return new Map();
  const [guests, contributors] = await Promise.all([
    Membership.find({ album: { $in: albumIds }, role: 'guest' }, 'album user'),
    Photo.aggregate([{ $match: { album: { $in: albumIds } } }, { $group: { _id: '$album', users: { $addToSet: '$uploader' } } }]),
  ]);
  const added = new Map(contributors.map((c) => [String(c._id), new Set(c.users.map(String))]));
  const waiting = new Map(albumIds.map((id) => [String(id), 0]));
  for (const g of guests) if (!added.get(String(g.album))?.has(String(g.user))) waiting.set(String(g.album), waiting.get(String(g.album)) + 1);
  return waiting;
}

export async function list(req, res) {
  const memberships = await Membership.find({ user: req.user._id }).populate('album');
  const mine = memberships.filter((m) => m.album);
  const ids = mine.map((m) => m.album._id);
  const hostedIds = mine.filter((m) => m.role === 'host').map((m) => m.album._id);
  const hidden = mine.flatMap((m) => m.hidden || []);
  const [stats, recent, waiting, invites] = await Promise.all([
    statsFor(ids, req.user._id, hidden),
    Photo.find({ album: { $in: ids }, _id: { $nin: hidden } }).sort({ createdAt: -1 }).limit(80).populate('uploader', 'name'),
    waitingGuests(hostedIds),
    // Only to someone who has proved the address is theirs: anyone can sign up with an email they
    // don't own, and an invite carries the album's join code
    req.user.emailVerified
      ? Invite.find({ email: req.user.email, album: { $nin: ids } }).sort({ createdAt: -1 }).limit(10).populate('album').populate('invitedBy', 'name')
      : [],
  ]);
  const albums = mine
    .map((m) => ({ ...summary(m.album, m.role, stats.get(String(m.album._id))), ...(m.role === 'host' && { waiting: waiting.get(String(m.album._id)) || 0 }) }))
    .sort((a, b) => b.date.localeCompare(a.date));
  res.json({
    albums,
    // Single photos, newest first (the "just added" line of prints)
    recent: recent.slice(0, 12).map((p) => ({
      albumId: String(p.album),
      photoId: p.id,
      url: thumbnailUrl(p.id),
      by: p.uploader?._id.equals(req.user._id) ? 'You' : firstName(p.uploader?.name),
      at: p.createdAt,
    })),
    // The same photos grouped into who-added-what batches
    feed: batches(recent, req.user._id).slice(0, 8),
    invites: invites.filter((i) => i.album).map((i) => ({
      id: i.id,
      code: i.album.displayCode,
      name: i.album.name,
      date: i.album.date,
      place: i.album.place,
      by: firstName(i.invitedBy?.name),
      at: i.createdAt,
    })),
  });
}

export async function create(req, res) {
  const fields = { ...readAlbumFields(req.body), ...readEventFields(req.body), visibility: req.body?.visibility === 'public' ? 'public' : 'invite' };
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
  res.status(201).json({ album: summary(album, 'host', { photos: 0, mine: 0, pics: [], guests: 1, hostName: (req.user.name || '').trim() || 'The host', hostIsYou: true }) });
}

// Joins an album from the code an invite link carried, when the account's email is confirmed.
// Returns the album, or null when the code no longer matches one
export async function joinFromInvite(user, rawCode) {
  const code = normaliseCode(rawCode);
  if (code.length !== 7) return null;
  const album = await Album.findOne({ code });
  if (!album) return null;
  try {
    await Membership.updateOne({ album: album._id, user: user._id }, { $setOnInsert: { role: 'guest' } }, { upsert: true });
  } catch (err) {
    if (err.code !== 11000) throw err;   // joined at the same moment some other way
  }
  if (user.emailVerified) await Invite.deleteMany({ album: album._id, email: user.email });
  return album;
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
  // (only for a confirmed address, so an unconfirmed sign-up can't clear the real person's invite)
  if (req.user.emailVerified) await Invite.deleteMany({ album: album._id, email: req.user.email });
  const stats = await statsFor([album._id], req.user._id, m?.hidden || []);
  res.status(already ? 200 : 201).json({ already, album: summary(album, m.role, stats.get(String(album._id))) });
}

// ---- One album ----

export async function show(req, res) {
  const m = await membershipOf(req, req.params.id);
  const hidden = m.hidden || [];
  const withHidden = req.query.hidden === '1';
  const [stats, photos, hiddenCount] = await Promise.all([
    statsFor([m.album._id], req.user._id, hidden),
    Photo.find({ album: m.album._id, ...(!withHidden && { _id: { $nin: hidden } }) }).sort({ createdAt: -1 }).populate('uploader', 'name'),
    hidden.length ? Photo.countDocuments({ album: m.album._id, _id: { $in: hidden } }) : 0,
  ]);
  const hiddenSet = new Set(hidden.map(String));
  res.json({
    album: { ...summary(m.album, m.role, stats.get(String(m.album._id))), hiddenCount },
    photos: photos.map((p) => {
      const mine = p.uploader?._id.equals(req.user._id);
      return {
        id: p.id, url: photoUrl(p.id), thumbnailUrl: thumbnailUrl(p.id), downloadUrl: `${photoUrl(p.id)}/download`, by: mine ? 'You' : firstName(p.uploader?.name), mine, at: p.createdAt,
        likes: p.likeCount || 0, liked: (p.likes || []).some((id) => id.equals(req.user._id)), comments: p.commentCount || 0,
        ...(withHidden && hiddenSet.has(p.id) && { hidden: true }),
      };
    }),
  });
}

// Hide photos from your own view of an album, or show them again. Body: { photoIds: [...], hidden: true|false }
// or { all: true, hidden: false } to show every hidden photo again. Only changes what this person sees.
export async function setHidden(req, res) {
  const m = await membershipOf(req, req.params.id);
  const hide = req.body?.hidden !== false;
  if (req.body?.all === true && !hide) {
    m.hidden = [];
  } else {
    const raw = Array.isArray(req.body?.photoIds) ? req.body.photoIds : [];
    if (!raw.length || raw.length > 500 || !raw.every((id) => mongoose.isValidObjectId(id))) throw new HttpError(400, 'Choose the photos to hide or show.');
    // Only photos that really are in this album
    const ids = (await Photo.find({ album: m.album._id, _id: { $in: raw } }, '_id')).map((p) => p._id);
    const keep = new Set(ids.map(String));
    if (hide) m.hidden = [...(m.hidden || []).filter((id) => !keep.has(String(id))), ...ids];
    else m.hidden = (m.hidden || []).filter((id) => !keep.has(String(id)));
  }
  await m.save();
  res.json({ hiddenCount: m.hidden.length });
}

export async function update(req, res) {
  const m = await membershipOf(req, req.params.id);
  if (m.role !== 'host') throw new HttpError(403, 'Only the host can change the album.');
  const fields = readAlbumFields({ name: m.album.name, date: m.album.date, place: m.album.place, zone: m.album.zone, ...req.body });
  Object.assign(m.album, fields);
  if (req.body?.visibility === 'public' || req.body?.visibility === 'invite') {
    if (req.body.visibility === 'public' && !m.album.zone?.radiusM) throw new HttpError(400, 'A public album needs a venue, so people nearby can find it.');
    m.album.visibility = req.body.visibility;
  }
  await m.album.save();
  const stats = await statsFor([m.album._id], req.user._id, m.hidden || []);
  res.json({ album: summary(m.album, 'host', stats.get(String(m.album._id))) });
}

export async function remove(req, res) {
  const m = await membershipOf(req, req.params.id);
  if (m.role !== 'host') throw new HttpError(403, 'Only the host can delete the album.');
  const photos = await Photo.find({ album: m.album._id }, 'storageKey');
  await deletePhotos(photos.map((p) => p.storageKey));
  await Promise.all([
    Photo.deleteMany({ album: m.album._id }),
    Comment.deleteMany({ album: m.album._id }),
    Membership.deleteMany({ album: m.album._id }),
    Invite.deleteMany({ album: m.album._id }),
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

// Runs before the upload is read, so non-members (and closed albums) are turned away without
// receiving any file data
export async function checkMember(req, res, next) {
  req.membership = await membershipOf(req, req.params.id);
  const album = req.membership.album;
  const { open, closes, status, opensAt } = albumLifecycle(album);
  // The host can always add photos to an album with event times (from home afterwards, say);
  // the time window and the zone are for guests
  const host = req.membership.role === 'host';
  if (!open && !(host && album.startsAt)) {
    if (status === 'upcoming' && opensAt) throw new HttpError(403, `Photos can be added from ${new Date(opensAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC.`, 'not-open-yet');
    throw new HttpError(403, `This album closed to new photos on ${closesLabel(closes)}. You can still look at it and download everything.`, 'closed');
  }
  if (!host && album.startsAt && album.zone?.radiusM && album.zone.lat != null) {
    // The browser sends where the guest is as "lat,lng,accuracy" in a header, so it's known before
    // any file data is read. Like any browser location it can be faked: it keeps honest guests to
    // the event, it isn't proof.
    const [lat, lng, acc] = String(req.get('X-Momento-Location') || '').split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new HttpError(403, 'Momento needs your location to check you’re at the event. Allow location access and try again.', 'location-needed');
    }
    const away = distanceM({ lat, lng }, album.zone);
    // A phone's fix can be off by its accuracy; up to 200 m of that is allowed for
    const slack = Math.min(Number.isFinite(acc) && acc > 0 ? acc : 0, 200);
    if (away - slack > album.zone.radiusM) {
      throw new HttpError(403, `You’re about ${kmLabel(away)} from the venue. Photos can be added within ${kmLabel(album.zone.radiusM)} of it.`, 'outside-zone');
    }
  }
  next();
}

export async function addPhotos(req, res) {
  const files = req.files || [];
  if (!files.length) throw new HttpError(400, 'Choose at least one photo.');
  const album = req.membership.album;
  const saved = [];
  for (const f of files) {
    const stored = await savePhoto(album.id, f.buffer);
    let p;
    try { p = await Photo.create({
      album: album._id, uploader: req.user._id, ...stored,
      originalName: f.originalname.slice(0, 200),
    }); } catch (err) { await deletePhotos([stored.storageKey]); throw err; }
    saved.push({ id: p.id, url: photoUrl(p.id), thumbnailUrl: thumbnailUrl(p.id), by: 'You', mine: true, at: p.createdAt });
  }
  res.status(201).json({ photos: saved });
}

export async function download(req, res) {
  const m = await membershipOf(req, req.params.id);
  const photos = await Photo.find({ album: m.album._id, _id: { $nin: m.hidden || [] } }).sort({ createdAt: 1 });
  if (!photos.length) throw new HttpError(404, 'This album has no photos yet.');
  const safeName = m.album.name.replace(/[^\w\- ]+/g, '').trim() || 'album';
  res.attachment(`${safeName}.zip`);
  const zip = new ZipArchive({ store: true });   // photos are already compressed
  zip.on('error', (err) => res.destroy(err));
  zip.pipe(res);
  try {
    // One photo at a time: each is fetched (from disk or S3) only when the zip is ready for it
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

// ---- Host actions: nudging guests, inviting people ----

const REMIND_EVERY_MS = 24 * 3600000;
// Each reminder is real email, so one goes to at most this many
const REMIND_MAX = 25;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Host actions send email from our domain to other people, so they need a confirmed address:
// otherwise a throwaway account could use Momento to send "invites" to anyone
async function hostedAlbum(req) {
  const m = await membershipOf(req, req.params.id);
  if (m.role !== 'host') throw new HttpError(403, 'Only the host can do that.');
  if (!req.user.emailVerified) throw new HttpError(403, 'Confirm your email first: we sent you a link when you signed up (My albums can send it again).');
  return m.album;
}

// Emails the guests who haven't added a photo yet, once a day at most
export async function remind(req, res) {
  const album = await hostedAlbum(req);
  const { closes, status } = albumLifecycle(album);
  if (status === 'kept') throw new HttpError(400, 'This album has closed, so there’s nothing to add any more.');
  const waiting = await waitingGuests([album._id]);
  if (!waiting.get(String(album._id))) throw new HttpError(400, 'Every guest has added photos already.');
  // Claim today's reminder in one step, so two quick clicks can't both send
  const claimed = await Album.findOneAndUpdate(
    { _id: album._id, $or: [{ lastReminderAt: { $exists: false } }, { lastReminderAt: null }, { lastReminderAt: { $lt: new Date(Date.now() - REMIND_EVERY_MS) } }] },
    { lastReminderAt: new Date() },
  );
  if (!claimed) throw new HttpError(429, 'You’ve already sent a reminder today. Try again tomorrow.');
  const [guests, contributors] = await Promise.all([
    Membership.find({ album: album._id, role: 'guest' }, 'user'),
    Photo.distinct('uploader', { album: album._id }),
  ]);
  const added = new Set(contributors.map(String));
  const ids = guests.map((g) => g.user).filter((u) => !added.has(String(u))).slice(0, REMIND_MAX);
  const people = await User.find({ _id: { $in: ids } }, 'name email');
  const link = `${config.frontendUrl}/albums.html?album=${album.id}`;
  const info = { name: album.name, closesLabel: closesLabel(closes) };
  const results = await Promise.allSettled(people.map((p) => sendEmail({
    to: p.email,
    subject: `Add your photos to ${album.name}`,
    html: reminderHtml(p, info, req.user.name, link),
  })));
  const sent = results.filter((r) => r.status === 'fulfilled').length;
  results.filter((r) => r.status === 'rejected').forEach((r) => console.error(`Reminder failed: ${r.reason?.message}`));
  if (!sent && people.length) throw new HttpError(502, 'The reminder couldn’t be sent just now. Try again in a few minutes.');
  res.json({ ok: true, sent });
}

// Invites someone by email: they get an email with the code, and it waits on their albums page
export async function invite(req, res) {
  const album = await hostedAlbum(req);
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'Enter an email address like name@example.com.');
  if (albumLifecycle(album).status === 'kept') throw new HttpError(400, 'This album has closed, so new guests can’t add photos.');
  const existing = await User.findOne({ email }, '_id');
  if (existing && await Membership.exists({ album: album._id, user: existing._id })) {
    throw new HttpError(409, 'They’re already in this album.');
  }
  await Invite.findOneAndUpdate(
    { album: album._id, email },
    { invitedBy: req.user._id, expiresAt: new Date(Date.now() + 30 * 86400000) },
    { upsert: true, setDefaultsOnInsert: true },
  );
  const link = `${config.frontendUrl}/albums.html?join=${album.displayCode}`;
  await sendEmail({
    to: email,
    subject: `${firstName(req.user.name)} invited you to ${album.name} on Momento`,
    html: inviteHtml(album, req.user.name, link, album.displayCode),
  });
  res.status(201).json({ ok: true });
}
