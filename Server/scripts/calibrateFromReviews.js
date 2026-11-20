// Builds the stage-one calibration table (NSFW_CALIBRATION) from staff decisions on uploads: no separate photo
// labelling. While uncalibrated, every upload waits for staff, so each decision is a labelled example with the
// MobileNetV2 score it was given. Staff should send the content level with each decision
// (POST /api/admin/moderation/:id { allow, severity: 0|15|25|50|75|100 }); without it, "approved" counts as
// publishable and "declined" as not.
//
//   node --env-file=.env scripts/calibrateFromReviews.js [calibration.json]   (no file: the table goes to stdout)
// On the AWS server (the summary is shown; the table is installed only when the run succeeds):
//   cd /opt/momento/Server/deploy && sudo docker compose exec -T api node scripts/calibrateFromReviews.js > /tmp/calibration.json \
//     && sudo install -m 644 /tmp/calibration.json /opt/momento-config/calibration.json
//
// Photos of one album stay in the same half (fit or holdout). A score range is enabled only when both halves show
// at least 90% (one-sided 95% lower bound) of its photos were publishable, so roughly 25+ publishable photos per
// range in each half are needed. Once calibrated, confidently passed photos skip staff and add no new examples;
// keep the table and recalibrate deliberately (decisions are kept for a year).
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { ModerationDecision } from '../src/models/ModerationDecision.js';
import { STAGE_MODELS } from '../src/services/uploadChecks.js';
import { LEVELS, truthOf, buildTable } from '../src/services/calibrationTable.js';

const log = (...args) => console.error(...args);

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

export async function calibrateFromReviews() {
  const rows = await reviewedRows();
  const { fit, holdout } = splitByGroup(rows);
  const count = list => `${list.length} photos (${list.filter(row => row.truth === 'allow').length} publishable)`;
  log(`Staff-reviewed uploads: ${count(rows)} from ${new Set(rows.map(row => row.group)).size} albums`);
  if (!fit.length || !holdout.length) throw new Error('Not enough reviewed uploads yet: photos from at least two albums are needed.');
  log(`Fit: ${count(fit)}; holdout: ${count(holdout)}`);
  return buildTable(fit, holdout, [1], log);
}

if (process.argv[1]?.endsWith('calibrateFromReviews.js')) {
  const [output] = process.argv.slice(2);
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const json = JSON.stringify(await calibrateFromReviews(), null, 2);
    if (output) await writeFile(output, json, { flag: 'wx' });
    else process.stdout.write(json + '\n');
  } catch (error) {
    log(error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
