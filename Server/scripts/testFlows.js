import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';

// Run without .env. Every write is confined to a disposable database and directory.
for (const key of Object.keys(process.env)) {
  if (/^(R2_|MS_|RESEND_|TURNSTILE_|EMAIL_|MONGODB_|FRONTEND_|CORS_|PUBLIC_)/.test(key)) delete process.env[key];
}
const folder = await mkdtemp(path.join(os.tmpdir(), 'momento-flow-'));
const mongo = await MongoMemoryServer.create();
Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'isolated-flow-test', MONGODB_URI: mongo.getUri(), UPLOAD_DIR: folder, PUBLIC_URL: 'http://localhost:4105', SUPPORT_EMAIL: 'test@example.invalid' });
const { app } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { Photo } = await import('../src/models/Photo.js');
const { issueToken } = await import('../src/services/emailTokenService.js');
await mongoose.connect(process.env.MONGODB_URI);
const server = app.listen(4105);
let checks = 0;
async function call(url, status, cookie = '', method = 'GET', body) {
  const headers = { cookie };
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const r = await fetch('http://localhost:4105' + url, { method, headers, body: body instanceof FormData ? body : body && JSON.stringify(body), redirect: 'manual' });
  assert.equal(r.status, status, `${method} ${url}: ${await r.clone().text()}`);
  checks++;
  return r;
}
const cookieOf = r => r.headers.get('set-cookie').split(';')[0];
try {
  const password = 'Test-password-123!';
  const passwordHash = await bcrypt.hash(password, 12);
  const host = await User.create({ name: 'Host', email: 'host@example.invalid', passwordHash, emailVerified: true });
  const guest = await User.create({ name: 'Guest', email: 'guest@example.invalid', passwordHash, emailVerified: true });
  const pending = await User.create({ name: 'Pending', email: 'pending@example.invalid', passwordHash });
  const login = async email => cookieOf(await call('/api/auth/login', 200, '', 'POST', { email, password }));
  for (const page of ['/', '/albums.html', '/settings.html', '/support.html', '/api/health']) await call(page, 200);
  await call('/api/albums', 401);
  await call('/api/auth/login', 401, '', 'POST', { email: host.email, password: 'wrong-password' });
  const h = await login(host.email), g = await login(guest.email), p = await login(pending.email);
  await call('/api/albums', 403, p);
  await call('/api/auth/verify-email/resend', 200, p, 'POST');
  await call('/api/auth/verify-email/resend', 429, p, 'POST');
  const token = await issueToken(pending, 'verify', 10);
  const verified = await call('/api/auth/verify-email?token=' + token, 303);
  const v = cookieOf(verified);
  assert.ok(verified.headers.get('location').endsWith('/albums.html?verified=1'));
  await call('/api/albums', 200, v);
  const replay = await call('/api/auth/verify-email?token=' + token, 303);
  assert.ok(replay.headers.get('location').includes('invalid'));
  await call('/api/auth/me', 200, h, 'PATCH', { name: 'Updated', notify: { photos: false } });
  const album = (await (await call('/api/albums', 201, h, 'POST', { name: 'Test album', date: new Date().toISOString().slice(0, 10), place: 'Test', startsAt: new Date(Date.now() - 3600000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), uploadLeadMin: 0, zone: { lat: -33.8688, lng: 151.2093, radiusM: 1000 }, venue: { address: 'Test venue' } })).json()).album;
  await call('/api/albums/' + album.id, 404, v);
  await call('/api/albums/join', 201, g, 'POST', { code: album.code });
  await call('/api/albums/' + album.id, 403, g, 'DELETE');
  const bytes = await sharp({ create: { width: 1200, height: 800, channels: 3, background: 'red' } }).png().toBuffer();
  const form = new FormData(); form.append('photos', new Blob([bytes], { type: 'image/png' }), 'test.png');
  await call('/api/albums/' + album.id + '/photos', 201, h, 'POST', form);
  const photo = await Photo.findOne({ album: album.id });
  const thumb = await call('/api/photos/' + photo.id + '?size=thumb', 200, h);
  assert.equal((await sharp(Buffer.from(await thumb.arrayBuffer())).metadata()).width, 600);
  await Photo.updateOne({ _id: photo.id }, { $unset: { thumbnailKey: 1 } });
  await call('/api/photos/' + photo.id + '?size=thumb', 200, h);
  assert.ok((await Photo.findById(photo.id)).thumbnailKey);
  const download = await call('/api/photos/' + photo.id + '/download', 200, h);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  await call('/api/albums/' + album.id + '/download', 200, h);
  await call('/api/photos/' + photo.id, 403, g, 'DELETE');
  await call('/api/photos/' + photo.id, 200, h, 'DELETE');
  await call('/api/albums/' + album.id + '/membership', 200, g, 'DELETE');
  await call('/api/albums/' + album.id, 200, h, 'DELETE');
  await call('/api/auth/logout', 200, h, 'POST');
  assert.equal((await (await call('/api/auth/me', 200, h)).json()).user, null);
  const reset = await issueToken(guest, 'reset', 10);
  await login(guest.email);
  await login(guest.email);
  await call('/api/auth/login', 409, '', 'POST', { email: guest.email, password });
  await call('/api/auth/password/reset', 200, '', 'POST', { token: reset, password: 'New-password-123!' });
  assert.equal((await (await call('/api/auth/me', 200, g)).json()).user, null);
  const changedToken = await issueToken(host, 'email', 10, { newEmail: 'changed@example.invalid' });
  await call('/api/auth/email/confirm?token=' + changedToken, 303);
  assert.equal((await User.findById(host.id)).email, 'changed@example.invalid');
  const changedCookie = await login('changed@example.invalid');
  await call('/api/auth/me', 200, changedCookie, 'DELETE', { password });
  assert.equal(await User.findById(host.id), null);
  await call('/api/auth/password/forgot', 200, '', 'POST', { email: 'missing@example.invalid' });
  await call('/api/auth/signup', 503, '', 'POST', { name: 'Test', email: 'signup@example.invalid', password });
  console.log(`PASS ${checks} HTTP checks plus thumbnail, verification, and session assertions`);
} finally {
  await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
  await rm(folder, { recursive: true, force: true });
}
