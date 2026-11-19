// The hourly jobs: "closes soon" emails, weekly recaps, tidying up, the daily backup (and restoring
// it), and the one-off clean-up of old chat data. node scripts/testJobs.js
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

for (const key of Object.keys(process.env)) {
  if (/^(AWS_|S3_|RECAPTCHA_|CAPTCHA_|EMAIL_|MONGODB_|FRONTEND_|CORS_|PUBLIC_|GOOGLE_|VAPID_)/.test(key)) delete process.env[key];
}
const here = path.dirname(fileURLToPath(import.meta.url));
const folder = await mkdtemp(path.join(os.tmpdir(), 'momento-jobs-'));
const mongo = await MongoMemoryServer.create();
const ENV = { NODE_ENV: 'test', JWT_SECRET: 'isolated-jobs-test', MONGODB_URI: mongo.getUri(), UPLOAD_DIR: folder, PUBLIC_URL: 'http://localhost:4112' };
Object.assign(process.env, ENV);
const { User } = await import('../src/models/User.js');
const { Album } = await import('../src/models/Album.js');
const { Membership } = await import('../src/models/Membership.js');
const { Photo } = await import('../src/models/Photo.js');
const { initStorage } = await import('../src/services/storageService.js');
const jobs = await import('../src/services/jobs.js');
await mongoose.connect(process.env.MONGODB_URI);
await initStorage();
let checks = 0;
const ok = (...a) => { assert.ok(...a); checks++; };
const eq = (...a) => { assert.equal(...a); checks++; };
// Emails print instead of sending here: collect them
const mails = [];
const realLog = console.log;
console.log = (...a) => { const m = String(a[0]).match(/To: (\S+) \| Subject: (.*)/); if (m) mails.push({ to: m[1], subject: m[2] }); else if (!/^\[email/.test(String(a[0]))) realLog(...a); };
const HOUR = 3600000, DAY = 24 * HOUR;

try {
  const pw = await bcrypt.hash('Test-password-123!', 4);
  const mk = (name, extra = {}) => User.create({ name, email: `${name.toLowerCase()}@example.invalid`, passwordHash: pw, emailVerified: true, ...extra });
  const host = await mk('Hana'), guest = await mk('Gus', { notify: { closing: false } }), other = await mk('Ola'), reader = await mk('Rae', { notify: { recap: true } });
  const album = await Album.create({ name: 'Picnic', date: new Date().toISOString().slice(0, 10), code: 'PIC1234', host: host._id,
    startsAt: new Date(Date.now() - HOUR), endsAt: new Date(Date.now() + 6 * HOUR), zone: { lat: 1, lng: 1, radiusM: 1000 } });
  for (const [u, role] of [[host, 'host'], [guest, 'guest'], [other, 'guest'], [reader, 'guest']]) await Membership.create({ album: album._id, user: u._id, role });

  // ---- Closes soon: once, to members who want it ----
  eq(await jobs.closingSoon(), 3, 'host, Ola and Rae (Gus turned it off)');
  ok(mails.every((m) => m.subject === 'Last chance to add your photos to Picnic'));
  ok(!mails.some((m) => m.to === 'gus@example.invalid'));
  eq(await jobs.closingSoon(), 0, 'never twice');
  // Everyone in the album also gets it in their inbox, even Gus (who turned the email off), once each
  const { Notification } = await import('../src/models/Notification.js');
  eq(await Notification.countDocuments({ type: 'closing', album: album._id }), 4);
  const { describe } = await import('../src/services/notifyService.js');
  const [closing] = await describe(await Notification.find({ type: 'closing', user: guest._id }));
  eq(closing.title, 'Picnic stops taking photos in 6 hours');
  eq(closing.albumId, album.id);
  ok(closing.body);

  // ---- Weekly recap: only to people who asked, only when there's something new, once a week ----
  mails.length = 0;
  await Photo.create([1, 2, 3].map((i) => ({ album: album._id, uploader: other._id, storageKey: `k${i}`, mimeType: 'image/jpeg', size: 1 })));
  await Photo.create({ album: album._id, uploader: reader._id, storageKey: 'mine', mimeType: 'image/jpeg', size: 1 });
  eq(await jobs.weeklyRecap(), 1);
  eq(mails[0].to, 'rae@example.invalid');
  eq(mails[0].subject, '3 new photos in your Momento albums this week', 'their own photo isn’t counted');
  eq(await jobs.weeklyRecap(), 0, 'once a week');

  // ---- Tidying ----
  const stale = await mk('Stale', { emailVerified: false });
  await User.collection.updateOne({ _id: stale._id }, { $set: { createdAt: new Date(Date.now() - 8 * DAY) } });
  const fresh = await mk('Fresh', { emailVerified: false });
  await Album.updateOne({ _id: album._id }, { $push: { requests: { $each: [
    { user: fresh._id, name: 'Old', status: 'pending', at: new Date(Date.now() - 31 * DAY) },
    { user: other._id, name: 'New', status: 'pending', at: new Date() },
    { user: guest._id, name: 'No', status: 'declined', at: new Date(Date.now() - 40 * DAY) },
  ] } } });
  const t = await jobs.tidy();
  eq(t.accounts, 1);
  ok(!(await User.exists({ _id: stale._id })), 'unconfirmed for 7 days: gone');
  ok(await User.exists({ _id: fresh._id }), 'new sign-ups stay');
  const left = (await Album.findById(album._id)).requests.map((r) => r.name).sort();
  assert.deepEqual(left, ['New', 'No'], 'the 31-day-old request goes; a decline stays'); checks++;

  // ---- Backup, once a day; and restoring it ----
  const b = await jobs.backup();
  ok(b.collections >= 4 && b.documents > 0);
  eq(await jobs.backup(), null, 'once a day');
  const dayDir = (await readdir(path.join(folder, 'backups'))).find((d) => d.startsWith('day-'));
  ok((await readdir(path.join(folder, 'backups', dayDir))).includes('albums.jsonl.gz'));
  ok((await readdir(path.join(folder, 'backups'))).some((d) => d.startsWith('month-')));
  await Album.deleteOne({ _id: album._id });
  const env = { ...process.env, ...ENV };
  const dry = execFileSync(process.execPath, [path.join(here, 'restoreBackup.js'), dayDir], { env, encoding: 'utf8' });
  ok(/dry run/.test(dry) && !(await Album.exists({ _id: album._id })), 'a dry run changes nothing');
  execFileSync(process.execPath, [path.join(here, 'restoreBackup.js'), dayDir, '--apply', '--only', 'albums'], { env, encoding: 'utf8' });
  eq((await Album.findById(album._id))?.name, 'Picnic', 'restored');

  // ---- The one-off clean-up of old chat data ----
  const db = mongoose.connection.db;
  await db.collection('groupmessages').insertMany([{ text: 'hi' }, { text: 'there' }]);
  await db.collection('comments').insertOne({ text: 'nice' });
  await db.collection('albums').updateOne({ _id: album._id }, { $set: { chatEnabled: true } });
  const look = execFileSync(process.execPath, [path.join(here, 'cleanOldData.js')], { env, encoding: 'utf8' });
  ok(/groupmessages\s+2 documents/.test(look) && /dry run/.test(look));
  ok((await db.listCollections({ name: 'groupmessages' }).toArray()).length === 1, 'a dry run changes nothing');
  execFileSync(process.execPath, [path.join(here, 'cleanOldData.js'), '--apply'], { env, encoding: 'utf8' });
  eq((await db.listCollections({ name: 'groupmessages' }).toArray()).length, 0);
  eq((await db.listCollections({ name: 'comments' }).toArray()).length, 0);
  eq((await db.collection('albums').findOne({ _id: album._id })).chatEnabled, undefined);

  console.log = realLog;
  console.log(`Job checks passed (${checks}).`);
} finally {
  console.log = realLog;
  await mongoose.disconnect();
  await mongo.stop();
  await rm(folder, { recursive: true, force: true });
}
