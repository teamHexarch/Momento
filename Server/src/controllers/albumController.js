import { admit } from '../services/eventAdmission.js';
import { tidy, lengthOf, LIMITS } from '../utils/text.js';
import { once } from 'node:events';
import mongoose from 'mongoose';
import { ZipArchive } from 'archiver';
import { config } from '../config/env.js';
import { Album } from '../models/Album.js';
import { Membership } from '../models/Membership.js';
import { Photo } from '../models/Photo.js';
import { User } from '../models/User.js';
import { Group } from '../models/Group.js';
import { GroupMember } from '../models/GroupMember.js';
import { hasGroupAccess, groupIdsOf, dropGroupRows } from '../services/groupAccess.js';
import { avatarOf, AVATAR_FIELDS } from '../services/avatarService.js';
import { sendEmail } from '../services/emailService.js';
import { reminderHtml } from '../services/emailTemplates.js';
import { HttpError } from '../utils/httpError.js';
import { newAlbumCode, normaliseCode } from '../utils/albumCodes.js';
import { deletePhotosLater, openPhoto } from '../services/storageService.js';
import { isRawName } from '../services/imageService.js';
import { reactionCounts, myReaction } from './photoController.js';
import { saveCover, removeCover, removeCoverFiles, hostCover } from '../services/coverService.js';
import { isBig, requestZip, ZipFile } from '../services/zipService.js';
import { discardChecks, queueUpload, checkNow } from '../services/uploadChecks.js';
import { UploadCheck } from '../models/UploadCheck.js';
import { UploadConsent } from '../models/UploadConsent.js';
import { ModerationDecision } from '../models/ModerationDecision.js';
import { isBanned, BANNED_MESSAGE } from '../services/contentSafety.js';
import { sendPhoto, removeFile, presignUpload, headFile } from '../services/storageService.js';
import { directUploadsOn, issueTicket, readTicket, newKey, hexToBase64, LINK_SECONDS } from '../services/directUploads.js';
import { chargeDailyQuota } from '../middleware/uploadBudget.js';

const PREVIEW_PICS = 12;
// Absolute, because the pages may be on another address (hexarch.org) than this API
const photoUrl = (id) => `${config.publicUrl}/api/photos/${id}`;
const thumbnailUrl = (id) => `${photoUrl(id)}?size=thumb`;
// The 320px grid picture, only for photos that have one (no miniUrl at all otherwise: the page uses the thumbnail)
export const miniOf = (p) => (p.miniKey ? { miniUrl: `${photoUrl(p._id || p.id)}?size=mini` } : {});
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
  // Plain albums (and friend-group albums without an event window) take photos any time
  if (album.kind === 'album' || (album.group && !album.eventUploadWindow)) return { status: 'live', open: true, anytimeUploads: true };
  if (!album.startsAt || !album.endsAt) return lifecycle(album.date);
  const opensAt = album.startsAt.getTime() - (album.uploadLeadMin || 0) * 60000;
  const endsAt = album.endsAt.getTime();
  const status = now < opensAt ? 'upcoming' : now <= endsAt ? 'live' : 'kept';
  return { status, closes: day(endsAt), open: status === 'live', opensAt: new Date(opensAt).toISOString() };
}
const closesLabel = (closes) => new Date(`${closes}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

// The caller's membership of an album, or a 404 (not 403, so album ids can't be probed).
// Friend-group members of a group album get a membership with via: 'group' (role guest): either
// the row that remembers what they've hidden, or an unsaved one. Group access is checked live,
// every time, so someone who has left the group gets the 404 straight away.
export async function membershipOf(req, albumId) {
  if (!mongoose.isValidObjectId(albumId)) throw new HttpError(404, 'Album not found.');
  const m = await Membership.findOne({ album: albumId, user: req.user._id }).populate('album');
  if (m?.album && m.via !== 'group') return m;
  const album = m?.album || await Album.findById(albumId);
  if (album && await hasGroupAccess(req.user._id, album)) {
    if (m) return m;
    const v = new Membership({ album: album._id, user: req.user._id, role: 'guest', via: 'group' });
    v.album = album;
    return v;
  }
  throw new HttpError(404, 'Album not found.');
}

// Album memberships plus the albums this person reaches through their friend groups
async function albumsOf(userId) {
  const [rows, groupIds] = await Promise.all([Membership.find({ user: userId }).populate('album'), groupIdsOf(userId)]);
  const groupAlbums = groupIds.length ? await Album.find({ group: { $in: groupIds } }) : [];
  const reachable = new Set(groupAlbums.map((a) => String(a._id)));
  // A group row only counts while the album is still shared with one of their groups
  const mine = rows.filter((m) => m.album && (m.via !== 'group' || reachable.has(String(m.album._id))));
  const have = new Set(mine.map((m) => String(m.album._id)));
  for (const a of groupAlbums) {
    if (have.has(String(a._id))) continue;
    const v = new Membership({ album: a._id, user: userId, role: 'guest', via: 'group' });
    v.album = a;
    mine.push(v);
  }
  return mine;
}

// Counts and the newest few photos for a set of albums, in two queries
// hidden: photo ids this person has hidden (left out of their counts and previews)
async function statsFor(albumIds, userId, hidden = []) {
  const [photoStats, memberStats, hosts, grouped] = await Promise.all([
    Photo.aggregate([
      { $match: { album: { $in: albumIds }, _id: { $nin: hidden }, deletedAt: null } },
      // How loved each photo is: its emoji reactions (bookmarks are private, so they don't count)
      { $addFields: { score: { $size: { $ifNull: ['$reactions', []] } } } },
      { $group: {
        _id: '$album',
        photos: { $sum: 1 },
        mine: { $sum: { $cond: [{ $eq: ['$uploader', userId] }, 1, 0] } },
        // Most loved first (newest first among equals)
        pics: { $topN: { n: PREVIEW_PICS, sortBy: { score: -1, createdAt: -1 }, output: '$_id' } },
        top: { $top: { sortBy: { score: -1, createdAt: -1 }, output: { id: '$_id', score: '$score' } } },
        newest: { $top: { sortBy: { createdAt: -1 }, output: '$_id' } },
      } },
    ]),
    Membership.aggregate([
      { $match: { album: { $in: albumIds }, via: { $ne: 'group' } } },
      { $group: { _id: '$album', users: { $addToSet: '$user' } } },
    ]),
    // Who hosts each album, so everyone in it can see it clearly
    Membership.find({ album: { $in: albumIds }, role: 'host' }, 'album user').populate('user', AVATAR_FIELDS),
    // Albums shared with a friend group: the group's name, and its people count as guests
    Album.find({ _id: { $in: albumIds }, group: { $ne: null } }, 'group').populate('group', 'name'),
  ]);
  const groupIds = grouped.filter((a) => a.group).map((a) => a.group._id);
  const groupPeople = new Map();
  if (groupIds.length) {
    for (const gm of await GroupMember.find({ group: { $in: groupIds } }, 'group user')) {
      const k = String(gm.group);
      if (!groupPeople.has(k)) groupPeople.set(k, []);
      groupPeople.get(k).push(String(gm.user));
    }
  }
  const byAlbum = new Map(albumIds.map((id) => [String(id), { photos: 0, mine: 0, pics: [], guests: 0, hostName: '', hostIsYou: false }]));
  for (const s of photoStats) Object.assign(byAlbum.get(String(s._id)), { photos: s.photos, mine: s.mine, pics: s.pics.map(thumbnailUrl), _top: s.top, _newest: s.newest });
  const people = new Map(memberStats.map((s) => [String(s._id), new Set(s.users.map(String))]));
  for (const a of grouped) {
    if (!a.group) continue;
    const set = people.get(String(a._id)) || new Set();
    for (const u of groupPeople.get(String(a.group._id)) || []) set.add(u);
    people.set(String(a._id), set);
    // anywhere: this person is in the album's group, so they can add photos from anywhere (no zone check)
    Object.assign(byAlbum.get(String(a._id)), { group: { id: a.group.id, name: a.group.name }, anywhere: (groupPeople.get(String(a.group._id)) || []).includes(String(userId)) });
  }
  for (const [id, set] of people) if (byAlbum.has(id)) byAlbum.get(id).guests = set.size;
  for (const h of hosts) {
    const name = (h.user?.name || '').trim() || 'The host';
    Object.assign(byAlbum.get(String(h.album)), { hostName: name, hostAvatar: avatarOf(h.user), hostIsYou: !!h.user?._id.equals(userId) });
  }
  return byAlbum;
}

// Which picture is the album's cover:
// - before the event: the host's picture (if they added one)
// - once it starts: the photo with the most likes and reactions, unless the host chose to keep theirs;
//   the host's picture stays until some photo gets its first like or reaction
// - no host picture: the most loved photo, or the newest one while none has any
export function coverOf(album, stats = {}) {
  const host = hostCover(album);
  const top = stats._top?.score > 0 ? { source: 'top', id: String(stats._top.id), url: photoUrl(stats._top.id), thumbUrl: thumbnailUrl(stats._top.id), score: stats._top.score } : null;
  const newest = stats._newest ? { source: 'newest', id: String(stats._newest), url: photoUrl(stats._newest), thumbUrl: thumbnailUrl(stats._newest) } : null;
  if (host && (albumLifecycle(album).status === 'upcoming' || album.keepHostCover)) return host;
  return top || host || newest || null;
}

function summary(album, role, stats = {}) {
  const { _top, _newest, ...shown } = stats;
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
    ...(role === 'host' && { joiningOpen: album.joiningOpen, locationRequired: album.locationRequired, joinDeadline: album.joinDeadline, requests: album.requests.filter(r => r.status !== 'declined') }),
    ...albumLifecycle(album),
    live: albumLifecycle(album).status === 'live',
    // Only the host sees the join code, to print or share
    code: role === 'host' ? album.displayCode : undefined,
    zone: album.zone?.radiusM ? album.zone : undefined,
    visibility: album.visibility || 'invite',
    // 'album' (just photos) or 'event' (times, venue, sharing zone); older albums go by whether they have times
    kind: album.kind || (album.startsAt ? 'event' : 'album'),
    cover: coverOf(album, stats),
    hasHostCover: !!album.cover?.key,
    keepHostCover: !!album.keepHostCover,
    allowComments: album.allowComments !== false,
    // Event games on or off (plain albums: always off)
    games: (album.kind || (album.startsAt ? 'event' : 'album')) === 'event' && album.games !== false,
    uploadLimits: { perGuest: album.uploadLimits?.perGuest ?? 150, total: album.uploadLimits?.total ?? 1500 },
    ...shown,
  };
}

// Album cards for a list of albums, from this person's point of view (used by friend groups)
export async function albumSummaries(albums, userId) {
  if (!albums.length) return [];
  const stats = await statsFor(albums.map((a) => a._id), userId);
  return albums.map((a) => summary(a, a.host.equals(userId) ? 'host' : 'guest', stats.get(String(a._id))));
}

// nameIsNew: the name was typed now (an album named before the 60-character limit keeps its longer name until renamed)
function readAlbumFields(body, { nameIsNew = true } = {}) {
  const name = tidy(body?.name);
  const date = String(body?.date ?? '').trim();
  const place = String(body?.place ?? '').trim();
  if (!name) throw new HttpError(400, 'Give the album a name.');
  if (lengthOf(name) > (nameIsNew ? LIMITS.title : 100)) throw new HttpError(400, `Keep the name to ${LIMITS.title} characters.`, 'TEXT_TOO_LONG', { max: LIMITS.title });
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
    Photo.aggregate([{ $match: { album: { $in: albumIds }, deletedAt: null } }, { $group: { _id: '$album', users: { $addToSet: '$uploader' } } }]),
  ]);
  const added = new Map(contributors.map((c) => [String(c._id), new Set(c.users.map(String))]));
  const waiting = new Map(albumIds.map((id) => [String(id), 0]));
  for (const g of guests) if (!added.get(String(g.album))?.has(String(g.user))) waiting.set(String(g.album), waiting.get(String(g.album)) + 1);
  return waiting;
}

// ---- Sorting (?sort_by=&order=), so paged or server-built lists come back in the order the page asks for ----
// Albums: sort_by name | date (default date, newest first). Photos in an album: sort_by name (file name) | uploader |
// taken (capture date, falling back to upload date) | uploaded (default, newest first). order: asc | desc.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
function sortOrder(req, allowed, fallback) {
  const by = allowed.includes(req.query.sort_by) ? req.query.sort_by : fallback;
  const order = req.query.order === 'asc' || req.query.order === 'desc' ? req.query.order
    : (by === 'name' || by === 'uploader') ? 'asc' : 'desc';
  return { by, dir: order === 'asc' ? 1 : -1 };
}
const byTime = (a, b) => new Date(a || 0) - new Date(b || 0);

export async function list(req, res) {
  const mine = await albumsOf(req.user._id);
  const ids = mine.map((m) => m.album._id);
  const hostedIds = mine.filter((m) => m.role === 'host').map((m) => m.album._id);
  const hidden = mine.flatMap((m) => m.hidden || []);
  const [stats, recent, waiting, binned, hiddenCount] = await Promise.all([
    statsFor(ids, req.user._id, hidden),
    Photo.find({ album: { $in: ids }, _id: { $nin: hidden }, deletedAt: null }).sort({ createdAt: -1 }).limit(80).populate('uploader', 'name'),
    waitingGuests(hostedIds),
    // The bin: every deleted photo in albums you host, and the ones you deleted yourself elsewhere
    Photo.aggregate([{ $match: { deletedAt: { $ne: null }, $or: [{ album: { $in: hostedIds } },
      { album: { $in: ids }, deletedBy: req.user._id, uploader: req.user._id }] } }, { $group: { _id: '$album', n: { $sum: 1 } } }]),
    hidden.length ? Photo.countDocuments({ _id: { $in: hidden }, deletedAt: null }) : 0,
  ]);
  const trash = new Map(binned.map((b) => [String(b._id), b.n]));
  const saved = new Set((req.user.savedAlbums || []).map(String));
  const albums = mine
    .map((m) => ({
      ...summary(m.album, m.role, stats.get(String(m.album._id))),
      saved: saved.has(String(m.album._id)),
      trashCount: trash.get(String(m.album._id)) || 0,
      ...(m.role === 'host' && { waiting: waiting.get(String(m.album._id)) || 0 }),
    }))
    .sort(((s) => (a, b) => s.dir * (s.by === 'name'
      ? collator.compare(a.name || '', b.name || '') || a.date.localeCompare(b.date)
      : a.date.localeCompare(b.date) || byTime(a.startsAt, b.startsAt)))(sortOrder(req, ['name', 'date'], 'date')));
  res.json({
    albums,
    // The bin (photos in albums you host, and your own deleted ones elsewhere) and the photos you've hidden, across all albums
    trashCount: [...trash.values()].reduce((t, n) => t + n, 0),
    hiddenCount,
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
  });
}

// A new album. With event times (startsAt/endsAt, or kind: 'event') it's an event: times, a venue and a
// sharing zone, and it can be public. Without them it's a plain album: a name and a date, photos any time,
// joined with its code or link, never public.
export async function create(req, res) {
  const b = req.body || {};
  const isEvent = b.kind === 'event' || b.startsAt != null || b.endsAt != null;
  const fields = { ...readAlbumFields(b), ...(isEvent ? readEventFields(b) : { zone: undefined }), kind: isEvent ? 'event' : 'album' };
  fields.visibility = isEvent && b.visibility === 'public' ? 'public' : 'invite';
  // Games: an event has them unless the host said no (games: false)
  if (isEvent) fields.games = b.games !== false;
  const group = b.groupId ? await groupFor(req.user._id, b.groupId) : null;
  // Group albums are for the group (and anyone given the code), never listed publicly on Events
  if (group) Object.assign(fields, { group: group._id, visibility: 'invite', eventUploadWindow: isEvent && b.eventUploadWindow === true });
  else fields.eventUploadWindow = isEvent;

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
  const stats = group ? (await statsFor([album._id], req.user._id)).get(String(album._id))
    : { photos: 0, mine: 0, pics: [], guests: 1, hostName: (req.user.name || '').trim() || 'The host', hostIsYou: true };
  res.status(201).json({ album: summary(album, 'host', stats) });
}

// A friend group the person is in, or a 404 (so group ids can't be probed)
async function groupFor(userId, groupId) {
  if (!mongoose.isValidObjectId(groupId) || !(await GroupMember.exists({ group: groupId, user: userId }))) {
    throw new HttpError(404, 'That friend group wasn’t found. You may have left it.');
  }
  const group = await Group.findById(groupId);
  if (!group) throw new HttpError(404, 'That friend group wasn’t found. You may have left it.');
  return group;
}

// GET /api/albums/preview/:code  (no login needed)
// What someone sees after scanning a QR code or typing a code, before they log in: enough to want
// to join (the event, who hosts it, how many photos and guests), never the photos themselves, the
// venue's exact position or anyone's name but the host's first name.
export async function preview(req, res) {
  const code = normaliseCode(req.params.code);
  if (code.length !== 7) throw new HttpError(400, 'Codes are 7 letters and numbers, like K7Q-48DM.');
  const album = await Album.findOne({ code }).populate('host', AVATAR_FIELDS);
  if (!album) throw new HttpError(404, 'No album has that code. Check it against the host’s card.');
  const [photos, guests, member] = await Promise.all([
    Photo.countDocuments({ album: album._id, deletedAt: null }),
    Membership.countDocuments({ album: album._id, via: { $ne: 'group' } }),
    req.user ? Membership.exists({ album: album._id, user: req.user._id, via: { $ne: 'group' } }) : null,
  ]);
  const life = albumLifecycle(album);
  const deadline = album.joinDeadline ?? album.endsAt;
  const open = album.joiningOpen !== false && !(deadline && deadline <= new Date());
  res.json({
    album: {
      code: album.displayCode,
      name: album.name, date: album.date, place: album.place,
      venue: album.venue?.address ? { address: album.venue.address } : undefined,
      startsAt: album.startsAt || undefined, endsAt: album.endsAt || undefined,
      status: life.status, live: life.status === 'live', opensAt: life.opensAt,
      hostName: firstName(album.host?.name), hostAvatar: req.user ? avatarOf(album.host) : '',
      photos, guests,
      visibility: album.visibility || 'invite',
      group: !!album.group,
      cover: hostCover(album),
      // How joining works, so the page can say it before they log in
      joining: {
        open,
        needsLocation: open && !album.group && album.locationRequired !== false && !!album.zone?.radiusM,
        radiusM: album.zone?.radiusM || undefined,
        approval: !open,   // closed: they can still ask the host
      },
    },
    signedIn: !!req.user,
    member: !!member,
  });
}

// POST /api/albums/:id/save  { saved: true|false }  The bookmark on My albums (only albums you're in)
// ---- The cover picture ----

// PUT /api/albums/:id/cover  (multipart field "cover")  The host's own picture for the album
export async function putCover(req, res) {
  const m = await membershipOf(req, req.params.id);
  if (m.role !== 'host') throw new HttpError(403, 'Only the host can change the cover.');
  if (!req.file) throw new HttpError(400, 'Choose a photo for the cover.');
  // Once the event has started, the most loved photo is normally the cover. A host who picks a picture
  // now wants to see it, so it's kept (they can switch "Keep my cover" off to hand back to the photos).
  if (albumLifecycle(m.album).status !== 'upcoming') m.album.keepHostCover = true;
  await saveCover(m.album, req.file.buffer);
  const stats = await statsFor([m.album._id], req.user._id, m.hidden || []);
  res.json({ album: summary(m.album, 'host', stats.get(String(m.album._id))) });
}

// DELETE /api/albums/:id/cover  Back to the album's photos for the cover
export async function deleteCover(req, res) {
  const m = await membershipOf(req, req.params.id);
  if (m.role !== 'host') throw new HttpError(403, 'Only the host can change the cover.');
  await removeCover(m.album);
  const stats = await statsFor([m.album._id], req.user._id, m.hidden || []);
  res.json({ album: summary(m.album, 'host', stats.get(String(m.album._id))) });
}

// GET /api/albums/:id/cover/:token[?size=thumb]  The picture itself. No login needed: the token in
// the address is the key (it's only given out with the album's details, invite or Events listing)
export async function coverFile(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'No cover.');
  const album = await Album.findById(req.params.id, 'cover');
  if (!album?.cover?.token || album.cover.token !== req.params.token) throw new HttpError(404, 'No cover.');
  const key = req.query.size === 'thumb' ? album.cover.thumbKey : album.cover.key;
  if (!(await sendPhoto(res, key, 'image/webp'))) throw new HttpError(404, 'No cover.');
}

export async function save(req, res) {
  const m = await membershipOf(req, req.params.id);
  const want = req.body?.saved !== false;
  await User.updateOne({ _id: req.user._id }, want ? { $addToSet: { savedAlbums: m.album._id } } : { $pull: { savedAlbums: m.album._id } });
  res.json({ saved: want });
}

// The ids of every album this person can open (their own memberships and their friend groups')
export async function albumIdsOf(userId) {
  return (await albumsOf(userId)).map((m) => m.album._id);
}

export async function join(req, res) {
  const code = normaliseCode(req.body?.code);
  if (code.length !== 7) throw new HttpError(400, 'Codes are 7 letters and numbers, like K7Q-48DM.');
  const album = await Album.findOne({ code });
  if (!album) throw new HttpError(404, 'No album has that code. Check it against the host’s card.');
  const result = await admit(album, req.user, req.body);
  if (result.pending) return res.status(202).json(result);
  const { already } = result;
  const m = await membershipOf(req, album.id);
  const stats = await statsFor([album._id], req.user._id, m?.hidden || []);
  res.status(already ? 200 : 201).json({ already, album: summary(album, m.role, stats.get(String(album._id))) });
}

// ---- One album ----

// File names saved before uploads were read as UTF-8 came out garbled ("è¢å¹æ“·..." for 螢幕擷取畫面): shown fixed
export function fixFileName(name) {
  const s = String(name || '');
  // Only names made of Latin-1 characters that include accented ones can be a misread UTF-8 name
  if (!/[\u0080-ÿ]/.test(s) || /[^\u0000-ÿ]/.test(s)) return s;
  const utf8 = Buffer.from(s, 'latin1').toString('utf8');
  return utf8.includes('�') ? s : utf8;
}
// Your own uploads still being checked, waiting for staff, or declined (only you see these)
async function checksFor(album, user) {
  const rows = await UploadCheck.find({ album, user, state: { $in: ['checking', 'review', 'publish', 'rejected', 'failed'] } },
    'originalName state explicit').sort({ createdAt: -1 }).lean();
  // A declined photo staff have already looked at can't be sent for review again
  const declined = rows.filter(row => row.state === 'rejected').map(row => row._id);
  const upheld = new Set(declined.length ? (await ModerationDecision.find({ _id: { $in: declined }, status: 'upheld' }, '_id').lean()).map(d => String(d._id)) : []);
  return rows.map(row => ({ id: String(row._id), name: fixFileName(row.originalName), state: row.state,
    ...(upheld.has(String(row._id)) && { reviewed: true }), ...(row.state === 'rejected' && row.explicit && { explicit: true }) }));
}
// Removes one of your own declined or unreadable uploads (it's deleted at once instead of after 30 days)
export async function removeCheck(req, res) {
  const member = await membershipOf(req, req.params.id);
  if (!mongoose.isValidObjectId(req.params.check)) throw new HttpError(404, 'Not found.');
  const filter = { _id: req.params.check, album: member.album._id, user: req.user._id, state: { $in: ['rejected', 'failed'] } };
  if (!await UploadCheck.exists(filter)) throw new HttpError(404, 'That upload can’t be removed (it may be waiting for staff review).');
  await discardChecks(filter);
    res.json({ ok: true });
}
export async function checkStatus(req, res) {
  const member = await membershipOf(req, req.params.id);
  res.set('Cache-Control', 'private, no-store').json({ checks: await checksFor(member.album._id, req.user._id) });
}
// GET /api/albums/:id/version → { version }: a short stamp that changes whenever a photo is added, deleted or changed
// (reactions, comments, bin, reports) or the album itself changes. An open album asks every few seconds and reloads
// only when it changes (live updates without keeping a connection open).
// Polling load (audit M4): the photo part of the stamp is kept in memory per album and worked out at most once a
// second, however many people have the album open; the answer carries an ETag, so an unchanged album is a bodyless 304.
const STAMP_MS = 1000;
const photoStamps = new Map(); // album id → { at, value: Promise<string> }
function photoStampOf(albumId) {
  const key = String(albumId);
  const now = Date.now();
  const hit = photoStamps.get(key);
  if (hit && now - hit.at < STAMP_MS) return hit.value;
  const value = Promise.all([
    Photo.countDocuments({ album: albumId }),
    Photo.findOne({ album: albumId }, 'updatedAt').sort({ updatedAt: -1 }).lean(),
  ]).then(([count, last]) => `${count}.${last?.updatedAt ? new Date(last.updatedAt).getTime() : 0}`);
  photoStamps.set(key, { at: now, value });
  value.catch(() => photoStamps.delete(key));
  // Albums nobody is looking at any more drop out (the map never grows past what's open right now)
  if (photoStamps.size > 2000) for (const [k, v] of photoStamps) if (now - v.at > 60000) photoStamps.delete(k);
  return value;
}
export async function version(req, res) {
  const m = await membershipOf(req, req.params.id);
  const stamp = `${await photoStampOf(m.album._id)}.${m.album.updatedAt ? new Date(m.album.updatedAt).getTime() : 0}`;
  const etag = `"v${stamp}"`;
  // Private (it's behind the login), and the browser must ask again every time, but may reuse its copy on a 304
  res.removeHeader('Pragma');
  res.set({ 'Cache-Control': 'private, no-cache', ETag: etag });
  const asked = String(req.get('If-None-Match') || '').split(',').map((t) => t.trim().replace(/^W\//, ''));
  if (asked.includes(etag)) return res.status(304).end();
  res.json({ version: stamp });
}

// ---- GET /api/albums/:id: the album and its photos ----
// Without ?limit (or ?since) every photo comes at once, as before. Paging (audit B1):
//   ?limit=N (default 200, at most 500) with ?sort_by=&order= as before. The answer adds { total, nextBefore };
//     ask again with ?before=<nextBefore> for the next page (null: that was the last). nextBefore is opaque:
//     a time and id for "uploaded" order (an ISO date is accepted too), a position for the other orders.
//   ?since=<nextSince> (live updates): only photos changed since then, as { photos, removed, total, nextSince };
//     removed lists ids now deleted or hidden from you. tooMany: true means reload the whole album instead.
export const PAGE_DEFAULT = 200;
export const PAGE_MAX = 500;
function photoJsonFor(req, withHidden, hiddenSet) {
  return (p) => {
    const mine = p.uploader?._id.equals(req.user._id);
    return {
      id: p.id, url: photoUrl(p.id), thumbnailUrl: thumbnailUrl(p.id), ...miniOf(p), downloadUrl: `${photoUrl(p.id)}/download`, by: mine ? 'You' : firstName(p.uploader?.name), mine, at: p.createdAt,
      // Bookmarked: private, just yours (liked is its old name)
      bookmarked: (p.likes || []).some((id) => id.equals(req.user._id)), liked: (p.likes || []).some((id) => id.equals(req.user._id)),
      reactions: reactionCounts(p), reaction: myReaction(p, req.user._id),
      // For sorting and the comment badge: the original file name and size, when it was taken, how many comments
      name: fixFileName(p.originalName || '') || undefined, size: p.size, takenAt: p.takenAt || null, commentCount: p.commentCount || 0,
      ...(withHidden && hiddenSet.has(p.id) && { hidden: true }),
    };
  };
}
function photoOrder(s) {
  const nameOf = (p) => fixFileName(p.originalName || '');
  return (a, b) => s.dir * (
    s.by === 'name' ? collator.compare(nameOf(a), nameOf(b))
      : s.by === 'uploader' ? collator.compare(a.uploader?.name || '', b.uploader?.name || '')
        : s.by === 'taken' ? byTime(a.takenAt || a.createdAt, b.takenAt || b.createdAt)
          : 0) || s.dir * byTime(a.createdAt, b.createdAt) || s.dir * String(a._id).localeCompare(String(b._id));
}
const badPage = () => new HttpError(400, 'That page of the album can’t be found. Reload the album.', 'BAD_PAGE');
function pageLimit(raw) {
  if (raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, 'limit must be a whole number from 1 to 500.', 'BAD_LIMIT');
  return Math.min(n, PAGE_MAX);
}
// "uploaded" order cursor: "<ms>_<photo id>" (what nextBefore gives), or a plain date (as the handoff spec allows)
function uploadedCursor(raw) {
  const s = String(raw);
  const m = /^(\d{1,15})_([0-9a-f]{24})$/i.exec(s);
  if (m) return { at: new Date(Number(m[1])), id: new mongoose.Types.ObjectId(m[2]) };
  const at = new Date(s);
  if (Number.isNaN(at.getTime())) throw badPage();
  return { at, id: null };
}
function sinceTime(raw) {
  const at = /^\d{1,15}$/.test(String(raw)) ? new Date(Number(raw)) : new Date(String(raw));
  if (Number.isNaN(at.getTime())) throw new HttpError(400, 'since must be a time from an earlier answer.', 'BAD_SINCE');
  return at;
}

export async function show(req, res) {
  const m = await membershipOf(req, req.params.id);
  const hidden = m.hidden || [];
  const hiddenSet = new Set(hidden.map(String));
  const withHidden = req.query.hidden === '1';
  const limit = pageLimit(req.query.limit);
  const since = req.query.since !== undefined ? sinceTime(req.query.since) : null;
  const shown = { album: m.album._id, deletedAt: null, ...(!withHidden && { _id: { $nin: hidden } }) };
  const s = sortOrder(req, ['name', 'uploader', 'taken', 'uploaded'], 'uploaded');
  const toJson = photoJsonFor(req, withHidden, hiddenSet);
  // Taken before anything is read, so a photo changed while this answer is built is in the next ?since= too
  const startedAt = Date.now();

  // Live updates: only what changed. Uses the { album, updatedAt } index
  if (since) {
    const cap = limit || PAGE_MAX;
    const [changed, total] = await Promise.all([
      Photo.find({ album: m.album._id, updatedAt: { $gte: since } }).sort({ updatedAt: 1 }).limit(cap + 1).populate('uploader', 'name'),
      Photo.countDocuments(shown),
    ]);
    const tooMany = changed.length > cap;
    const rows = tooMany ? changed.slice(0, cap) : changed;
    const visible = (p) => !p.deletedAt && (withHidden || !hiddenSet.has(p.id));
    // $gte: a photo changed in the same millisecond as the last one is sent again rather than missed
    const nextSince = rows.length ? new Date(rows.at(-1).updatedAt).getTime() : since.getTime();
    return res.json({
      photos: rows.filter(visible).map(toJson), removed: rows.filter((p) => !visible(p)).map((p) => p.id),
      total, nextSince, ...(tooMany && { tooMany: true }),
      checks: await checksFor(m.album._id, req.user._id),
    });
  }

  const [stats, hiddenCount, trashCount, consent] = await Promise.all([
    statsFor([m.album._id], req.user._id, hidden),
    hidden.length ? Photo.countDocuments({ album: m.album._id, _id: { $in: hidden }, deletedAt: null }) : 0,
    // The bin's count: every deleted photo for the host; for anyone else, the ones they deleted themselves
    Photo.countDocuments({ album: m.album._id, deletedAt: { $ne: null }, ...(m.role !== 'host' && { deletedBy: req.user._id, uploader: req.user._id }) }),
    uploadConsentOf(m.album._id, req.user._id),
  ]);
  const albumJson = { ...summary(m.album, m.role, stats.get(String(m.album._id))), hiddenCount, trashCount, saved: (req.user.savedAlbums || []).some((id) => id.equals(m.album._id)),
    // The upload agreement this person gave for this album under the current Terms (null: ask before uploading)
    uploadConsent: consent, termsVersion: config.policies.tos };

  let photos, page = {};
  if (!limit) {
    // Everything at once (today's page, until it pages through albums)
    photos = await Photo.find(shown).sort({ createdAt: -1 }).populate('uploader', 'name');
    photos.sort(photoOrder(s));
  } else if (s.by === 'uploaded') {
    // Straight from the { album, createdAt } index, one page at a time
    const op = s.dir === 1 ? '$gt' : '$lt';
    let after = {};
    if (req.query.before !== undefined) {
      const c = uploadedCursor(req.query.before);
      after = c.id ? { $or: [{ createdAt: { [op]: c.at } }, { createdAt: c.at, _id: { [op]: c.id } }] } : { createdAt: { [op]: c.at } };
    }
    const [rows, total] = await Promise.all([
      Photo.find({ $and: [shown, after] }).sort({ createdAt: s.dir, _id: s.dir }).limit(limit + 1).populate('uploader', 'name'),
      Photo.countDocuments(shown),
    ]);
    photos = rows.slice(0, limit);
    const last = photos.at(-1);
    page = { total, nextBefore: rows.length > limit ? `${new Date(last.createdAt).getTime()}_${last.id}` : null };
  } else {
    // Name, uploader or date taken: sorted here across the whole album from just the sort fields, then only this
    // page's photos are read in full
    const offset = req.query.before === undefined ? 0 : Number(/^o(\d{1,7})$/.exec(String(req.query.before))?.[1] ?? NaN);
    if (!Number.isInteger(offset)) throw badPage();
    const keys = await Photo.find(shown, 'originalName takenAt createdAt uploader').populate('uploader', 'name').lean();
    keys.sort(photoOrder(s));
    const ids = keys.slice(offset, offset + limit).map((p) => p._id);
    const full = new Map((await Photo.find({ _id: { $in: ids } }).populate('uploader', 'name')).map((p) => [p.id, p]));
    photos = ids.map((id) => full.get(String(id))).filter(Boolean);
    page = { total: keys.length, nextBefore: offset + limit < keys.length ? `o${offset + limit}` : null };
  }
  res.json({
    checks: await checksFor(m.album._id, req.user._id),
    album: albumJson,
    photos: photos.map(toJson),
    ...page,
    // Where live updates (?since=) start from for this answer
    ...(limit && { nextSince: startedAt }),
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
    const ids = (await Photo.find({ album: m.album._id, _id: { $in: raw }, deletedAt: null }, '_id')).map((p) => p._id);
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
  const fields = readAlbumFields({ name: m.album.name, date: m.album.date, place: m.album.place, zone: m.album.zone, ...req.body },
    { nameIsNew: req.body?.name !== undefined && tidy(req.body.name) !== m.album.name });
  Object.assign(m.album, fields);
  if (typeof req.body?.keepHostCover === 'boolean') m.album.keepHostCover = req.body.keepHostCover;
  // Photo comments on or off for the whole album
  if (typeof req.body?.allowComments === 'boolean') m.album.allowComments = req.body.allowComments;
  // Event games on or off (only events have them; turning them off hides them, nothing is deleted)
  if (typeof req.body?.games === 'boolean') {
    if ((m.album.kind || (m.album.startsAt ? 'event' : 'album')) !== 'event') throw new HttpError(400, 'Games are only for events.', 'GAMES_EVENTS_ONLY');
    m.album.games = req.body.games;
  }
  // Upload caps: photos per guest (1-1000) and for the album (1-10000)
  if (req.body?.uploadLimits !== undefined) {
    const { perGuest, total } = req.body.uploadLimits || {};
    const ok = (n, max) => n === undefined || (Number.isInteger(n) && n >= 1 && n <= max);
    if (!ok(perGuest, 1000) || !ok(total, 10000)) throw new HttpError(400, 'Upload limits: 1-1000 photos per guest, 1-10000 for the album.', 'UPLOAD_LIMITS_INVALID');
    if (perGuest !== undefined) m.album.set('uploadLimits.perGuest', perGuest);
    if (total !== undefined) m.album.set('uploadLimits.total', total);
  }
  // groupId: a friend group the host is in, or null to stop sharing it with its group
  if (req.body && 'groupId' in req.body) {
    const before = m.album.group;
    m.album.group = req.body.groupId ? (await groupFor(req.user._id, req.body.groupId))._id : undefined;
    if (before && !before.equals(m.album.group)) await dropGroupRows({ album: m.album._id });
    if (m.album.group) m.album.visibility = 'invite';
  }
  if (req.body?.visibility === 'public' || req.body?.visibility === 'invite') {
    if (req.body.visibility === 'public' && !m.album.zone?.radiusM) throw new HttpError(400, 'A public album needs a venue, so people nearby can find it.');
    if (req.body.visibility === 'public' && m.album.group) throw new HttpError(400, 'Albums shared with a friend group can’t be public. Stop sharing it with the group first.');
    m.album.visibility = req.body.visibility;
  }
  await m.album.save();
  const stats = await statsFor([m.album._id], req.user._id, m.hidden || []);
  res.json({ album: summary(m.album, 'host', stats.get(String(m.album._id))) });
}

export async function remove(req, res) {
  const m = await membershipOf(req, req.params.id);
  if (m.role !== 'host') throw new HttpError(403, 'Only the host can delete the album.');
  await discardChecks({ album: m.album._id });
  const photos = await Photo.find({ album: m.album._id }, 'storageKey');
  await removeCoverFiles([m.album.cover?.key, m.album.cover?.thumbKey]);
  const { removeGamesFor } = await import('../services/gameService.js');
  await removeGamesFor({ albums: [m.album._id] });
  const [{ PhotoComment }, { Report }, { Notification }] = await Promise.all([
    import('../models/PhotoComment.js'), import('../models/Report.js'), import('../models/Notification.js')]);
  // The album and everything that points at it go now (comments, reports and notifications too: audit B3)
  await Promise.all([
    Photo.deleteMany({ album: m.album._id }),
    Membership.deleteMany({ album: m.album._id }),
    PhotoComment.deleteMany({ album: m.album._id }),
    Report.deleteMany({ album: m.album._id }),
    Notification.deleteMany({ album: m.album._id }),
    UploadConsent.deleteMany({ album: m.album._id }),
    m.album.deleteOne(),
  ]);
  // The photo files are deleted in the background, after this answer (audit B4)
  await deletePhotosLater(photos.map((p) => p.storageKey));
  res.json({ ok: true });
}

// Guests can leave; the host deletes the album instead
export async function leave(req, res) {
  const m = await membershipOf(req, req.params.id);
  if (m.role === 'host') throw new HttpError(400, 'You’re the host. Delete the album instead.');
  if (m.via === 'group' || await hasGroupAccess(req.user._id, m.album)) {
    throw new HttpError(400, 'This album is shared with your friend group. Leave the group to stop seeing its albums.', 'group-album');
  }
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
  if (!open) {
    if (status === 'upcoming' && opensAt) throw new HttpError(403, `Photos can be added from ${new Date(opensAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC.`, 'not-open-yet');
    throw new HttpError(403, `This album closed to new photos on ${closesLabel(closes)}. You can still look at it and download everything.`, 'closed');
  }
  // The upload agreement (UPLOAD_CONSENT=on), checked before any file is received
  if (config.policies.uploadConsent && !await uploadConsentOf(album._id, req.user._id)) {
    throw new HttpError(409, 'Tick the box to agree, then upload again.', 'consent-required', { termsVersion: config.policies.tos });
  }
  next();
}

// ---- The upload agreement (per person, per album, per Terms version) ----
// { termsVersion, at } when this person agreed to upload to this album under the current Terms, otherwise null
async function uploadConsentOf(albumId, userId) {
  const row = await UploadConsent.findOne({ album: albumId, user: userId, termsVersion: config.policies.tos }, 'termsVersion at').lean();
  return row ? { termsVersion: row.termsVersion, at: row.at } : null;
}
// POST /api/albums/:id/consent { termsVersion } (members only) → { ok, termsVersion, at }
// The version must be the current one (it's in /api/config and in the album's details): agreeing to older Terms is a
// 409 terms-outdated with the current version, so the page can show the box again.
export async function giveUploadConsent(req, res) {
  const m = await membershipOf(req, req.params.id);
  const termsVersion = req.body?.termsVersion;
  if (typeof termsVersion !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(termsVersion)) {
    throw new HttpError(400, 'Send the Terms version you agreed to, like 2026-11-20.', 'BAD_TERMS_VERSION');
  }
  if (termsVersion !== config.policies.tos) {
    throw new HttpError(409, 'The Terms have been updated. Read them, then tick the box again.', 'terms-outdated', { termsVersion: config.policies.tos });
  }
  const at = new Date();
  await UploadConsent.updateOne({ album: m.album._id, user: req.user._id }, { $set: { termsVersion, at } }, { upsert: true });
  res.json({ ok: true, termsVersion, at });
}

export async function addPhotos(req, res) {
  try { await acceptPhotoBatch(req, res); }
  finally {
    await Promise.all((req.files || []).filter(f => f.rawKey && !f.queued).map(f => removeFile(f.rawKey)));
  }
}

// Uploads into one album take turns from counting against the caps until their photos are queued, so uploads sent
// side by side (the page sends 3 at once) can't each see the same free room and together go over a cap.
// (In this process: the API runs as one instance.)
const albumTurns = new Map();
function inTurn(key, fn) {
  const before = albumTurns.get(key) || Promise.resolve();
  const run = before.then(fn, fn);
  const tail = run.catch(() => {});
  albumTurns.set(key, tail);
  tail.then(() => { if (albumTurns.get(key) === tail) albumTurns.delete(key); });
  return run;
}

async function acceptPhotoBatch(req, res) {
  const files = req.files || [];
  if (!files.length) throw new HttpError(400, 'Choose at least one photo.');
  // The turn covers counting and queuing only; the photo checks below run side by side again
  const batch = await inTurn(String(req.membership.album._id), () => queueBatch(req, files));
  return answerBatch(req, res, batch);
}
async function queueBatch(req, files) {
  const album = req.membership.album;
  // The same file twice (in this upload, or already in the album and not deleted): skipped
  const hashes = files.map((f) => f.hash);
  const there = new Set((await Photo.find({ album: album._id, hash: { $in: hashes }, deletedAt: null }, 'hash')).map((p) => p.hash));
  let skipped = 0, banned = 0;
  const tooBig = [];
  // Upload caps (Album.uploadLimits): photos in the album plus those still being checked or waiting for review.
  // Guests have their own cap too; the host only the album's. Photos over a cap are left out and named in overLimit.
  const pending = { state: { $in: ['checking', 'publish', 'review'] } };
  const host = req.membership.role === 'host';
  const [inAlbum, waitingAll, mineIn, mineWaiting] = await Promise.all([
    Photo.countDocuments({ album: album._id, deletedAt: null }),
    UploadCheck.countDocuments({ album: album._id, ...pending }),
    host ? 0 : Photo.countDocuments({ album: album._id, uploader: req.user._id, deletedAt: null }),
    host ? 0 : UploadCheck.countDocuments({ album: album._id, user: req.user._id, ...pending }),
  ]);
  const caps = { perGuest: album.uploadLimits?.perGuest ?? 150, total: album.uploadLimits?.total ?? 1500 };
  let roomAlbum = caps.total - inAlbum - waitingAll;
  let roomMine = host ? Infinity : caps.perGuest - mineIn - mineWaiting;
  const overLimit = [];
  const checks = [];
  // One photo, start to finish. Anything wrong with it skips just that photo; the rest still go in.
  async function one(f, i) {
    const hash = hashes[i], name = f.originalname.slice(0, 200);
    if (there.has(hash)) { skipped++; return; }
    there.add(hash);   // (claimed now, so the same file twice in this upload is only added once)
    // Up to MAX_UPLOAD_MB a photo; camera RAW files only have the much higher safety ceiling
    const limit = isRawName(name) ? config.maxRawUploadBytes : config.maxUploadBytes;
    if (f.size > limit) { tooBig.push(name); there.delete(hash); return; }
    // Over a cap: decided before any waiting, so it's always the later photos of an upload that are left out
    if (roomAlbum <= 0 || roomMine <= 0) { overLimit.push(name); there.delete(hash); return; }
    roomAlbum--; roomMine--;
    // Files taken down after a complaint can't come back
    if (await isBanned(hash)) { banned++; roomAlbum++; roomMine++; return; }
    // Queued for the nudity check (services/uploadChecks.js): published once it passes, otherwise declined and
    // kept private, with a "Request review" for the uploader. Unreadable files are reported there too.
    const job = await queueUpload(album._id, req.user._id, hash, name, f);
    checks.push({ id: job.id, name, state: job.state });
  }
  // Two at a time: each is already in private storage, so this only records it and queues the check
  let next = 0;
  const workers = await Promise.allSettled([0, 1].map(async () => { while (next < files.length) { const i = next++; await one(files[i], i); } }));
  const failure = workers.find(worker => worker.status === 'rejected');
  if (failure) throw failure.reason;
  return { checks, skipped, banned, tooBig, overLimit, caps, roomMine, roomAlbum };
}
// ---- Direct uploads (audit B3; services/directUploads.js) ----
// POST /api/albums/:id/uploads  { files: [{ name, size, sha256 (hex) }] } (1-30; members of an open album who agreed)
// → { uploads: [{ i, ticket, url, method, headers }], skipped: [i] (already in the album), tooBig: [names], expiresIn }
// 404 direct-upload-off when this server takes uploads only the old way (POST /photos).
const SHA256_HEX = /^[0-9a-f]{64}$/;
export async function presignUploads(req, res) {
  if (!directUploadsOn()) throw new HttpError(404, 'Direct uploads aren’t on here: send the photos the usual way.', 'direct-upload-off');
  const list = req.body?.files;
  if (!Array.isArray(list) || !list.length || list.length > 30) throw new HttpError(400, 'Send 1 to 30 photos at a time.', 'BAD_UPLOAD_LIST');
  const files = list.map((f, i) => ({ i, name: String(f?.name ?? '').slice(0, 200), size: Number(f?.size), sha256: String(f?.sha256 ?? '').toLowerCase() }));
  if (files.some((f) => !f.name || !Number.isInteger(f.size) || f.size <= 0 || !SHA256_HEX.test(f.sha256))) {
    throw new HttpError(400, 'Each photo needs its name, size and SHA-256.', 'BAD_UPLOAD_LIST');
  }
  const album = req.membership.album;
  const tooBig = files.filter((f) => f.size > (isRawName(f.name) ? config.maxRawUploadBytes : config.maxUploadBytes));
  const there = new Set((await Photo.find({ album: album._id, hash: { $in: files.map((f) => f.sha256) }, deletedAt: null }, 'hash')).map((p) => p.hash));
  const send = files.filter((f) => !tooBig.includes(f) && !there.has(f.sha256));
  // The day's quota is counted before anything is sent (audit M3)
  await chargeDailyQuota(req, send.reduce((t, f) => t + f.size, 0));
  const uploads = await Promise.all(send.map(async (f) => {
    const key = newKey(req.user._id);
    const link = await presignUpload(key, { sha256Base64: hexToBase64(f.sha256) }, LINK_SECONDS);
    return { i: f.i, ticket: issueTicket({ key, userId: req.user._id, albumId: album._id, name: f.name, size: f.size, sha256: f.sha256 }), ...link };
  }));
  res.json({ uploads, skipped: files.filter((f) => there.has(f.sha256)).map((f) => f.i), tooBig: tooBig.map((f) => f.name), expiresIn: LINK_SECONDS });
}

// POST /api/albums/:id/uploads/process  { tickets: [...] } (1-30) → the same answer as POST /photos, plus
// missing: [names] that didn't arrive (or not as described). 409 upload-missing when none of them did.
export async function processUploads(req, res) {
  if (!directUploadsOn()) throw new HttpError(404, 'Direct uploads aren’t on here: send the photos the usual way.', 'direct-upload-off');
  const tickets = req.body?.tickets;
  if (!Array.isArray(tickets) || !tickets.length || tickets.length > 30) throw new HttpError(400, 'Send 1 to 30 tickets at a time.', 'BAD_UPLOAD_LIST');
  const album = req.membership.album;
  const read = tickets.map((t) => readTicket(t, { userId: req.user._id, albumId: album._id }));
  if (read.some((t) => !t)) throw new HttpError(400, 'That upload link has expired or isn’t yours. Upload the photos again.', 'BAD_TICKET');
  const files = [], missing = [], wrong = [];
  // Each one really arrived, as described: same size, and the SHA-256 S3 checked (one small request each, no download)
  await Promise.all(read.map(async (t) => {
    const got = await headFile(t.key);
    if (!got) { missing.push(t.name); return; }
    if (got.size !== t.size || got.sha256Base64 !== hexToBase64(t.sha256)) { missing.push(t.name); wrong.push(t.key); return; }
    files.push({ rawKey: t.key, hash: t.sha256, size: got.size, originalname: t.name });
  }));
  await Promise.all(wrong.map((k) => removeFile(k).catch(() => {})));
  if (!files.length) throw new HttpError(409, 'The photos didn’t arrive. Try again.', 'upload-missing', { missing });
  res.locals.missing = missing;
  try {
    const batch = await inTurn(String(album._id), () => queueBatch(req, files));
    return await answerBatch(req, res, batch);
  } finally {
    // Anything not queued (a copy already in the album, over a cap, taken down before) is removed from the bucket
    await Promise.all(files.filter((f) => !f.queued).map((f) => removeFile(f.rawKey).catch(() => {})));
  }
}

async function answerBatch(req, res, { checks, skipped, banned, tooBig, overLimit, caps, roomMine, roomAlbum }) {
  // Nothing could be added, only because of size: say why
  if (!checks.length && !skipped && !banned && tooBig.length) {
    throw new HttpError(413, `Photos can be up to ${Math.round(config.maxUploadBytes / 1048576)} MB each (camera RAW files can be bigger).`, 'too-big', { tooBig });
  }
  if (banned && !checks.length && !skipped) throw new HttpError(422, BANNED_MESSAGE, 'removed-content');
  if (!checks.length && overLimit.length) {
    const whose = roomMine <= 0 && roomAlbum > 0 ? `You can add up to ${caps.perGuest} photos to this album.` : `This album can hold up to ${caps.total} photos.`;
    throw new HttpError(409, `${whose} Ask the host if you need more.`, 'UPLOAD_LIMIT', { overLimit, uploadLimits: caps });
  }
  // Up to 10 photos are checked right away, so they appear at once; bigger uploads carry on in the background
  if (checks.length && checks.length <= 10) await checkNow(checks.map(c => c.id));
  const now = checks.length ? await UploadCheck.find({ _id: { $in: checks.map(c => c.id) } }, 'state explicit').lean() : [];
  const stateOf = new Map(now.map(row => [String(row._id), row.state]));
  const explicitIds = new Set(now.filter(row => row.state === 'rejected' && row.explicit).map(row => String(row._id)));
  const published = checks.filter(c => stateOf.get(String(c.id)) === 'published').map(c => c.id);
  const photos = published.length ? await Photo.find({ _id: { $in: published } }) : [];
  const waiting = checks.filter(c => !published.includes(c.id))
    .map(c => ({ ...c, state: stateOf.get(String(c.id)) || c.state, ...(explicitIds.has(String(c.id)) && { explicit: true }) }));
  // photos: published now; checks: the rest (still being checked, declined, or unreadable; the album shows you
  // their status, with Request review on a declined one); skipped: already in the album (or twice in this upload)
  // banned: files removed from Momento before; tooBig: names left out for being over the size limit
  // 202 while some photos are still being checked; 201 once every photo is decided (published, declined, unreadable)
  res.status(waiting.some(c => ['checking', 'publish'].includes(c.state)) ? 202 : 201).json({
    photos: photos.map((p) => ({ id: p.id, url: photoUrl(p.id), thumbnailUrl: thumbnailUrl(p.id), ...miniOf(p), by: 'You', mine: true, at: p.createdAt })),
    checks: waiting, skipped, banned, tooBig, overLimit, uploadLimits: caps,
    declined: waiting.filter(c => c.state === 'rejected').length, blocked: waiting.filter(c => c.state === 'rejected').length,
    decisionIds: waiting.filter(c => c.state === 'rejected').map(c => c.id), failed: waiting.filter(c => c.state === 'failed').map(c => c.name),
    ...(res.locals.missing?.length && { missing: res.locals.missing }),
  });
}

export async function download(req, res) {
  const m = await membershipOf(req, req.params.id);
  // A big album: zipped in the background and emailed, rather than making the browser wait
  if (await isBig(m.album._id, m.hidden || [])) {
    await requestZip(m.album, req.user, m.hidden || []);
    return res.redirect(303, `${config.frontendUrl}/albums?album=${m.album.id}&zip=preparing`);
  }
  const photos = await Photo.find({ album: m.album._id, _id: { $nin: m.hidden || [] }, deletedAt: null }).sort({ createdAt: 1 });
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

// GET /api/albums/:id/zip/:token  The link in the "your download is ready" email
export async function zipFile(req, res) {
  const m = await membershipOf(req, req.params.id);
  const z = await ZipFile.findOne({ album: m.album._id, user: req.user._id, token: String(req.params.token), status: 'ready', expiresAt: { $gt: new Date() } });
  if (!z || !(await sendPhoto(res, z.key, 'application/zip', { filename: z.name }))) {
    throw new HttpError(404, 'This download has expired. Download the album again from Momento.');
  }
}

// ---- Host actions: nudging guests ----

const REMIND_EVERY_MS = 24 * 3600000;
// Each reminder is real email, so one goes to at most this many
const REMIND_MAX = 25;

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
    Photo.distinct('uploader', { album: album._id, deletedAt: null }),
  ]);
  const added = new Set(contributors.map(String));
  const ids = guests.map((g) => g.user).filter((u) => !added.has(String(u))).slice(0, REMIND_MAX);
  const people = await User.find({ _id: { $in: ids } }, 'name email');
  const link = `${config.frontendUrl}/albums?album=${album.id}`;
  const info = { name: album.name, closesLabel: closes && closesLabel(closes) };
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

// POST /api/albums/:id/photos/known  { hashes: ['<sha256 hex>', ...] (up to 500) } → { known: [...] }
// Which of these files the album already has (not in the bin), so the page can skip them before uploading: no
// upload time, storage or photo check spent on a duplicate. The page computes each file's SHA-256 (crypto.subtle).
export async function knownHashes(req, res) {
  const m = await membershipOf(req, req.params.id);
  const raw = Array.isArray(req.body?.hashes) ? req.body.hashes : null;
  if (!raw || raw.length > 500 || !raw.every((h) => typeof h === 'string' && /^[0-9a-f]{64}$/i.test(h))) {
    throw new HttpError(400, 'Send up to 500 SHA-256 hashes (64 hex characters each).', 'HASHES_INVALID');
  }
  const hashes = [...new Set(raw.map((h) => h.toLowerCase()))];
  const [inAlbum, waiting] = await Promise.all([
    Photo.find({ album: m.album._id, hash: { $in: hashes }, deletedAt: null }, 'hash').lean(),
    UploadCheck.find({ album: m.album._id, user: req.user._id, hash: { $in: hashes }, state: { $in: ['checking', 'publish', 'review'] } }, 'hash').lean(),
  ]);
  res.json({ known: [...new Set([...inAlbum, ...waiting].map((p) => p.hash))] });
}
