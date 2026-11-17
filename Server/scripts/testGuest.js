// Visitors without an account: they can look (album preview by code, the nearby events scan), and
// the moment they try to do something they get a 401 'login-required' saying what for.
// Runs without .env: a disposable database and upload folder. node scripts/testGuest.js
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

for (const key of Object.keys(process.env)) {
  if (/^(AWS_|S3_|RECAPTCHA_|CAPTCHA_|EMAIL_|MONGODB_|FRONTEND_|CORS_|PUBLIC_|GOOGLE_)/.test(key)) delete process.env[key];
}
const folder = await mkdtemp(path.join(os.tmpdir(), 'momento-guest-'));
const mongo = await MongoMemoryServer.create();
Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'isolated-guest-test', MONGODB_URI: mongo.getUri(), UPLOAD_DIR: folder, PUBLIC_URL: 'http://localhost:4108' });
const { app } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
await mongoose.connect(process.env.MONGODB_URI);
const server = app.listen(4108);
let checks = 0;
async function call(url, status, cookie = '', method = 'GET', body) {
  const h = { cookie };
  if (body && !(body instanceof FormData)) h['Content-Type'] = 'application/json';
  const r = await fetch('http://localhost:4108' + url, { method, headers: h, body: body instanceof FormData ? body : body && JSON.stringify(body) });
  const text = await r.clone().text();
  assert.equal(r.status, status, `${method} ${url}: ${text}`);
  checks++;
  return r;
}
const json = async (r) => r.json();
const HOUR = 3600000;
// Sydney Opera House, and points north, east and further away
const here = { lat: -33.8568, lng: 151.2153 };
const north600 = { lat: here.lat + 600 / 111320, lng: here.lng };
const east3k = { lat: here.lat, lng: here.lng + 3000 / (111320 * Math.cos(here.lat * Math.PI / 180)) };
const far20k = { lat: here.lat - 20000 / 111320, lng: here.lng };

try {
  const password = 'Test-password-123!';
  await User.create({ name: 'Hana Host', email: 'host@example.invalid', passwordHash: await bcrypt.hash(password, 12), emailVerified: true });
  const login = await call('/api/auth/login', 200, '', 'POST', { email: 'host@example.invalid', password });
  const h = login.headers.get('set-cookie').split(';')[0];
  const event = (name, at, radiusM, visibility = 'public') => call('/api/albums', 201, h, 'POST', {
    name, date: new Date().toISOString().slice(0, 10), place: name, visibility,
    startsAt: new Date(Date.now() - HOUR).toISOString(), endsAt: new Date(Date.now() + 4 * HOUR).toISOString(),
    zone: { lat: at.lat, lng: at.lng, radiusM }, venue: { address: `${name}, Sydney` },
  }).then(json).then((r) => r.album);
  const near = await event('Harbour party', north600, 1000);
  const wide = await event('City fun run', east3k, 5000);     // centre 3 km away, but its zone reaches here
  await event('Beach day', far20k, 1000);                     // 20 km away
  const priv = await event('Private dinner', north600, 1000, 'invite');

  // ---- The scan, logged out ----
  const scan = await json(await call(`/api/events/nearby?lat=${here.lat}&lng=${here.lng}&radius=1000`, 200));
  assert.equal(scan.signedIn, false);
  assert.equal(scan.scan.radiusM, 1000);
  const names = scan.events.map((e) => e.name);
  assert.ok(names.includes('Harbour party'), 'an event 600 m away is in a 1 km scan');
  assert.ok(names.includes('City fun run'), 'an event whose zone you stand in is included');
  assert.ok(!names.includes('Beach day'), 'an event 20 km away is not');
  assert.ok(!names.includes('Private dinner'), 'invite-only albums are never listed');
  const harbour = scan.events.find((e) => e.name === 'Harbour party');
  assert.equal(harbour.direction, 'north');
  assert.ok(harbour.distanceM > 550 && harbour.distanceM < 650);
  assert.equal(harbour.inScan, true);
  assert.equal(harbour.inside, true);
  assert.deepEqual(harbour.pics, [], 'no photos for people who haven’t joined');
  const run = scan.events.find((e) => e.name === 'City fun run');
  assert.equal(run.inScan, false);
  assert.equal(run.inside, true);
  assert.equal(run.direction, 'east');
  assert.equal(scan.scan.count, 1);
  // A wider scan finds the far one; a bad position is refused
  const wider = await json(await call(`/api/events/nearby?lat=${here.lat}&lng=${here.lng}&km=25`, 200));
  assert.ok(wider.events.some((e) => e.name === 'Beach day'));
  await call('/api/events/nearby?lat=999&lng=0', 400);

  // ---- Looking at an album from its code, logged out ----
  const pv = await json(await call(`/api/albums/preview/${priv.code}`, 200));
  assert.equal(pv.album.name, 'Private dinner');
  assert.equal(pv.album.hostName, 'Hana');
  assert.equal(pv.album.photos, 0);
  assert.equal(pv.album.joining.open, true);
  assert.equal(pv.album.zone, undefined, 'no exact venue position');
  assert.equal(pv.signedIn, false);
  assert.equal(pv.member, false);
  await call('/api/albums/preview/NOPE', 400);
  await call('/api/albums/preview/ZZZ-ZZZZ', 404);
  const mine = await json(await call(`/api/albums/preview/${priv.code}`, 200, h));
  assert.equal(mine.signedIn, true);
  assert.equal(mine.member, true);

  // ---- Doing something, logged out: a login popup with the reason ----
  const needs = async (url, method, action, body) => {
    const r = await json(await call(url, 401, '', method, body));
    assert.equal(r.code, 'login-required', url);
    assert.equal(r.action, action, url);
    assert.match(r.error, /^Log in or sign up/);
  };
  await needs('/api/albums/join', 'POST', 'join', { code: priv.code });
  await needs(`/api/events/${near.id}/join`, 'POST', 'join', {});
  await needs(`/api/albums/${near.id}/photos`, 'POST', 'upload');
  await needs('/api/photos/000000000000000000000000/like', 'POST', 'react', { liked: true });
  await needs('/api/albums', 'POST', 'create', { name: 'x' });
  await needs('/api/groups', 'POST', 'groups', { name: 'x' });
  await needs(`/api/albums/${near.id}`, 'GET', 'view');
  await needs('/api/albums', 'GET', 'continue');
  void wide;

  console.log(`Guest checks passed (${checks} requests).`);
} finally {
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
  await rm(folder, { recursive: true, force: true });
}
