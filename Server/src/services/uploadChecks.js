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
import { scan } from './nsfwService.js';
import { isBanned } from './contentSafety.js';
import { storePhoto, openPhoto, deletePhoto, removeFile } from './storageService.js';
import { sanitizePhoto } from './imageService.js';

export const cascadeEnabled = process.env.NSFW_PIPELINE === 'three-stage';
const thresholds = [0, .90, .85, .85];
const models = ['', 'NSFW.js MobileNetV2', 'Falconsai/nsfw_image_detection', 'Qwen/Qwen2.5-VL-7B-Instruct'];
// The API does not load worker configuration or model weights.
const calibration = process.env.NSFW_WORKER === '1' && process.env.NSFW_CALIBRATION
  ? JSON.parse(readFileSync(process.env.NSFW_CALIBRATION, 'utf8')) : {};

// Calibration files map raw scores to observed decision precision on routed, labelled photos.
// A missing bin gives no authority to release or reject a private upload.
export function routeScore(stage, scores, table = calibration) {
  if (stage === 3 && ![0, 15, 25, 100].includes(scores.severity)) return { action: 'review' };
  for (const action of stage === 3 ? ['allow', 'reject'] : ['allow']) {
    if (stage === 3 && ((scores.severity === 100) !== (action === 'reject'))) continue;
    const raw = scores[action];
    if (!Number.isFinite(raw) || raw < 0 || raw > 1) continue;
    const bin = table[stage]?.[action]?.find(b => raw >= b.min && (raw < b.max || (raw === 1 && b.max === 1)));
    if (bin && Number.isFinite(bin.confidence) && bin.confidence <= 1 && bin.confidence >= thresholds[stage]) {
      return { action, confidence: bin.confidence };
    }
  }
  return { action: stage === 3 ? 'review' : 'escalate' };
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

export async function expireRefusals() {
  const old = await UploadCheck.find({ state: 'rejected', updatedAt: { $lt: new Date(Date.now() - 30 * 86400000) } }, '_id').limit(20);
  for (const job of old) await discardChecks({ _id: job._id, state: 'rejected' });
  await discardChecks({ state: 'discarding' });
}

export async function classify(stage, image) {
  if (stage === 1) {
    const result = await scan(image);
    if (!result) throw new Error('First model unavailable');
    return { allow: result.Neutral };
  }
  const origin = process.env.NSFW_MODEL_URL || 'http://127.0.0.1:8071';
  const response = await fetch(new URL('/stage/' + stage, origin), {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: image,
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error('Model service returned ' + response.status);
  const scores = await response.json();
  if (!Number.isFinite(scores.allow) || (stage === 3 && !Number.isFinite(scores.reject))) throw new Error('Invalid model output');
  return scores;
}

async function publish(job) {
  const album = await Album.findById(job.album, 'group');
  if (!album || !await User.exists({ _id: job.user, deletingAt: null }) || await isBanned(job.hash)) {
    await discardChecks({ _id: job._id });
    return;
  }
  const result = await Photo.updateOne({ _id: job._id }, { $setOnInsert: {
    album: job.album, uploader: job.user, hash: job.hash, originalName: job.originalName, ...job.files,
    nextAudit: new Date(Date.now() + 30 * 86400000),
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

export async function processCheck(stage, infer = classify, table = calibration) {
  const claim = randomUUID();
  const job = await UploadCheck.findOneAndUpdate({
    state: stage === 0 ? 'publish' : 'checking', ...(stage && { stage }), due: { $lte: new Date() },
  }, { $set: { claim, due: new Date(Date.now() + 5 * 60000) } }, { sort: { due: 1 }, returnDocument: 'after' }).select('+files +rawKey');
  if (!job) return false;
  const owns = { _id: job._id, claim };
  try {
    if (!stage) { await publish(job); return true; }
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
    const image = await buffer(await openPhoto(stage === 3 ? job.files.previewKey : job.files.thumbnailKey));
    const scores = await infer(stage, image);
    const { action, confidence } = routeScore(stage, scores, table);
    const state = { allow: 'publish', reject: 'rejected', review: 'review', escalate: 'checking' }[action];
    if (action === 'review' || action === 'reject') {
      await ModerationDecision.updateOne({ _id: job._id }, { $setOnInsert: {
        user: job.user, album: job.album, hash: job.hash, kind: 'photo', model: models[stage],
        threshold: thresholds[stage], scores, status: action === 'review' ? 'review-requested' : 'final',
        reason: action === 'review' ? 'Needs staff review before publication' : 'Explicit sexual content',
      } }, { upsert: true });
    }
    await UploadCheck.updateOne(owns, { $set: { state, stage: action === 'escalate' ? stage + 1 : stage,
      ...(Number.isFinite(scores.severity) && { severity: scores.severity }), attempts: 0, due: new Date() },
      $unset: { claim: 1 }, $push: { history: { stage, model: models[stage], scores, confidence, action } } });
  } catch (error) {
    const attempts = job.attempts + 1;
    console.error('Upload check stage %d: %s', stage, error.message);
    // Processing errors never publish a photo. After retries, offer staff a reviewable copy.
    if (attempts >= 3 && stage && !job.files) {
      if (job.rawKey) await removeFile(job.rawKey);
      await UploadCheck.updateOne(owns, { $set: { state: 'failed', attempts, expires: new Date(Date.now() + 86400000) },
        $unset: { claim: 1, rawKey: 1 } });
    } else if (attempts >= 3 && stage) {
      await ModerationDecision.updateOne({ _id: job._id }, { $setOnInsert: { user: job.user, album: job.album,
        hash: job.hash, kind: 'photo', model: models[stage], status: 'review-requested', reason: 'Model unavailable' } }, { upsert: true });
      await UploadCheck.updateOne(owns, { $set: { state: 'review', attempts }, $unset: { claim: 1 } });
    } else await UploadCheck.updateOne(owns, { $set: { attempts, due: new Date(Date.now() + Math.min(attempts, 10) * 15000) }, $unset: { claim: 1 } });
  }
  return true;
}

export function startUploadChecks() {
  let stopped = false;
  for (const stage of [0, 1, 2, 3]) {
    const tick = async () => {
      if (stopped) return;
      let worked = false;
      try { worked = await processCheck(stage); } catch (error) { console.error('Upload queue:', error.message); }
      if (!stopped) setTimeout(tick, worked ? 0 : 1500).unref();
    };
    void tick();
  }
  return () => { stopped = true; };
}
