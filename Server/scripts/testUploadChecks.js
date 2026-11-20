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
Object.assign(process.env, { NSFW_PIPELINE: 'three-stage', NSFW_CALIBRATION: '', NSFW_SPOT_CHECK: '0', NODE_ENV: 'test', S3_BUCKET: '',
  MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-only-isolated', UPLOAD_DIR: dir, PUBLIC_URL: 'http://localhost:4000',
  CLIENT_DIR: fileURLToPath(new URL('../../Client/', import.meta.url)) });
await mongoose.connect(process.env.MONGODB_URI);
const { app } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { Photo } = await import('../src/models/Photo.js');
const { UploadCheck } = await import('../src/models/UploadCheck.js');
const { Report } = await import('../src/models/Report.js');
const { auditOne, startAlbumAudits } = await import('../src/services/albumAudit.js');
const { routeScore, processCheck } = await import('../src/services/uploadChecks.js');
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const bins = confidence => [{ min: .8, max: 1, confidence }];
const table = { 1: { allow: bins(.90) }, 2: { allow: bins(.85) }, 3: { allow: bins(.85), reject: bins(.85) } };
async function request(url, status, cookie = '', method = 'GET', body) {
  const form = body instanceof FormData;
  const response = await fetch(origin + url, { method, headers: { cookie, ...(!form && { 'Content-Type': 'application/json' }) },
    body: form ? body : JSON.stringify(body) });
  assert.equal(response.status, status, url + ' ' + (response.status === status ? '' : await response.text()));
  return response;
}
try {
  assert.equal(routeScore(1, { allow: 1 }, { 1: { allow: bins(.8499) } }).action, 'escalate', 'a range must be 85% sure');
  assert.equal(routeScore(1, { allow: 1 }, { 1: { allow: bins(.85) } }).action, 'allow');
  assert.equal(routeScore(2, { allow: .85 }, table).action, 'allow');
  assert.equal(routeScore(2, { reject: 1 }, table).action, 'escalate');
  assert.equal(routeScore(3, { severity: 75, reject: 1 }, table).action, 'review');
  assert.equal(routeScore(3, { severity: 100, reject: .99 }, {}).action, 'review');
  const password = 'test-user-password-123';
  const user = await User.create({ name: 'Host', email: 'host@example.invalid', passwordHash: await bcrypt.hash(password, 4), emailVerified: true });
  const cookie = (await request('/api/auth/login', 200, '', 'POST', { email: user.email, password })).headers.get('set-cookie').split(';')[0];
  const { album } = await (await request('/api/albums', 201, cookie, 'POST', { kind: 'album', name: 'Moderation test', date: '2026-11-21' })).json();
  const url = '/api/albums/' + album.id;
  const upload = async (color, name) => {
    const bytes = await sharp({ create: { width: 64, height: 64, channels: 3, background: color } }).jpeg().toBuffer();
    const form = new FormData();
    form.append('photos', new Blob([bytes]), name);
    return (await (await request(url + '/photos', 202, cookie, 'POST', form)).json()).checks[0];
  };
  const one = await upload('green', 'ordinary.jpg');
  const two = await upload('red', 'needs-review.jpg');
  assert.equal(await Photo.countDocuments(), 0);
  assert.equal((await upload('green', 'ordinary.jpg')).id, one.id);
  await request('/api/photos/' + two.id, 404, cookie);
  let entered, resume;
  const started = new Promise(resolve => { entered = resolve; });
  const pausedModel = new Promise(resolve => { resume = resolve; });
  const firstCheck = processCheck(1, async () => { entered(); await pausedModel; return { allow: .99 }; }, table);
  await started;
  await request('/api/health', 200);
  await request('/api/albums', 200, cookie);
  assert.equal((await (await request(url + '/checks', 200, cookie)).json()).checks.length, 2);
  resume();
  await firstCheck;
  await processCheck(0);
  assert.equal((await (await request(url, 200, cookie)).json()).photos.length, 1);
  await processCheck(1, async () => ({ allow: .2 }), table);
  await processCheck(2, async () => ({ allow: .2 }), table);
  await processCheck(3, async () => ({ allow: .1, reject: .1, severity: 75 }), table);
  assert.equal((await UploadCheck.findById(two.id)).state, 'review');
  await request('/api/admin/moderation/' + two.id + '/preview', 404, cookie);
  await User.updateOne({ _id: user._id }, { $set: { plan: 'staff' } });
  await request('/api/admin/moderation/' + two.id + '/preview', 200, cookie);
  // The review page's list: album, file name and whether a private preview exists
  const queue = (await (await request('/api/admin/moderation', 200, cookie)).json()).decisions;
  const waiting = queue.find(d => d.id === two.id);
  assert.equal(waiting.albumName, 'Moderation test');
  assert.equal(waiting.fileName, 'needs-review.jpg');
  assert.equal(waiting.preview, true);
  assert.equal(waiting.severity, null);
  // The page itself, and the staff-only menu item under "Account settings" on every page
  assert.match(await (await request('/review.html', 200)).text(), /Photo review/);
  for (const page of ['index.html', 'albums.html', 'events.html', 'settings.html', 'support.html']) {
    const html = await (await request('/' + page, 200)).text();
    assert.match(html, /data-act="review" hidden>\$\{ICON\.review\}Photo review/, page);
    assert.match(html, /built\.review\.hidden = !\(a && a\.plan === 'staff'\)/, page);
  }
  await request('/api/admin/moderation/' + two.id, 400, cookie, 'POST', { allow: true, severity: 33 });
  assert.equal((await UploadCheck.findById(two.id)).state, 'review', 'an invalid severity changes nothing');
  const reviewed = await (await request('/api/admin/moderation/' + two.id, 200, cookie, 'POST', { allow: true, severity: 15 })).json();
  assert.equal(reviewed.severity, 15);
  await processCheck(0);
  assert.equal(await Photo.countDocuments(), 2);
  const three = await upload('blue', 'declined.jpg');
  for (const stage of [1, 2, 3]) await processCheck(stage, async () => ({ allow: .01, reject: .99, severity: 100 }), table);
  assert.equal((await UploadCheck.findById(three.id)).state, 'rejected');
  await request('/api/photos/' + three.id, 404, cookie);
  await request('/api/photos/' + one.id + '/report', 201, cookie, 'POST', { reason: 'nudity' });
  await auditOne(async stage => { assert.equal(stage, 3); return { severity: 100, reject: 1 }; }, table);
  assert.ok(await Report.exists({ photo: one.id, source: 'model', status: 'open' }));
  await request('/api/photos/' + one.id, 404, cookie);
  const retry = await upload('purple', 'retry.jpg');
  await processCheck(1, async () => { throw new Error('simulated transient outage'); }, table);
  assert.equal((await UploadCheck.findById(retry.id)).state, 'checking');
  await UploadCheck.updateOne({ _id: retry.id }, { due: new Date(0) });
  await processCheck(1, async () => ({ allow: .3 }), table);
  await processCheck(2, async () => ({ allow: .99 }), table);
  await processCheck(0);
  assert.ok(await Photo.exists({ _id: retry.id }));
  // Stage-one mode (last stage 1): a confident pass publishes, an uncertain score goes to staff, never to stage 2
  const sure = await upload('yellow', 'stage-one-sure.jpg');
  await processCheck(1, async () => ({ allow: .95 }), table, 1);
  assert.equal((await UploadCheck.findById(sure.id)).state, 'publish');
  await processCheck(0);
  assert.ok(await Photo.exists({ _id: sure.id }));
  // A spot check sends a photo the model would publish to staff instead, saying so
  const spot = await upload('teal', 'stage-one-spot-check.jpg');
  await processCheck(1, async () => ({ allow: .99 }), table, 1, 1);
  assert.equal((await UploadCheck.findById(spot.id)).state, 'review');
  const { ModerationDecision } = await import('../src/models/ModerationDecision.js');
  assert.match((await ModerationDecision.findById(spot.id)).reason, /Spot check/);
  assert.equal((await UploadCheck.findById(spot.id)).history.at(-1).spotCheck, true);
  // The review page's status of what publishes on its own (three-stage here: no stage-one learning)
  const status = await (await request('/api/admin/moderation-status', 200, cookie)).json();
  assert.equal(status.enabled, false);
  assert.equal(typeof status.reviewed, 'number');
  const relearned = await (await request('/api/admin/moderation-status/relearn', 200, cookie, 'POST', {})).json();
  assert.equal(typeof relearned.result.ok, 'boolean');
  const unsure = await upload('orange', 'stage-one-unsure.jpg');
  await processCheck(1, async () => ({ allow: .5 }), table, 1);
  assert.equal((await UploadCheck.findById(unsure.id)).state, 'review');
  const uncalibrated = await upload('pink', 'stage-one-uncalibrated.jpg');
  await processCheck(1, async () => ({ allow: .99 }), {}, 1);
  assert.equal((await UploadCheck.findById(uncalibrated.id)).state, 'review');
  await Photo.updateOne({ _id: retry.id }, { $set: { nextAudit: new Date(0) } });
  await auditOne(async () => ({ allow: 1 }), table);
  assert.ok((await Photo.findById(retry.id)).nextAudit > new Date());
  const due = { _id: { $in: [retry.id, two.id] } };
  await Photo.updateMany(due, { nextAudit: new Date(0) });
  const scheduled = [];
  const stopAudits = startAlbumAudits(async () => ({ allow: 1 }), table, (tick, delay) => {
    scheduled.push({ tick, delay });
    return { unref() { return this; } };
  });
  try {
    for (const expected of [1, 2]) {
      assert.equal(scheduled.length, 1);
      const next = scheduled.shift();
      assert.equal(next.delay, 60000);
      await next.tick();
      assert.equal(await Photo.countDocuments({ ...due, nextAudit: { $gt: new Date(Date.now() + 86400000) } }), expected);
    }
  } finally { stopAudits(); }
  if (process.argv.includes('--browser')) {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge' });
    try {
      const page = await browser.newPage();
      await page.route('**/*', async route => {
        const target = new URL(route.request().url());
        if (target.origin !== 'http://localhost:4000') return route.abort();
        const response = await route.fetch({ url: origin + target.pathname + target.search,
          headers: { ...route.request().headers(), cookie } });
        await route.fulfill({ response });
      });
      await page.goto('http://localhost:4000/albums.html?album=' + album.id);
      await page.locator('#albumModal[open]').waitFor();
      const bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'yellow' } }).jpeg().toBuffer();
      await page.locator('#albumFiles').setInputFiles({ name: 'browser.jpg', mimeType: 'image/jpeg', buffer: bytes });
      await page.locator('dialog.ev-ask [data-yes]').click();
      await page.getByText('browser.jpg — Checking', { exact: true }).waitFor();
      await page.waitForFunction(() => !document.getElementById('albumAdd').disabled);
      const before = await page.locator('#albumModal .ab-tile').count();
      await processCheck(1, async () => ({ allow: .99 }), table);
      await processCheck(0);
      await page.waitForFunction(count => document.querySelectorAll('#albumModal .ab-tile').length === count + 1, before);
      console.log('Browser verified: upload acknowledgement, controls available during checking, automatic publication.');
    } finally { await browser.close(); }
  }
  console.log('Passed: asynchronous upload, routing, incremental publication, review permissions, staff approval, rejection and flagged-photo audit.');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
  await rm(dir, { recursive: true, force: true });
}
