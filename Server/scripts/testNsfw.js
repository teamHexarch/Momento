// Nudity check: explicit photos are refused (album photos, covers, profile pictures); swimwear-type
// ("Sexy") photos are allowed. Uses a stand-in for the model so results are predictable.
// Runs without .env: a disposable database and upload folder. node scripts/testNsfw.js
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';

for (const key of Object.keys(process.env)) {
  if (/^(AWS_|S3_|RECAPTCHA_|CAPTCHA_|EMAIL_|MONGODB_|FRONTEND_|CORS_|PUBLIC_|GOOGLE_|NSFW_)/.test(key)) delete process.env[key];
}
const folder = await mkdtemp(path.join(os.tmpdir(), 'momento-nsfw-'));
const mongo = await MongoMemoryServer.create();
Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'isolated-nsfw-test', MONGODB_URI: mongo.getUri(), UPLOAD_DIR: folder, PUBLIC_URL: 'http://localhost:4111' });
const { app } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const nsfw = await import('../src/services/nsfwService.js');
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

// The stand-in "model": red pictures are explicit, green ones are swimwear, anything else is neutral
const RED = { r: 220, g: 10, b: 10 }, GREEN = { r: 10, g: 200, b: 10 };
nsfw.useClassifier(async (buf) => {
  const { dominant } = await sharp(buf).stats();
  if (dominant.r > 150 && dominant.g < 80) return { Porn: 0.9, Hentai: 0.05, Sexy: 0.03, Neutral: 0.01, Drawing: 0.01 };
  if (dominant.g > 150 && dominant.r < 80) return { Porn: 0.2, Hentai: 0, Sexy: 0.75, Neutral: 0.05, Drawing: 0 };
  return { Porn: 0.01, Hentai: 0, Sexy: 0.02, Neutral: 0.95, Drawing: 0.02 };
});
let shade = 0;
const pic = (colour) => sharp({ create: { width: 300, height: 200, channels: 3, background: colour || { r: 40, g: 90 + (shade++ % 50), b: 160 } } }).jpeg().toBuffer();
const form = async (field, ...bufs) => { const fd = new FormData(); for (const [i, b] of bufs.entries()) fd.append(field, new Blob([b], { type: 'image/jpeg' }), `p${i}.jpg`); return fd; };

try {
  // The rule itself
  assert.equal(nsfw.isExplicit(null), false, 'no scores (check off) = allowed');
  assert.equal(nsfw.isExplicit({ Porn: 0.4, Hentai: 0.25 }), true, 'Porn + Hentai together count');
  assert.equal(nsfw.isExplicit({ Porn: 0.3, Sexy: 0.7 }), false, 'swimwear is fine');

  const password = 'Test-password-123!';
  for (const n of ['host', 'guest']) await User.create({ name: n, email: `${n}@example.invalid`, passwordHash: await bcrypt.hash(password, 12), emailVerified: true });
  const login = async (email) => (await call('/api/auth/login', 200, '', 'POST', { email, password })).headers.get('set-cookie').split(';')[0];
  const h = await login('host@example.invalid'), g = await login('guest@example.invalid');
  const album = (await json(await call('/api/albums', 201, h, 'POST', {
    name: 'Pool party', date: new Date().toISOString().slice(0, 10), place: 'Pool',
    startsAt: new Date(Date.now() - HOUR).toISOString(), endsAt: new Date(Date.now() + 4 * HOUR).toISOString(),
    zone: { ...venue, radiusM: 1000 }, venue: { address: 'Pool' },
  }))).album;
  await call('/api/albums/join', 201, g, 'POST', { code: album.code, location: { ...venue, accuracy: 10, timestamp: Date.now() } });
  const up = `/api/albums/${album.id}/photos`;

  // ---- Album photos ----
  let r = await json(await call(up, 201, g, 'POST', await form('photos', await pic(), await pic(GREEN))));
  assert.equal(r.photos.length, 2, 'normal and swimwear photos go in');
  assert.equal(r.blocked, 0);
  // A mixed upload: the explicit one is left out, the rest goes in
  r = await json(await call(up, 201, g, 'POST', await form('photos', await pic(), await pic(RED), await pic())));
  assert.equal(r.photos.length, 2);
  assert.equal(r.blocked, 1);
  // Only explicit photos: refused with a clear message
  const one = await json(await call(up, 422, g, 'POST', await form('photos', await pic(RED))));
  assert.equal(one.code, 'nsfw');
  assert.match(one.error, /nudity/);
  const two = await json(await call(up, 422, h, 'POST', await form('photos', await pic(RED), await pic({ r: 200, g: 20, b: 40 }))));
  assert.match(two.error, /These photos/);
  const { Photo } = await import('../src/models/Photo.js');
  assert.equal(await Photo.countDocuments({ album: album.id }), 4, 'no explicit photo was saved');

  // ---- Cover picture ----
  const cover = await json(await call(`/api/albums/${album.id}/cover`, 422, h, 'PUT', await form('cover', await pic(RED))));
  assert.match(cover.error, /This cover/);
  assert.equal((await json(await call(`/api/albums/${album.id}`, 200, h))).album.hasHostCover, false);
  await call(`/api/albums/${album.id}/cover`, 200, h, 'PUT', await form('cover', await pic()));

  // ---- Profile picture ----
  const av = await json(await call('/api/auth/avatar', 422, g, 'POST', await form('avatar', await pic(RED))));
  assert.match(av.error, /profile photo/);
  assert.ok(!(await User.findOne({ email: 'guest@example.invalid' })).avatarKey, 'not saved');
  await call('/api/auth/avatar', 200, g, 'POST', await form('avatar', await pic()));

  // ---- If the check can't run, uploads still work ----
  nsfw.useClassifier(async () => { throw new Error('model missing'); });
  const err = console.error; console.error = () => {};
  r = await json(await call(up, 201, g, 'POST', await form('photos', await pic(RED))));
  console.error = err;
  assert.equal(r.photos.length, 1);

  console.log(`testNsfw: PASS (${checks} requests checked)`);
} finally {
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
  await rm(folder, { recursive: true, force: true });
}
