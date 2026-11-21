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
Object.assign(process.env, { NSFW_CALIBRATION: '', NODE_ENV: 'test', S3_BUCKET: '', DEV_MODE_ADMIN_EMAIL: 'staff@example.invalid',
  MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-only-isolated', UPLOAD_DIR: dir, PUBLIC_URL: 'http://localhost:4000',
  CLIENT_DIR: process.env.CLIENT_DIR || fileURLToPath(new URL('../../Client/', import.meta.url)) });
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
  // ---- The thresholds: risk (Porn + Hentai + Sexy) under 25% publishes; Porn or Hentai 85%+ is a hard decline ----
  const cls = (porn, sexy = 0, hentai = 0) => ({ classes: { Neutral: 1 - porn - sexy - hentai, Drawing: 0, Sexy: sexy, Porn: porn, Hentai: hentai } });
  assert.equal(routeScore(cls(.1, .1)).action, 'allow');
  assert.equal(routeScore(cls(.1, .15)).action, 'decline');
  assert.equal(routeScore(cls(0, .99)).explicit, undefined, 'swimwear can always be reviewed');
  assert.equal(routeScore(cls(.85)).explicit, true);
  assert.equal(routeScore(cls(0, 0, .9)).explicit, true);

  const password = 'test-user-password-123';
  const user = await User.create({ name: 'Host', email: 'host@example.invalid', passwordHash: await bcrypt.hash(password, 4), emailVerified: true });
  const staffUser = await User.create({ name: 'Staff', email: 'staff@example.invalid', passwordHash: await bcrypt.hash(password, 4), emailVerified: true, plan: 'staff' });
  const login = async (u) => (await request('/api/auth/login', 200, '', 'POST', { email: u.email, password })).headers.get('set-cookie').split(';')[0];
  const cookie = await login(user), staffLogin = await login(staffUser);
  // Moderation needs Dev Mode: the shared admin account plus a personal access code
  await request('/api/admin/moderation', 401, staffLogin);
  const { withDevMode } = await import('./devModeTestKit.js');
  const staff = await withDevMode(origin, staffLogin);
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
  assert.match(asked.message, /within 1–2 working days/);
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
  // Who reviewed it: nobody yet
  assert.equal((await (await request('/api/admin/moderation/' + declined.id, 200, staff)).json()).waiting, true);
  await request('/api/admin/moderation/' + declined.id, 404, cookie);   // staff only
  const why = ['swimwear', 'beach-sport'];
  await request('/api/admin/moderation/' + declined.id, 404, cookie, 'POST', { allow: true, severity: 15, reasons: why });   // not staff
  await request('/api/admin/moderation/' + declined.id, 400, staff, 'POST', { allow: true, severity: 33, reasons: why });
  // A level is always needed; keeping it private needs a reason too; only known reasons; level 100 or a possible
  // minor never publishes
  await request('/api/admin/moderation/' + declined.id, 400, staff, 'POST', { allow: true, reasons: why });
  await request('/api/admin/moderation/' + declined.id, 400, staff, 'POST', { allow: false, severity: 50 });
  await request('/api/admin/moderation/' + declined.id, 400, staff, 'POST', { allow: false, severity: 50, reasons: [] });
  await request('/api/admin/moderation/' + declined.id, 400, staff, 'POST', { allow: true, severity: 15, reasons: ['made-up'] });
  await request('/api/admin/moderation/' + declined.id, 400, staff, 'POST', { allow: true, severity: 100, reasons: ['sexual-act'] });
  await request('/api/admin/moderation/' + declined.id, 400, staff, 'POST', { allow: true, severity: 0, reasons: ['clothed', 'possible-minor'] });
  assert.equal((await ModerationDecision.findById(declined.id)).status, 'review-requested', 'refused reviews change nothing');
  // Publishing needs only the level
  const reviewed = await (await request('/api/admin/moderation/' + declined.id, 200, staff, 'POST', { allow: true, severity: 15 })).json();
  assert.deepEqual([reviewed.severity, reviewed.reasons], [15, []]);
  await processCheck(0);
  assert.ok(await Photo.exists({ _id: declined.id }), 'approved: published');
  const decided = await (await request('/api/admin/moderation/' + declined.id, 200, staff)).json();
  assert.deepEqual([decided.waiting, decided.decision, decided.reviewedBy, decided.severity], [false, 'approved', 'you', 15]);
  // The uploader is told: in their inbox and by email
  await new Promise(r => setTimeout(r, 100));
  const inbox = (await (await request('/api/notifications', 200, cookie)).json()).notifications;
  assert.ok(inbox.some(n => n.type === 'review-approved'), 'approved: in the uploader’s inbox');
  assert.ok(mails.some(m => m.includes('To: host@example.invalid') && m.includes('Your photo was approved')), 'and emailed');
  assert.equal(typeof (await ModerationDecision.findById(declined.id)).dueDay, 'string', 'a due day was set when the review was asked for');

  // ---- Staff decline: it stays private, can't be sent again, and is deleted after 30 days ----
  const no2 = (await (await request(url + '/photos', 201, cookie, 'POST', await form('explicit.jpg'))).json()).checks[0];
  await request('/api/auth/moderation/' + no2.id + '/review', 200, cookie, 'POST', {});
  // Staff may keep a low level private too: clothed, but a sexual act
  const kept = await (await request('/api/admin/moderation/' + no2.id, 200, staff, 'POST', { allow: false, severity: 25, reasons: ['clothed', 'touching'] })).json();
  assert.deepEqual(kept.reasons, ['clothed', 'touching'], 'the reasons for keeping it private are saved');
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

  // ---- Names in any language arrive intact; you can delete your own photo; a declined upload can be removed ----
  nsfw.useClassifier(async () => SURE);
  const named = (await (await request(url + '/photos', 201, cookie, 'POST', await form('螢幕擷取畫面 2026.png'))).json()).photos[0];
  assert.equal((await UploadCheck.findById(named.id)).originalName, '螢幕擷取畫面 2026.png');
  const guestUser = await User.create({ name: 'Guest', email: 'guest@example.invalid', passwordHash: await bcrypt.hash(password, 4), emailVerified: true });
  const guest = await login(guestUser);
  await request('/api/albums/join', 201, guest, 'POST', { code: album.code });
  const guestPhoto = (await (await request(url + '/photos', 201, guest, 'POST', await form('mine.jpg'))).json()).photos[0];
  await request('/api/trash', 403, guest, 'POST', { photoIds: [named.id] });   // not theirs
  assert.equal((await (await request('/api/trash', 200, guest, 'POST', { photoIds: [guestPhoto.id] })).json()).moved, 1, 'the uploader deletes their own');
  assert.equal((await (await request('/api/trash/restore', 200, guest, 'POST', { photoIds: [guestPhoto.id] })).json()).restored, 1, 'and can undo it');
  assert.equal((await (await request('/api/trash', 200, cookie, 'POST', { photoIds: [guestPhoto.id] })).json()).moved, 1, 'the host deletes any');
  nsfw.useClassifier(async () => UNSURE);
  const gone = (await (await request(url + '/photos', 201, cookie, 'POST', await form('remove-me.jpg'))).json()).checks[0];
  await request(url + '/checks/' + gone.id, 404, guest, 'DELETE');
  await request(url + '/checks/' + gone.id, 200, cookie, 'DELETE');
  assert.equal(await UploadCheck.exists({ _id: gone.id }), null, 'removed from the list and deleted');

  // ---- 85%+ sure it's nudity: declined with no Request review, and nobody is emailed ----
  nsfw.useClassifier(async () => ({ Neutral: .03, Sexy: .02, Porn: .95 }));
  const sureNo = (await (await request(url + '/photos', 201, cookie, 'POST', await form('sure.jpg'))).json()).checks[0];
  assert.equal(sureNo.explicit, true);
  const before = mails.length;
  await request('/api/auth/moderation/' + sureNo.id + '/review', 400, cookie, 'POST', {});
  assert.equal(mails.length, before, 'no email for a photo the check is sure about');
  assert.equal((await (await request(url + '/checks', 200, cookie)).json()).checks.find(c => c.id === sureNo.id).explicit, true);

  // ---- In a real browser: staff open the email's link and see the picture, at its own shape ----
  if (process.argv.includes('--browser')) {
    nsfw.useClassifier(async () => UNSURE);
    const tall = new FormData();
    tall.append('photos', new Blob([await sharp({ create: { width: 300, height: 600, channels: 3, background: '#c83c64' } }).jpeg().toBuffer()]), 'portrait.jpg');
    const waitingId = (await (await request(url + '/photos', 201, cookie, 'POST', tall)).json()).checks[0].id;
    mails.length = 0;
    await request('/api/auth/moderation/' + waitingId + '/review', 200, cookie, 'POST', {});
    await new Promise(r => setTimeout(r, 100));
    const link = 'review.html?id=' + waitingId;   // the email's button (services/reviewAlerts.js)
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge' });
    try {
      const page = await (await browser.newContext()).newPage();
      // The page and the API are served by this test server (as hexarch.org and api.hexarch.org would be)
      await page.route('**/*', async route => {
        const target = new URL(route.request().url());
        if (!['http://localhost:4000'].includes(target.origin)) return route.abort();
        const response = await route.fetch({ url: origin + target.pathname + target.search, headers: { ...route.request().headers(), cookie: staff } });
        await route.fulfill({ response });
      });
      await page.goto('http://localhost:4000/' + link);
      await page.locator('#stage:not([hidden])').waitFor();
      await page.waitForFunction(() => document.getElementById('photo').naturalWidth > 0);
      const shown = await page.evaluate(() => { const i = document.getElementById('photo'); const r = i.getBoundingClientRect(), f = i.parentElement.getBoundingClientRect();
        return { w: i.naturalWidth, h: i.naturalHeight, name: document.getElementById('name').textContent, inside: r.bottom <= f.bottom + 1 && r.right <= f.right + 1,
          scroll: document.documentElement.scrollHeight - innerHeight, scrollX: document.documentElement.scrollWidth - innerWidth,
          levels: [...document.querySelectorAll('#levels .lv')].map((x) => x.dataset.value).join(','), levelsOnScreen: document.getElementById('levels').getBoundingClientRect().bottom <= innerHeight }; });
      assert.ok(shown.w > 0 && shown.h > shown.w, 'the picture shows, taller than wide: ' + JSON.stringify(shown));
      assert.ok(shown.inside, 'the picture fits inside its frame');
      assert.equal(shown.scroll, 0, 'one screen: no vertical scrolling');
      assert.equal(shown.scrollX, 0, 'no sideways scrolling');
      assert.equal(shown.levels, '0,15,25,50,75,100', 'the six levels, so the check learns from each rating');
      assert.ok(shown.levelsOnScreen, 'the levels are on screen without scrolling');
      assert.match(shown.name, /portrait\.jpg/);
      console.log('Browser verified: the email link opens that photo, on one screen with no scrolling, with the six levels.');
      if (process.env.REVIEW_SHOT) { await page.setViewportSize({ width: 1366, height: 768 }); await page.waitForTimeout(400); await page.screenshot({ path: process.env.REVIEW_SHOT }); await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(400); await page.screenshot({ path: process.env.REVIEW_SHOT.replace('.png', '-phone.png') }); await page.setViewportSize({ width: 1280, height: 720 }); }
      // Rating the last one: it leaves the queue, and the empty-queue pop-up offers the way home
      await page.locator('#levels .lv[data-value="0"]').click();
      const empty = page.locator('#pop[open]');
      await empty.waitFor();
      assert.match(await empty.innerText(), /No photos to review/);
      assert.equal((await ModerationDecision.findById(waitingId)).status, 'allowed');
      assert.equal((await ModerationDecision.findById(waitingId)).severity, 0, 'the level is kept, for learning');
      await page.getByRole('link', { name: 'Go Back to Home Page' }).click();
      await page.waitForURL(/index\.html$/, { timeout: 10000 });
      console.log('Browser verified: rating the last photo shows "No photos to review" and Go Back to Home Page.');
      // The email's link again, now that it has been decided: a pop-up says who reviewed it (not an empty page)
      await page.goto('http://localhost:4000/' + link);
      const popup = page.locator('#pop[open]');
      await popup.waitFor();
      const said = await popup.innerText();
      assert.match(said, /Already reviewed/);
      assert.match(said, /This has been reviewed by you on .+: approved \(level 0\)/);
      assert.match(said, /portrait\.jpg/);
      console.log('Browser verified: an already-reviewed photo says who reviewed it, when, and the outcome.');
    } finally { await browser.close(); }
  }

  // ---- Reminders to staff: 1 working day left, then due today; each once, and none once reviewed ----
  const { dueDay, workingDaysLeft } = await import('../src/utils/workingDays.js');
  assert.equal(dueDay(new Date('2026-11-20T01:00:00Z')), '2026-11-24', 'Friday upload (Sydney): due Tuesday (skips the weekend)');
  assert.equal(workingDaysLeft('2026-11-24', new Date('2026-11-23T01:00:00Z')), 1, 'Monday: 1 working day left');
  assert.equal(workingDaysLeft('2026-11-24', new Date('2026-11-24T01:00:00Z')), 0, 'Tuesday: due today');
  nsfw.useClassifier(async () => UNSURE);
  const late = (await (await request(url + '/photos', 201, cookie, 'POST', await form('remind-me.jpg'))).json()).checks[0];
  await request('/api/auth/moderation/' + late.id + '/review', 200, cookie, 'POST', {});
  await ModerationDecision.updateOne({ _id: late.id }, { $set: { dueDay: '2026-11-24' } });
  const { reviewReminders } = await import('../src/services/jobs.js');
  mails.length = 0;
  assert.equal((await reviewReminders(new Date('2026-11-23T01:00:00Z'))).reminded, 1);
  assert.equal((await reviewReminders(new Date('2026-11-23T05:00:00Z'))).reminded, 0, 'once');
  assert.match(mails.join(' '), /You haven’t reviewed this photo yet — 1 working day left/);
  assert.equal((await reviewReminders(new Date('2026-11-24T01:00:00Z'))).reminded, 1);
  assert.match(mails.join(' '), /Action Required: Photo review is due today/);
  assert.equal((await reviewReminders(new Date('2026-11-24T05:00:00Z'))).reminded, 0, 'once');
  const d2 = await ModerationDecision.findById(late.id);
  assert.equal(d2.oneDayReminderSent, true); assert.equal(d2.dueTodayReminderSent, true);
  // Reviewed: no more reminders
  const another = (await (await request(url + '/photos', 201, cookie, 'POST', await form('reviewed-in-time.jpg'))).json()).checks[0];
  await request('/api/auth/moderation/' + another.id + '/review', 200, cookie, 'POST', {});
  await ModerationDecision.updateOne({ _id: another.id }, { $set: { dueDay: '2026-11-24' } });
  await request('/api/admin/moderation/' + another.id, 200, staff, 'POST', { allow: false, severity: 75, reasons: ['genitals'] });
  assert.equal((await reviewReminders(new Date('2026-11-23T01:00:00Z'))).reminded, 0, 'nothing for a reviewed photo');
  await new Promise(r => setTimeout(r, 100));
  assert.ok((await (await request('/api/notifications', 200, cookie)).json()).notifications.some(n => n.type === 'review-declined'), 'declined: the uploader hears too');

  // ---- The review page and the staff status ----
  const status = await (await request('/api/admin/moderation-status', 200, staff)).json();
  assert.equal(status.enabled, true);
  assert.equal(status.source, 'thresholds');
  assert.equal('spotCheck' in status, false, 'no spot checks');
  const relearned = await (await request('/api/admin/moderation-status/relearn', 200, staff, 'POST', {})).json();
  assert.equal(typeof relearned.result.ok, 'boolean');
  const page = await (await request('/review.html', 200)).text();
  assert.match(page, /Photo review/);
  assert.match(page, /Go Back to Home Page/, 'a way back home when nothing is waiting');
  for (const link of ['index.html', 'albums.html', 'events.html']) assert.match(page, new RegExp(`class="nav glass[\\s\\S]*href="${link}"`), link);
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
