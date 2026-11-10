import mongoose from 'mongoose';
import { Album } from '../models/Album.js';
import { Membership } from '../models/Membership.js';
import { HttpError } from '../utils/httpError.js';
import { hasGroupAccess } from './groupAccess.js';

async function grant(album, user, via) {
  try {
    await Membership.updateOne({ album: album._id, user }, { $setOnInsert: { role: 'guest', via } }, { upsert: true });
  } catch (err) { if (err.code !== 11000) throw err; }
  await Membership.updateOne({ album: album._id, user, via: 'group' }, { $set: { via } });
}

function inZone(point, zone) {
  if (!point || !['lat','lng','accuracy','timestamp'].every(k => Number.isFinite(point[k]))) return false;
  const { lat, lng, accuracy, timestamp } = point;
  const age = Date.now() - timestamp;
  if (age < -5000 || age > 120000 || Math.abs(lat) > 90 || Math.abs(lng) > 180 || accuracy < 0 || accuracy > 200) return false;
  const rad = Math.PI / 180;
  const h = Math.sin((lat-zone.lat)*rad/2)**2 + Math.cos(lat*rad)*Math.cos(zone.lat*rad)*Math.sin((lng-zone.lng)*rad/2)**2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(h,1))) <= zone.radiusM + accuracy;
}

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
  // A host's decline sticks: the person stays out, and the album's photos and chat stay private
  if (previous?.status === 'declined') throw new HttpError(403, 'The host declined your request.');
  const deadline = album.joinDeadline ?? album.endsAt ?? new Date(Date.parse(album.date) + 31 * 86400000);
  const closed = !album.joiningOpen || (deadline && deadline <= new Date());
  const needsLocation = !album.group && album.locationRequired && !!album.zone?.radiusM;
  if (!closed && needsLocation && body.location === undefined) throw new HttpError(409, 'Check your location to join this event.', 'check-location');
  if (closed || (needsLocation && !inZone(body.location, album.zone))) {
    await Album.updateOne({ _id: album._id, 'requests.user': { $ne: user._id } },
      { $push: { requests: { user: user._id, name: user.name || 'Guest', status: 'pending' } } });
    return { pending: true };
  }
  // Someone still waiting who now passes the checks (joining reopened, or they reached the venue)
  // gets in straight away, and their request leaves the host's list
  await grant(album, user._id, needsLocation ? 'location' : 'invite');
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
    await Album.updateOne({ _id: id }, { $pull: { requests: { user: guest, status: 'approving' } } });
  }
  res.json({ ok: true });
}

export async function eventPolicy(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Event not found.');
  const update = {};
  for (const key of ['joiningOpen','locationRequired','chatEnabled']) {
    if (typeof req.body?.[key] === 'boolean') update[key] = req.body[key];
  }
  if ('joinDeadline' in (req.body || {})) {
    const date = req.body.joinDeadline ? new Date(req.body.joinDeadline) : null;
    if (date && !Number.isFinite(+date)) throw new HttpError(400, 'Choose a valid deadline.');
    update.joinDeadline = date;
  }
  const result = await Album.updateOne({ _id: req.params.id, host: req.user._id }, { $set: update });
  if (!result.matchedCount) throw new HttpError(404, 'Event not found.');
  res.json({ ok: true });
}
