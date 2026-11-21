// Stage one keeps learning from staff: on start-up and every NSFW_RELEARN_HOURS (24 unless set) the calibration
// table is rebuilt from all staff-reviewed uploads (services/reviewCalibration.js) and stored in MongoDB, so every
// review makes the automatic check better. Until the table supports a score range, only the two thresholds apply
// (services/uploadChecks.js, activeTable). A rebuild that fails, or finds too few reviews, keeps the last table.
import { ModerationCalibration } from '../models/ModerationCalibration.js';
import { calibrateFromReviews } from './reviewCalibration.js';
import { setLearnedTable, SCORE_VERSION } from './uploadChecks.js';

const ID = 'stage-one';
const hoursSetting = Number(process.env.NSFW_RELEARN_HOURS ?? '24');
export const relearnHours = Number.isFinite(hoursSetting) && hoursSetting > 0 ? hoursSetting : 24;

export async function loadLearned() {
  const doc = await ModerationCalibration.findById(ID).lean();
  // A table learned under another score definition is ignored until it is relearned
  setLearnedTable(doc?.table || null, doc?.scoreVersion);
  return doc;
}

let running = null;
export function relearn() {
  running ||= (async () => {
    const at = new Date();
    try {
      const { table, summary, reasons } = await calibrateFromReviews();
      await ModerationCalibration.updateOne({ _id: ID }, { $set: { table, scoreVersion: SCORE_VERSION, builtAt: at, ...summary, reasons, lastAttemptAt: at, lastError: null } }, { upsert: true });
      setLearnedTable(table, SCORE_VERSION);
      return { ok: true, builtAt: at, ...summary, ranges: (table[1]?.allow || []).length };
    } catch (error) {
      // Too few reviews for a table still records what the reasons say so far
      await ModerationCalibration.updateOne({ _id: ID }, { $set: { lastAttemptAt: at, lastError: error.message, ...(error.reasons && { reasons: error.reasons }) } }, { upsert: true }).catch(() => {});
      return { ok: false, error: error.message };
    }
  })().finally(() => { running = null; });
  return running;
}

// After a staff review: relearn shortly (RELEARN_AFTER_REVIEW_MS, 60 s), so the new rating counts within a minute,
// not only at the next NSFW_RELEARN_HOURS rebuild. Reviews in quick succession share one rebuild.
const afterReviewSetting = Number(process.env.RELEARN_AFTER_REVIEW_MS ?? '60000');
const afterReviewMs = Number.isFinite(afterReviewSetting) && afterReviewSetting >= 0 ? afterReviewSetting : 60000;
let soon = null;
export function relearnSoon() {
  if (soon) return;
  soon = setTimeout(() => {
    soon = null;
    relearn().then((r) => console.log(r.ok
      ? `Photo checks relearned after a staff review: ${r.reviewed} reviews, ${r.ranges} score range(s) publish at once.`
      : `Photo checks after a staff review: kept the current rules (${r.error})`),
    (error) => console.error('Photo check learning:', error.message));
  }, afterReviewMs);
  soon.unref?.();
}

export function startLearning() {
  const run = () => relearn().then((r) => {
    if (r.ok) console.log(`Photo checks learned from ${r.reviewed} staff reviews: ${r.ranges} score range(s) publish at once.`);
    else console.log(`Photo checks: kept the current rules (${r.error})`);
  }, (error) => console.error('Photo check learning:', error.message));
  loadLearned().catch((error) => console.error('Photo check learning:', error.message)).finally(run);
  const timer = setInterval(run, relearnHours * 3600000);
  timer.unref();
  return () => clearInterval(timer);
}
