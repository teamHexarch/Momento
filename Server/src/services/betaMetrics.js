import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { Album } from '../models/Album.js';
import { Membership } from '../models/Membership.js';
import { Photo } from '../models/Photo.js';
import { User } from '../models/User.js';
import { UploadCheck } from '../models/UploadCheck.js';

// ---- The beta's numbers (28 Nov 2026) ----
// Worked out only from what Momento already stores (who joined which album, who added photos, failed uploads):
// no tracking, no cookies, no third-party analytics, and only totals leave this file (no names or emails).
//
//   Main number   guest upload rate: of the guests who joined an album, the share who added at least one photo
//                 within 48 hours of joining. Target: 30% or more.
//   Also          time from joining to the first photo (median minutes), hosts coming back (a second album within
//                 60 days of their first), and the share of uploads that failed.
const HOUR = 3600000, DAY = 24 * HOUR;
export const TARGET = 0.3;
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);

export async function betaNumbers({ days = 7, now = new Date() } = {}) {
  const from = new Date(now - days * DAY);
  // Guests count once their 48 hours are over (or right away if they already added a photo)
  const joins = await Membership.aggregate([
    { $match: { role: 'guest', createdAt: { $gte: from, $lt: now } } },
    { $lookup: { from: Photo.collection.name, let: { a: '$album', u: '$user', t: '$createdAt' }, as: 'first', pipeline: [
      { $match: { $expr: { $and: [{ $eq: ['$album', '$$a'] }, { $eq: ['$uploader', '$$u'] }, { $lte: ['$createdAt', { $add: ['$$t', 48 * HOUR] }] }] } } },
      { $sort: { createdAt: 1 } }, { $limit: 1 }, { $project: { _id: 0, createdAt: 1 } }] } },
    { $project: { album: 1, createdAt: 1, firstAt: { $first: '$first.createdAt' } } },
  ]);
  const settled = joins.filter((j) => j.firstAt || j.createdAt <= new Date(now - 48 * HOUR));
  const uploaded = settled.filter((j) => j.firstAt);
  const minutes = uploaded.map((j) => Math.max(0, (j.firstAt - j.createdAt) / 60000));

  // Per album (biggest first): guests counted, guests who added photos, the rate
  const byAlbum = new Map();
  for (const j of settled) {
    const k = String(j.album), row = byAlbum.get(k) || { guests: 0, uploaded: 0 };
    row.guests++; if (j.firstAt) row.uploaded++;
    byAlbum.set(k, row);
  }
  const names = new Map((await Album.find({ _id: { $in: [...byAlbum.keys()] } }, 'name kind startsAt').lean()).map((a) => [String(a._id), a]));
  const albums = [...byAlbum.entries()].map(([id, r]) => ({ id, name: names.get(id)?.name || '(deleted album)', kind: names.get(id)?.kind || (names.get(id)?.startsAt ? 'event' : 'album'),
    guests: r.guests, uploaded: r.uploaded, rate: pct(r.uploaded, r.guests) })).sort((a, b) => b.guests - a.guests).slice(0, 20);

  // Hosts coming back: hosts whose first album was made 60+ days ago and inside the window's reach (the last 180 days)
  const firsts = await Album.aggregate([
    { $group: { _id: '$host', first: { $min: '$createdAt' }, all: { $push: '$createdAt' } } },
    { $match: { first: { $lte: new Date(now - 60 * DAY), $gte: new Date(now - 180 * DAY) } } },
  ]);
  const returned = firsts.filter((h) => h.all.some((t) => t > h.first && t <= new Date(h.first.getTime() + 60 * DAY))).length;

  // Uploads in the window: published photos, plus uploads that were declined or failed
  const [photos, failed, declined, newHosts] = await Promise.all([
    Photo.countDocuments({ createdAt: { $gte: from, $lt: now } }),
    UploadCheck.countDocuments({ state: 'failed', createdAt: { $gte: from, $lt: now } }),
    UploadCheck.countDocuments({ state: 'rejected', createdAt: { $gte: from, $lt: now } }),
    Album.countDocuments({ createdAt: { $gte: from, $lt: now } }),
  ]);

  return {
    window: { from, to: now, days },
    guestUploadRate: { value: pct(uploaded.length, settled.length), target: TARGET * 100, guests: settled.length, uploaded: uploaded.length,
      waiting: joins.length - settled.length, met: settled.length ? uploaded.length / settled.length >= TARGET : null },
    minutesToFirstPhoto: { median: minutes.length ? Math.round(median(minutes)) : null },
    hostsReturning: { value: pct(returned, firsts.length), hosts: firsts.length, returned },
    uploads: { total: photos + failed + declined, published: photos, declined, failed, failedRate: pct(failed, photos + failed + declined) },
    albumsCreated: newHosts,
    albums,
  };
}

// ---- Once a week (Monday, server time): the numbers by email to the team inbox ----
export async function weeklyBetaEmail(now = new Date()) {
  if (now.getDay() !== 1) return null;
  const week = now.toISOString().slice(0, 10);
  const JobState = mongoose.models.JobState;
  if (!JobState) return null;
  const claimed = (await JobState.updateOne({ _id: 'beta-numbers', at: { $lt: new Date(week) } }, { at: now })).modifiedCount === 1
    || (!(await JobState.exists({ _id: 'beta-numbers' })) && await JobState.create({ _id: 'beta-numbers', at: now }).then(() => true, () => false));
  if (!claimed) return null;
  const n = await betaNumbers({ days: 7, now });
  const { sendTeamMail } = await import('./teamMail.js');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const g = n.guestUploadRate;
  const row = (k, v) => `<tr><td style="padding:6px 12px 6px 0;color:#5C596B">${k}</td><td style="padding:6px 0;font-weight:600">${v}</td></tr>`;
  await sendTeamMail({
    group: 'system', kind: 'beta-numbers',
    title: `Beta numbers · guest upload rate ${g.value == null ? 'n/a' : g.value + '%'} (target ${g.target}%)`,
    html: `<table>${[
      row('Guest upload rate (main number)', g.value == null ? 'no guests yet' : `${g.value}% (${g.uploaded} of ${g.guests} guests) ${g.met ? '✅ on target' : '❌ below target'}`),
      row('Minutes from joining to first photo (median)', n.minutesToFirstPhoto.median ?? 'n/a'),
      row('Hosts coming back within 60 days', n.hostsReturning.value == null ? 'not enough history yet' : `${n.hostsReturning.value}% (${n.hostsReturning.returned} of ${n.hostsReturning.hosts})`),
      row('Uploads that failed', n.uploads.failedRate == null ? 'no uploads' : `${n.uploads.failedRate}% (${n.uploads.failed} of ${n.uploads.total})`),
      row('New albums and events', n.albumsCreated)].join('')}</table>
      ${n.albums.length ? `<p style="margin-top:16px">Busiest albums:</p><ul>${n.albums.slice(0, 8).map((a) => `<li>${esc(a.name)}: ${a.uploaded} of ${a.guests} guests added photos (${a.rate}%)</li>`).join('')}</ul>` : ''}
      <p style="color:#8A8697;font-size:13px">Last 7 days. Totals only, worked out from Momento's own records: no tracking. Full view on the staff page.</p>`,
    data: { rate: g.value, guests: g.guests, uploaded: g.uploaded, medianMinutes: n.minutesToFirstPhoto.median, failedRate: n.uploads.failedRate, albums: n.albumsCreated },
  });
  return { sent: 1 };
}

// ---- The day after an event: two questions to its host (replies go to the team inbox) ----
// Once per event, 12 to 72 hours after it closed; not for hosts who turned these emails off.
export async function hostFeedback(now = new Date()) {
  const due = await Album.find({ endsAt: { $lte: new Date(now - 12 * HOUR), $gt: new Date(now - 72 * HOUR) }, feedbackAskedAt: null }).limit(50);
  const { sendEmail } = await import('./emailService.js');
  const { hostFeedbackHtml } = await import('./emailTemplates.js');
  const { unsubscribeUrl } = await import('../controllers/privacyController.js');
  let sent = 0;
  for (const a of due) {
    const claimed = await Album.findOneAndUpdate({ _id: a._id, feedbackAskedAt: null }, { feedbackAskedAt: now });
    if (!claimed) continue;
    const host = await User.findOne({ _id: a.host, emailVerified: true, 'notify.feedback': { $ne: false } }, 'name email').lean();
    if (!host) continue;
    const [guests, uploaders] = await Promise.all([
      Membership.countDocuments({ album: a._id, role: 'guest' }),
      Photo.distinct('uploader', { album: a._id, uploader: { $ne: a.host } }).then((x) => x.length),
    ]);
    const unsubscribe = unsubscribeUrl(host, 'feedback');
    try {
      await sendEmail({ to: host.email, replyTo: config.support.inbox, subject: `How did ${a.name} go?`, html: hostFeedbackHtml(host, { name: a.name, link: `${config.frontendUrl}/albums?album=${a.id}` }, { guests, uploaders }, unsubscribe), unsubscribe });
      sent++;
    } catch (err) { console.error(`Host feedback email failed: ${err.message}`); }
  }
  return sent;
}
