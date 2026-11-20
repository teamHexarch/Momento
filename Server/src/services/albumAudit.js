import { buffer } from 'node:stream/consumers';
import { Photo } from '../models/Photo.js';
import { Report } from '../models/Report.js';
import { UploadCheck } from '../models/UploadCheck.js';
import { openPhoto, ensureThumbnail } from './storageService.js';
import { audit } from './auditService.js';
import { classify, routeScore, expireRefusals } from './uploadChecks.js';

const DAY = 86400000;
export async function auditOne(infer = classify, table) {
  const now = new Date();
  const lease = new Date(Date.now() + 10 * 60000);
  const claim = { $set: { nextAudit: lease } };
  const options = { sort: { nextAudit: 1 }, returnDocument: 'after' };
  let photo = await Photo.findOneAndUpdate({ auditRequested: true, nextAudit: { $lte: now } }, claim, options);
  if (!photo) {
    if (await UploadCheck.exists({ state: { $in: ['checking', 'publish'] } })) return false;
    photo = await Photo.findOneAndUpdate({ deletedAt: null, $or: [{ nextAudit: null }, { nextAudit: { $lte: now } }] }, claim, options);
  }
  if (!photo) return false;
  const owns = { _id: photo._id, nextAudit: lease };
  try {
    const thumb = await buffer(await openPhoto(await ensureThumbnail(photo)));
    // A nudity report explicitly asks for context review even if the quick scan looks ordinary.
    for (let stage = photo.auditRequested ? 3 : 1; stage <= 3; stage++) {
      const image = stage === 3 && photo.previewKey ? await buffer(await openPhoto(photo.previewKey)) : thumb;
      const scores = await infer(stage, image);
      const { action, confidence } = routeScore(stage, scores, table);
      if (action === 'escalate') continue;
      if (action !== 'allow') {
        await Report.updateOne({ photo: photo._id, reporter: null }, { $set: {
          album: photo.album, reason: 'nudity', source: 'model', status: 'open',
          note: 'Automated album audit: ' + action + '. Staff review requested.',
        } }, { upsert: true });
        if (action === 'reject') await Photo.updateOne({ ...owns, deletedAt: null }, { $set: { auditHidden: true, flaggedAt: now, deletedAt: now } });
      }
      await audit('photo.moderation-audit', { target: photo._id, meta: { stage, action, confidence, severity: scores.severity } });
      await Photo.updateOne(owns, { $set: { nextAudit: new Date(Date.now() + 30 * DAY), auditRequested: false } });
      return true;
    }
  } catch (error) {
    await Photo.updateOne(owns, { $set: { nextAudit: new Date(Date.now() + 3600000) } });
    throw error;
  }
}

export function startAlbumAudits(infer = classify, table, schedule = setTimeout) {
  let stopped = false;
  let timer;
  const tick = async () => {
    if (stopped) return;
    try {
      await expireRefusals();
      if (!stopped) await auditOne(infer, table);
    } catch (error) { console.error('Album audit:', error.message); }
    if (!stopped) timer = schedule(tick, 60000).unref();
  };
  timer = schedule(tick, 60000).unref();
  return () => { stopped = true; clearTimeout(timer); };
}

// Stage-one mode has no context model, so routine album audits could only ever escalate. Declined uploads
// are still removed after 30 days.
export function startRefusalCleanup() {
  const timer = setInterval(() => expireRefusals().catch(error => console.error('Refusal cleanup:', error.message)), 3600000);
  timer.unref();
  return () => clearInterval(timer);
}
