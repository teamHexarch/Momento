import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { Album } from '../models/Album.js';
import { Membership } from '../models/Membership.js';
import { Photo } from '../models/Photo.js';
import { HttpError } from '../utils/httpError.js';
import { albumLifecycle, distanceM } from './albumController.js';

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
      photos: s?.photos || 0, pics: (s?.pics || []).map(thumbnailUrl), guests: countOf.get(String(a.id)) || 0,
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
  if (albumLifecycle(album).status === 'kept') throw new HttpError(400, 'This event has finished.');
  const at = readPoint(req.body);
  const slack = Math.min(200, Math.max(0, Number(req.body?.accuracy) || 0));
  const d = distanceM(at, album.zone);
  if (d > album.zone.radiusM + slack) {
    const away = d - album.zone.radiusM;
    throw new HttpError(403, `You’re ${away >= 1000 ? (away / 1000).toFixed(1) + ' km' : Math.round(away / 10) * 10 + ' m'} outside the zone. Get closer to join.`, 'outside');
  }
  const already = await Membership.exists({ album: album._id, user: req.user._id });
  if (!already) {
    try { await Membership.create({ album: album._id, user: req.user._id, role: 'guest' }); }
    catch (err) { if (err.code !== 11000) throw err; }
  }
  res.status(already ? 200 : 201).json({ already: !!already, id: album.id });
}
