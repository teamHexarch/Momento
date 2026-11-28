import { randomUUID } from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import { UploadCheck } from '../models/UploadCheck.js';
import { ModerationDecision } from '../models/ModerationDecision.js';
import { Photo } from '../models/Photo.js';
import { Album } from '../models/Album.js';
import { User } from '../models/User.js';
import { Membership } from '../models/Membership.js';
import { GroupMember } from '../models/GroupMember.js';
import { notifyPhotos } from './notifyService.js';
import { scan, checkIsOff, isAllowedFile } from './nsfwService.js';
import * as rekognition from './rekognitionService.js';
import { isBanned } from './contentSafety.js';
import { storePhoto, openPhoto, deletePhoto, removeFile } from './storageService.js';
import { sanitizePhoto } from './imageService.js';

// ---- The nudity check for album photos: AWS Rekognition (services/rekognitionService.js) ----
// Every album upload is saved privately first (uploadIntake.js) and queued here. The API runs the queue itself.
// For each photo:
//   1. its location data is removed and its previews made (sanitizePhoto);
//   2. Rekognition scores its preview, and the level decides:
//        0-75  published at once (from level 25, only if nobody in it may be under 18: the minors check below)
//        85/95 private; the uploader can ask for a review (a level the check is very sure of has no review)
//        100   private for good: no Request review, and staff can't publish it
//   3. a declined photo stays private. The uploader sees "Declined" with a Request review button
//      (privacyController.requestReview). Only then does it go to staff (review.html), who are emailed about it.
//      A declined photo nobody asks about is deleted after 30 days (expireRefusals).
// A photo is never published because the check failed: it's tried again for about 3 hours, then declined.

export const MODEL_NAME = rekognition.MODEL_NAME;

// What happens to a photo: { action: 'allow' | 'decline', explicit?, staff?, sure?, level }
export function routeScore(scores) {
  const level = Number(scores?.level);
  if (scores?.engine !== 'rekognition' || !rekognition.LEVELS.includes(level)) return { action: 'decline' };   // no usable answer: never publish
  const action = rekognition.actionOf(level);
  if (action === 'publish') return { action: 'allow', level };
  if (action === 'staff') return { action: 'decline', staff: true, level };
  // explicit: no review possible (level 100, or 85/95 when the check is very sure: rekognition.isSure)
  const sure = action === 'private' && rekognition.isSure(scores);
  return { action: 'decline', explicit: action === 'locked' || sure, level, ...(sure && { sure: true }) };
}

export async function queueUpload(album, user, hash, originalName, file) {
  const key = { album, user, hash };
  // Published files are deduplicated by the existing Photo query. Permit re-upload after deletion.
  await UploadCheck.deleteOne({ ...key, state: { $in: ['published', 'failed'] } });
  const existing = await UploadCheck.findOne(key);
  if (existing) return existing;
  try {
    const job = await UploadCheck.create({ ...key, originalName, rawKey: file.rawKey });
    file.queued = true;
    return job;
  }
  catch (error) {
    if (error.code === 11000) return UploadCheck.findOne(key).orFail();
    throw error;
  }
}

export async function discardChecks(filter) {
  for await (const row of UploadCheck.find(filter, '_id').cursor()) {
    const job = await UploadCheck.findOneAndUpdate({ ...filter, _id: row._id }, { $set: { state: 'discarding' }, $unset: { claim: 1 } },
      { returnDocument: 'after' }).select('+files +rawKey');
    if (!job) continue;
    if (job.rawKey) await removeFile(job.rawKey);
    if (job.files && !await Photo.exists({ _id: job._id, storageKey: job.files.storageKey })) await deletePhoto(job.files.storageKey);
    await UploadCheck.deleteOne({ _id: job._id });
  }
}

// Declined photos nobody asked about (or staff declined) are deleted 30 days after the last change
export async function expireRefusals() {
  const old = await UploadCheck.find({ state: 'rejected', updatedAt: { $lt: new Date(Date.now() - 30 * 86400000) } }, '_id').limit(20);
  for (const job of old) await discardChecks({ _id: job._id, state: 'rejected' });
  await discardChecks({ state: 'discarding' });
}

// Rekognition's scores for one image (the photo's preview)
export async function classify(image) {
  // Check switched off: every photo passes, as it always has
  if (checkIsOff()) return { engine: 'rekognition', version: rekognition.SCORE_VERSION, labels: [], level: 0, drivers: [] };
  const result = await scan(image);
  if (!result) throw new Error('The nudity check is unavailable');
  return result;
}

// The minors check: { minor, ages } for a photo that would publish at level 25 or more, null otherwise (or when the
// check is off). Throws when Rekognition can't answer, so the photo is tried again rather than published.
export async function minorsCheck(image, level) {
  if (checkIsOff() || !(level >= rekognition.MINORS_CHECK_FROM)) return null;
  return rekognition.checkAges(image);
}

async function publish(job) {
  const album = await Album.findById(job.album, 'group');
  if (!album || !await User.exists({ _id: job.user, deletingAt: null }) || await isBanned(job.hash)) {
    await discardChecks({ _id: job._id });
    return;
  }
  const result = await Photo.updateOne({ _id: job._id }, { $setOnInsert: {
    album: job.album, uploader: job.user, hash: job.hash, originalName: job.originalName, ...job.files,
  } }, { upsert: true });
  await UploadCheck.updateOne({ _id: job._id, claim: job.claim }, {
    $set: { state: 'published', expires: new Date(Date.now() + 86400000) }, $unset: { files: 1, claim: 1 },
  });
  if (result.upsertedCount) {
    const members = await Membership.find({ album: job.album, via: { $ne: 'group' } }, 'user');
    const group = album.group ? await GroupMember.find({ group: album.group }, 'user') : [];
    await notifyPhotos({ users: [...members, ...group].map(m => m.user), actor: job.user, album: job.album, count: 1, photoIds: [job.id] });
  }
}

// Declined: private, and recorded. If the check was unsure, the uploader can ask a person to look (status 'final'
// until they do); level 100, or a level the check is very sure of, has no review (explicit: true)
async function decline(job, owns, { scores, reason, entry, explicit = false, staff = false }) {
  const level = scores?.engine === 'rekognition' ? scores.level : undefined;
  await ModerationDecision.updateOne({ _id: job._id }, { $setOnInsert: {
    user: job.user, album: job.album, hash: job.hash, kind: 'photo', model: MODEL_NAME, threshold: rekognition.PUBLISH_MAX,
    ...(scores && { scores }), ...(level !== undefined && { autoLevel: level }), status: 'final', reason,
  } }, { upsert: true });
  await UploadCheck.updateOne(owns, { $set: { state: staff ? 'review' : 'rejected', attempts: 0, explicit }, $unset: { claim: 1 },
    ...(entry && { $push: { history: entry } }) });
  if (staff) await holdForStaff(job);
}

// Straight to staff, as if the uploader had asked (privacyController.requestReview): due 2 working days after the
// upload, and staff are emailed with a link to it. Used by the minors check (someone in it may be under 18).
async function holdForStaff(job) {
  const { dueDay } = await import('../utils/workingDays.js');
  const before = await ModerationDecision.findOneAndUpdate({ _id: job._id, status: 'final' },
    { $set: { status: 'review-requested', requestedAt: new Date(), dueDay: dueDay(job.createdAt || new Date()) } }, { returnDocument: 'after' });
  if (!before) return;
  const user = await User.findById(job.user, 'name email');
  const { tellStaffAboutReview } = await import('./reviewAlerts.js');
  tellStaffAboutReview({ decision: { ...before.toObject(), id: before.id }, fileName: job.originalName, user })
    .catch((err) => console.error(`Photo ${job.id} is held for staff, but the staff email failed: ${err.message}`));
}

// One step of the queue. step 0: publish approved photos; step 1: check new ones. Returns whether it did anything.
// only: this one job (checkNow), instead of the next one due
export async function processCheck(step, infer = classify, only, ages = minorsCheck) {
  const claim = randomUUID();
  const job = await UploadCheck.findOneAndUpdate({
    ...(only && { _id: only }), state: step === 0 ? 'publish' : 'checking', due: { $lte: new Date() },
  }, { $set: { claim, due: new Date(Date.now() + 5 * 60000) } }, { sort: { due: 1 }, returnDocument: 'after' }).select('+files +rawKey');
  if (!job) return false;
  const owns = { _id: job._id, claim };
  // How long each step took, logged once per photo (to see where an upload's time goes)
  const started = Date.now(), times = {};
  const lap = (name, since) => { times[name] = Date.now() - since; };
  try {
    if (!step) { await publish(job); return true; }
    // The new preview, kept in memory, and its check started at once (in step with storing the files) rather than
    // after the files are stored and the preview read back from storage
    let preview = null, early = null;
    if (!job.files) {
      let t = Date.now();
      const raw = await buffer(await openPhoto(job.rawKey));
      lap('read', t); t = Date.now();
      let clean;
      try { clean = await sanitizePhoto(raw, { name: job.originalName, inPlace: true }); }
      catch (error) {
        if (error.status !== 400) throw error;
        await removeFile(job.rawKey);
        await UploadCheck.updateOne(owns, { $set: { state: 'failed', expires: new Date(Date.now() + 86400000) },
          $unset: { rawKey: 1, claim: 1 } });
        return true;
      }
      lap('process', t); t = Date.now();
      preview = clean.preview;
      early = infer(preview).then((scores) => ({ scores }), (error) => ({ error }));
      // (a camera RAW is stored as its JPEG; the RAW goes with the quarantine copy below)
      job.files = { ...await storePhoto(String(job.album), clean), ...(clean.takenAt && { takenAt: clean.takenAt }) };
      lap('store', t);
      const assigned = await UploadCheck.updateOne(owns, { $set: { files: job.files } });
      if (!assigned.matchedCount) { await deletePhoto(job.files.storageKey); return true; }
    }
    if (job.rawKey) {
      await removeFile(job.rawKey);
      await UploadCheck.updateOne(owns, { $unset: { rawKey: 1 } });
    }
    // Staff already approved this exact file (same fingerprint) on review.html: it passes without the model
    if (await isAllowedFile(job.hash)) {
      await UploadCheck.updateOne(owns, { $set: { state: 'publish', attempts: 0, due: new Date() }, $unset: { claim: 1 },
        $push: { history: { stage: 1, action: 'allow', rule: 'staff-approved', at: new Date() } } });
      return true;
    }
    // Scored on the preview (up to 2560 px), not the small, heavily compressed thumbnail
    let t = Date.now();
    const image = preview || await buffer(await openPhoto(job.files.previewKey || job.files.thumbnailKey));
    const result = early ? await early : await infer(image).then((scores) => ({ scores }), (error) => ({ error }));
    if (result.error) throw result.error;
    const scores = result.scores;
    lap('check', t);
    console.log('Photo check %s: %s, %d ms in all', job.id, Object.entries(times).map(([k, v]) => `${k} ${v} ms`).join(', '), Date.now() - started);
    let { action, explicit = false, staff = false, sure = false, level } = routeScore(scores);
    // Minors check: a photo that would publish at level 25+ waits for staff if anyone in it may be under 18
    let minors = null;
    if (action === 'allow') {
      minors = await ages(image, level);
      if (minors?.minor) { action = 'decline'; staff = true; }
    }
    const entry = { stage: 1, model: MODEL_NAME, scores, action, level, ...(staff && { rule: minors?.minor ? 'minor' : 'staff' }),
      ...(minors && { ages: minors.ages }) };
    if (action === 'allow') {
      await UploadCheck.updateOne(owns, { $set: { state: 'publish', attempts: 0, due: new Date() }, $unset: { claim: 1 }, $push: { history: entry } });
    } else {
      const reason = minors?.minor ? `Level ${level}: someone in it may be under 18, waiting for staff`
        : explicit && sure ? `Level ${level}: kept private, the check is very sure (no review)`
        : explicit ? 'Level 100: nudity or explicit content'
        : staff ? `Level ${level}: waiting for staff`
        : level !== undefined ? `Level ${level}: near-nude or nude, kept private` : 'The automatic check couldn’t read this photo';
      await decline(job, owns, { scores, entry, explicit, staff, reason });
      // Rekognition decides on its own: a level 85 or 95 it isn't very sure about gets the second, closer look at
      // once (no one has to ask), and is published if that comes out at 75 or below
      if (!explicit && [85, 95].includes(level)) await secondLookDecides(job.id).catch((err) => console.error('Second look: %s', err.message));
    }
  } catch (error) {
    const attempts = job.attempts + 1;
    console.error('Photo check: %s', error.message);
    // A photo that has failed 3 times tells the team (a system email, at most one an hour), so a broken check
    // (AWS permissions, a format Rekognition refuses) is noticed in minutes rather than by people whose photos never appear
    if (attempts === 3) tellTeamChecksFail(error);
    // Processing errors never publish a photo, and never hand an ordinary photo to people either: a busy or failing
    // check (Rekognition throttling, a storage hiccup) is simply tried again, a little later each time (15 s up to
    // 5 minutes), for about 3 hours (MAX_ATTEMPTS). Only then is it given up on.
    if (attempts >= MAX_ATTEMPTS && step && !job.files) {
      if (job.rawKey) await removeFile(job.rawKey);
      await UploadCheck.updateOne(owns, { $set: { state: 'failed', attempts, expires: new Date(Date.now() + 86400000) },
        $unset: { claim: 1, rawKey: 1 } });
    } else if (attempts >= MAX_ATTEMPTS && step) {
      await decline(job, owns, { reason: 'The automatic check couldn’t run' });
    } else await UploadCheck.updateOne(owns, { $set: { attempts, due: new Date(Date.now() + Math.min(attempts, 20) * 15000) }, $unset: { claim: 1 } });
  }
  return true;
}

const MAX_ATTEMPTS = Number(process.env.CHECK_MAX_ATTEMPTS) || 40;
let lastFailMail = 0;
function tellTeamChecksFail(error) {
  if (Date.now() - lastFailMail < 3600000) return;
  lastFailMail = Date.now();
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  import('./teamMail.js').then(({ sendTeamMail }) => sendTeamMail({
    group: 'system', kind: 'check-failing', title: `Photo checks are failing: ${error.name || 'Error'}`,
    html: `<p>Uploaded photos can't be checked, so they aren't appearing in albums. They're tried again for about 3 hours.</p>
      <pre style="font-family:monospace;white-space:pre-wrap">${esc(error.name)}: ${esc(error.message)}</pre>
      <p style="color:#5C596B;font-size:13px">See the server log: sudo docker compose logs --tail 200 api | grep "Photo check"</p>`,
  })).catch((err) => console.error('Check failure email: %s', err.message));
}

// A small upload is checked straight away, inside the request, so its photos appear at once (one photo is well
// under a second). Whatever isn't done within the time (a big batch, a retry) is left to the queue loops.
export async function checkNow(ids, budgetMs = 8000) {
  const until = Date.now() + budgetMs;
  // Two photos at a time (the server has two processors; HEIC photos still decode one at a time)
  let next = 0;
  await Promise.all([0, 1].map(async () => {
    while (next < ids.length && Date.now() <= until) {
      const id = ids[next++];
      if (await processCheck(1, classify, id)) await processCheck(0, classify, id);
    }
  }));
}

// Publishes one approved photo now (instead of waiting for the queue loop)
export const publishNow = (id) => processCheck(0, classify, id);

// The second look, when someone asks for a review of a declined photo (privacyController.requestReview): the photo
// again, bigger (up to 4096 px, not the 2560 px preview). Returns Rekognition's scores, or null when there's nothing
// to look at.
export async function secondLook(checkId) {
  if (checkIsOff()) return null;
  const job = await UploadCheck.findById(checkId).select('+files');
  if (!job?.files?.storageKey || job.state !== 'rejected' || job.explicit) return null;
  const { readableImage } = await import('./imageService.js');
  const sharp = (await import('sharp')).default;
  const picture = await readableImage(await buffer(await openPhoto(job.files.storageKey)));
  let image;
  // Rekognition takes up to 5 MB
  for (const [edge, quality] of [[4096, 88], [3200, 85], [2560, 82]]) {
    image = await sharp(picture, { limitInputPixels: false }).rotate().resize(edge, edge, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality }).toBuffer();
    if (image.length <= 5 * 1024 * 1024) break;
  }
  const look = await rekognition.detect(image);
  // Would publish at level 25+: the minors check too, on the same bigger picture
  const minors = rekognition.actionOf(look.level) === 'publish' ? await minorsCheck(image, look.level) : null;
  return { ...look, ...(minors && { minor: minors.minor, ages: minors.ages }) };
}

// The second look, deciding: at level 75 or below the photo is published (decision 'allowed' by 'Automatic second
// look'), unless someone in it may be under 18; otherwise what it found is kept for staff. True when it published.
export async function secondLookDecides(checkId, { userId } = {}) {
  const look = await secondLook(checkId);
  if (!look) return false;
  const record = { level: look.level, labels: look.labels, ...(look.ages && { ages: look.ages, minor: look.minor }), at: new Date() };
  const mine = userId ? { user: userId } : {};
  if (rekognition.actionOf(look.level) === 'publish' && !look.minor) {
    const allowed = await ModerationDecision.findOneAndUpdate({ _id: checkId, ...mine, status: { $in: ['final', 'review-requested'] } },
      { $set: { status: 'allowed', reviewer: 'Automatic second look', reviewedAt: new Date(), secondLook: record } });
    if (allowed) {
      await UploadCheck.updateOne({ _id: checkId, state: { $in: ['rejected', 'review'] } }, { $set: { state: 'publish', attempts: 0, due: new Date() },
        $push: { history: { stage: 2, action: 'allow', rule: 'second-look', level: look.level, at: new Date() } } });
      await publishNow(checkId).catch((err) => console.error('Second look publish: %s', err.message));
      return true;
    }
  }
  await ModerationDecision.updateOne({ _id: checkId, ...mine }, { $set: { secondLook: record } });
  return false;
}

// The two queue loops (publish, check), run by the API itself
export function startUploadChecks() {
  let stopped = false;
  // Publishing (0) and checking (1), with two check workers so a big upload isn't checked one photo at a time
  for (const step of [0, 1, 1]) {
    const tick = async () => {
      if (stopped) return;
      let worked = false;
      try { worked = await processCheck(step); } catch (error) { console.error('Upload queue:', error.message); }
      if (!stopped) setTimeout(tick, worked ? 0 : 1500).unref();
    };
    void tick();
  }
  return () => { stopped = true; };
}
