// Builds the stage-one calibration table from staff decisions on uploads: every reviewed upload is a labelled
// example (its MobileNetV2 score and the staff's level on Momento's 0-100 scale, or approve/decline without one).
// Photos of one album stay in the same half (fit or holdout). A score range is enabled only when both halves show
// at least 90% (one-sided 95% lower bound) publishable photos, so roughly 25+ per range in each half are needed.
import { createHash } from 'node:crypto';
import { ModerationDecision } from '../models/ModerationDecision.js';
import { STAGE_MODELS } from './uploadChecks.js';
import { LEVELS, truthOf, buildTable } from './calibrationTable.js';

// Staff decisions on stage-one uploads, one per file, as { group, truth, scores }
export async function reviewedRows() {
  const docs = await ModerationDecision.find({
    kind: 'photo', model: STAGE_MODELS[1], status: { $in: ['allowed', 'upheld'] }, reviewedBy: { $exists: true },
    'scores.allow': { $type: 'number' },
  }, 'album hash scores status severity').sort({ at: 1 }).lean();
  const seen = new Set(), rows = [];
  for (const d of docs) {
    const allow = d.scores.allow;
    if (!(allow >= 0 && allow <= 1) || seen.has(d.hash)) continue;
    seen.add(d.hash);
    const truth = LEVELS.includes(d.severity) ? truthOf(d.severity) : d.status === 'allowed' ? 'allow' : 'reject';
    rows.push({ group: d.album ? String(d.album) : 'no-album-' + d._id, truth, scores: [, { allow }] });
  }
  return rows;
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

// { table, summary }; throws when there are not yet reviewed uploads from at least two albums
export async function calibrateFromReviews(log = () => {}) {
  const rows = await reviewedRows();
  const { fit, holdout } = splitByGroup(rows);
  const good = list => list.filter(row => row.truth === 'allow').length;
  const summary = { reviewed: rows.length, publishable: good(rows), albums: new Set(rows.map(row => row.group)).size, fit: fit.length, holdout: holdout.length };
  log(`Staff-reviewed uploads: ${rows.length} photos (${summary.publishable} publishable) from ${summary.albums} albums`);
  if (!fit.length || !holdout.length) throw new Error('Not enough reviewed uploads yet: photos from at least two albums are needed.');
  log(`Fit: ${fit.length} photos (${good(fit)} publishable); holdout: ${holdout.length} photos (${good(holdout)} publishable)`);
  return { table: buildTable(fit, holdout, [1], log), summary };
}
