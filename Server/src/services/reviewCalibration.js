// Builds the stage-one calibration table from staff decisions on uploads: every reviewed upload is a labelled
// example (its MobileNetV2 score and the staff's level on Momento's 0-100 scale, or approve/decline without one).
// Publishable means staff published it at level 0-50 (kept private at any level counts as not publishable). Photos of one album stay in the same half (fit or holdout). A score range is enabled
// only when both halves show at least 85% (one-sided 95% lower bound) publishable photos, so roughly 16+ per range
// in each half are needed.
// The reasons staff tick (utils/reviewReasons.js) come with every photo kept private, which counts as not
// publishable for its score range; each relearn reports per reason how often it was used and how often the model
// had scored those photos as safe (its blind spots).
import { createHash } from 'node:crypto';
import { ModerationDecision } from '../models/ModerationDecision.js';
import { MODEL_NAME, stageOneScores, SCORE_VERSION } from './uploadChecks.js';
import { LEVELS, truthOf, buildTable, STAGE_ONE_PUBLISH_MAX } from './calibrationTable.js';
import { REASON_KEYS, BLIND_SPOT_ALLOW } from '../utils/reviewReasons.js';

// Staff decisions on stage-one uploads, one per file, as { group, truth, scores }. The score is recomputed from the
// model's raw classes with the same function the live check uses, so learning and checking always agree; older
// decisions without the raw classes (scored another way) are left out. When staff rated the same file more than
// once, their latest rating is the one learned from.
export async function reviewedRows() {
  const docs = await ModerationDecision.find({
    kind: 'photo', model: MODEL_NAME, status: { $in: ['allowed', 'upheld'] }, reviewedBy: { $exists: true },
    'scores.classes': { $type: 'object' },
    // Only photos scored the way the live check scores now (SCORE_VERSION: same image, same score), so a table is
    // never learned from scores of another kind (thumbnail scores before version 6)
    'scores.version': SCORE_VERSION,
  }, 'album hash scores status severity reasons reviewedAt').sort({ reviewedAt: -1, at: -1 }).lean();
  const seen = new Set(), rows = [];
  for (const d of docs) {
    const { allow } = stageOneScores(d.scores.classes);
    if (!(allow >= 0 && allow <= 1) || seen.has(d.hash)) continue;
    seen.add(d.hash);
    // Publishable only when staff published it at level 0-50: a low level kept private (a clothed photo of a sexual
    // act, say: the model's score looks safe but the meaning isn't) teaches the check not to trust that score
    const truth = d.status !== 'allowed' ? 'decline'
      : LEVELS.includes(d.severity) ? truthOf(d.severity, STAGE_ONE_PUBLISH_MAX) : 'allow';
    // Reasons count only for photos kept private (publishing needs none)
    const reasons = truth === 'decline' ? (d.reasons || []).filter((r) => REASON_KEYS.includes(r)) : [];
    rows.push({ group: d.album ? String(d.album) : 'no-album-' + d._id, truth, scores: [, { allow }], reasons });
  }
  return rows;
}

// Per reason: how many kept-private photos had it, and how many of those the model had scored as safe (allow at
// least BLIND_SPOT_ALLOW): the kinds of photo the automatic check can't see by itself
export function reasonStats(rows) {
  const stats = {};
  for (const row of rows) for (const r of row.reasons || []) {
    stats[r] ||= { kept: 0, blindSpots: 0 };
    stats[r].kept++;
    if (row.scores[1].allow >= BLIND_SPOT_ALLOW) stats[r].blindSpots++;
  }
  return stats;
}

// Whole albums go to one half, in a fixed (hashed) order, each to the half with fewer publishable photos so far
export function splitByGroup(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.group)) groups.set(row.group, []);
    groups.get(row.group).push(row);
  }
  const hash = s => createHash('sha256').update(s).digest('hex');
  const split = { fit: [], holdout: [] };
  const good = list => list.filter(row => row.truth === 'allow').length;
  for (const name of [...groups.keys()].sort((a, b) => hash(a).localeCompare(hash(b)))) {
    const key = good(split.fit) !== good(split.holdout) ? (good(split.fit) < good(split.holdout) ? 'fit' : 'holdout')
      : split.fit.length <= split.holdout.length ? 'fit' : 'holdout';
    split[key].push(...groups.get(name));
  }
  return split;
}

// { table, summary, reasons }; throws when there are not yet reviewed uploads from at least two albums
export async function calibrateFromReviews(log = () => {}) {
  const rows = await reviewedRows();
  const reasons = reasonStats(rows);
  const { fit, holdout } = splitByGroup(rows);
  const good = list => list.filter(row => row.truth === 'allow').length;
  const summary = { reviewed: rows.length, publishable: good(rows), albums: new Set(rows.map(row => row.group)).size, fit: fit.length, holdout: holdout.length };
  log(`Staff-reviewed uploads: ${rows.length} photos (${summary.publishable} publishable) from ${summary.albums} albums`);
  if (!fit.length || !holdout.length) throw Object.assign(new Error('Not enough reviewed uploads yet: photos from at least two albums are needed.'), { reasons });
  log(`Fit: ${fit.length} photos (${good(fit)} publishable); holdout: ${holdout.length} photos (${good(holdout)} publishable)`);
  return { table: buildTable(fit, holdout, [1], log), summary, reasons };
}
