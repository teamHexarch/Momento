import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Album } from '../models/Album.js';
import { Membership } from '../models/Membership.js';
import { HttpError } from '../utils/httpError.js';
import { hasGroupAccess } from './groupAccess.js';

import { notify } from './notifyService.js';

async function grant(album, user, via) {
  try {
    await Membership.updateOne({ album: album._id, user }, { $setOnInsert: { role: 'guest', via } }, { upsert: true });
  } catch (err) { if (err.code !== 11000) throw err; }
  await Membership.updateOne({ album: album._id, user, via: 'group' }, { $set: { via } });
}

// Inside the sharing zone: within its radius plus the phone's own uncertainty (coords.accuracy), but at most
// MAX_GPS_ALLOWANCE (100 m) extra. Indoors (a hall, a house) GPS is often 30-100 m out, so a guest standing at the
// venue isn't turned away; a very vague fix can't stretch the circle by more than 100 m.
export const MAX_GPS_ALLOWANCE = 100;
export function inZone(point, zone) {
  if (!point || !['lat','lng','accuracy','timestamp'].every(k => Number.isFinite(point[k]))) return false;
  const { lat, lng, accuracy, timestamp } = point;
  const age = Date.now() - timestamp;
  if (age < -5000 || age > 120000 || Math.abs(lat) > 90 || Math.abs(lng) > 180 || accuracy < 0) return false;
  const rad = Math.PI / 180;
  const h = Math.sin((lat-zone.lat)*rad/2)**2 + Math.cos(lat*rad)*Math.cos(zone.lat*rad)*Math.sin((lng-zone.lng)*rad/2)**2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(h,1))) <= zone.radiusM + Math.min(accuracy, MAX_GPS_ALLOWANCE);
}

// ---- The venue PIN ----
// 6 characters from letters and digits that can't be confused (no 0/O, 1/I/L). Typed in any case.
const PIN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newVenuePin() {
  return Array.from(crypto.randomBytes(6), (b) => PIN_ALPHABET[b % PIN_ALPHABET.length]).join('');
}
const pinOf = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function pinMatches(typed, pin) {
  const a = Buffer.from(pinOf(typed).padEnd(6, '#').slice(0, 6)), b = Buffer.from(String(pin || '######'));
  return a.length === b.length && crypto.timingSafeEqual(a, b) && !!pin;
}
// Wrong PINs: 5 per person per album in 15 minutes, then a wait (the join route also limits every attempt)
const pinTries = new Map();
function pinLocked(key) {
  const now = Date.now(), t = (pinTries.get(key) || []).filter((at) => now - at < 15 * 60000);
  pinTries.set(key, t);
  return t.length >= 5;
}
const pinFailed = (key) => pinTries.set(key, [...(pinTries.get(key) || []), Date.now()]);

// The admission flow, in order: the invite (code, link or public event) has already been found by
// the caller → already a member? → is joining open (host switch + deadline, on server time)? →
// does this album check location, and is the guest in range? → otherwise a pending request the host
// approves or declines. Approved, location and invite admissions each save one membership.
export async function admit(album, user, body = {}) {
  const member = await Membership.findOne({ album: album._id, user: user._id });
  if (member && member.via !== 'group') return { already: true };
  if (await hasGroupAccess(user._id, album)) {
    await Membership.updateOne({ album: album._id, user: user._id }, { $set: { via: 'invite' }, $setOnInsert: { role: 'guest' } }, { upsert: true });
    return { already: true };
  }
  const previous = album.requests.find(r => r.user.equals(user._id));
  // A host's decline sticks: the person stays out, and the album's photos stay private
  if (previous?.status === 'declined') throw new HttpError(403, 'The host declined your request.');
  const deadline = album.joinDeadline ?? album.endsAt ?? new Date(Date.parse(album.date) + 31 * 86400000);
  const closed = !album.joiningOpen || (deadline && deadline <= new Date());
  // A public event (on the Events map) lets anyone in while joining is open: no location check and no
  // waiting for the host
  const needsLocation = album.visibility !== 'public' && !album.group && album.locationRequired && !!album.zone?.radiusM;
  // The venue PIN instead of the location (a phone that won't share it): right PIN = at the venue
  let byPin = false;
  if (!closed && needsLocation && body.venuePin !== undefined) {
    const key = `${album._id}:${user._id}`;
    if (pinLocked(key)) throw new HttpError(429, 'Too many wrong venue PINs. Wait 15 minutes, or ask the host.', 'VENUE_PIN_LOCKED');
    if (!pinMatches(body.venuePin, album.venuePin)) {
      pinFailed(key);
      throw new HttpError(400, 'That venue PIN isn’t right. Check it with the host.', 'VENUE_PIN_WRONG');
    }
    byPin = true;
  }
  if (!closed && needsLocation && !byPin && body.location === undefined) throw new HttpError(409, 'Check your location to join this event.', 'check-location');
  if (closed || (needsLocation && !byPin && !inZone(body.location, album.zone))) {
    await Album.updateOne({ _id: album._id, 'requests.user': { $ne: user._id } },
      { $push: { requests: { user: user._id, name: user.name || 'Guest', status: 'pending', at: new Date() } } });
    // The host hears someone is waiting
    await notify({ user: album.host, type: 'request', actor: user._id, album: album._id });
    return { pending: true };
  }
  // Someone still waiting who now passes the checks (joining reopened, or they reached the venue)
  // gets in straight away, and their request leaves the host's list
  await grant(album, user._id, byPin ? 'venue-pin' : needsLocation ? 'location' : 'invite');
  await notify({ user: album.host, type: 'joined', actor: user._id, album: album._id });
  if (previous) await Album.updateOne({ _id: album._id }, { $pull: { requests: { user: user._id, status: { $in: ['pending', 'approving'] } } } });
  return { already: false };
}

export async function reviewRequest(req, res) {
  const { id, guest } = req.params;
  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(guest)) throw new HttpError(404, 'This request is no longer pending.');
  const approve = req.body?.approve;
  if (typeof approve !== 'boolean') throw new HttpError(400, 'Choose approve or decline.');
  const filter = { _id: id, host: req.user._id, requests: { $elemMatch: { user: guest,
    status: approve ? { $in: ['pending','approving'] } : 'pending' } } };
  const album = await Album.findOneAndUpdate(filter, { $set: { 'requests.$.status': approve ? 'approving' : 'declined' } });
  if (!album) throw new HttpError(404, 'This request is no longer pending.');
  if (approve) {
    await grant(album, guest, 'approval');
    await notify({ user: guest, type: 'approved', actor: req.user._id, album: album._id });
    await Album.updateOne({ _id: id }, { $pull: { requests: { user: guest, status: 'approving' } } });
  }
  res.json({ ok: true });
}

export async function eventPolicy(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Event not found.');
  const update = {};
  for (const key of ['joiningOpen','locationRequired']) {
    if (typeof req.body?.[key] === 'boolean') update[key] = req.body[key];
  }
  // A new venue PIN (the old one stops working at once), e.g. if it was shared too widely
  if (req.body?.newVenuePin === true) update.venuePin = newVenuePin();
  if ('joinDeadline' in (req.body || {})) {
    const date = req.body.joinDeadline ? new Date(req.body.joinDeadline) : null;
    if (date && !Number.isFinite(+date)) throw new HttpError(400, 'Choose a valid deadline.');
    update.joinDeadline = date;
  }
  const result = await Album.updateOne({ _id: req.params.id, host: req.user._id }, { $set: update });
  if (!result.matchedCount) throw new HttpError(404, 'Event not found.');
  res.json({ ok: true, ...(update.venuePin && { venuePin: update.venuePin }) });
}
