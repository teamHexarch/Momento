import { admit } from '../services/eventAdmission.js';
import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { Album } from '../models/Album.js';
import { Membership } from '../models/Membership.js';
import { Photo } from '../models/Photo.js';
import { EventMessage } from '../models/EventMessage.js';
import { avatarOf, AVATAR_FIELDS } from '../services/avatarService.js';
import { HttpError } from '../utils/httpError.js';
import { albumLifecycle, distanceM, membershipOf } from './albumController.js';

// Events: public albums (the host chose "Public" when creating it) that anyone can find on the
// Events map and join, as long as they're inside the album's zone. Invite-only albums never show here.

const thumbnailUrl = (id) => `${config.publicUrl}/api/photos/${id}?size=thumb`;
const firstName = (name) => (name || '').trim().split(/\s+/)[0] || 'Someone';
const PREVIEWS = 9;

function readPoint(src) {
  const lat = Number(src?.lat), lng = Number(src?.lng);
  if (!(Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) throw new HttpError(400, 'Your location is needed to find events near you.');
  return { lat, lng };
}

// GET /api/events/nearby?lat=&lng=&km=  Public events that haven't finished, within km (25 by default,
// at most 100) of the point. Live ones come first, then the closest.
export async function nearby(req, res) {
  const at = readPoint(req.query);
  const km = Math.min(100, Math.max(1, Number(req.query.km) || 25));
  // A box first (cheap, on the zone's centre), then the exact distance
  const dLat = km / 111, dLng = km / (111 * Math.max(.2, Math.cos(at.lat * Math.PI / 180)));
  const albums = await Album.find({
    visibility: 'public',
    endsAt: { $gt: new Date() },
    'zone.lat': { $gte: at.lat - dLat, $lte: at.lat + dLat },
    'zone.lng': { $gte: at.lng - dLng, $lte: at.lng + dLng },
  }).limit(200).populate('host', 'name');
  const found = albums
    .map((a) => ({ a, distanceM: Math.round(distanceM(at, a.zone)) }))
    .filter((x) => x.distanceM <= km * 1000);
  const ids = found.map((x) => x.a._id);
  const [stats, members, mine] = await Promise.all([
    Photo.aggregate([
      { $match: { album: { $in: ids } } },
      { $group: { _id: '$album', photos: { $sum: 1 }, pics: { $topN: { n: PREVIEWS, sortBy: { likeCount: -1, createdAt: -1 }, output: '$_id' } } } },
    ]),
    Membership.aggregate([{ $match: { album: { $in: ids } } }, { $group: { _id: '$album', n: { $sum: 1 } } }]),
    Membership.find({ album: { $in: ids }, user: req.user._id }, 'album'),
  ]);
  const statOf = new Map(stats.map((s) => [String(s._id), s]));
  const countOf = new Map(members.map((m) => [String(m._id), m.n]));
  const joined = new Set(mine.map((m) => String(m.album)));
  const events = found.map(({ a, distanceM: d }) => {
    const life = albumLifecycle(a), s = statOf.get(String(a.id));
    return {
      id: a.id, name: a.name, date: a.date, place: a.place, venue: a.venue?.address ? { address: a.venue.address } : undefined,
      startsAt: a.startsAt, endsAt: a.endsAt, status: life.status, live: life.status === 'live', opensAt: life.opensAt,
      zone: { lat: a.zone.lat, lng: a.zone.lng, radiusM: a.zone.radiusM },
      distanceM: d, inside: d <= a.zone.radiusM,
      photos: s?.photos || 0, pics: joined.has(String(a.id)) ? (s?.pics || []).map(thumbnailUrl) : [], guests: countOf.get(String(a.id)) || 0,
      hostName: firstName(a.host?.name), joined: joined.has(String(a.id)),
    };
  }).sort((x, y) => (y.live - x.live) || (x.distanceM - y.distanceM));
  res.json({ events });
}

// POST /api/events/:id/join  { lat, lng, accuracy }  Joins a public event as a guest, but only from
// inside its zone (with a little allowance for the phone's own uncertainty).
export async function join(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Event not found.');
  const album = await Album.findById(req.params.id);
  if (!album || album.visibility !== 'public') throw new HttpError(404, 'Event not found.');
  const result = await admit(album, req.user, req.body);
  res.status(result.pending ? 202 : result.already ? 200 : 201).json({ ...result, id: album.id });
}
export async function requests(req, res) {
  const albums = await Album.find({ 'requests.user': req.user._id }, 'name requests');
  res.json({ requests: albums.map(a => ({ name: a.name, status: a.requests.find(r => r.user.equals(req.user._id)).status })) });
}

// ---- Event chat: works like a friend group's chat (assets in groups.html) ----
// Every read and send checks, on the spot, that the person is still an active member of the album
// (membershipOf: a 404 otherwise) and that the host has the chat switched on (a 403 otherwise).
const messageOut = (m, userId) => ({
  id: m.id,
  text: m.text,
  avatarUrl: avatarOf(m.user),
  by: m.user?._id.equals(userId) ? 'You' : (m.user?.name || '').trim() || 'Someone',
  you: !!m.user?._id.equals(userId),
  at: m.createdAt,
});
async function chatMember(req) {
  const member = await membershipOf(req, req.params.id);
  if (!member.album.chatEnabled) throw new HttpError(403, 'The host has switched the event chat off.', 'chat-off');
  return member;
}
// Marks the chat read: a saved membership keeps the time; a friend-group member without a saved row
// gets one (via 'group', which never grants access on its own)
async function markRead(member, userId) {
  await Membership.updateOne({ album: member.album._id, user: userId },
    { $set: { chatReadAt: new Date() }, $setOnInsert: { role: 'guest', via: member.via || 'group' } }, { upsert: true });
}

// Who is typing, kept in memory for a few seconds (one server process), as in friend groups
const typingNow = new Map();   // album id -> Map(user id -> { name, avatarUrl, until })
const TYPING_MS = 6000;
function typingIn(albumId, exceptUserId) {
  const people = typingNow.get(albumId);
  if (!people) return [];
  const now = Date.now(), out = [];
  for (const [id, t] of people) {
    if (t.until < now) people.delete(id);
    else if (id !== exceptUserId) out.push({ name: t.name, avatarUrl: t.avatarUrl });
  }
  if (!people.size) typingNow.delete(albumId);
  return out;
}

// GET /api/events/:id/chat  The newest 50 messages (oldest first), or the 50 before ?before=<ISO time>
export async function chat(req, res) {
  const member = await chatMember(req);
  const albumId = member.album._id;
  const before = req.query.before ? new Date(String(req.query.before)) : null;
  const filter = { album: albumId, ...(before && !Number.isNaN(before.getTime()) && { createdAt: { $lt: before } }) };
  const list = await EventMessage.find(filter).sort({ createdAt: -1 }).limit(50).populate('user', AVATAR_FIELDS);
  if (!before) await markRead(member, req.user._id);
  res.set('Cache-Control', 'no-store').json({
    messages: list.reverse().map((m) => messageOut(m, req.user._id)), more: list.length === 50, typing: typingIn(String(albumId), req.user.id),
  });
}

// POST /api/events/:id/chat  { text }
export async function sendChat(req, res) {
  const member = await chatMember(req);
  const text = String(req.body?.text ?? req.body?.body ?? '').trim();
  if (!text) throw new HttpError(400, 'Write a message first.');
  if (text.length > 1000) throw new HttpError(400, 'Keep messages under 1,000 characters.');
  const m = await EventMessage.create({ album: member.album._id, user: req.user._id, text });
  await m.populate('user', AVATAR_FIELDS);
  typingNow.get(String(member.album._id))?.delete(req.user.id);
  await markRead(member, req.user._id);
  res.status(201).json({ message: messageOut(m, req.user._id) });
}

// POST /api/events/:id/typing  { typing: false } to stop
export async function typing(req, res) {
  const member = await chatMember(req);
  const key = String(member.album._id);
  if (!typingNow.has(key)) typingNow.set(key, new Map());
  if (req.body?.typing === false) typingNow.get(key).delete(req.user.id);
  else typingNow.get(key).set(req.user.id, { name: firstName(req.user.name), avatarUrl: avatarOf(req.user), until: Date.now() + TYPING_MS });
  res.json({ typing: typingIn(key, req.user.id) });
}

// GET /api/events/unread  Unread chat messages in each album you're in that has its chat on
export async function unread(req, res) {
  const mine = await Membership.find({ user: req.user._id, via: { $ne: 'group' } }, 'album chatReadAt createdAt');
  const ids = mine.map((m) => m.album);
  const open = new Map((await Album.find({ _id: { $in: ids }, chatEnabled: true }, 'name')).map((a) => [String(a._id), a.name]));
  const albums = [];
  for (const m of mine) {
    if (!open.has(String(m.album))) continue;
    const filter = { album: m.album, user: { $ne: req.user._id }, createdAt: { $gt: m.chatReadAt || m.createdAt } };
    const n = await EventMessage.countDocuments(filter);
    if (!n) continue;
    // The newest one, for the notification (as friend groups do)
    const latest = await EventMessage.findOne(filter).sort({ createdAt: -1 }).populate('user', AVATAR_FIELDS);
    albums.push({ id: String(m.album), name: open.get(String(m.album)), unread: n, latest: latest && messageOut(latest, req.user._id) });
  }
  res.set('Cache-Control', 'no-store').json({ total: albums.reduce((t, a) => t + a.unread, 0), albums });
}
