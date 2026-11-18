// Notifications: likes and reactions on your photos, people joining or asking to join your album,
// being let in. One per person per photo; undoing takes it back; never for your own actions.
// Runs without .env: a disposable database and upload folder. node scripts/testNotify.js
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import webpush from 'web-push';

for (const key of Object.keys(process.env)) {
  if (/^(AWS_|S3_|RECAPTCHA_|CAPTCHA_|EMAIL_|MONGODB_|FRONTEND_|CORS_|PUBLIC_|GOOGLE_|VAPID_)/.test(key)) delete process.env[key];
}
const folder = await mkdtemp(path.join(os.tmpdir(), 'momento-notify-'));
const mongo = await MongoMemoryServer.create();
const vapid = webpush.generateVAPIDKeys();
Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'isolated-notify-test', MONGODB_URI: mongo.getUri(), UPLOAD_DIR: folder, PUBLIC_URL: 'http://localhost:4111',
  VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey });
const { app } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { PushSubscription } = await import('../src/models/PushSubscription.js');
await mongoose.connect(process.env.MONGODB_URI);
const server = app.listen(4111);
let checks = 0;
const venue = { lat: -33.8568, lng: 151.2153 };
async function call(url, status, cookie = '', method = 'GET', body) {
  const h = { cookie, 'X-Momento-Location': `${venue.lat},${venue.lng},10` };
  if (body && !(body instanceof FormData)) h['Content-Type'] = 'application/json';
  const r = await fetch('http://localhost:4111' + url, { method, headers: h, body: body instanceof FormData ? body : body && JSON.stringify(body) });
  const text = await r.clone().text();
  assert.equal(r.status, status, `${method} ${url}: ${text.slice(0, 200)}`);
  checks++;
  return r;
}
const json = async (r) => r.json();
const HOUR = 3600000;
const inbox = async (c) => json(await call('/api/notifications', 200, c));

try {
  const password = 'Test-password-123!';
  for (const n of ['Hana Host', 'Gus Guest', 'Lee Late']) await User.create({ name: n, email: `${n.split(' ')[0].toLowerCase()}@example.invalid`, passwordHash: await bcrypt.hash(password, 12), emailVerified: true });
  const login = async (email) => (await call('/api/auth/login', 200, '', 'POST', { email, password })).headers.get('set-cookie').split(';')[0];
  const h = await login('hana@example.invalid'), g = await login('gus@example.invalid'), l = await login('lee@example.invalid');
  const album = (await json(await call('/api/albums', 201, h, 'POST', {
    name: 'Picnic', date: new Date().toISOString().slice(0, 10), place: 'Park', visibility: 'public',
    startsAt: new Date(Date.now() - HOUR).toISOString(), endsAt: new Date(Date.now() + 4 * HOUR).toISOString(),
    zone: { ...venue, radiusM: 1000 }, venue: { address: 'Park' },
  }))).album;
  await call('/api/notifications', 401, '');

  // Someone joins: the host hears
  await call('/api/albums/join', 201, g, 'POST', { code: album.code, location: { ...venue, accuracy: 10, timestamp: Date.now() } });
  let hi = await inbox(h);
  assert.equal(hi.unread, 1);
  assert.equal(hi.notifications[0].type, 'joined');
  assert.equal(hi.notifications[0].text, 'Gus joined Picnic');

  // The guest's photo is liked and reacted to by the host: the guest hears, once each
  const fd = new FormData();
  fd.append('photos', new Blob([await sharp({ create: { width: 200, height: 150, channels: 3, background: 'red' } }).jpeg().toBuffer()], { type: 'image/jpeg' }), 'p.jpg');
  const [photo] = (await json(await call(`/api/albums/${album.id}/photos`, 201, g, 'POST', fd))).photos;
  await call(`/api/photos/${photo.id}/like`, 200, h, 'POST', { liked: true });
  await call(`/api/photos/${photo.id}/like`, 200, h, 'POST', { liked: true });   // twice: still one
  await call(`/api/photos/${photo.id}/reaction`, 200, h, 'POST', { emoji: '🔥' });
  await call(`/api/photos/${photo.id}/reaction`, 200, h, 'POST', { emoji: '😍' });   // changed: updated, not a second
  let gi = await inbox(g);
  assert.equal(gi.unread, 2);
  const types = gi.notifications.map((n) => n.type).sort();
  assert.deepEqual(types, ['like', 'reaction']);
  const rx = gi.notifications.find((n) => n.type === 'reaction');
  assert.equal(rx.emoji, '😍');
  assert.equal(rx.text, 'Hana reacted 😍 to your photo in Picnic');
  assert.equal(rx.photoId, photo.id);
  assert.match(rx.thumbUrl, /size=thumb/);
  // Liking your own photo: nothing
  await call(`/api/photos/${photo.id}/like`, 200, g, 'POST', { liked: true });
  assert.equal((await inbox(g)).unread, 2);
  // Undoing takes it back
  await call(`/api/photos/${photo.id}/like`, 200, h, 'POST', { liked: false });
  await call(`/api/photos/${photo.id}/reaction`, 200, h, 'POST', { emoji: null });
  assert.equal((await inbox(g)).notifications.length, 0);
  await call(`/api/photos/${photo.id}/like`, 200, h, 'POST', { liked: true });

  // Marking read; the cheap count for a badge
  gi = await inbox(g);
  assert.equal((await json(await call('/api/notifications/unread', 200, g))).unread, 1);
  await call('/api/notifications/read', 400, g, 'POST', {});
  assert.deepEqual(await json(await call('/api/notifications/read', 200, g, 'POST', { ids: [gi.notifications[0].id] })), { marked: 1, unread: 0 });
  assert.equal((await inbox(g)).notifications[0].read, true);
  // Only your own
  assert.equal((await json(await call('/api/notifications/read', 200, h, 'POST', { ids: [gi.notifications[0].id] }))).marked, 0);

  // New photos: everyone else in the album hears, adding up while unread
  let shade = 0;
  const photoFd = async (n) => { const f = new FormData(); for (let i = 0; i < n; i++) f.append('photos', new Blob([await sharp({ create: { width: 120, height: 90, channels: 3, background: { r: 20 + 40 * shade++, g: 80, b: 200 } } }).jpeg().toBuffer()], { type: 'image/jpeg' }), 'q.jpg'); return f; };
  await call(`/api/albums/${album.id}/photos`, 201, g, 'POST', await photoFd(2));
  await new Promise((r) => setTimeout(r, 300));
  hi = await inbox(h);
  const added = hi.notifications.find((n) => n.type === 'photos');
  assert.equal(added.count, 3, 'the first photo plus these two, while unread');
  assert.equal(added.text, 'Gus added 3 photos to Picnic');
  assert.equal(hi.notifications.filter((n) => n.type === 'photos').length, 1, 'one per album and uploader');
  assert.ok(!(await inbox(g)).notifications.some((n) => n.type === 'photos'), 'not for your own photos');
  // Once read, the next upload starts a fresh count
  await call('/api/notifications/read', 200, h, 'POST', { ids: [added.id] });
  await call(`/api/albums/${album.id}/photos`, 201, g, 'POST', await photoFd(1));
  await new Promise((r) => setTimeout(r, 300));
  const again = (await inbox(h)).notifications.find((n) => n.type === 'photos');
  assert.equal(again.count, 1);
  assert.equal(again.read, false);
  assert.equal(again.text, 'Gus added a photo to Picnic');

  // Asking to join a closed album, then being let in
  await call(`/api/events/${album.id}/policy`, 200, h, 'PATCH', { joiningOpen: false });
  const asked = await call('/api/albums/join', 202, l, 'POST', { code: album.code, location: { ...venue, accuracy: 10, timestamp: Date.now() } });
  assert.equal((await json(asked)).pending, true);
  hi = await inbox(h);
  assert.equal(hi.notifications[0].type, 'request');
  assert.equal(hi.notifications[0].text, 'Lee is asking to join Picnic');
  const leeId = (await User.findOne({ email: 'lee@example.invalid' })).id;
  await call(`/api/events/${album.id}/requests/${leeId}`, 200, h, 'POST', { approve: true });
  const li = await inbox(l);
  assert.equal(li.notifications[0].type, 'approved');
  assert.match(li.notifications[0].text, /You’re in! Picnic/);
  await call('/api/notifications/read', 200, h, 'POST', { all: true });
  assert.equal((await json(await call('/api/notifications/unread', 200, h))).unread, 0);

  // Push: the key is public; a device subscribes, and bad subscriptions are refused
  assert.equal((await json(await call('/api/notifications/push/key', 200))).key, vapid.publicKey);
  await call('/api/notifications/push', 400, g, 'POST', { subscription: { endpoint: 'http://not-https' } });
  const sub = { endpoint: 'https://push.example.invalid/abc', keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } };
  await call('/api/notifications/push', 201, g, 'POST', { subscription: sub });
  await call('/api/notifications/push', 201, g, 'POST', { subscription: sub });   // the same device: still one
  assert.equal(await PushSubscription.countDocuments({}), 1);
  await call('/api/notifications/push', 200, g, 'DELETE', { endpoint: sub.endpoint });
  assert.equal(await PushSubscription.countDocuments({}), 0);

  console.log(`Notification checks passed (${checks} requests).`);
} finally {
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
  await rm(folder, { recursive: true, force: true });
}
