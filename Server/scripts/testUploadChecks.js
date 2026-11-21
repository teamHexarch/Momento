// The nudity check for album photos (one model, NSFW.js MobileNetV2, on this server; services/uploadChecks.js):
// confident photos publish, the rest are declined and private, and only "Request review" sends one to staff
// (emailing them). Model scores come from a stand-in, so no real model is loaded.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import sharp from 'sharp';
import bcrypt from 'bcryptjs';

const dir = await mkdtemp(path.join(os.tmpdir(), 'momento-upload-checks-'));
const mongo = await MongoMemoryServer.create();
Object.assign(process.env, { NSFW_CALIBRATION: '', NODE_ENV: 'test', S3_BUCKET: '',
  MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-only-isolated', UPLOAD_DIR: dir, PUBLIC_URL: 'http://localhost:4000',
  CLIENT_DIR: fileURLToPath(new URL('../../Client/', import.meta.url)) });
await mongoose.connect(process.env.MONGODB_URI);
const { app } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { Photo } = await import('../src/models/Photo.js');
const { UploadCheck } = await import('../src/models/UploadCheck.js');
const { ModerationDecision } = await import('../src/models/ModerationDecision.js');
const { routeScore, processCheck, expireRefusals } = await import('../src/services/uploadChecks.js');
const nsfw = await import('../src/services/nsfwService.js');
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
let checks = 0;
async function request(url, status, cookie = '', method = 'GET', body) {
  const form = body instanceof FormData;
  const response = await fetch(origin + url, { method, headers: { cookie, ...(!form && body && { 'Content-Type': 'application/json' }) },
    body: form ? body : body && JSON.stringify(body) });
  assert.equal(response.status, status, url + ' ' + (response.status === status ? '' : await response.text()));
  checks++;
  return response;
}
// Emails are printed in tests ("[email not set up] To: ... | Subject: ..."): collected here
const mails = [];
const log = console.log;
console.log = (...args) => { const line = args.join(' '); if (line.startsWith('[email not set up]')) mails.push(line); else log(...args); };
// The stand-in model: what it "sees" in the next photos
const SURE = { Neutral: .97, Drawing: .01, Sexy: .01, Porn: .005, Hentai: .005 };
const UNSURE = { Neutral: .3, Sexy: .2, Porn: .5 };
nsfw.useClassifier(async () => SURE);

try {
  // ---- What publishes on its own: a range trusted at 85% or more ----
  const bins = confidence => ({ 1: { allow: [{ min: .8, max: 1, confidence }] } });
  assert.equal(routeScore({ allow: .86 }).action, 'allow', 'the starter rule: 85%+ sure of level 0-50 publishes');
  assert.equal(routeScore({ allow: .86 }).starter, true);
  assert.equal(routeScore({ allow: .84 }).action, 'decline');
  assert.equal(routeScore({ allow: 1 }, bins(.8499)).action, 'decline');
  assert.equal(routeScore({ allow: 1 }, bins(.85)).action, 'allow');
  assert.equal(routeScore({ allow: NaN }).action, 'decline');

  const password = 'test-user-password-123';
  const user = await User.create({ name: 'Host', email: 'host@example.invalid', passwordHash: await bcrypt.hash(password, 4), emailVerified: true });
  const staffUser = await User.create({ name: 'Staff', email: 'staff@example.invalid', passwordHash: await bcrypt.hash(password, 4), emailVerified: true, plan: 'staff' });
  const login = async (u) => (await request('/api/auth/login', 200, '', 'POST', { email: u.email, password })).headers.get('set-cookie').split(';')[0];
  const cookie = await login(user), staff = await login(staffUser);
  const { album } = await (await request('/api/albums', 201, cookie, 'POST', { kind: 'album', name: 'Moderation test', date: '2026-11-21' })).json();
  const url = '/api/albums/' + album.id;
  let shade = 0;
  const form = async (...names) => {
    const f = new FormData();
    for (const name of names) f.append('photos', new Blob([await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 10 + 5 * shade, g: 200 - 3 * shade++, b: 90 } } }).jpeg().toBuffer()]), name);
    return f;
  };

  // ---- A confident photo is published at once (small uploads are checked inside the request) ----
  const ok = await (await request(url + '/photos', 201, cookie, 'POST', await form('ordinary.jpg'))).json();
  assert.equal(ok.photos.length, 1);
  assert.equal(ok.checks.length, 0);
  assert.ok(await Photo.exists({ _id: ok.photos[0].id }));

  // ---- An uncertain one is declined: private, shown only to its uploader, and NOT sent to staff ----
  nsfw.useClassifier(async () => UNSURE);
  const no = await (await request(url + '/photos', 201, cookie, 'POST', await form('unsure.jpg'))).json();
  assert.equal(no.photos.length, 0);
  const declined = no.checks[0];
  assert.equal(declined.state, 'rejected');
  assert.equal(no.declined, 1);
  await request('/api/photos/' + declined.id, 404, cookie);
  const mine = (await (await request(url + '/checks', 200, cookie)).json()).checks;
  assert.deepEqual(mine.map(c => [c.name, c.state, !!c.reviewed]), [['unsure.jpg', 'rejected', false]]);
  assert.equal((await ModerationDecision.findById(declined.id)).status, 'final');
  assert.equal((await (await request('/api/admin/moderation', 200, staff)).json()).decisions.length, 0, 'nothing reaches staff on its own');
  assert.equal(mails.length, 0, 'and nobody is emailed');
  // Nobody else sees it, not even in their status list
  await request('/api/admin/moderation/' + declined.id + '/preview', 404, cookie);

  // ---- Request review: now it goes to staff, who are emailed with a link to the review page ----
  const asked = await (await request('/api/auth/moderation/' + declined.id + '/review', 200, cookie, 'POST', {})).json();
  assert.match(asked.message, /staff member will review/);
  assert.equal((await UploadCheck.findById(declined.id)).state, 'review');
  await new Promise(r => setTimeout(r, 50));
  assert.equal(mails.length, 1);
  assert.match(mails[0], /To: team@hexarch\.org \| Subject: \[Momento review\] An album photo is waiting for review/);
  await request('/api/auth/moderation/' + declined.id + '/review', 200, cookie, 'POST', {});
  await new Promise(r => setTimeout(r, 50));
  assert.equal(mails.length, 1, 'asking twice emails once');
  // Only the uploader can ask
  await request('/api/auth/moderation/' + declined.id + '/review', 404, staff, 'POST', {});

  // ---- The review page lists it (album, file, private preview); staff approve it and it's published ----
  const queue = (await (await request('/api/admin/moderation', 200, staff)).json()).decisions;
  const waiting = queue.find(d => d.id === declined.id);
  assert.equal(waiting.albumName, 'Moderation test');
  assert.equal(waiting.fileName, 'unsure.jpg');
  assert.equal(waiting.preview, true);
  await request('/api/admin/moderation/' + declined.id + '/preview', 200, staff);
  await request('/api/admin/moderation/' + declined.id, 404, cookie, 'POST', { allow: true, severity: 15 });   // not staff
  await request('/api/admin/moderation/' + declined.id, 400, staff, 'POST', { allow: true, severity: 33 });
  assert.equal((await (await request('/api/admin/moderation/' + declined.id, 200, staff, 'POST', { allow: true, severity: 15 })).json()).severity, 15);
  await processCheck(0);
  assert.ok(await Photo.exists({ _id: declined.id }), 'approved: published');

  // ---- Staff decline: it stays private, can't be sent again, and is deleted after 30 days ----
  const no2 = (await (await request(url + '/photos', 201, cookie, 'POST', await form('explicit.jpg'))).json()).checks[0];
  await request('/api/auth/moderation/' + no2.id + '/review', 200, cookie, 'POST', {});
  await request('/api/admin/moderation/' + no2.id, 200, staff, 'POST', { allow: false, severity: 100 });
  assert.equal((await UploadCheck.findById(no2.id)).state, 'rejected');
  const after = (await (await request(url + '/checks', 200, cookie)).json()).checks.find(c => c.id === no2.id);
  assert.equal(after.reviewed, true, 'the album says staff declined it (no Request review button)');
  await request('/api/auth/moderation/' + no2.id + '/review', 404, cookie, 'POST', {});
  await UploadCheck.collection.updateOne({ _id: new mongoose.Types.ObjectId(no2.id) }, { $set: { updatedAt: new Date(Date.now() - 31 * 86400000) } });
  await expireRefusals();
  assert.equal(await UploadCheck.exists({ _id: no2.id }), null, 'declined over 30 days ago: deleted');
  await request('/api/photos/' + no2.id, 404, cookie);

  // ---- A big upload (over 10 photos) is checked in the background by the queue ----
  nsfw.useClassifier(async () => SURE);
  const names = Array.from({ length: 11 }, (_, i) => `batch-${i}.jpg`);
  const big = await (await request(url + '/photos', 202, cookie, 'POST', await form(...names))).json();
  assert.equal(big.checks.length, 11);
  assert.ok(big.checks.every(c => c.state === 'checking'));
  while (await processCheck(1) || await processCheck(0)) { /* drain the queue */ }
  assert.equal(await Photo.countDocuments({ _id: { $in: big.checks.map(c => c.id) } }), 11);

  // ---- The model failing never publishes a photo: after 3 tries it's declined, and can be sent for review ----
  nsfw.useClassifier(async () => { throw new Error('simulated outage'); });
  const broken = (await (await request(url + '/photos', 202, cookie, 'POST', await form('outage.jpg'))).json()).checks[0];
  assert.equal(broken.state, 'checking', 'tried once in the request, then left to the queue');
  for (let i = 0; i < 2; i++) { await UploadCheck.updateOne({ _id: broken.id }, { due: new Date(0) }); await processCheck(1); }
  assert.equal((await UploadCheck.findById(broken.id)).state, 'rejected');
  assert.match((await ModerationDecision.findById(broken.id)).reason, /couldn’t run/);
  await request('/api/photos/' + broken.id, 404, cookie);

  // ---- The review page and the staff status ----
  const status = await (await request('/api/admin/moderation-status', 200, staff)).json();
  assert.equal(status.enabled, true);
  assert.equal(status.source, 'starter');
  assert.equal('spotCheck' in status, false, 'no spot checks');
  const relearned = await (await request('/api/admin/moderation-status/relearn', 200, staff, 'POST', {})).json();
  assert.equal(typeof relearned.result.ok, 'boolean');
  const page = await (await request('/review.html', 200)).text();
  assert.match(page, /Photo review/);
  assert.match(page, /href="albums\.html"[^>]*>[\s\S]*?Back to My albums/, 'a way back to the albums');
  for (const link of ['index.html', 'albums.html', 'events.html', 'settings.html']) assert.match(page, new RegExp(`class="site-nav[\\s\\S]*href="${link}"`), link);
  for (const p of ['index.html', 'albums.html', 'events.html', 'settings.html', 'support.html']) {
    const html = await (await request('/' + p, 200)).text();
    assert.match(html, /data-act="review" hidden>\$\{ICON\.review\}Photo review/, p);
    assert.match(html, /built\.review\.hidden = !\(a && a\.plan === 'staff'\)/, p);
  }
  console.log = log;
  console.log(`Passed: photo checks (${checks} requests): confident photos publish, uncertain ones are declined and private, Request review sends them to staff with an email, staff decide, 30-day clean-up, background queue and model failures.`);
} finally {
  console.log = log;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
  await rm(dir, { recursive: true, force: true });
}
