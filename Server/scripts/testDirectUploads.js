// Direct uploads (audit B3): links, the PUT (local stand-in for S3), process, and every way it can go wrong. Local only.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import sharp from 'sharp';
import bcrypt from 'bcryptjs';

const dir = await mkdtemp(path.join(os.tmpdir(), 'momento-direct-'));
const mongo = await MongoMemoryServer.create();
Object.assign(process.env, { NODE_ENV: 'test', S3_BUCKET: '', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-only-isolated-direct-uploads',
  UPLOAD_DIR: dir, UPLOAD_CONSENT: 'off', UPLOAD_DAY_GB: '0.001' });
await mongoose.connect(process.env.MONGODB_URI);
const { app } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { Photo } = await import('../src/models/Photo.js');
const { UploadCheck } = await import('../src/models/UploadCheck.js');
const rk = await import('../src/services/rekognitionService.js');
rk.useDetector(async () => []);
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const origin = 'http://127.0.0.1:' + server.address().port;
process.env.PUBLIC_URL = origin;
const call = async (url, cookie, body, status) => {
  const r = await fetch(origin + url, { method: body ? 'POST' : 'GET', headers: { cookie, ...(body && { 'Content-Type': 'application/json' }) }, body: body && JSON.stringify(body) });
  const data = await r.json().catch(() => null);
  if (status) assert.equal(r.status, status, `${url}: ${JSON.stringify(data)}`);
  return { status: r.status, body: data, cookie: r.headers.get('set-cookie') };
};
// The links point at PUBLIC_URL as the config read it at start-up: send them to this test server instead
const put = (link, body, headers = link.headers) => fetch(origin + new URL(link.url).pathname, { method: 'PUT', headers, body });
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
let shade = 0;
const jpeg = () => sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 20 + 7 * shade, g: 150 - 5 * shade++, b: 60 } } }).jpeg().toBuffer();

try {
  const password = 'test-user-password-123';
  const host = await User.create({ name: 'Host', email: 'host@example.invalid', passwordHash: await bcrypt.hash(password, 4), emailVerified: true });
  const other = await User.create({ name: 'Other', email: 'other@example.invalid', passwordHash: await bcrypt.hash(password, 4), emailVerified: true });
  const login = async (u) => (await call('/api/auth/login', '', { email: u.email, password }, 200)).cookie.split(';')[0];
  const cookie = await login(host), stranger = await login(other);
  const { album } = (await call('/api/albums', cookie, { kind: 'album', name: 'Direct', date: new Date().toISOString().slice(0, 10) }, 201)).body;
  const base = `/api/albums/${album.id}/uploads`;

  // ---- The whole way: links, PUT, process → published ----
  const a = await jpeg(), b = await jpeg();
  const asked = (await call(base, cookie, { files: [{ name: 'a.jpg', size: a.length, sha256: sha(a) }, { name: 'b.jpg', size: b.length, sha256: sha(b) }] }, 200)).body;
  assert.equal(asked.uploads.length, 2);
  assert.equal(asked.uploads[0].method, 'PUT');
  assert.ok(asked.uploads[0].headers['x-amz-checksum-sha256']);
  for (const [i, file] of [a, b].entries()) assert.equal((await put(asked.uploads[i], file)).status, 200);
  const done = (await call(base + '/process', cookie, { tickets: asked.uploads.map((u) => u.ticket) }, 201)).body;
  assert.equal(done.photos.length, 2, 'both published');
  const stored = await Photo.find({ album: album.id }).lean();
  assert.deepEqual(stored.map((p) => p.hash).sort(), [sha(a), sha(b)].sort(), 'the fingerprints are the files’ own');
  assert.equal((await readdir(path.join(dir, 'quarantine', 'direct', String(host._id))).catch(() => [])).length, 0, 'the quarantine copies are gone');

  // ---- Already in the album: skipped before sending ----
  const again = (await call(base, cookie, { files: [{ name: 'a-again.jpg', size: a.length, sha256: sha(a) }] }, 200)).body;
  assert.deepEqual([again.uploads.length, again.skipped], [0, [0]]);

  // ---- A different file than described: the stand-in (like S3) refuses the PUT ----
  const c = await jpeg(), d = await jpeg();
  const forC = (await call(base, cookie, { files: [{ name: 'c.jpg', size: c.length, sha256: sha(c) }] }, 200)).body.uploads[0];
  assert.equal((await put(forC, d)).status, 400, 'a file that doesn’t match its SHA-256 is refused');
  assert.equal((await put(forC, c, { 'Content-Type': 'application/octet-stream' })).status, 400, 'the checksum header is required');
  // Bigger than the link was made for (the size is signed into it, like S3's Content-Length): refused
  assert.equal((await put(forC, Buffer.concat([c, Buffer.alloc(4096)]))).status, 403, 'a bigger file is refused');
  // Processed without arriving: 409 upload-missing, nothing queued
  const missing = await call(base + '/process', cookie, { tickets: [forC.ticket] }, 409);
  assert.deepEqual([missing.body.code, missing.body.missing], ['upload-missing', ['c.jpg']]);
  // Now it arrives
  assert.equal((await put(forC, c)).status, 200);
  assert.equal((await call(base + '/process', cookie, { tickets: [forC.ticket] }, 201)).body.photos.length, 1);
  // The same ticket again: the file is gone, nothing more is added
  assert.equal((await call(base + '/process', cookie, { tickets: [forC.ticket] }, 409)).body.code, 'upload-missing');

  // ---- Someone else's ticket, a made-up one, or another album ----
  const e = await jpeg();
  const forE = (await call(base, cookie, { files: [{ name: 'e.jpg', size: e.length, sha256: sha(e) }] }, 200)).body.uploads[0];
  await put(forE, e);
  assert.equal((await call(base + '/process', stranger, { tickets: [forE.ticket] })).status, 404);
  assert.equal((await call(base + '/process', cookie, { tickets: ['made.up.ticket'] }, 400)).body.code, 'BAD_TICKET');
  const { album: second } = (await call('/api/albums', cookie, { kind: 'album', name: 'Second', date: new Date().toISOString().slice(0, 10) }, 201)).body;
  assert.equal((await call(`/api/albums/${second.id}/uploads/process`, cookie, { tickets: [forE.ticket] }, 400)).body.code, 'BAD_TICKET', 'only into its own album');

  // ---- Bad requests, sizes, and the day's quota (1 MB here) ----
  await call(base, cookie, { files: [] }, 400);
  await call(base, cookie, { files: [{ name: 'x.jpg', size: 10, sha256: 'nothex' }] }, 400);
  assert.deepEqual((await call(base, cookie, { files: [{ name: 'huge.jpg', size: 60 * 1048576, sha256: sha(Buffer.from('h')) }] }, 200)).body.tooBig, ['huge.jpg']);
  assert.equal((await call(base, cookie, { files: [{ name: 'big.jpg', size: 2 * 1048576, sha256: sha(Buffer.from('q')) }] }, 429)).body.code, 'daily-quota');
  // Not a member at all
  assert.equal((await call(base, stranger, { files: [{ name: 'z.jpg', size: 10, sha256: sha(Buffer.from('z')) }] })).status, 404);
  // An expired local link
  const forged = await fetch(origin + '/api/uploads/local/not-a-token', { method: 'PUT', body: 'x' });
  assert.equal(forged.status, 403);
  assert.equal(await UploadCheck.countDocuments({ state: { $in: ['checking', 'publish'] } }), 0);
  console.log('Passed: direct uploads (links, PUT with SHA-256 checked, process, skips, tickets bound to person and album, sizes, quota).');
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  await mongo.stop();
  await rm(dir, { recursive: true, force: true });
}
