// Calibration from staff decisions: which decisions count, staff severity over approve/decline, whole albums per
// half, the table it enables, clean stdout for the server, and that a broken table never stops the API.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

const run = promisify(execFile);
const serverDir = fileURLToPath(new URL('..', import.meta.url));
const dir = await mkdtemp(path.join(os.tmpdir(), 'momento-review-calibration-'));
const mongo = await MongoMemoryServer.create();
const env = { NSFW_PIPELINE: 'stage-one', NSFW_CALIBRATION: '', NODE_ENV: 'test', S3_BUCKET: '', JWT_SECRET: 'test-only-isolated',
  MONGODB_URI: mongo.getUri('reviews'), UPLOAD_DIR: dir };
Object.assign(process.env, env);
const childEnv = { ...process.env, ...env };
await mongoose.connect(process.env.MONGODB_URI);
const { ModerationDecision } = await import('../src/models/ModerationDecision.js');
const { reviewedRows, splitByGroup } = await import('./calibrateFromReviews.js');
const { calibrateFromReviews } = await import('../src/services/reviewCalibration.js');
const { routeScore, activeTable, isSpotCheck, stageOneScores, starterThreshold } = await import('../src/services/uploadChecks.js');
const { relearn, loadLearned } = await import('../src/services/stageOneLearning.js');
const { ModerationCalibration } = await import('../src/models/ModerationCalibration.js');

const user = new mongoose.Types.ObjectId(), staff = new mongoose.Types.ObjectId();
let n = 0;
// Reviews as the live check stores them: the raw classes (allow is recomputed from them when learning)
const decision = (album, allow, status, extra = {}) => ({ user, album, kind: 'photo', hash: 'h' + n++, model: 'NSFW.js MobileNetV2',
  scores: { allow: 0, classes: { Neutral: allow, Sexy: 1 - allow }, version: 2 }, status, reviewedBy: staff, ...extra });
try {
  // The model's classes against Momento's levels: everyday (Neutral + Drawing) is the publishable score
  assert.deepEqual(stageOneScores({ Neutral: .5, Drawing: .3, Sexy: .15, Porn: .04, Hentai: .01 }),
    { allow: .8, level: 0, classes: { Neutral: .5, Drawing: .3, Sexy: .15, Porn: .04, Hentai: .01 }, version: 2 });
  assert.equal(stageOneScores({ Neutral: .2, Sexy: .7, Porn: .1 }).level, 25);
  assert.equal(stageOneScores({ Neutral: .1, Porn: .9 }).level, 100);
  // Method B until the reviews teach it: the starter rule (0.98 unless NSFW_STARTER_THRESHOLD)
  assert.equal(starterThreshold, .98);
  assert.equal(activeTable().source, 'starter');
  assert.equal(routeScore(1, { allow: .985 }).action, 'allow');
  assert.equal(routeScore(1, { allow: .985 }).starter, true);
  assert.equal(routeScore(1, { allow: .97 }).action, 'escalate');
  // Spot checks: the same file always gets the same answer, about the configured share of files
  assert.equal(isSpotCheck('a', 1), true);
  assert.equal(isSpotCheck('a', 0), false);
  assert.equal(isSpotCheck('abc', .1), isSpotCheck('abc', .1));
  const sampled = Array.from({ length: 2000 }, (_, i) => isSpotCheck('job-' + i, .1)).filter(Boolean).length;
  assert.ok(sampled > 140 && sampled < 260, 'about 10% spot-checked: ' + sampled);
  // Too few reviews: relearning keeps the starter rule and says why
  assert.equal((await relearn()).ok, false);
  assert.match((await ModerationCalibration.findById('stage-one')).lastError, /Not enough reviewed uploads/);
  assert.equal(activeTable().source, 'starter');

  const albums = Array.from({ length: 8 }, () => new mongoose.Types.ObjectId());
  const docs = [];
  // Confident, ordinary photos staff approved (some with a level, some without)
  for (const album of albums) for (let i = 0; i < 8; i++) docs.push(decision(album, .91 + i / 100, 'allowed', i % 2 ? { severity: 15 } : {}));
  // Uncertain photos: declined ones, and approvals staff rated 50 (allowed in context, not publishable unseen)
  const mixed = new mongoose.Types.ObjectId();
  for (let i = 0; i < 10; i++) docs.push(decision(mixed, .3, 'upheld'));
  for (let i = 0; i < 30; i++) docs.push(decision(albums[i % 8], .85, 'allowed', { severity: 50 }));
  // Not usable: still waiting, another model, no score, a cover, unreviewed, and a duplicate file
  docs.push(decision(mixed, .99, 'review-requested'));
  docs.push(decision(mixed, .99, 'allowed', { model: 'nsfwjs 4.4.0 / MobileNetV2' }));
  docs.push(decision(mixed, undefined, 'allowed', { scores: undefined, reason: 'Model unavailable' }));
  docs.push(decision(mixed, .99, 'allowed', { kind: 'cover' }));
  docs.push(decision(mixed, .99, 'allowed', { reviewedBy: undefined }));
  docs.push({ ...decision(mixed, .99, 'upheld'), hash: 'h0', at: new Date(Date.now() + 60000) });
  // Scored the old way (Neutral only, no raw classes): left out, so learning never mixes score definitions
  docs.push({ ...decision(mixed, .99, 'upheld'), scores: { allow: .99 } });
  await ModerationDecision.insertMany(docs);

  const rows = await reviewedRows();
  assert.equal(rows.length, 64 + 10 + 30);
  assert.equal(rows.filter(row => row.truth === 'allow').length, 64);
  const split = splitByGroup(rows);
  const groups = list => new Set(list.map(row => row.group));
  for (const group of groups(split.fit)) assert.ok(!groups(split.holdout).has(group), 'album in both halves');
  assert.deepEqual(splitByGroup(rows), split, 'split is repeatable');

  const { table, summary } = await calibrateFromReviews();
  assert.deepEqual(summary, { reviewed: 104, publishable: 64, albums: 9, fit: summary.fit, holdout: summary.holdout });
  assert.deepEqual(table[1].allow.map(bin => [bin.min, bin.max]), [[.9, 1]]);
  // Method A: the server relearns from the reviews, keeps the table in MongoDB and switches to it
  const learned = await relearn();
  assert.equal(learned.ok, true);
  assert.equal(learned.ranges, 1);
  assert.equal(activeTable().source, 'learned');
  assert.deepEqual(activeTable().table, table);
  assert.equal(routeScore(1, { allow: .93 }).action, 'allow', 'the learned range (0.9+) replaces the 0.98 starter');
  assert.equal(routeScore(1, { allow: .93 }).starter, undefined);
  const stored = await ModerationCalibration.findById('stage-one').lean();
  assert.deepEqual(stored.table, table);
  assert.equal(stored.lastError, null);
  // After a restart it loads what it learned
  const { setLearnedTable } = await import('../src/services/uploadChecks.js');
  setLearnedTable(null);
  assert.equal(activeTable().source, 'starter');
  await loadLearned();
  assert.equal(activeTable().source, 'learned');
  // A table learned under another score definition is ignored until relearned
  await ModerationCalibration.updateOne({ _id: 'stage-one' }, { $set: { scoreVersion: 1 } });
  await loadLearned();
  assert.equal(activeTable().source, 'starter');
  await relearn();
  assert.equal(activeTable().source, 'learned');
  assert.equal((await ModerationCalibration.findById('stage-one').lean()).scoreVersion, 2);
  assert.ok(table[1].allow[0].confidence >= .9);
  assert.equal(routeScore(1, { allow: .95 }, table).action, 'allow');
  assert.equal(routeScore(1, { allow: .85 }, table).action, 'escalate', 'severity 50 approvals do not enable a range');
  // A later rebuild with too little data never throws away what was learned
  await ModerationDecision.deleteMany({});
  assert.equal((await relearn()).ok, false);
  assert.deepEqual((await ModerationCalibration.findById('stage-one').lean()).table, table);
  assert.equal(activeTable().source, 'learned');
  await ModerationDecision.insertMany(docs);

  // The server command: table alone on stdout, summary on stderr
  const script = path.join(serverDir, 'scripts', 'calibrateFromReviews.js');
  const ok = await run(process.execPath, [script], { cwd: serverDir, env: childEnv });
  assert.deepEqual(JSON.parse(ok.stdout), table);
  assert.match(ok.stderr, /Staff-reviewed uploads: 104 photos \(64 publishable\) from 9 albums/);
  // Too little data: non-zero exit and nothing on stdout, so "&& sudo install" leaves the old table alone
  const empty = await run(process.execPath, [script], { cwd: serverDir, env: { ...childEnv, MONGODB_URI: mongo.getUri('empty') } })
    .then(() => assert.fail('should fail'), error => error);
  assert.equal(empty.code, 1);
  assert.equal(empty.stdout, '');
  assert.match(empty.stderr, /Not enough reviewed uploads/);

  // A missing or broken table file never stops the API, and fails closed: everything waits for staff
  const probe = async (file, extra = {}) => JSON.parse((await run(process.execPath, ['--input-type=module', '-e',
    "const m = await import('./src/services/uploadChecks.js'); console.log(JSON.stringify({ error: m.calibrationError, source: m.activeTable().source, bins: m.calibratedBins(1) }))"],
  { cwd: serverDir, env: { ...childEnv, NSFW_CALIBRATION: file, ...extra } })).stdout.trim().split('\n').pop());
  const missing = await probe(path.join(dir, 'missing.json'));
  assert.ok(missing.error);
  assert.equal(missing.source, 'none');
  assert.equal(missing.bins, 0);
  await writeFile(path.join(dir, 'broken.json'), '');
  assert.equal((await probe(path.join(dir, 'broken.json'))).source, 'none');
  await writeFile(path.join(dir, 'good.json'), JSON.stringify(table));
  assert.deepEqual(await probe(path.join(dir, 'good.json')), { error: null, source: 'file', bins: 1 });
  // NSFW_STARTER_THRESHOLD=off: until it learns, everything waits for staff
  assert.deepEqual(await probe('', { NSFW_STARTER_THRESHOLD: 'off' }), { error: null, source: 'none', bins: 0 });
  console.log('Passed: staff-decision calibration (severity, album halves, exclusions, stdout), fail-safe table loading.');
} finally {
  await mongoose.disconnect();
  await mongo.stop();
  await rm(dir, { recursive: true, force: true });
}
