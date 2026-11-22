// End to end: staff reviews through the real review API (Dev Mode) → the server relearns on its own → the
// calibration table is stored in MongoDB → the live check routes photos differently. Throwaway database.
//   node scripts/testLearningEndToEnd.js
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

for (const key of Object.keys(process.env)) {
  if (/^(AWS_|S3_|RECAPTCHA_|CAPTCHA_|EMAIL_|MONGODB_|FRONTEND_|CORS_|PUBLIC_|GOOGLE_|NSFW_|DEV_MODE_|RELEARN_)/.test(key)) delete process.env[key];
}
const mongo = await MongoMemoryServer.create();
Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'isolated-learning-e2e-secret-xxxxxxxxxx', MONGODB_URI: mongo.getUri(),
  PUBLIC_URL: 'http://localhost:4118', DEV_MODE_ADMIN_EMAIL: 'admin@example.invalid', RELEARN_AFTER_REVIEW_MS: '300' });
await mongoose.connect(process.env.MONGODB_URI);
const { app } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { ModerationDecision } = await import('../src/models/ModerationDecision.js');
const { ModerationCalibration } = await import('../src/models/ModerationCalibration.js');
const { ensureSlots } = await import('../src/services/devModeService.js');
const { routeScore, activeTable } = await import('../src/services/uploadChecks.js');
const { withDevMode } = await import('./devModeTestKit.js');
const server = app.listen(4118);
const BASE = 'http://localhost:4118';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// A middle-zone photo: risk 0.65 (all "Porn"), above the 0.4 auto-publish line and under the 0.85 hard decline, so it goes to staff review
const photo = (allow) => ({ Neutral: allow, Drawing: 0, Sexy: 0, Porn: 1 - allow, Hentai: 0 });
const route = () => routeScore({ classes: photo(.35) });

try {
  await User.create({ name: 'Admin', email: 'admin@example.invalid', passwordHash: await bcrypt.hash('Correct-horse-9', 4), emailVerified: true, plan: 'staff' });
  await ensureSlots();
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.invalid', password: 'Correct-horse-9' }) });
  const cookie = await withDevMode(BASE, login.headers.get('set-cookie').split(';')[0], 'Reviewer_A');

  // Before: no learned table; the photo goes to review
  assert.equal(activeTable().source, 'thresholds');
  assert.equal(route().action, 'decline');
  console.log('Before any review: score 0.35 →', route().action, '(review)');

  // 60 photos in that score range waiting for review, across 6 albums
  const user = new mongoose.Types.ObjectId();
  const albums = Array.from({ length: 6 }, () => new mongoose.Types.ObjectId());
  const waiting = await ModerationDecision.insertMany(Array.from({ length: 60 }, (_, i) => ({ user, album: albums[i % 6], kind: 'photo',
    hash: 'p' + i, model: 'NSFW.js MobileNetV2', status: 'review-requested', scores: { allow: .35, classes: photo(.34 + (i % 10) / 1000), version: 6 } })));
  const review = (d, body) => fetch(BASE + '/api/admin/moderation/' + d._id, { method: 'POST',
    headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => assert.equal(r.status, 200, await r.text()));

  // Staff publish them all at level 15 (beach / swimwear), through the review API
  for (const d of waiting) await review(d, { allow: true, severity: 15, reasons: [] });
  await wait(1500);
  const stored = await ModerationCalibration.findById('stage-one').lean();
  console.log('Calibration table stored:', JSON.stringify(stored.table[1]), `(${stored.reviewed} reviews)`);
  assert.equal(activeTable().source, 'learned');
  assert.equal(route().action, 'allow');
  assert.equal(route().learned, true);
  console.log('After staff published 60: score 0.35 →', route().action, '(publishes on its own, learned)');

  // Staff change their minds: keep 20 of them private with a reason → the newest ratings win, the range closes again
  for (const d of waiting.slice(0, 20)) await review(d, { allow: false, severity: 15, reasons: ['clothed', 'touching'] });
  await wait(1500);
  const after = await ModerationCalibration.findById('stage-one').lean();
  console.log('Relearned table:', JSON.stringify(after.table[1]), 'reasons:', JSON.stringify(after.reasons));
  assert.equal(route().action, 'decline');
  assert.equal(after.reasons.touching.kept, 20);
  console.log('After staff kept 20 private: score 0.35 →', route().action, '(back to review)');
  console.log('\nEnd-to-end learning: all checks passed');
} finally {
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
}
