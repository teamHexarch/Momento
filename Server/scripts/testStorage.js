// Big album downloads made in the background and emailed; CloudFront links; the cheaper storage tier.
// Runs without .env (a disposable database and folder; a stand-in for S3). node scripts/testStorage.js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';

for (const key of Object.keys(process.env)) {
  if (/^(AWS_|S3_|RECAPTCHA_|CAPTCHA_|EMAIL_|MONGODB_|FRONTEND_|CORS_|PUBLIC_|GOOGLE_|VAPID_|CLOUDFRONT_)/.test(key)) delete process.env[key];
}
const folder = await mkdtemp(path.join(os.tmpdir(), 'momento-storage-'));
const mongo = await MongoMemoryServer.create();
Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'isolated-storage-test', MONGODB_URI: mongo.getUri(), UPLOAD_DIR: folder, PUBLIC_URL: 'http://localhost:4113', ZIP_BIG_PHOTOS: '2' });
const { app } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const zips = await import('../src/services/zipService.js');
const { objectStorage } = await import('../src/services/storage/objectStorage.js');
await mongoose.connect(process.env.MONGODB_URI);
const server = app.listen(4113);
let checks = 0;
const venue = { lat: -33.8568, lng: 151.2153 };
async function call(url, status, cookie = '', method = 'GET', body) {
  const h = { cookie, 'X-Momento-Location': `${venue.lat},${venue.lng},10` };
  if (body && !(body instanceof FormData)) h['Content-Type'] = 'application/json';
  const r = await fetch((url.startsWith('http') ? '' : 'http://localhost:4113') + url, { method, headers: h, redirect: 'manual', body: body instanceof FormData ? body : body && JSON.stringify(body) });
  assert.equal(r.status, status, `${method} ${url}: ${(await r.clone().text()).slice(0, 200)}`);
  checks++;
  return r;
}
const json = async (r) => r.json();
const mails = [];
const realLog = console.log;
console.log = (...a) => { const s = String(a[0]); if (/^\[email not set up\]/.test(s)) mails.push(s); else realLog(...a); };

try {
  // ---- Big albums: zipped in the background, emailed ----
  const password = 'Test-password-123!';
  for (const n of ['host', 'guest', 'stranger']) await User.create({ name: n, email: `${n}@example.invalid`, passwordHash: await bcrypt.hash(password, 4), emailVerified: true });
  const login = async (e) => (await call('/api/auth/login', 200, '', 'POST', { email: e, password })).headers.get('set-cookie').split(';')[0];
  const h = await login('host@example.invalid'), s = await login('stranger@example.invalid');
  const album = (await json(await call('/api/albums', 201, h, 'POST', { name: 'Big day', date: new Date().toISOString().slice(0, 10), place: 'Park',
    startsAt: new Date(Date.now() - 3600000).toISOString(), endsAt: new Date(Date.now() + 4 * 3600000).toISOString(), zone: { ...venue, radiusM: 1000 }, venue: { address: 'Park' } }))).album;
  let shade = 0;
  const add = async (n) => { const fd = new FormData(); for (let i = 0; i < n; i++) fd.append('photos', new Blob([await sharp({ create: { width: 200, height: 150, channels: 3, background: { r: 50 + (shade++) * 60, g: 20, b: 90 } } }).jpeg().toBuffer()], { type: 'image/jpeg' }), `p${i}.jpg`); await call(`/api/albums/${album.id}/photos`, 201, h, 'POST', fd); };
  await add(2);
  // Small enough: the zip comes straight away
  const now = await call(`/api/albums/${album.id}/download`, 200, h);
  assert.match(now.headers.get('content-disposition'), /Big day\.zip/);
  await add(1);
  // Now "big" (3 > 2): back to the site with a note, and the zip is made in the background
  const later = await call(`/api/albums/${album.id}/download`, 303, h);
  assert.match(later.headers.get('location'), /albums\.html\?album=.+&zip=preparing$/);
  await call(`/api/albums/${album.id}/download`, 303, h);   // asking twice: still one zip
  await zips.idle();
  assert.equal(await zips.ZipFile.countDocuments({}), 1); checks++;
  const email = mails.find((m) => m.includes('Your download of Big day is ready'));
  assert.ok(email, 'the email went out'); checks++;
  const z = await zips.ZipFile.findOne({});
  assert.equal(z.status, 'ready'); assert.equal(z.photos, 3); checks += 2;
  const link = `/api/albums/${album.id}/zip/${z.token}`;
  const got = await call(link, 200, h);
  assert.match(got.headers.get('content-disposition'), /attachment; filename="Big day\.zip"/);
  const bytes = Buffer.from(await got.arrayBuffer());
  assert.equal(bytes.subarray(0, 2).toString(), 'PK', 'a real zip'); checks++;
  await call(link, 404, s);                                   // not in the album
  await call(`/api/albums/${album.id}/zip/nope`, 404, h);     // wrong token
  // After 3 days it's gone, file and all
  await zips.ZipFile.updateOne({ _id: z._id }, { expiresAt: new Date(Date.now() - 1000) });
  assert.equal(await zips.removeExpiredZips(), 1); checks++;
  await call(link, 404, h);

  // ---- Photos through CloudFront when it's set up; the cheaper tier for big originals ----
  const sent = [];
  const fake = { send: async (cmd) => { sent.push(cmd); return {}; } };
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const store = objectStorage({ name: 's3', label: 'S3', bucket: 'b', keyHint: '', client: fake, cdn: { domain: 'd123.cloudfront.net', keyPairId: 'K2ABC', privateKey } });
  let to = '';
  const res = { set() { return this; }, redirect(code, url) { to = url; } };
  await store.send(res, 'album1/photo one.jpg', 'image/jpeg');
  assert.match(to, /^https:\/\/d123\.cloudfront\.net\/album1\/photo%20one\.jpg\?Expires=\d+&Key-Pair-Id=K2ABC&Signature=/); checks++;
  await store.save('a/big.jpg', Buffer.alloc(200 * 1024), 'image/jpeg', { tier: true });
  await store.save('a/small.jpg', Buffer.alloc(10 * 1024), 'image/jpeg', { tier: true });
  await store.save('a/big.thumb.webp', Buffer.alloc(200 * 1024), 'image/webp');
  assert.deepEqual(sent.map((c) => c.input.StorageClass), ['INTELLIGENT_TIERING', undefined, undefined]); checks++;

  console.log = realLog;
  console.log(`Storage checks passed (${checks}).`);
} finally {
  console.log = realLog;
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
  await rm(folder, { recursive: true, force: true });
}
