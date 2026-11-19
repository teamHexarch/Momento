import { admit } from '../services/eventAdmission.js';
import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { Album } from '../models/Album.js';
import { Membership } from '../models/Membership.js';
import { Photo } from '../models/Photo.js';
import { HttpError } from '../utils/httpError.js';
import { albumLifecycle, distanceM } from './albumController.js';
import { hostCover } from '../services/coverService.js';

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

// GET /api/events/nearby?lat=&lng=[&radius=<metres>|&km=<km>]   (no login needed)
// The scan: public events within 1 km (radius=1000, the default) or 5 km (radius=5000), plus any
// event whose own sharing zone you're standing in even if its venue is further. Sorted live first,
// then nearest. Each comes with its distance and its compass direction from you, for a radar view.
// Your position comes from your phone (the browser's location, free); distances are worked out
// here, so no paid map or location service is involved.
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
function bearing(from, to) {
  const r = Math.PI / 180, dLng = (to.lng - from.lng) * r;
  const y = Math.sin(dLng) * Math.cos(to.lat * r);
  const x = Math.cos(from.lat * r) * Math.sin(to.lat * r) - Math.sin(from.lat * r) * Math.cos(to.lat * r) * Math.cos(dLng);
  return (Math.atan2(y, x) / r + 360) % 360;
}
export async function nearby(req, res) {
  const at = readPoint(req.query);
  // Only two sizes: 1 km, or 5 km for anything bigger (radius in metres, or the older km)
  const want = Number(req.query.radius) || (Number(req.query.km) || 1) * 1000;
  const radiusM = want > 1000 ? 5000 : 1000;
  // A box first (cheap, on the zone's centre), then the exact distance. The box also reaches 10 km
  // further, the biggest a sharing zone can be, so a zone you're standing in is never missed
  const km = radiusM / 1000 + 10;
  const dLat = km / 111, dLng = km / (111 * Math.max(.2, Math.cos(at.lat * Math.PI / 180)));
  const albums = await Album.find({
    visibility: 'public',
    endsAt: { $gt: new Date() },
    'zone.lat': { $gte: at.lat - dLat, $lte: at.lat + dLat },
    'zone.lng': { $gte: at.lng - dLng, $lte: at.lng + dLng },
  }).limit(300).populate('host', 'name isMinor');
  const found = albums
    .map((a) => ({ a, distanceM: Math.round(distanceM(at, a.zone)) }))
    .filter((x) => x.distanceM <= radiusM || x.distanceM <= (x.a.zone.radiusM || 0));
  const ids = found.map((x) => x.a._id);
  const [stats, members, mine] = await Promise.all([
    Photo.aggregate([
      { $match: { album: { $in: ids }, deletedAt: null } },
      // Most reacted-to first (bookmarks are private, so they don't count)
      { $addFields: { score: { $size: { $ifNull: ['$reactions', []] } } } },
      { $group: { _id: '$album', photos: { $sum: 1 }, pics: { $topN: { n: PREVIEWS, sortBy: { score: -1, createdAt: -1 }, output: '$_id' } } } },
    ]),
    Membership.aggregate([{ $match: { album: { $in: ids } } }, { $group: { _id: '$album', n: { $sum: 1 } } }]),
    req.user ? Membership.find({ album: { $in: ids }, user: req.user._id }, 'album') : [],
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
      distanceM: d, inside: d <= a.zone.radiusM, inScan: d <= radiusM,
      bearing: Math.round(bearing(at, a.zone)), direction: d < 30 ? 'here' : COMPASS[Math.round(bearing(at, a.zone) / 45) % 8],
      photos: s?.photos || 0, pics: joined.has(String(a.id)) ? (s?.pics || []).map(thumbnailUrl) : [], guests: countOf.get(String(a.id)) || 0,
      hostName: a.host?.isMinor ? undefined : firstName(a.host?.name), joined: joined.has(String(a.id)),
      cover: hostCover(a),
    };
  }).sort((x, y) => (y.live - x.live) || (x.distanceM - y.distanceM));
  res.json({ events, scan: { lat: at.lat, lng: at.lng, radiusM, count: events.filter((e) => e.inScan).length }, signedIn: !!req.user });
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

