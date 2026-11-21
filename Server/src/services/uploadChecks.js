import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buffer } from 'node:stream/consumers';
import { UploadCheck } from '../models/UploadCheck.js';
import { ModerationDecision } from '../models/ModerationDecision.js';
import { Photo } from '../models/Photo.js';
import { Album } from '../models/Album.js';
import { User } from '../models/User.js';
import { Membership } from '../models/Membership.js';
import { GroupMember } from '../models/GroupMember.js';
import { notifyPhotos } from './notifyService.js';
import { scan, checkIsOff } from './nsfwService.js';
import { isBanned } from './contentSafety.js';
import { storePhoto, openPhoto, deletePhoto, removeFile } from './storageService.js';
import { sanitizePhoto } from './imageService.js';

// ---- The nudity check for album photos: one free model (NSFW.js, MobileNetV2) on this server ----
// Every album upload is saved privately first (uploadIntake.js) and queued here. The API runs the queue itself:
// no model service, no GPU and no separate worker. For each photo:
//   1. its location data is removed and its previews made (sanitizePhoto);
//   2. the model scores it; a score range the active table trusts publishes it at once;
//   3. anything else is declined and stays private. The uploader sees "Declined" with a Request review button
//      (privacyController.requestReview). Only then does it go to staff (review.html), who are emailed about it.
//      A declined photo nobody asks about is deleted after 30 days (expireRefusals).
// A photo is never published because the model failed: after 3 tries it's declined like an uncertain one.

// The model's name, kept with each decision
export const MODEL_NAME = 'NSFW.js MobileNetV2';
// How sure a score range must be before it publishes on its own (the agreed standard for one model)
export const CONFIDENCE = 0.85;
// The score definition (stageOneScores, below); every calibration table records the version it was built with
export const SCORE_VERSION = 4;

// ---- The two thresholds that decide every album photo (change them with the env settings) ----
// The photo's risk is NSFW.js's Porn + Hentai + Sexy score (0 to 1).
//   risk below NSFW_PUBLISH_BELOW (0.25)          → published at once
//   Porn or Hentai at NSFW_HARD_DECLINE (0.85)+   → hard decline: no Request review, no staff email
//   anything else (0.25 and up, incl. high Sexy)  → declined with Request review (swimwear can be appealed),
//     unless what staff decided on earlier reviews shows that score range is fine (learning, below)
const fraction = (value, fallback) => { const n = Number(value); return Number.isFinite(n) && n > 0 && n <= 1 ? n : fallback; };
export const PUBLISH_BELOW = fraction(process.env.NSFW_PUBLISH_BELOW, 0.25);
export const HARD_DECLINE_AT = fraction(process.env.NSFW_HARD_DECLINE, 0.85);

// ---- Learning from staff decisions ----
// Every NSFW_RELEARN_HOURS (24) the server rebuilds a table from staff reviews (services/stageOneLearning.js): a score
// range staff approved at least CONFIDENCE (85%) of the time, on enough reviews in both halves, publishes at once too.
// A table file (NSFW_CALIBRATION) can be pinned instead; if it can't be read, only the thresholds apply.
export let calibrationError = null;
const calibration = (() => {
  if (!process.env.NSFW_CALIBRATION) return {};
  try {
    const table = JSON.parse(readFileSync(process.env.NSFW_CALIBRATION, 'utf8'));
    if (!table || typeof table !== 'object' || Array.isArray(table)) throw new Error('not a calibration table');
    if (table.scoreVersion !== SCORE_VERSION) throw new Error(`built with score version ${table.scoreVersion ?? 'none'}, not ${SCORE_VERSION}; rebuild it`);
    return table;
  } catch (error) {
    calibrationError = error.message;
    console.error(`Calibration table ${process.env.NSFW_CALIBRATION} unusable (${error.message}): only the thresholds apply until it's fixed.`);
    return {};
  }
})();
let learned = null;
// The version must be given and match exactly: a table with no version is never trusted
export function setLearnedTable(table, version) {
  learned = version === SCORE_VERSION && table && typeof table === 'object' && !Array.isArray(table) ? table : null;
}
const binsOf = (table) => table?.[1]?.allow?.length || 0;
export function activeTable() {
  if (process.env.NSFW_CALIBRATION && !calibrationError) return { source: 'file', table: calibration };
  if (binsOf(learned)) return { source: 'learned', table: learned };
  return { source: 'thresholds', table: {} };
}
// How many score ranges may publish on their own
export const calibratedBins = () => binsOf(activeTable().table);

// MobileNetV2's own classes, against Momento's levels: Neutral and Drawing are everyday (0), Sexy covers swimwear to
// clearly suggestive (15-50), Porn and Hentai are explicit (75-100). The "allow" score is 1 - risk (Neutral + Drawing),
// the score the learned table works on. The estimated level is kept for comparison with staff ratings.
const CLASS_LEVEL = { Neutral: 0, Drawing: 0, Sexy: 25, Porn: 100, Hentai: 100 };
export function stageOneScores(classes) {
  const p = name => (Number.isFinite(classes?.[name]) ? classes[name] : 0);
  const allow = Math.max(0, Math.min(1, 1 - (p('Porn') + p('Hentai') + p('Sexy'))));
  const top = Object.keys(CLASS_LEVEL).reduce((a, b) => (p(b) > p(a) ? b : a), 'Neutral');
  return { allow, level: CLASS_LEVEL[top], classes: Object.fromEntries(Object.keys(CLASS_LEVEL).map(k => [k, p(k)])), version: SCORE_VERSION };
}

// What happens to a photo: { action: 'allow' | 'decline', explicit?, risk?, learned? }
export function routeScore(scores, table = activeTable().table) {
  const c = scores?.classes;
  const p = (name) => (Number.isFinite(c?.[name]) ? c[name] : NaN);
  const porn = p('Porn'), hentai = p('Hentai'), sexy = p('Sexy');
  if (![porn, hentai, sexy].every(Number.isFinite)) return { action: 'decline' };   // no usable scores: never publish
  if (Math.max(porn, hentai) >= HARD_DECLINE_AT) return { action: 'decline', explicit: true };
  const risk = porn + hentai + sexy;
  if (risk < PUBLISH_BELOW) return { action: 'allow', risk };
  // Learned from staff decisions: a score range they approve 85%+ of the time publishes too
  const allow = 1 - risk;
  const bin = table[1]?.allow?.find(x => allow >= x.min && (allow < x.max || (allow === 1 && x.max === 1)));
  if (bin && Number.isFinite(bin.confidence) && bin.confidence <= 1 && bin.confidence >= CONFIDENCE) return { action: 'allow', risk, learned: true, confidence: bin.confidence };
  return { action: 'decline', risk };
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

// The model's scores for one image (its thumbnail: the model only looks at 224×224 pixels)
export async function classify(image) {
  // Check switched off: every photo passes, as it always has
  if (checkIsOff()) return stageOneScores({ Neutral: 1 });
  const result = await scan(image);
  if (!result) throw new Error('The nudity check is unavailable');
  return stageOneScores(result);
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
// until they do); a hard decline (Porn or Hentai at HARD_DECLINE_AT or more) has no review (explicit: true)
async function decline(job, owns, { scores, reason, entry, explicit = false }) {
  await ModerationDecision.updateOne({ _id: job._id }, { $setOnInsert: {
    user: job.user, album: job.album, hash: job.hash, kind: 'photo', model: MODEL_NAME, threshold: PUBLISH_BELOW,
    ...(scores && { scores }), status: 'final', reason,
  } }, { upsert: true });
  await UploadCheck.updateOne(owns, { $set: { state: 'rejected', attempts: 0, explicit }, $unset: { claim: 1 },
    ...(entry && { $push: { history: entry } }) });
}

// One step of the queue. step 0: publish approved photos; step 1: check new ones. Returns whether it did anything.
// only: this one job (checkNow), instead of the next one due
export async function processCheck(step, infer = classify, table = activeTable().table, only) {
  const claim = randomUUID();
  const job = await UploadCheck.findOneAndUpdate({
    ...(only && { _id: only }), state: step === 0 ? 'publish' : 'checking', due: { $lte: new Date() },
  }, { $set: { claim, due: new Date(Date.now() + 5 * 60000) } }, { sort: { due: 1 }, returnDocument: 'after' }).select('+files +rawKey');
  if (!job) return false;
  const owns = { _id: job._id, claim };
  try {
    if (!step) { await publish(job); return true; }
    if (!job.files) {
      const raw = await buffer(await openPhoto(job.rawKey));
      let clean;
      try { clean = await sanitizePhoto(raw, { name: job.originalName, inPlace: true }); }
      catch (error) {
        if (error.status !== 400) throw error;
        await removeFile(job.rawKey);
        await UploadCheck.updateOne(owns, { $set: { state: 'failed', expires: new Date(Date.now() + 86400000) },
          $unset: { rawKey: 1, claim: 1 } });
        return true;
      }
      job.files = await storePhoto(String(job.album), clean);
      const assigned = await UploadCheck.updateOne(owns, { $set: { files: job.files } });
      if (!assigned.matchedCount) { await deletePhoto(job.files.storageKey); return true; }
    }
    if (job.rawKey) {
      await removeFile(job.rawKey);
      await UploadCheck.updateOne(owns, { $unset: { rawKey: 1 } });
    }
    const scores = await infer(await buffer(await openPhoto(job.files.thumbnailKey)));
    const { action, explicit = false, risk, learned: byLearning, confidence } = routeScore(scores, table);
    const entry = { stage: 1, model: MODEL_NAME, scores, action, risk, publishBelow: PUBLISH_BELOW, hardDeclineAt: HARD_DECLINE_AT,
      ...(byLearning && { rule: 'learned', confidence }) };
    if (action === 'allow') {
      await UploadCheck.updateOne(owns, { $set: { state: 'publish', attempts: 0, due: new Date() }, $unset: { claim: 1 }, $push: { history: entry } });
    } else {
      await decline(job, owns, { scores, entry, explicit, reason: explicit ? 'The automatic check is sure this photo contains nudity' : 'The automatic check wasn’t sure about this photo' });
    }
  } catch (error) {
    const attempts = job.attempts + 1;
    console.error('Photo check: %s', error.message);
    // Processing errors never publish a photo
    if (attempts >= 3 && step && !job.files) {
      if (job.rawKey) await removeFile(job.rawKey);
      await UploadCheck.updateOne(owns, { $set: { state: 'failed', attempts, expires: new Date(Date.now() + 86400000) },
        $unset: { claim: 1, rawKey: 1 } });
    } else if (attempts >= 3 && step) {
      // Stored but the model kept failing: declined like an uncertain photo, so the uploader can ask for a review
      await decline(job, owns, { reason: 'The automatic check couldn’t run' });
    } else await UploadCheck.updateOne(owns, { $set: { attempts, due: new Date(Date.now() + Math.min(attempts, 10) * 15000) }, $unset: { claim: 1 } });
  }
  return true;
}

// A small upload is checked straight away, inside the request, so its photos appear at once (one photo is well
// under a second). Whatever isn't done within the time (a big batch, a retry) is left to the queue loops.
export async function checkNow(ids, budgetMs = 8000) {
  const until = Date.now() + budgetMs;
  for (const id of ids) {
    if (Date.now() > until) break;
    if (await processCheck(1, classify, activeTable().table, id)) await processCheck(0, classify, activeTable().table, id);
  }
}

// The two queue loops (publish, check), run by the API itself
export function startUploadChecks() {
  let stopped = false;
  for (const step of [0, 1]) {
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
