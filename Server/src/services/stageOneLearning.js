// Stage one keeps learning from staff: on start-up and every NSFW_RELEARN_HOURS (24 unless set) the calibration
// table is rebuilt from all staff-reviewed uploads (services/reviewCalibration.js) and stored in MongoDB, so every
// review makes the automatic check better. Until the table supports a score range, the starter rule applies
// (services/uploadChecks.js, activeTable). A rebuild that fails, or finds too few reviews, keeps the last table.
import { ModerationCalibration } from '../models/ModerationCalibration.js';
import { calibrateFromReviews } from './reviewCalibration.js';
import { setLearnedTable } from './uploadChecks.js';

const ID = 'stage-one';
const hoursSetting = Number(process.env.NSFW_RELEARN_HOURS ?? '24');
export const relearnHours = Number.isFinite(hoursSetting) && hoursSetting > 0 ? hoursSetting : 24;

export async function loadLearned() {
  const doc = await ModerationCalibration.findById(ID).lean();
  setLearnedTable(doc?.table || null);
  return doc;
}

let running = null;
export function relearn() {
  running ||= (async () => {
    const at = new Date();
    try {
      const { table, summary } = await calibrateFromReviews();
      await ModerationCalibration.updateOne({ _id: ID }, { $set: { table, builtAt: at, ...summary, lastAttemptAt: at, lastError: null } }, { upsert: true });
      setLearnedTable(table);
      return { ok: true, builtAt: at, ...summary, ranges: (table[1]?.allow || []).length };
    } catch (error) {
      await ModerationCalibration.updateOne({ _id: ID }, { $set: { lastAttemptAt: at, lastError: error.message } }, { upsert: true }).catch(() => {});
      return { ok: false, error: error.message };
    }
  })().finally(() => { running = null; });
  return running;
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
