// Security and privacy checks: headers, request IDs, bad input, login token rotation and reuse,
// staff-only routes and emergency switches, data export, consent, unsubscribe, reports and takedowns
// (with banned files and strikes), automatic decisions and human review, location removal, the age
// check, short login links, account deletion (and finishing it if it stops), and log redaction.
// Runs without .env: a disposable database and upload folder. node scripts/testSecurity.js
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import jwt from 'jsonwebtoken';

for (const key of Object.keys(process.env)) {
  if (/^(AWS_|S3_|RECAPTCHA_|CAPTCHA_|EMAIL_|MONGODB_|FRONTEND_|CORS_|PUBLIC_|GOOGLE_|NSFW_|REQUIRE_|SECURITY_|TOKEN_)/.test(key)) delete process.env[key];
}
const folder = await mkdtemp(path.join(os.tmpdir(), 'momento-security-'));
const mongo = await MongoMemoryServer.create();
const SECRET = 'isolated-security-test';
Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: SECRET, MONGODB_URI: mongo.getUri(), UPLOAD_DIR: folder, PUBLIC_URL: 'http://localhost:4115' });
const { app } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { Photo } = await import('../src/models/Photo.js');
const { AuditLog } = await import('../src/models/AuditLog.js');
const { Consent } = await import('../src/models/Consent.js');
const { Report } = await import('../src/models/Report.js');
const { ModerationDecision } = await import('../src/models/ModerationDecision.js');
const { Membership } = await import('../src/models/Membership.js');
const { EmailToken } = await import('../src/models/EmailToken.js');
const { forgetSwitches } = await import('../src/services/switches.js');
const { unsubscribeUrl } = await import('../src/controllers/privacyController.js');
const { issueToken } = await import('../src/services/emailTokenService.js');
const { redact } = await import('../src/utils/logRedaction.js');
const { hasLocation } = await import('../src/utils/gpsStrip.js');
const nsfw = await import('../src/services/nsfwService.js');
const jobs = await import('../src/services/jobs.js');
await mongoose.connect(process.env.MONGODB_URI);
const server = app.listen(4115);
const BASE = 'http://localhost:4115';
let checks = 0, ipN = 0;
const venue = { lat: -33.8568, lng: 151.2153 };
// Each request comes from its own made-up IP (the server trusts one proxy), so per-IP limits don't get in the way
async function raw(url, { cookie = '', method = 'GET', body, headers = {} } = {}) {
  const h = { cookie, 'X-Momento-Location': `${venue.lat},${venue.lng},10`, 'X-Forwarded-For': `10.9.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...headers };
  if (body && !(body instanceof FormData) && typeof body !== 'string') h['Content-Type'] = 'application/json';
  return fetch((url.startsWith('http') ? '' : BASE) + url, { method, headers: h, redirect: 'manual', body: body instanceof FormData || typeof body === 'string' ? body : body && JSON.stringify(body) });
}
async function call(url, status, cookie = '', method = 'GET', body, headers) {
  const r = await raw(url, { cookie, method, body, headers });
  const text = await r.clone().text();
  assert.equal(r.status, status, `${method} ${url}: ${text.slice(0, 200)}`);
  checks++;
  return r;
}
const json = async (r) => r.json();
const cookieOf = (r) => (r.headers.get('set-cookie') || '').split(';')[0];
const HOUR = 3600000;
let shade = 0;
const pic = (colour) => sharp({ create: { width: 160, height: 120, channels: 3, background: colour || { r: 30 + (shade % 200), g: 60 + (shade++ % 150), b: 140 } } }).jpeg().toBuffer();
const form = (field, ...bufs) => { const fd = new FormData(); bufs.forEach((b, i) => fd.append(field, new Blob([b], { type: 'image/jpeg' }), `p${i}.jpg`)); return fd; };
const audits = (event) => AuditLog.countDocuments({ event });

try {
  const password = 'Test-password-123!';
  for (const n of ['Hana Host', 'Gus Guest', 'Ola Other', 'Rae Reporter', 'Sam Staff']) {
    await User.create({ name: n, email: `${n.split(' ')[0].toLowerCase()}@example.invalid`, passwordHash: await bcrypt.hash(password, 4), emailVerified: true });
  }
  const login = async (email) => cookieOf(await call('/api/auth/login', 200, '', 'POST', { email, password }));
  let h = await login('hana@example.invalid');
  const g = await login('gus@example.invalid'), o = await login('ola@example.invalid'), r = await login('rae@example.invalid');

  // ---- Headers and request IDs ----
  let res = await call('/api/auth/me', 200, h);
  assert.match(res.headers.get('x-request-id'), /^[\w-]{8,}$/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  const me = await json(res);
  assert.equal(me.user.role, undefined, 'the role never goes to the browser');
  assert.equal(me.user.passwordHash, undefined);
  assert.equal(me.policies.upToDate, false);

  // ---- Bad input: MongoDB operators and prototype keys are refused everywhere ----
  assert.equal((await json(await call('/api/auth/login', 400, '', 'POST', { email: { $ne: '' }, password: { $ne: '' } }))).code, 'bad-input');
  await call('/api/auth/login', 400, '', 'POST', '{"email":"a@b.co","password":"x","__proto__":{"admin":true}}', { 'Content-Type': 'application/json' });
  await call('/api/notifications/read', 400, g, 'POST', { ids: [{ $gt: '' }] });
  await call('/api/auth/login', 413, '', 'POST', JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(200000) }), { 'Content-Type': 'application/json' });

  // ---- An album with photos ----
  const album = (await json(await call('/api/albums', 201, h, 'POST', {
    name: 'Picnic', date: new Date().toISOString().slice(0, 10), place: 'Park',
    startsAt: new Date(Date.now() - HOUR).toISOString(), endsAt: new Date(Date.now() + 4 * HOUR).toISOString(),
    zone: { ...venue, radiusM: 1000 }, venue: { address: 'Park' },
  }))).album;
  for (const c of [g, o, r]) await call('/api/albums/join', 201, c, 'POST', { code: album.code, location: { ...venue, accuracy: 10, timestamp: Date.now() } });
  const up = `/api/albums/${album.id}/photos`;

  // ---- Location is taken out of uploaded originals ----
  const withGps = await sharp({ create: { width: 200, height: 150, channels: 3, background: '#4a8' } }).jpeg()
    .withExif({ IFD0: { Make: 'Cam' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '33/1 51/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '151/1 12/1 0/1' } }).toBuffer();
  assert.ok(hasLocation(withGps));
  const [gpsPhoto] = (await json(await call(up, 201, g, 'POST', form('photos', withGps)))).photos;
  const original = Buffer.from(await (await call(`/api/photos/${gpsPhoto.id}/download`, 200, h)).arrayBuffer());
  assert.ok(!hasLocation(original), 'downloaded original has no location');
  assert.equal(original.length, withGps.length);
  assert.ok((await sharp(original).metadata()).exif, 'the rest of the details are kept');

  // ---- Login tokens: renewed after 12 hours of use; an old copy stops working ----
  const hanaId = (await User.findOne({ email: 'hana@example.invalid' })).id;
  const tokenOf = (cookie) => decodeURIComponent(cookie.split('=')[1]);
  const first = jwt.decode(tokenOf(h));
  assert.equal(first.iss, 'momento-api');
  assert.equal(first.aud, 'momento-session');
  assert.ok(first.exp - first.iat <= 7 * 86400, 'a token lives 7 days at most');
  const aged = jwt.sign({ sub: hanaId, jti: first.jti, iat: Math.floor(Date.now() / 1000) - 13 * 3600 }, SECRET, { expiresIn: '6d', issuer: 'momento-api', audience: 'momento-session' });
  res = await call('/api/auth/me', 200, `momento_session=${aged}`);
  const fresh = cookieOf(res);
  assert.ok(fresh.startsWith('momento_session='), 'a new token');
  assert.notEqual(jwt.decode(tokenOf(fresh)).jti, first.jti);
  assert.equal((await json(res)).user.email, 'hana@example.invalid');
  // Right after: the old one still works (requests already on their way)
  assert.ok((await json(await call('/api/auth/me', 200, `momento_session=${aged}`))).user);
  // Later: the old one is a copy. That login ends, and it's logged
  await User.updateOne({ _id: hanaId }, { $set: { 'sessions.$[].rotatedAt': new Date(Date.now() - 5 * 60000) } });
  assert.equal((await json(await call('/api/auth/me', 200, `momento_session=${aged}`))).user, null);
  assert.equal((await json(await call('/api/auth/me', 200, fresh))).user, null, 'the whole login ended');
  assert.equal(await audits('session.reuse'), 1);
  // Forged tokens: "none" algorithm, another audience, another secret
  const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: hanaId, jti: 'x' })).toString('base64url')}.`;
  assert.equal((await json(await call('/api/auth/me', 200, `momento_session=${none}`))).user, null);
  h = await login('hana@example.invalid');
  const hj = jwt.decode(tokenOf(h)).jti;
  for (const bad of [
    jwt.sign({ sub: hanaId, jti: hj }, SECRET, { audience: 'momento-device' }),
    jwt.sign({ sub: hanaId, jti: hj }, 'another-secret', { issuer: 'momento-api', audience: 'momento-session' }),
  ]) assert.equal((await json(await call('/api/auth/me', 200, `momento_session=${bad}`))).user, null);
  // An old-style token (from before issuer/audience) still works once, and is swapped straight away
  const legacy = jwt.sign({ sub: hanaId, jti: hj }, SECRET, { expiresIn: '30d' });
  res = await call('/api/auth/me', 200, `momento_session=${legacy}`);
  assert.ok((await json(res)).user);
  h = cookieOf(res);
  assert.equal(jwt.decode(tokenOf(h)).aud, 'momento-session');

  // ---- Staff only: everyone else sees nothing at all ----
  await call('/api/admin/switches', 404, g);
  await call('/api/admin/switches', 404);
  await call('/api/admin/reports', 404, h, 'GET');
  await call('/api/auth/me', 200, g, 'PATCH', { name: 'Gus', role: 'staff', plan: 'admin', emailVerified: true, strikes: 0 });
  assert.equal((await User.findOne({ email: 'gus@example.invalid' }).select('+role')).role, 'user', 'role can’t be set through the API');
  await User.updateOne({ email: 'sam@example.invalid' }, { $set: { role: 'staff' } });
  const s = await login('sam@example.invalid');
  assert.deepEqual(await json(await call('/api/admin/switches', 200, s)), { signupsPaused: false, uploadsPaused: false, joinsPaused: false, sessionsValidAfter: null });

  // ---- Emergency switches ----
  await call('/api/admin/switches', 200, s, 'PATCH', { uploadsPaused: true, joinsPaused: true, signupsPaused: true });
  forgetSwitches();
  assert.equal((await json(await call(up, 503, g, 'POST', form('photos', await pic())))).code, 'paused');
  assert.equal((await json(await call('/api/albums/join', 503, g, 'POST', { code: album.code }))).code, 'paused');
  assert.equal((await json(await call('/api/auth/signup', 503, '', 'POST', { name: 'X', email: 'x@example.invalid', password }))).code, 'paused');
  await call('/api/admin/switches', 200, s, 'PATCH', { uploadsPaused: false, joinsPaused: false, signupsPaused: false });
  forgetSwitches();
  assert.equal(await audits('staff.switches'), 2);

  // ---- Reports: hidden for the reporter at once; for everyone at 3 reports, until staff decide ----
  const [target] = (await json(await call(up, 201, g, 'POST', form('photos', await pic())))).photos;
  await call(`/api/photos/${target.id}/report`, 400, r, 'POST', { reason: 'because' });
  await call(`/api/photos/${target.id}/report`, 201, r, 'POST', { reason: 'abuse', note: 'mean' });
  const seenBy = async (c) => (await json(await call(`/api/albums/${album.id}`, 200, c))).photos.some((p) => p.id === target.id);
  assert.equal(await seenBy(r), false, 'the reporter no longer sees it');
  assert.equal(await seenBy(h), true, 'everyone else still does');
  await call(`/api/photos/${target.id}/report`, 201, o, 'POST', { reason: 'abuse' });
  await call(`/api/photos/${target.id}/report`, 201, h, 'POST', { reason: 'privacy' });
  assert.equal(await seenBy(g), false, 'three reports: hidden for everyone (the uploader too)');
  await call('/api/trash/restore', 200, h, 'POST', { photoIds: [target.id] });
  assert.equal(await seenBy(h), false, 'the host can’t bring it back');
  const open = (await json(await call('/api/admin/reports', 200, s))).reports;
  assert.equal(open.length, 3);
  await call(`/api/admin/reports/${open[0].id}/dismiss`, 200, s, 'POST');
  assert.equal(await seenBy(g), true, 'dismissed: back for everyone (reporters keep it hidden for themselves)');
  assert.equal(await seenBy(r), false);

  // ---- Takedowns: gone for good, the same file can't come back, strikes, suspension at 3 ----
  const files = [await pic('#d22'), await pic('#2d2'), await pic('#22d')];
  for (const [i, file] of files.entries()) {
    const [p] = (await json(await call(up, 201, g, 'POST', form('photos', file)))).photos;
    const t = await json(await call(`/api/admin/photos/${p.id}/takedown`, 200, s, 'POST', { reason: 'copyright', notice: 'DMCA notice #' + i }));
    assert.equal(t.strikes, i + 1);
    assert.equal(t.suspended, i === 2);
    assert.equal(await Photo.countDocuments({ _id: p.id }), 0);
  }
  const suspended = await call(up, 403, g, 'POST', form('photos', await pic()));
  assert.equal((await json(suspended)).code, 'suspended');
  assert.equal((await json(await call('/api/auth/me', 200, g))).user.suspended, true, 'can still log in');
  await call('/api/auth/me/export', 200, g);   // and download their data
  const gusId = (await User.findOne({ email: 'gus@example.invalid' })).id;
  await call(`/api/admin/users/${gusId}/unsuspend`, 200, s, 'POST', { clearStrikes: true });
  assert.equal((await json(await call(up, 422, o, 'POST', form('photos', files[0])))).code, 'removed-content', 'a taken-down file can’t be uploaded again, by anyone');
  assert.equal((await json(await call(`/api/albums/${album.id}/cover`, 422, h, 'PUT', form('cover', files[1])))).code, 'removed-content');
  assert.equal(await audits('takedown'), 3);
  assert.equal(await audits('account.suspended'), 1);

  // ---- Automatic decisions: recorded, and a person can be asked to look again ----
  // A stand-in model: bright red pictures are "explicit"
  nsfw.useClassifier(async (buf) => { const { dominant } = await sharp(buf).stats(); return dominant.r > 200 && dominant.g < 60 ? { Porn: 0.95, Hentai: 0, Sexy: 0, Neutral: 0.05, Drawing: 0 } : { Porn: 0, Hentai: 0, Sexy: 0, Neutral: 1, Drawing: 0 }; });
  const flagged = await pic('#f01010');
  const refused = await json(await call(up, 422, o, 'POST', form('photos', flagged)));
  assert.equal(refused.code, 'nsfw');
  assert.equal(refused.decisionIds.length, 1);
  const d = await ModerationDecision.findById(refused.decisionIds[0]);
  assert.equal(d.model, nsfw.MODEL_NAME);
  assert.ok(d.scores.Porn > 0.9 && d.threshold > 0);
  await call(`/api/auth/moderation/${d.id}/review`, 404, g, 'POST');   // not theirs
  assert.equal((await json(await call(`/api/auth/moderation/${d.id}/review`, 200, o, 'POST'))).status, 'review-requested');
  assert.equal((await json(await call('/api/admin/moderation', 200, s))).decisions.length, 1);
  await call(`/api/admin/moderation/${d.id}`, 200, s, 'POST', { allow: true });
  assert.equal((await json(await call(up, 201, o, 'POST', form('photos', flagged)))).photos.length, 1, 'allowed by a person: it goes in');
  nsfw.useClassifier(null);

  // ---- Consent ----
  let c = await json(await call('/api/auth/consent', 200, g));
  assert.equal(c.upToDate, false);
  await call('/api/auth/consent', 409, g, 'POST', { tos: 'an-old-version', privacy: c.current.privacy });
  c = await json(await call('/api/auth/consent', 200, g, 'POST', { tos: c.current.tos, privacy: c.current.privacy }));
  assert.equal(c.upToDate, true);
  assert.equal(await Consent.countDocuments({ user: gusId }), 2);
  const proof = await Consent.findOne({ user: gusId });
  assert.ok(proof.ipHash && !proof.ipHash.includes('.'), 'the IP is only kept as a hash');

  // ---- One-click unsubscribe ----
  const gus = await User.findById(gusId);
  const link = unsubscribeUrl(gus, 'closing');
  await call(link.replace(/s=[\w-]+/, 's=' + 'A'.repeat(32)), 400);
  await call(link.replace('k=closing', 'k=recap'), 400, '', 'GET');
  await call(link, 200);
  assert.equal((await User.findById(gusId)).notify.closing, false);
  await call(link, 200, '', 'POST');   // mail apps' one-click POST

  // ---- Data export ----
  res = await call('/api/auth/me/export', 200, h);
  assert.match(res.headers.get('content-disposition'), /momento-my-data\.json/);
  const data = await json(res);
  assert.equal(data.account.email, 'hana@example.invalid');
  assert.equal(data.albumsYouHost.length, 1);
  assert.ok(data.reportsYouMade.length >= 1);
  const text = JSON.stringify(data);
  for (const secret of ['passwordHash', 'sessions', '$2', 'tokenHash', 'momento_session']) assert.ok(!text.includes(secret), `no ${secret} in the export`);
  assert.ok(await audits('data.exported') >= 2);

  // ---- The age check, before anything is kept ----
  const before = await User.countDocuments();
  const young = new Date(Date.now() - 10 * 365 * 86400000).toISOString().slice(0, 10);
  assert.equal((await json(await call('/api/auth/signup', 403, '', 'POST', { name: 'Kid', email: 'kid@example.invalid', password, birthDate: young }))).code, 'too-young');
  assert.equal((await json(await call('/api/auth/signup', 400, '', 'POST', { name: 'X', email: 'x2@example.invalid', password, birthDate: '2010-02-31' }))).code, 'age-invalid');
  assert.equal(await User.countDocuments(), before, 'nothing stored');
  assert.ok(!(await AuditLog.findOne({ meta: { $exists: true } }).lean() || {}).meta?.email);

  // ---- Short-lived login links ----
  const fresh2 = await User.create({ name: 'New', email: 'new@example.invalid', passwordHash: await bcrypt.hash(password, 4) });
  let tok = await issueToken(fresh2, 'verify', 24 * 60);
  res = await call(`/api/auth/verify-email?token=${tok}`, 303);
  assert.ok(cookieOf(res).startsWith('momento_session='), 'opened within 15 minutes: logged in');
  const late = await User.create({ name: 'Late', email: 'late@example.invalid', passwordHash: await bcrypt.hash(password, 4) });
  tok = await issueToken(late, 'verify', 24 * 60);
  await EmailToken.collection.updateOne({ user: late._id }, { $set: { createdAt: new Date(Date.now() - 20 * 60000) } });
  res = await call(`/api/auth/verify-email?token=${tok}`, 303);
  assert.equal(cookieOf(res), '', 'opened later: confirmed, but not logged in');
  assert.match(res.headers.get('location'), /login=1&verified=1/);
  assert.equal((await User.findById(late._id)).emailVerified, true);
  await issueToken(late, 'reset', 15);
  const resetRow = await EmailToken.findOne({ user: late._id, purpose: 'reset' });
  assert.ok(resetRow.expiresAt - Date.now() <= 15 * 60000 + 1000, 'reset links last 15 minutes');

  // ---- Per-account login limit (from many IPs) ----
  for (let i = 0; i < 10; i++) await call('/api/auth/login', 401, '', 'POST', { email: 'nobody@example.invalid', password: 'wrong-password-' + i });
  await call('/api/auth/login', 429, '', 'POST', { email: 'nobody@example.invalid', password: 'wrong-password-x' });

  // ---- Sign everyone out ----
  await call('/api/admin/sessions/revoke-all', 200, s, 'POST');
  forgetSwitches();
  assert.equal((await json(await call('/api/auth/me', 200, o))).user, null);
  assert.equal((await json(await call('/api/auth/me', 200, s))).user, null, 'staff too');
  assert.equal(await audits('staff.sessions-revoked'), 1);
  const o2 = await login('ola@example.invalid');
  assert.ok((await json(await call('/api/auth/me', 200, o2))).user, 'a new login works');

  // ---- Deleting an account: everything about them goes; it finishes even if it stopped halfway ----
  const olaId = (await User.findOne({ email: 'ola@example.invalid' })).id;
  await call('/api/auth/consent', 200, o2, 'POST', { accept: true });
  await call('/api/auth/me', 200, o2, 'DELETE', { password });
  assert.equal(await User.countDocuments({ _id: olaId }), 0);
  for (const [M, q] of [[Consent, { user: olaId }], [Report, { reporter: olaId }], [ModerationDecision, { user: olaId }], [Membership, { user: olaId }], [Photo, { uploader: olaId }]]) {
    assert.equal(await M.countDocuments(q), 0, `${M.modelName} cleared`);
  }
  assert.equal(await audits('account.deleted'), 1);
  // Halfway: marked as deleting, data still there. No login works, and the job finishes it
  const rae = await User.findOne({ email: 'rae@example.invalid' });
  await User.updateOne({ _id: rae._id }, { $set: { deletingAt: new Date(Date.now() - 11 * 60000) } });
  assert.equal((await json(await call('/api/auth/me', 200, r))).user, null);
  const t = await jobs.tidy();
  assert.equal(t.resumed, 1);
  assert.equal(await User.countDocuments({ _id: rae._id }), 0);
  assert.equal(await Report.countDocuments({ reporter: rae._id }), 0);
  // The audit log is append-only
  await assert.rejects(AuditLog.updateOne({}, { event: 'changed' }), /append-only/);
  await assert.rejects(AuditLog.deleteMany({}), /append-only/);

  // ---- Logs: secrets and addresses are taken out ----
  // Fake secrets, put together here so no key-shaped text sits in the code (GitHub's secret scanner)
  const fakeToken = 'abcdefghij'.repeat(3) + '0123456789', fakeKeyId = ['AK', 'IA'].join('') + 'Z'.repeat(16);
  const fakeJwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjMifQ', 'abcdefghijklmno'].join('.');
  const line = redact(`login {"email":"gus@example.invalid","password":"hunter22"} token=${fakeToken} ${fakeJwt} ${fakeKeyId} req 3f2b8c1e-1d2a-4c3b-9a8e-7f6d5c4b3a21`);
  for (const leaked of ['hunter22', 'gus@example', fakeToken, 'eyJhbGci', fakeKeyId]) assert.ok(!line.includes(leaked), `log hides ${leaked.slice(0, 8)}…`);
  assert.ok(line.includes('3f2b8c1e-1d2a-4c3b-9a8e-7f6d5c4b3a21'), 'request IDs stay readable');

  console.log(`Security checks passed (${checks} requests).`);
} finally {
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
  await rm(folder, { recursive: true, force: true });
}
