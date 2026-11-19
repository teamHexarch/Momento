// Album covers: the host uploads a picture; it's the cover before the event, then the most loved
// photo takes over (unless the host keeps theirs); with no picture, the newest photo is the cover.
// The picture shows without logging in (invite, Events map) through an address with a token.
// Runs without .env: a disposable database and upload folder. node scripts/testCover.js
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';

for (const key of Object.keys(process.env)) {
  if (/^(AWS_|S3_|RECAPTCHA_|CAPTCHA_|EMAIL_|MONGODB_|FRONTEND_|CORS_|PUBLIC_|GOOGLE_)/.test(key)) delete process.env[key];
}
const folder = await mkdtemp(path.join(os.tmpdir(), 'momento-cover-'));
const mongo = await MongoMemoryServer.create();
Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'isolated-cover-test', MONGODB_URI: mongo.getUri(), UPLOAD_DIR: folder, PUBLIC_URL: 'http://localhost:4110' });
const { app } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
await mongoose.connect(process.env.MONGODB_URI);
const server = app.listen(4110);
let checks = 0;
const venue = { lat: -33.8568, lng: 151.2153 };
async function call(url, status, cookie = '', method = 'GET', body) {
  const h = { cookie, 'X-Momento-Location': `${venue.lat},${venue.lng},10` };
  if (body && !(body instanceof FormData)) h['Content-Type'] = 'application/json';
  const r = await fetch((url.startsWith('http') ? '' : 'http://localhost:4110') + url, { method, headers: h, body: body instanceof FormData ? body : body && JSON.stringify(body) });
  const text = await r.clone().text();
  assert.equal(r.status, status, `${method} ${url}: ${text.slice(0, 200)}`);
  checks++;
  return r;
}
const json = async (r) => r.json();
const HOUR = 3600000;
const png = (w, h, colour) => sharp({ create: { width: w, height: h, channels: 3, background: colour } }).png().toBuffer();
const coverForm = async (buf, type = 'image/png') => { const fd = new FormData(); fd.append('cover', new Blob([buf], { type }), 'cover.png'); return fd; };

try {
  const password = 'Test-password-123!';
  for (const n of ['host', 'guest']) await User.create({ name: n, email: `${n}@example.invalid`, passwordHash: await bcrypt.hash(password, 12), emailVerified: true });
  const login = async (email) => (await call('/api/auth/login', 200, '', 'POST', { email, password })).headers.get('set-cookie').split(';')[0];
  const h = await login('host@example.invalid'), g = await login('guest@example.invalid');
  const make = async (name, startsIn) => (await json(await call('/api/albums', 201, h, 'POST', {
    name, date: new Date(Date.now() + startsIn).toISOString().slice(0, 10), place: 'Park', visibility: 'public',
    startsAt: new Date(Date.now() + startsIn).toISOString(), endsAt: new Date(Date.now() + startsIn + 4 * HOUR).toISOString(),
    zone: { ...venue, radiusM: 1000 }, venue: { address: 'Park' },
  }))).album;

  // ---- The browser may send it: the site is on another address, so the cover's PUT must be allowed ----
  const pre = await fetch('http://localhost:4110/api/albums/x/cover', { method: 'OPTIONS', headers: { Origin: 'http://localhost:3000', 'Access-Control-Request-Method': 'PUT' } });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('access-control-allow-methods') || '', /\bPUT\b/, 'PUT allowed from the site');
  checks++;

  // ---- Before the event: the host's picture ----
  const soon = await make('Next week', 7 * 24 * HOUR);
  assert.equal(soon.cover, null);
  assert.equal(soon.hasHostCover, false);
  await call(`/api/albums/${soon.id}/cover`, 400, h, 'PUT', await coverForm(Buffer.from('not a picture')));
  await call(`/api/albums/${soon.id}/cover`, 400, h, 'PUT', new FormData());
  let a = (await json(await call(`/api/albums/${soon.id}/cover`, 200, h, 'PUT', await coverForm(await png(3000, 2000, 'orange'))))).album;
  assert.equal(a.cover.source, 'host');
  assert.equal(a.hasHostCover, true);
  assert.equal(a.keepHostCover, false, 'before the event, the photos still take over later');
  // The picture itself: no login needed, re-encoded small, only with the right token
  const big = await call(a.cover.url, 200);
  const meta = await sharp(Buffer.from(await big.arrayBuffer())).metadata();
  assert.equal(meta.format, 'webp');
  assert.ok(meta.width <= 1600, 'resized down');
  const thumb = await sharp(Buffer.from(await (await call(a.cover.thumbUrl, 200)).arrayBuffer())).metadata();
  assert.ok(thumb.width <= 640);
  await call(a.cover.url.replace(/\/cover\/[0-9a-f]+/, '/cover/0000'), 404);
  // Shown on the invite (preview by code) and the Events map
  const pv = await json(await call(`/api/albums/preview/${a.code}`, 200));
  assert.equal(pv.album.cover.url, a.cover.url);
  // Only the host
  await call(`/api/albums/join`, 201, g, 'POST', { code: a.code, location: { ...venue, accuracy: 10, timestamp: Date.now() } });
  await call(`/api/albums/${soon.id}/cover`, 403, g, 'PUT', await coverForm(await png(400, 300, 'blue')));
  await call(`/api/albums/${soon.id}/cover`, 403, g, 'DELETE');
  assert.equal((await json(await call(`/api/albums/${soon.id}`, 200, g))).album.cover.source, 'host', 'guests see it too');
  // Changing it replaces the old files (the old address stops working)
  const oldUrl = a.cover.url;
  a = (await json(await call(`/api/albums/${soon.id}/cover`, 200, h, 'PUT', await coverForm(await png(800, 600, 'green'))))).album;
  assert.notEqual(a.cover.url, oldUrl);
  await call(oldUrl, 404);

  // ---- During the event ----
  const now = await make('Tonight', -HOUR);
  const bytes = await sharp({ create: { width: 300, height: 200, channels: 3, background: 'red' } }).jpeg().toBuffer();
  let shade = 0;
  const upload = async () => { const pic = await sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 30 + 50 * shade++, g: 60, b: 120 } } }).jpeg().toBuffer(); const fd = new FormData(); fd.append('photos', new Blob([pic], { type: 'image/jpeg' }), 'p.jpg'); return (await json(await call(`/api/albums/${now.id}/photos`, 201, h, 'POST', fd))).photos[0]; };
  const p1 = await upload(); await new Promise((r) => setTimeout(r, 20)); const p2 = await upload();
  // No picture, no likes yet: the newest photo
  a = (await json(await call(`/api/albums/${now.id}`, 200, h))).album;
  assert.equal(a.cover.source, 'newest');
  assert.equal(a.cover.id, p2.id);
  // A bookmark is private: it doesn't make a photo the cover
  await call(`/api/photos/${p1.id}/bookmark`, 200, h, 'POST', { bookmarked: true });
  a = (await json(await call(`/api/albums/${now.id}`, 200, h))).album;
  assert.equal(a.cover.source, 'newest');
  // Reactions on the older photo: it's the most loved, so it's the cover
  const gc = await login('guest@example.invalid');
  await call('/api/albums/join', 201, gc, 'POST', { code: now.code, location: { ...venue, accuracy: 10, timestamp: Date.now() } });
  await call(`/api/photos/${p1.id}/reaction`, 200, h, 'POST', { emoji: '🔥' });
  await call(`/api/photos/${p1.id}/reaction`, 200, gc, 'POST', { emoji: '😍' });
  a = (await json(await call(`/api/albums/${now.id}`, 200, h))).album;
  assert.equal(a.cover.source, 'top');
  assert.equal(a.cover.id, p1.id);
  assert.equal(a.cover.score, 2, 'two reactions (the bookmark doesn’t count)');
  // The host picks a picture while the event is live: it shows straight away (and is kept)
  a = (await json(await call(`/api/albums/${now.id}/cover`, 200, h, 'PUT', await coverForm(await png(500, 500, 'purple'))))).album;
  assert.equal(a.cover.source, 'host', 'a picture chosen during the event shows right away');
  assert.equal(a.keepHostCover, true);
  // Changing it again: the new picture shows
  const firstUrl = a.cover.url;
  a = (await json(await call(`/api/albums/${now.id}/cover`, 200, h, 'PUT', await coverForm(await png(500, 500, 'teal'))))).album;
  assert.equal(a.cover.source, 'host');
  assert.notEqual(a.cover.url, firstUrl);
  // "Keep my cover" off: the most loved photo takes over again; on: the host's picture is back
  a = (await json(await call(`/api/albums/${now.id}`, 200, h, 'PATCH', { keepHostCover: false }))).album;
  assert.equal(a.cover.source, 'top');
  a = (await json(await call(`/api/albums/${now.id}`, 200, h, 'PATCH', { keepHostCover: true }))).album;
  assert.equal(a.keepHostCover, true);
  assert.equal(a.cover.source, 'host');
  // Taking the picture off: back to the most loved photo
  a = (await json(await call(`/api/albums/${now.id}/cover`, 200, h, 'DELETE'))).album;
  assert.equal(a.hasHostCover, false);
  assert.equal(a.keepHostCover, false);
  assert.equal(a.cover.source, 'top');
  // The list shows the same
  const listed = (await json(await call('/api/albums', 200, h))).albums.find((x) => x.id === now.id);
  assert.equal(listed.cover.id, p1.id);

  // ---- Deleting the album takes its cover files with it ----
  const coverDir = path.join(folder, 'covers', soon.id);
  assert.ok((await readdir(coverDir)).length > 0);
  await call(`/api/albums/${soon.id}`, 200, h, 'DELETE');
  assert.equal((await readdir(coverDir).catch(() => [])).length, 0);

  console.log(`Cover checks passed (${checks} requests).`);
} finally {
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
  await rm(folder, { recursive: true, force: true });
}
