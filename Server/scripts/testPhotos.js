// What the My albums page needs from the server (V2.6): emoji reactions, the Liked tab and Save,
// "Hidden by you", and the Recently deleted bin (host only, 30 days).
// Runs without .env: a disposable database and upload folder. node scripts/testPhotos.js
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';

for (const key of Object.keys(process.env)) {
  if (/^(AWS_|S3_|RECAPTCHA_|CAPTCHA_|EMAIL_|MONGODB_|FRONTEND_|CORS_|PUBLIC_|GOOGLE_)/.test(key)) delete process.env[key];
}
const folder = await mkdtemp(path.join(os.tmpdir(), 'momento-photos-'));
const mongo = await MongoMemoryServer.create();
Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'isolated-photo-test', MONGODB_URI: mongo.getUri(), UPLOAD_DIR: folder, PUBLIC_URL: 'http://localhost:4109' });
const { app } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { Photo } = await import('../src/models/Photo.js');
const { purgeExpired } = await import('../src/controllers/trashController.js');
await mongoose.connect(process.env.MONGODB_URI);
const server = app.listen(4109);
let checks = 0;
const venue = { lat: -33.8568, lng: 151.2153 };
async function call(url, status, cookie = '', method = 'GET', body) {
  const h = { cookie, 'X-Momento-Location': `${venue.lat},${venue.lng},10` };
  if (body && !(body instanceof FormData)) h['Content-Type'] = 'application/json';
  const r = await fetch('http://localhost:4109' + url, { method, headers: h, body: body instanceof FormData ? body : body && JSON.stringify(body) });
  const text = await r.clone().text();
  assert.equal(r.status, status, `${method} ${url}: ${text}`);
  checks++;
  return r;
}
const json = async (r) => r.json();
const HOUR = 3600000;

try {
  const password = 'Test-password-123!';
  for (const n of ['host', 'guest']) await User.create({ name: n, email: `${n}@example.invalid`, passwordHash: await bcrypt.hash(password, 12), emailVerified: true });
  const login = async (email) => (await call('/api/auth/login', 200, '', 'POST', { email, password })).headers.get('set-cookie').split(';')[0];
  const h = await login('host@example.invalid'), g = await login('guest@example.invalid');
  const album = (await json(await call('/api/albums', 201, h, 'POST', {
    name: 'Picnic', date: new Date().toISOString().slice(0, 10), place: 'Park',
    startsAt: new Date(Date.now() - HOUR).toISOString(), endsAt: new Date(Date.now() + 4 * HOUR).toISOString(),
    zone: { ...venue, radiusM: 1000 }, venue: { address: 'Park' },
  }))).album;
  await call('/api/albums/join', 201, g, 'POST', { code: album.code, location: { ...venue, accuracy: 10, timestamp: Date.now() } });
  const bytes = await sharp({ create: { width: 300, height: 200, channels: 3, background: 'red' } }).jpeg().toBuffer();
  // A different picture each time (the same file twice is skipped as a duplicate)
  let shade = 0;
  const upload = async (cookie) => {
    const pic = shade++ ? await sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 40 * shade, g: 90, b: 160 } } }).jpeg().toBuffer() : bytes;
    const fd = new FormData(); fd.append('photos', new Blob([pic], { type: 'image/jpeg' }), 'p.jpg');
    return (await json(await call(`/api/albums/${album.id}/photos`, 201, cookie, 'POST', fd))).photos[0];
  };
  const hostPic = await upload(h), guestPic = await upload(g), third = await upload(h);

  // ---- The same photo twice is skipped (the same file, in the same album) ----
  {
    const twice = new FormData();
    twice.append('photos', new Blob([bytes], { type: 'image/jpeg' }), 'again.jpg');
    twice.append('photos', new Blob([bytes], { type: 'image/jpeg' }), 'again2.jpg');
    const r = await json(await call(`/api/albums/${album.id}/photos`, 201, g, 'POST', twice));
    assert.equal(r.photos.length, 0, 'already in the album');
    assert.equal(r.skipped, 2);
    const other = await sharp({ create: { width: 300, height: 200, channels: 3, background: 'green' } }).jpeg().toBuffer();
    const mix = new FormData();
    mix.append('photos', new Blob([other], { type: 'image/jpeg' }), 'a.jpg');
    mix.append('photos', new Blob([other], { type: 'image/jpeg' }), 'b.jpg');
    const m = await json(await call(`/api/albums/${album.id}/photos`, 201, g, 'POST', mix));
    assert.equal(m.photos.length, 1, 'twice in one upload: kept once');
    assert.equal(m.skipped, 1);
    await call('/api/trash', 200, h, 'POST', { photoIds: [m.photos[0].id] });
    await call('/api/trash/purge', 200, h, 'POST', { photoIds: [m.photos[0].id] });
  }

  // ---- Emoji reactions: one each, switchable, removable; who reacted ----
  await call(`/api/photos/${hostPic.id}/reaction`, 200, g, 'POST', { emoji: '🥳' });
  assert.equal((await json(await call(`/api/photos/${hostPic.id}/reactions`, 200, h))).people[0].emoji, '🥳');
  await call(`/api/photos/${hostPic.id}/reaction`, 400, g, 'POST', { emoji: '💩' });
  let r = await json(await call(`/api/photos/${hostPic.id}/reaction`, 200, g, 'POST', { emoji: '😍' }));
  assert.deepEqual(r, { reactions: { '😍': 1 }, reaction: '😍' });
  r = await json(await call(`/api/photos/${hostPic.id}/reaction`, 200, g, 'POST', { emoji: '🔥' }));
  assert.deepEqual(r.reactions, { '🔥': 1 }, 'switching replaces your reaction');
  await call(`/api/photos/${hostPic.id}/reaction`, 200, h, 'POST', { emoji: '🔥' });
  const who = await json(await call(`/api/photos/${hostPic.id}/reactions`, 200, h));
  assert.equal(who.people.length, 2);
  assert.equal(who.people[0].by, 'You');
  let shown = await json(await call(`/api/albums/${album.id}`, 200, g));
  const seen = shown.photos.find((p) => p.id === hostPic.id);
  assert.deepEqual(seen.reactions, { '🔥': 2 });
  assert.equal(seen.reaction, '🔥');
  assert.equal(seen.comments, undefined, 'comments are gone');
  r = await json(await call(`/api/photos/${hostPic.id}/reaction`, 200, h, 'POST', { emoji: null }));
  assert.deepEqual(r, { reactions: { '🔥': 1 }, reaction: null });
  await call(`/api/photos/${hostPic.id}/comments`, 404, g);

  // ---- Liked tab: likes keep their time, newest first ----
  await call(`/api/photos/${third.id}/like`, 200, g, 'POST', { liked: true });
  assert.deepEqual((await json(await call(`/api/photos/${third.id}/likes`, 200, h))).people.map(p => p.by), ['guest']);
  await new Promise((res) => setTimeout(res, 20));
  await call(`/api/photos/${hostPic.id}/like`, 200, g, 'POST', { liked: true });
  let liked = (await json(await call('/api/photos/liked', 200, g))).photos;
  assert.deepEqual(liked.map((p) => p.id), [hostPic.id, third.id]);
  assert.equal(liked[0].albumName, 'Picnic');
  assert.ok(liked[0].likedAt);
  await call(`/api/photos/${third.id}/like`, 200, g, 'POST', { liked: false });
  assert.deepEqual((await json(await call(`/api/photos/${third.id}/likes`, 200, h))).people, []);
  liked = (await json(await call('/api/photos/liked', 200, g))).photos;
  assert.deepEqual(liked.map((p) => p.id), [hostPic.id]);

  // ---- Save (bookmark) ----
  assert.equal((await json(await call('/api/albums', 200, g))).albums[0].saved, false);
  assert.deepEqual(await json(await call(`/api/albums/${album.id}/save`, 200, g, 'POST', { saved: true })), { saved: true });
  assert.equal((await json(await call('/api/albums', 200, g))).albums[0].saved, true);
  assert.equal((await json(await call(`/api/albums/${album.id}`, 200, g))).album.saved, true);
  await call(`/api/albums/${album.id}/save`, 200, g, 'POST', { saved: false });
  assert.equal((await json(await call('/api/albums', 200, g))).albums[0].saved, false);
  await call('/api/albums/000000000000000000000000/save', 404, g, 'POST', { saved: true });

  // ---- Hidden by you ----
  await call(`/api/albums/${album.id}/hidden`, 200, g, 'POST', { photoIds: [third.id], hidden: true });
  const hid = (await json(await call('/api/hidden', 200, g))).photos;
  assert.deepEqual(hid.map((p) => p.id), [third.id]);
  assert.equal(hid[0].albumName, 'Picnic');
  assert.equal((await json(await call('/api/albums', 200, g))).hiddenCount, 1);
  assert.equal((await json(await call(`/api/hidden?album=${album.id}`, 200, h))).photos.length, 0, 'only your own hidden photos');

  // ---- The bin: host only ----
  const tried = await json(await call('/api/trash', 403, g, 'POST', { photoIds: [guestPic.id] }));
  assert.match(tried.error, /Only the host/);
  await call(`/api/photos/${guestPic.id}`, 403, g, 'DELETE');   // not even your own upload: host only
  assert.deepEqual(await json(await call('/api/trash', 200, h, 'POST', { photoIds: [guestPic.id, 'nope'] })), { moved: 1, skipped: 1 });
  shown = await json(await call(`/api/albums/${album.id}`, 200, g));
  assert.ok(!shown.photos.some((p) => p.id === guestPic.id), 'binned photos leave the album');
  assert.equal(shown.album.photos, 1, 'and the counts');
  await call(`/api/photos/${guestPic.id}?size=thumb`, 404, g);
  await call(`/api/photos/${guestPic.id}/like`, 404, g, 'POST', { liked: true });
  await call(`/api/photos/${guestPic.id}?size=thumb`, 200, h);   // the host still sees it in the bin
  let bin = (await json(await call('/api/trash', 200, h))).photos;
  assert.equal(bin.length, 1);
  assert.equal(bin[0].albumName, 'Picnic');
  assert.ok(new Date(bin[0].purgeAt) - new Date(bin[0].deletedAt) === 30 * 86400000);
  assert.equal((await json(await call('/api/trash', 200, g))).photos.length, 0, 'guests have no bin');
  const list = await json(await call('/api/albums', 200, h));
  assert.equal(list.trashCount, 1);
  assert.equal(list.albums[0].trashCount, 1);
  assert.equal((await json(await call(`/api/albums/${album.id}`, 200, h))).album.trashCount, 1);
  // Recover, bin again, then delete for good
  assert.deepEqual(await json(await call('/api/trash/restore', 200, h, 'POST', { photoIds: [guestPic.id] })), { restored: 1 });
  assert.ok((await json(await call(`/api/albums/${album.id}`, 200, g))).photos.some((p) => p.id === guestPic.id));
  await call('/api/trash', 200, h, 'POST', { photoIds: [guestPic.id] });
  assert.deepEqual(await json(await call('/api/trash/purge', 200, g, 'POST', { all: true })), { purged: 0 }, 'a guest can’t empty the host’s bin');
  assert.deepEqual(await json(await call('/api/trash/purge', 200, h, 'POST', { all: true, album: album.id })), { purged: 1 });
  assert.equal(await Photo.countDocuments({ _id: guestPic.id }), 0);
  // After 30 days the server empties the bin by itself
  await call('/api/trash', 200, h, 'POST', { photoIds: [third.id] });
  await Photo.updateOne({ _id: third.id }, { deletedAt: new Date(Date.now() - 31 * 86400000) });
  assert.equal(await purgeExpired(), 1);
  assert.equal(await Photo.countDocuments({ _id: third.id }), 0);
  assert.equal((await json(await call('/api/hidden', 200, g))).photos.length, 0);

  console.log(`Photo checks passed (${checks} requests).`);
} finally {
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
  await rm(folder, { recursive: true, force: true });
}
