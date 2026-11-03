import { once } from 'node:events';
import mongoose from 'mongoose';
import { ZipArchive } from 'archiver';
import { config } from '../config/env.js';
import { Album } from '../models/Album.js';
import { Membership } from '../models/Membership.js';
import { Photo } from '../models/Photo.js';
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
const closesLabel = (closes) => new Date(`${closes}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

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
  for (const s of photoStats) Object.assign(byAlbum.get(String(s._id)), { photos: s.photos, mine: s.mine, pics: s.pics.map(thumbnailUrl) });
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
    ...lifecycle(album.date),
    live: lifecycle(album.date).status === 'live',
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

// Photos added by one person to one album within a few minutes of each other count as one batch
const BATCH_GAP_MS = 10 * 60000;
function batches(photos, userId) {
  const out = [];
  for (const p of photos) {   // newest first
    const last = out[out.length - 1];
    const by = p.uploader?._id;
    if (last && String(last.albumId) === String(p.album) && String(last.uploaderId) === String(by) && last.oldest - p.createdAt < BATCH_GAP_MS) {
      last.n++; last.oldest = p.createdAt;
      if (last.pics.length < 6) last.pics.push(photoUrl(p.id));
      continue;
    }
    out.push({ albumId: String(p.album), uploaderId: by, by: by?.equals(userId) ? 'You' : firstName(p.uploader?.name), n: 1, pics: [photoUrl(p.id)], at: p.createdAt, oldest: p.createdAt });
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
  const [stats, recent, waiting, invites] = await Promise.all([
    statsFor(ids, req.user._id),
    Photo.find({ album: { $in: ids } }).sort({ createdAt: -1 }).limit(80).populate('uploader', 'name'),
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
  // (only for a confirmed address, so an unconfirmed sign-up can't clear the real person's invite)
  if (req.user.emailVerified) await Invite.deleteMany({ album: album._id, email: req.user.email });
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
      return { id: p.id, url: `${photoUrl(p.id)}?size=preview`, thumbnailUrl: thumbnailUrl(p.id), downloadUrl: `${photoUrl(p.id)}/download`, by: mine ? 'You' : firstName(p.uploader?.name), mine, at: p.createdAt };
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
  const { open, closes } = lifecycle(req.membership.album.date);
  if (!open) throw new HttpError(403, `This album closed to new photos on ${closesLabel(closes)}. You can still look at it and download everything.`);
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

// ---- Host actions: nudging guests, inviting people ----

const REMIND_EVERY_MS = 24 * 3600000;
// Each reminder is real email (Resend's free plan allows 100 a day), so one goes to at most this many
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
  const { open, closes } = lifecycle(album.date);
  if (!open) throw new HttpError(400, 'This album has closed, so there’s nothing to add any more.');
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
  if (!lifecycle(album.date).open) throw new HttpError(400, 'This album has closed, so new guests can’t add photos.');
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
