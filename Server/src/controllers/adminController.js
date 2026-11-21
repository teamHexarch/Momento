import { fixFileName } from './albumController.js';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Photo } from '../models/Photo.js';
import { Report } from '../models/Report.js';
import { Takedown } from '../models/Takedown.js';
import { ModerationDecision } from '../models/ModerationDecision.js';
import { UploadCheck } from '../models/UploadCheck.js';
import { Album } from '../models/Album.js';
import { ModerationCalibration } from '../models/ModerationCalibration.js';
import { activeTable, PUBLISH_BELOW, HARD_DECLINE_AT } from '../services/uploadChecks.js';
import { relearn, relearnHours } from '../services/stageOneLearning.js';
import { SecuritySetting } from '../models/SecuritySetting.js';
import { deletePhotos, openPhoto } from '../services/storageService.js';
import { sha256 } from '../services/contentSafety.js';
import { forgetSwitches } from '../services/switches.js';
import { audit } from '../services/auditService.js';
import { HttpError } from '../utils/httpError.js';

// Staff tools (all under /api/admin, staff only: everyone else gets 404). Every action is in the audit log.
const STRIKES_TO_SUSPEND = 3;
const id = (v) => { if (!mongoose.isValidObjectId(v)) throw new HttpError(404, 'Not found.'); return v; };

// ---- Reports ----
// GET /api/admin/reports[?status=open|removed|dismissed]
export async function reports(req, res) {
  const status = ['open', 'removed', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
  const rows = await Report.find({ status }).sort({ createdAt: -1 }).limit(200).lean();
  res.json({ reports: rows.map((r) => ({ id: String(r._id), photo: String(r.photo), album: String(r.album), reporter: r.reporter ? String(r.reporter) : null, source: r.source || 'user', reason: r.reason, note: r.note, status: r.status, at: r.createdAt })) });
}

// POST /api/admin/reports/:id/dismiss  Nothing wrong: the report closes, and if reports had hidden the
// photo from everyone, it comes back
export async function dismissReport(req, res) {
  const r = await Report.findById(id(req.params.id));
  if (!r) throw new HttpError(404, 'Not found.');
  await Report.updateMany({ photo: r.photo, status: 'open' }, { status: 'dismissed', decidedBy: req.user._id, decidedAt: new Date() });
  await Photo.updateOne({ _id: r.photo, flaggedAt: { $ne: null } }, { $unset: { flaggedAt: 1, auditHidden: 1, deletedAt: 1, deletedBy: 1 } });
  await audit('report.dismissed', { req, target: r.photo });
  res.json({ ok: true });
}

// ---- POST /api/admin/photos/:id/takedown  { reason, notice } ----
// Removes the photo for good (files too), records the notice, bans the file's fingerprint, closes its
// reports, and gives the uploader a strike for copyright (3 strikes suspend the account).
export async function takedown(req, res) {
  const reason = ['copyright', 'abuse', 'nudity', 'privacy', 'other'].includes(req.body?.reason) ? req.body.reason : null;
  if (!reason) throw new HttpError(400, 'Say why: copyright, abuse, nudity, privacy or other.');
  const notice = String(req.body?.notice ?? '').slice(0, 5000);
  const photo = await Photo.findById(id(req.params.id));
  if (!photo) throw new HttpError(404, 'Photo not found.');
  let hash = photo.hash;
  if (!hash) {
    const chunks = [];
    for await (const c of await openPhoto(photo.storageKey)) chunks.push(c);
    hash = sha256(Buffer.concat(chunks));
  }
  await Takedown.create({ hash, photo: photo._id, album: photo.album, uploader: photo.uploader, reason, notice, by: req.user._id });
  await deletePhotos([photo.storageKey]);
  await Photo.deleteOne({ _id: photo._id });
  await Report.updateMany({ photo: photo._id, status: 'open' }, { status: 'removed', decidedBy: req.user._id, decidedAt: new Date() });
  // Any other copy of the same file elsewhere goes too
  const copies = await Photo.find({ hash, _id: { $ne: photo._id } }, 'storageKey');
  if (copies.length) { await deletePhotos(copies.map((p) => p.storageKey)); await Photo.deleteMany({ _id: { $in: copies.map((p) => p._id) } }); }
  let strikes = null, suspended = false;
  if (reason === 'copyright' && photo.uploader) {
    const u = await User.findOneAndUpdate({ _id: photo.uploader }, { $inc: { strikes: 1 } }, { returnDocument: 'after' });
    strikes = u?.strikes ?? null;
    if (u && u.strikes >= STRIKES_TO_SUSPEND && !u.suspendedAt) {
      await User.updateOne({ _id: u._id }, { $set: { suspendedAt: new Date(), suspendedReason: `${u.strikes} copyright strikes` } });
      suspended = true;
      await audit('account.suspended', { req, target: u._id, meta: { strikes: u.strikes } });
    }
  }
  await audit('takedown', { req, target: photo._id, meta: { reason, uploader: String(photo.uploader), strikes, copies: copies.length } });
  res.json({ removed: 1 + copies.length, strikes, suspended });
}

// POST /api/admin/users/:id/unsuspend  (also clears strikes when { clearStrikes: true })
export async function unsuspend(req, res) {
  const set = { $unset: { suspendedAt: 1, suspendedReason: 1 }, ...(req.body?.clearStrikes === true && { $set: { strikes: 0 } }) };
  const r = await User.updateOne({ _id: id(req.params.id) }, set);
  if (!r.matchedCount) throw new HttpError(404, 'Not found.');
  await audit('account.unsuspended', { req, target: req.params.id });
  res.json({ ok: true });
}

// ---- Automatic decisions people asked a human to review ----
// GET /api/admin/moderation[?status=review-requested]
export async function decisions(req, res) {
  const status = ['final', 'review-requested', 'allowed', 'upheld'].includes(req.query.status) ? req.query.status : 'review-requested';
  const rows = await ModerationDecision.find({ status }).sort({ at: -1 }).limit(200).lean();
  // For the review page (review.html): which album and file each one is, and whether a private preview exists
  // (uploads waiting for a decision; refused covers and avatars were never stored)
  const ids = rows.map((d) => d._id);
  const [jobs, albums] = await Promise.all([
    UploadCheck.find({ _id: { $in: ids } }, 'originalName state').lean(),
    Album.find({ _id: { $in: rows.map((d) => d.album).filter(Boolean) } }, 'name').lean(),
  ]);
  const jobOf = new Map(jobs.map((j) => [String(j._id), j]));
  const albumName = new Map(albums.map((a) => [String(a._id), a.name]));
  res.json({ decisions: rows.map((d) => {
    const job = jobOf.get(String(d._id));
    return { id: String(d._id), user: String(d.user), kind: d.kind, model: d.model, threshold: d.threshold, scores: d.scores, reason: d.reason, status: d.status, severity: d.severity ?? null, at: d.at,
      dueDay: d.dueDay || null, album: d.album ? String(d.album) : null, albumName: (d.album && albumName.get(String(d.album))) || null, fileName: job?.originalName ? fixFileName(job.originalName) : null,
      preview: !!job && ['review', 'rejected'].includes(job.state) };
  }) });
}
// POST /api/admin/moderation/:id  { allow: true|false, severity?: 0|15|25|50|75|100 }
// Allowed: that exact file passes the check next time. The optional severity (Momento's content level) makes
// the decision usable for calibration (scripts/calibrateFromReviews.js).
const SEVERITIES = [0, 15, 25, 50, 75, 100];
export async function decide(req, res) {
  if (typeof req.body?.allow !== 'boolean') throw new HttpError(400, 'Choose approve or uphold.');
  const severity = req.body?.severity;
  if (severity !== undefined && !SEVERITIES.includes(severity)) throw new HttpError(400, 'Severity must be 0, 15, 25, 50, 75 or 100.');
  const allow = req.body?.allow === true;
  const job = await UploadCheck.findById(id(req.params.id));
  if (job) {
    const result = await UploadCheck.updateOne({ _id: job._id, state: { $in: ['review', 'rejected'] } },
      { $set: { state: allow ? 'publish' : 'rejected', due: new Date(), attempts: 0 } });
    if (!result.matchedCount) throw new HttpError(409, 'This upload is no longer awaiting a decision.');
  }
  const d = await ModerationDecision.findOneAndUpdate({ _id: id(req.params.id) }, { $set: { status: allow ? 'allowed' : 'upheld', reviewedBy: req.user._id, reviewedAt: new Date(),
    ...(severity !== undefined && { severity }) } }, { returnDocument: 'after' });
  if (!d) throw new HttpError(404, 'Not found.');
  await audit('moderation.reviewed', { req, target: d._id, meta: { allow, ...(severity !== undefined && { severity }) } });
  // The person who asked hears the answer: in their inbox and by email (only for album photos they sent for review)
  if (job && d.requestedAt) tellUploader(d, allow).catch((err) => console.error(`Review ${d.id} decided, but telling the uploader failed: ${err.message}`));
  res.json({ id: d.id, status: d.status, severity: d.severity ?? null });
}

async function tellUploader(d, allow) {
  const [{ notify }, { sendEmail }, { reviewResultHtml }, { config }] = await Promise.all([
    import('../services/notifyService.js'), import('../services/emailService.js'), import('../services/emailTemplates.js'), import('../config/env.js')]);
  await notify({ user: d.user, type: allow ? 'review-approved' : 'review-declined', album: d.album, ...(allow && { photo: d._id }) });
  const [user, album] = await Promise.all([User.findById(d.user, 'name email emailVerified deletingAt'), d.album ? Album.findById(d.album, 'name') : null]);
  if (!user?.email || user.deletingAt) return;
  await sendEmail({
    to: user.email,
    subject: allow ? 'Your photo was approved' : 'Your photo was declined',
    html: reviewResultHtml(user, album?.name, allow, `${config.frontendUrl}/albums.html${d.album ? `?album=${d.album}` : ''}`),
  });
}

// ---- What publishes on its own (stage one), and what it has learned from staff reviews ----
// GET /api/admin/moderation-status · POST /api/admin/moderation-status/relearn
async function learningStatus() {
  const { source, table } = activeTable();
  const doc = await ModerationCalibration.findById('stage-one').lean();
  const [waiting, reviewed, rated] = await Promise.all([
    ModerationDecision.countDocuments({ kind: 'photo', status: 'review-requested' }),
    ModerationDecision.countDocuments({ kind: 'photo', status: { $in: ['allowed', 'upheld'] }, reviewedBy: { $exists: true } }),
    ModerationDecision.countDocuments({ kind: 'photo', status: { $in: ['allowed', 'upheld'] }, severity: { $in: SEVERITIES } }),
  ]);
  return {
    enabled: true, source, publishBelow: PUBLISH_BELOW, hardDeclineAt: HARD_DECLINE_AT, relearnHours,
    ranges: (table[1]?.allow || []).map((b) => ({ min: b.min, max: b.max, confidence: b.confidence })),
    waiting, reviewed, rated,
    learned: doc ? { builtAt: doc.builtAt || null, reviewed: doc.reviewed ?? null, publishable: doc.publishable ?? null, albums: doc.albums ?? null,
      ranges: (doc.table?.[1]?.allow || []).length, lastAttemptAt: doc.lastAttemptAt || null, lastError: doc.lastError || null } : null,
  };
}
export async function moderationStatus(req, res) {
  res.json(await learningStatus());
}
export async function relearnNow(req, res) {
  const result = await relearn();
  await audit('moderation.relearned', { req, meta: result });
  res.json({ result, status: await learningStatus() });
}

// GET /api/admin/moderation/:id  One request: still waiting, or who reviewed it, when, and what they decided
// (the review page shows this when a staff email's link points to a photo a teammate already reviewed)
export async function decisionStatus(req, res) {
  const d = await ModerationDecision.findById(id(req.params.id)).lean();
  if (!d) throw new HttpError(404, 'Not found.');
  const [reviewer, job, album] = await Promise.all([
    d.reviewedBy ? User.findById(d.reviewedBy, 'name email').lean() : null,
    UploadCheck.findById(d._id, 'originalName').lean(),
    d.album ? Album.findById(d.album, 'name').lean() : null,
  ]);
  res.json({
    id: String(d._id), status: d.status, waiting: d.status === 'review-requested',
    decision: d.status === 'allowed' ? 'approved' : d.status === 'upheld' ? 'declined' : null,
    reviewedBy: reviewer ? (String(reviewer._id) === String(req.user._id) ? 'you' : reviewer.name || reviewer.email) : null,
    reviewedAt: d.reviewedAt || null, severity: d.severity ?? null,
    fileName: job?.originalName ? fixFileName(job.originalName) : null, albumName: album?.name || null,
  });
}

export async function moderationPreview(req, res) {
  const job = await UploadCheck.findOne({ _id: id(req.params.id), state: { $in: ['review', 'rejected'] } }).select('+files');
  if (!job?.files) throw new HttpError(404, 'Review image unavailable.');
  const big = !!job.files.previewKey;
  const stream = await openPhoto(big ? job.files.previewKey : job.files.thumbnailKey);
  res.set('Cache-Control', 'private, no-store').type(big ? (job.files.previewMimeType || 'image/jpeg') : 'webp');
  stream.on('error', () => res.destroy()).pipe(res);
}

export async function reportPreview(req, res) {
  const report = await Report.findById(id(req.params.id));
  const photo = report && await Photo.findById(report.photo);
  if (!photo?.thumbnailKey) throw new HttpError(404, 'Review image unavailable.');
  const stream = await openPhoto(photo.thumbnailKey);
  res.set('Cache-Control', 'private, no-store').type('webp');
  stream.on('error', () => res.destroy()).pipe(res);
}

// ---- Emergency switches ----
// GET /api/admin/switches · PATCH { signupsPaused?, uploadsPaused?, joinsPaused? }
const view = (s) => ({ signupsPaused: !!s?.signupsPaused, uploadsPaused: !!s?.uploadsPaused, joinsPaused: !!s?.joinsPaused, sessionsValidAfter: s?.sessionsValidAfter || null });
export async function getSwitches(req, res) {
  res.json(view(await SecuritySetting.findById('switches').lean()));
}
export async function setSwitches(req, res) {
  const $set = { updatedBy: req.user._id };
  for (const k of ['signupsPaused', 'uploadsPaused', 'joinsPaused']) if (typeof req.body?.[k] === 'boolean') $set[k] = req.body[k];
  const s = await SecuritySetting.findOneAndUpdate({ _id: 'switches' }, { $set }, { upsert: true, returnDocument: 'after' }).lean();
  forgetSwitches();
  await audit('staff.switches', { req, meta: view(s) });
  res.json(view(s));
}
// POST /api/admin/sessions/revoke-all  Signs everyone out, everywhere (you too: log in again after)
export async function revokeAll(req, res) {
  const now = new Date();
  await audit('staff.sessions-revoked', { req, meta: { at: now } });
  await SecuritySetting.updateOne({ _id: 'switches' }, { $set: { sessionsValidAfter: now, updatedBy: req.user._id } }, { upsert: true });
  const r = await User.updateMany({ 'sessions.0': { $exists: true } }, { $set: { sessions: [] } });
  forgetSwitches();
  res.json({ signedOut: r.modifiedCount, at: now });
}
