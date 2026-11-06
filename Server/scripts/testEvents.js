// Event albums: start/end times, the upload window and the 1 km / 2 km zone.
// Runs without .env: a disposable database and upload folder. node scripts/testEvents.js
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';

for (const key of Object.keys(process.env)) {
  if (/^(R2_|MS_|RESEND_|TURNSTILE_|EMAIL_|MONGODB_|FRONTEND_|CORS_|PUBLIC_|GOOGLE_)/.test(key)) delete process.env[key];
}
const folder = await mkdtemp(path.join(os.tmpdir(), 'momento-events-'));
const mongo = await MongoMemoryServer.create();
Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'isolated-event-test', MONGODB_URI: mongo.getUri(), UPLOAD_DIR: folder, PUBLIC_URL: 'http://localhost:4106', GOOGLE_MAPS_API_KEY: 'test-maps-key' });
const { app } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { Album } = await import('../src/models/Album.js');
await mongoose.connect(process.env.MONGODB_URI);
const server = app.listen(4106);
let checks = 0;
async function call(url, status, cookie = '', method = 'GET', body, headers = {}) {
  const h = { cookie, ...headers };
  if (body && !(body instanceof FormData)) h['Content-Type'] = 'application/json';
  const r = await fetch('http://localhost:4106' + url, { method, headers: h, body: body instanceof FormData ? body : body && JSON.stringify(body) });
  const text = await r.clone().text();
  assert.equal(r.status, status, `${method} ${url}: ${text}`);
  checks++;
  return r;
}
const json = async (r) => r.json();
const cookieOf = (r) => r.headers.get('set-cookie').split(';')[0];
const HOUR = 3600000;
const venue = { lat: -33.8568, lng: 151.2153 };   // Sydney Opera House
// Points roughly 0.5 km, 1.5 km and 5 km north of the venue
const north = (km) => `${(venue.lat + km / 111.2).toFixed(6)},${venue.lng},20`;

try {
  const password = 'Test-password-123!';
  const passwordHash = await bcrypt.hash(password, 12);
  await User.create({ name: 'Host', email: 'host@example.invalid', passwordHash, emailVerified: true });
  await User.create({ name: 'Guest', email: 'guest@example.invalid', passwordHash, emailVerified: true });
  const login = async (email) => cookieOf(await call('/api/auth/login', 200, '', 'POST', { email, password }));
  const h = await login('host@example.invalid'), g = await login('guest@example.invalid');

  const cfg = await json(await call('/api/config', 200));
  assert.equal(cfg.mapsApiKey, 'test-maps-key');

  const base = {
    name: 'Rooftop party', date: new Date().toISOString().slice(0, 10), place: 'Opera House',
    startsAt: new Date(Date.now() + 2 * HOUR).toISOString(), endsAt: new Date(Date.now() + 5 * HOUR).toISOString(),
    uploadLeadMin: 30, zone: { ...venue, radiusM: 1000 }, venue: { address: 'Bennelong Point, Sydney', placeId: 'abc' },
  };
  // Validation
  await call('/api/albums', 400, h, 'POST', { ...base, startsAt: undefined });
  await call('/api/albums', 400, h, 'POST', { ...base, endsAt: base.startsAt });
  await call('/api/albums', 400, h, 'POST', { ...base, endsAt: new Date(Date.now() - HOUR).toISOString(), startsAt: new Date(Date.now() - 2 * HOUR).toISOString() });
  await call('/api/albums', 400, h, 'POST', { ...base, uploadLeadMin: 2000 });
  await call('/api/albums', 400, h, 'POST', { ...base, zone: { ...venue, radiusM: 500 } });
  await call('/api/albums', 400, h, 'POST', { ...base, zone: { ...venue, radiusM: 12000 } });
  await call('/api/albums', 400, h, 'POST', { ...base, zone: undefined });

  // Upcoming: uploads open 30 minutes before the start, which is 2 hours away
  const album = (await json(await call('/api/albums', 201, h, 'POST', base))).album;
  assert.equal(album.status, 'upcoming');
  assert.equal(album.open, false);
  assert.equal(album.uploadLeadMin, 30);
  assert.equal(album.zone.radiusM, 1000);
  assert.equal(album.venue.address, 'Bennelong Point, Sydney');
  assert.equal(new Date(album.opensAt).getTime(), new Date(base.startsAt).getTime() - 30 * 60000);
  await call('/api/albums/join', 201, g, 'POST', { code: album.code });

  const bytes = await sharp({ create: { width: 400, height: 300, channels: 3, background: 'blue' } }).jpeg().toBuffer();
  const photo = () => { const f = new FormData(); f.append('photos', new Blob([bytes], { type: 'image/jpeg' }), 'p.jpg'); return f; };
  const up = (status, cookie, loc) => call(`/api/albums/${album.id}/photos`, status, cookie, 'POST', photo(), loc ? { 'X-Momento-Location': loc } : {});

  // Before the window: guests are turned away, the host isn't
  let r = await json(await up(403, g, north(0.5)));
  assert.equal(r.code, 'not-open-yet');
  await up(201, h);

  // Inside the window (start moved to 10 minutes from now: within the 30-minute lead)
  await Album.updateOne({ _id: album.id }, { startsAt: new Date(Date.now() + 10 * 60000) });
  assert.equal(r = (await json(await call('/api/albums/' + album.id, 200, g))).album.status, 'live');
  r = await json(await up(403, g));
  assert.equal(r.code, 'location-needed');
  r = await json(await up(403, g, north(1.5)));
  assert.equal(r.code, 'outside-zone');
  assert.match(r.error, /1\.5 km/);
  await up(201, g, north(0.5));
  // A 2 km zone lets the guest 1.5 km away in
  await Album.updateOne({ _id: album.id }, { 'zone.radiusM': 2000 });
  await up(201, g, north(1.5));
  r = await json(await up(403, g, north(5)));
  assert.equal(r.code, 'outside-zone');
  // Up to 10 km
  await Album.updateOne({ _id: album.id }, { 'zone.radiusM': 10000 });
  await up(201, g, north(5));

  // After the end: closed for guests, still open to the host
  await Album.updateOne({ _id: album.id }, { startsAt: new Date(Date.now() - 3 * HOUR), endsAt: new Date(Date.now() - HOUR) });
  r = await json(await up(403, g, north(0.5)));
  assert.equal(r.code, 'closed');
  await up(201, h);
  assert.equal((await json(await call('/api/albums/' + album.id, 200, h))).album.status, 'kept');

  // The browser is allowed to send the location header across origins
  const pre = await fetch('http://localhost:4106/api/albums/x/photos', { method: 'OPTIONS', headers: { Origin: 'http://localhost:3000', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-momento-location' } });
  assert.match(pre.headers.get('access-control-allow-headers') || '', /X-Momento-Location/i);
  checks++;

  // Albums made before event times keep working the old way
  const old = await Album.create({ name: 'Old album', date: new Date().toISOString().slice(0, 10), code: 'OLDCODE', host: (await User.findOne({ email: 'host@example.invalid' }))._id });
  const { Membership } = await import('../src/models/Membership.js');
  await Membership.create({ album: old._id, user: (await User.findOne({ email: 'guest@example.invalid' }))._id, role: 'guest' });
  await call(`/api/albums/${old.id}/photos`, 201, g, 'POST', photo());

  // A 7.5 km zone is accepted when creating
  const wide = (await json(await call('/api/albums', 201, h, 'POST', { ...base, name: 'Wide', zone: { ...venue, radiusM: 7500 } }))).album;
  assert.equal(wide.zone.radiusM, 7500);

  // Changing the password: needs the current one, logs other devices out, not for Google-only accounts
  const other = await login('host@example.invalid');
  await call('/api/auth/password', 401, h, 'POST', { currentPassword: 'wrong-password', newPassword: 'New-password-456!' });
  await call('/api/auth/password', 400, h, 'POST', { currentPassword: password, newPassword: 'short' });
  const changed = await call('/api/auth/password', 200, h, 'POST', { currentPassword: password, newPassword: 'New-password-456!' });
  const fresh = cookieOf(changed);
  await call('/api/auth/me', 200, fresh).then(async (res) => assert.equal((await res.json()).user.hasPassword, true));
  assert.equal((await json(await call('/api/auth/me', 200, other))).user, null);
  await call('/api/auth/login', 200, '', 'POST', { email: 'host@example.invalid', password: 'New-password-456!' });
  const gUser = await User.create({ name: 'Google person', email: 'g@example.invalid', googleId: 'google-123', emailVerified: true });
  const { startSession } = await import('../src/utils/session.js');
  let gCookie = '';
  await startSession({ cookie: (n, v) => { gCookie = `${n}=${v}`; } }, gUser);
  const gMe = (await json(await call('/api/auth/me', 200, gCookie))).user;
  assert.equal(gMe.hasPassword, false);
  assert.deepEqual(gMe.providers, ['google']);
  assert.equal((await json(await call('/api/auth/password', 400, gCookie, 'POST', { newPassword: 'Another-pass-789!' }))).code, 'no-password');
  // ...but they can still change their email (no password needed)
  await call('/api/auth/email', 200, gCookie, 'POST', { email: 'g-new@example.invalid' });

  console.log(`Event checks passed: ${checks}`);
} finally {
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
  await rm(folder, { recursive: true, force: true });
}
