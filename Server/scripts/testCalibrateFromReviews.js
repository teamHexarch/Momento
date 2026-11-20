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
const { calibrateFromReviews, reviewedRows, splitByGroup } = await import('./calibrateFromReviews.js');
const { routeScore } = await import('../src/services/uploadChecks.js');

const user = new mongoose.Types.ObjectId(), staff = new mongoose.Types.ObjectId();
let n = 0;
const decision = (album, allow, status, extra = {}) => ({ user, album, kind: 'photo', hash: 'h' + n++, model: 'NSFW.js MobileNetV2',
  scores: { allow }, status, reviewedBy: staff, ...extra });
try {
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
  await ModerationDecision.insertMany(docs);

  const rows = await reviewedRows();
  assert.equal(rows.length, 64 + 10 + 30);
  assert.equal(rows.filter(row => row.truth === 'allow').length, 64);
  const split = splitByGroup(rows);
  const groups = list => new Set(list.map(row => row.group));
  for (const group of groups(split.fit)) assert.ok(!groups(split.holdout).has(group), 'album in both halves');
  assert.deepEqual(splitByGroup(rows), split, 'split is repeatable');

  const table = await calibrateFromReviews();
  assert.deepEqual(table[1].allow.map(bin => [bin.min, bin.max]), [[.9, 1]]);
  assert.ok(table[1].allow[0].confidence >= .9);
  assert.equal(routeScore(1, { allow: .95 }, table).action, 'allow');
  assert.equal(routeScore(1, { allow: .85 }, table).action, 'escalate', 'severity 50 approvals do not enable a range');

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

  // A missing or broken table never stops the API: nothing is released automatically
  const probe = async file => JSON.parse((await run(process.execPath, ['--input-type=module', '-e',
    "const m = await import('./src/services/uploadChecks.js'); console.log(JSON.stringify({ error: m.calibrationError, bins: m.calibratedBins(1) }))"],
  { cwd: serverDir, env: { ...childEnv, NSFW_CALIBRATION: file } })).stdout.trim().split('\n').pop());
  assert.equal((await probe(path.join(dir, 'missing.json'))).bins, 0);
  assert.ok((await probe(path.join(dir, 'missing.json'))).error);
  await writeFile(path.join(dir, 'broken.json'), '');
  assert.equal((await probe(path.join(dir, 'broken.json'))).bins, 0);
  await writeFile(path.join(dir, 'good.json'), JSON.stringify(table));
  assert.deepEqual(await probe(path.join(dir, 'good.json')), { error: null, bins: 1 });
  console.log('Passed: staff-decision calibration (severity, album halves, exclusions, stdout), fail-safe table loading.');
} finally {
  await mongoose.disconnect();
  await mongo.stop();
  await rm(dir, { recursive: true, force: true });
}
