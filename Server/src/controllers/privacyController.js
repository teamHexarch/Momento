import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { User } from '../models/User.js';
import { Album } from '../models/Album.js';
import { Membership } from '../models/Membership.js';
import { Photo } from '../models/Photo.js';
import { Group } from '../models/Group.js';
import { GroupMember } from '../models/GroupMember.js';
import { Notification } from '../models/Notification.js';
import { PushSubscription } from '../models/PushSubscription.js';
import { Consent } from '../models/Consent.js';
import { Report } from '../models/Report.js';
import { ModerationDecision } from '../models/ModerationDecision.js';
import { UploadCheck } from '../models/UploadCheck.js';
import { audit, ipHash } from '../services/auditService.js';
import { countExport } from '../services/securityAlerts.js';
import { currentPolicies, hasAccepted } from '../middleware/authMiddleware.js';
import { HttpError } from '../utils/httpError.js';

// ---- GET /api/auth/me/export  Everything Momento stores about you, as one JSON file ----
// The photo files themselves aren't inside (they can be big): each photo has its download link, and
// albums can be downloaded whole from the album page.
export async function exportData(req, res) {
  const u = await User.findById(req.user._id).select('+sessions');
  const uid = u._id;
  const photoUrl = (id) => `${config.publicUrl}/api/photos/${id}`;
  const [hosted, memberships, uploaded, reacted, bookmarked, groups, notifications, consents, reports, decisions, pushDevices] = await Promise.all([
    Album.find({ host: uid }).lean(),
    Membership.find({ user: uid }).populate('album', 'name date').lean(),
    Photo.find({ uploader: uid }).populate('album', 'name').lean(),
    Photo.find({ 'reactions.user': uid }, 'album reactions').lean(),
    Photo.find({ 'likeLog.user': uid }, 'album likeLog').lean(),
    GroupMember.find({ user: uid }).lean(),
    Notification.find({ user: uid }).sort({ at: -1 }).limit(1000).lean(),
    Consent.find({ user: uid }).lean(),
    Report.find({ reporter: uid }).lean(),
    ModerationDecision.find({ user: uid }).lean(),
    PushSubscription.countDocuments({ user: uid }),
  ]);
  const groupNames = new Map((await Group.find({ _id: { $in: groups.map((g) => g.group) } }, 'name').lean()).map((g) => [String(g._id), g.name]));
  const data = {
    about: 'Everything Momento stores about you, as of exportedAt. Photo files are linked (log in to open them).',
    exportedAt: new Date(),
    account: {
      ...u.toPublic(), createdAt: u.createdAt, updatedAt: u.updatedAt, lastLoginAt: u.lastLoginAt,
      isMinor: u.isMinor, ageConfirmedAt: u.ageConfirmedAt, strikes: u.strikes, suspendedAt: u.suspendedAt,
      savedAlbums: (u.savedAlbums || []).map(String),
    },
    logins: (u.sessions || []).map((s) => ({ device: s.deviceName, loggedInAt: s.loggedInAt, expiresAt: s.expiresAt })),
    pushNotificationDevices: pushDevices,
    consents: consents.map((c) => ({ policy: c.policy, version: c.version, at: c.at, via: c.via })),
    albumsYouHost: hosted.map((a) => ({
      id: String(a._id), name: a.name, date: a.date, place: a.place, visibility: a.visibility, code: a.code,
      startsAt: a.startsAt, endsAt: a.endsAt, venue: a.venue?.address, zone: a.zone, createdAt: a.createdAt,
      requests: (a.requests || []).map((r) => ({ user: String(r.user), status: r.status, at: r.at })),
    })),
    albumsYouAreIn: memberships.filter((m) => m.album).map((m) => ({ id: String(m.album._id), name: m.album.name, role: m.role, joinedVia: m.via, joinedAt: m.createdAt, photosYouHid: (m.hidden || []).map(String) })),
    photosYouAdded: uploaded.map((p) => ({
      id: String(p._id), album: p.album ? { id: String(p.album._id), name: p.album.name } : null, addedAt: p.createdAt,
      fileName: p.originalName, type: p.mimeType, bytes: p.size, inBin: !!p.deletedAt, download: `${photoUrl(p._id)}/download`,
    })),
    yourReactions: reacted.map((p) => ({ photo: String(p._id), album: String(p.album), emoji: p.reactions.find((r) => r.user?.equals(uid))?.emoji })),
    yourBookmarks: bookmarked.map((p) => ({ photo: String(p._id), album: String(p.album), at: p.likeLog.find((l) => l.user?.equals(uid))?.at })),
    groups: groups.map((g) => ({ id: String(g.group), name: groupNames.get(String(g.group)) || null, role: g.role, joinedAt: g.createdAt })),
    notifications: notifications.map((n) => ({ type: n.type, at: n.at, read: n.read, album: n.album && String(n.album), photo: n.photo && String(n.photo) })),
    reportsYouMade: reports.map((r) => ({ photo: String(r.photo), reason: r.reason, note: r.note, status: r.status, at: r.createdAt })),
    automaticDecisions: decisions.map((d) => ({ id: String(d._id), kind: d.kind, decision: d.decision, reason: d.reason, model: d.model, at: d.at, status: d.status })),
  };
  await audit('data.exported', { req });
  countExport();
  res.set('Content-Disposition', 'attachment; filename="momento-my-data.json"');
  res.json(data);
}

// ---- Terms and Privacy Policy ----
// GET  /api/auth/consent  → { current: { tos, privacy }, accepted: { tos, privacy }, upToDate, required }
// POST /api/auth/consent  { tos, privacy } (the versions shown) or { accept: true } (the current ones)
export function consentStatus(req, res) {
  const u = req.user;
  res.json({ current: currentPolicies(), accepted: { tos: u.accepted?.tos || null, privacy: u.accepted?.privacy || null }, upToDate: hasAccepted(u), required: config.policies.enforce });
}
export async function recordConsent(user, req, via, versions = currentPolicies()) {
  const now = new Date(), hash = ipHash(req?.ip);
  for (const policy of ['tos', 'privacy']) {
    await Consent.updateOne({ user: user._id, policy, version: versions[policy] }, { $setOnInsert: { at: now, ipHash: hash, via } }, { upsert: true });
  }
  await User.updateOne({ _id: user._id }, { $set: { accepted: { tos: versions.tos, privacy: versions.privacy } } });
}
export async function acceptPolicies(req, res) {
  const current = currentPolicies();
  const b = req.body || {};
  // Only the current versions can be accepted (an old page can't accept a policy that was replaced)
  if (!(b.accept === true || (b.tos === current.tos && b.privacy === current.privacy))) {
    throw new HttpError(409, 'The Terms or Privacy Policy changed. Reload the page to see the current version.', 'policy-changed', { policies: current });
  }
  await recordConsent(req.user, req, 'update');
  await audit('consent.accepted', { req, meta: current });
  res.json({ accepted: current, upToDate: true });
}

// ---- One-click unsubscribe (link in every email that isn't about the account itself) ----
// GET or POST /api/auth/unsubscribe?u=<user id>&k=<closing|recap|photos>&s=<signature>
// The signature proves the link came from us, so nobody can switch off someone else's emails.
const UNSUB_KINDS = new Set(['closing', 'recap', 'photos']);
const unsubKey = crypto.createHmac('sha256', config.jwtSecret).update('momento-unsubscribe').digest();
const signUnsub = (userId, kind) => crypto.createHmac('sha256', unsubKey).update(`${userId}:${kind}`).digest('base64url').slice(0, 32);
export const unsubscribeUrl = (user, kind) => `${config.publicUrl}/api/auth/unsubscribe?u=${user._id || user.id}&k=${kind}&s=${signUnsub(String(user._id || user.id), kind)}`;
const KIND_NAME = { closing: '“An album is about to close”', recap: 'weekly recap', photos: '“New photos in your albums”' };

export async function unsubscribe(req, res) {
  const q = { ...req.query, ...(typeof req.body === 'object' && req.body) };
  const u = String(q.u || ''), k = String(q.k || ''), s = String(q.s || '');
  const good = mongoose.isValidObjectId(u) && UNSUB_KINDS.has(k) && /^[\w-]{32}$/.test(s)
    && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(signUnsub(u, k)));
  if (good) await User.updateOne({ _id: u }, { $set: { [`notify.${k}`]: false } });
  if (good) await audit('email.unsubscribed', { req, actor: u, meta: { kind: k } });
  // A tiny page for people who opened the link (one-click unsubscribes from mail apps get the same)
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.status(good ? 200 : 400).type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Momento</title>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#2E2C3A;line-height:1.6">
<h1 style="font-size:1.4rem">${good ? 'You’re unsubscribed' : 'This link doesn’t work'}</h1>
<p>${good ? `You won’t get ${KIND_NAME[k]} emails any more. You can turn them back on in Momento’s account settings.` : 'It may have been copied incompletely. You can turn emails off in Momento’s account settings.'}</p>
<p><a href="${config.frontendUrl}/settings.html">Open settings</a></p></body>`);
}

// ---- POST /api/auth/moderation/:id/review  Ask a person to look at an automatic decision ----
// Only now does a declined picture go to staff (review.html): they're emailed the first time it's asked
export async function requestReview(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Not found.');
  if (await UploadCheck.exists({ _id: req.params.id, user: req.user._id, explicit: true })) {
    throw new HttpError(400, 'Momento’s check is sure this photo contains nudity, so it can’t be sent for review.', 'explicit');
  }
  const before = await ModerationDecision.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id, status: { $in: ['final', 'review-requested'] } },
    { $set: { status: 'review-requested' } }, { returnDocument: 'before' },
  );
  if (!before) throw new HttpError(404, 'That decision can’t be reviewed (it may have been reviewed already).');
  const d = { ...before.toObject(), id: before.id, status: 'review-requested' };
  const pending = await UploadCheck.updateOne({ _id: d._id, user: req.user._id, state: 'rejected' }, { $set: { state: 'review' } });
  await audit('moderation.review-requested', { req, target: d._id });
  if (before.status === 'final') {
    const job = await UploadCheck.findById(d._id, 'originalName').lean();
    const { tellStaffAboutReview } = await import('../services/reviewAlerts.js');
    tellStaffAboutReview({ decision: d, fileName: job?.originalName, user: req.user })
      .catch((err) => console.error(`Review request ${d.id} saved but the staff email failed: ${err.message}`));
  }
  res.json({ id: d.id, status: d.status, message: pending.modifiedCount
    ? 'A staff member will review your photo. If approved, it will appear in the album.'
    : 'Thanks. A person will look at it. If it’s allowed, you can add the same photo again.' });
}
