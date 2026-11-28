// Local only (gitignored): the upload agreement (Client/BACKEND-REQUESTS.md item 1).
// Usage (from Server/): node scripts/testUploadConsent.js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri('momento');
process.env.JWT_SECRET ||= crypto.randomBytes(48).toString('base64');
process.env.NODE_ENV = 'test';
process.env.TOS_VERSION = '2026-11-20';
const jwt = (await import('jsonwebtoken')).default;
const { config } = await import('../src/config/env.js');
const { connectDb } = await import('../src/config/database.js');
const { app } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { Album } = await import('../src/models/Album.js');
const { Membership } = await import('../src/models/Membership.js');
const { UploadConsent } = await import('../src/models/UploadConsent.js');
const { orphans } = await import('../src/services/jobs.js');
const { deleteAccount } = await import('../src/services/accountService.js').catch(() => ({}));
await connectDb();

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
let failed = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`  ok   ${name}`); } catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`); }
};
async function login(email) {
  const sid = crypto.randomUUID();
  const user = await User.create({ email, name: email.split('@')[0], emailVerified: true, sessions: [{ id: sid, expiresAt: new Date(Date.now() + 86400000) }] });
  const token = jwt.sign({ sub: user.id, jti: sid }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: 3600, issuer: 'momento-api', audience: 'momento-session' });
  return { user, cookie: `momento_session=${token}` };
}
const call = async (method, path, who, body) => {
  const r = await fetch(base + path, { method, headers: { cookie: who.cookie, origin: config.publicUrl, ...(body && { 'content-type': 'application/json' }) }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const upload = async (album, who) => {
  const form = new FormData();
  form.append('photos', new Blob([Buffer.from('not really a photo')], { type: 'image/jpeg' }), 'x.jpg');
  const r = await fetch(`${base}/api/albums/${album.id}/photos`, { method: 'POST', headers: { cookie: who.cookie, origin: config.publicUrl }, body: form });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const host = await login('host@example.test');
const guest = await login('guest@example.test');
const stranger = await login('stranger@example.test');
const album = await Album.create({ name: 'Consent', date: '2026-11-27', code: 'CONS001', host: host.user._id });
await Membership.create([{ album: album._id, user: host.user._id, role: 'host' }, { album: album._id, user: guest.user._id, role: 'guest' }]);
const A = `/api/albums/${album.id}`;

console.log('Upload agreement');
await check('/api/config says the current Terms version', async () => {
  const r = await fetch(base + '/api/config').then((x) => x.json());
  assert.equal(r.termsVersion, '2026-11-20');
});
await check('the album says uploadConsent: null before agreeing, and the Terms version', async () => {
  const r = await call('GET', A, guest);
  assert.equal(r.status, 200); assert.equal(r.body.album.uploadConsent, null); assert.equal(r.body.album.termsVersion, '2026-11-20');
});
await check('a bad or missing termsVersion is a 400', async () => {
  for (const body of [{}, { termsVersion: 5 }, { termsVersion: 'yesterday' }, { termsVersion: { $gt: '' } }]) {
    const r = await call('POST', `${A}/consent`, guest, body);
    assert.ok([400].includes(r.status), `${JSON.stringify(body)} → ${r.status}`);
  }
});
await check('older Terms (the website’s 2026-11-07): 409 terms-outdated with the current version', async () => {
  const r = await call('POST', `${A}/consent`, guest, { termsVersion: '2026-11-07' });
  assert.equal(r.status, 409); assert.equal(r.body.code, 'terms-outdated'); assert.equal(r.body.termsVersion, '2026-11-20');
  assert.equal(await UploadConsent.countDocuments(), 0);
});
await check('someone not in the album: 404, nothing saved', async () => {
  const r = await call('POST', `${A}/consent`, stranger, { termsVersion: '2026-11-20' });
  assert.equal(r.status, 404); assert.equal(await UploadConsent.countDocuments(), 0);
});

console.log('Uploading with UPLOAD_CONSENT=off (today)');
config.policies.uploadConsent = false;
await check('no agreement: the upload is not stopped for it', async () => {
  const r = await upload(album, guest);
  assert.notEqual(r.body?.code, 'consent-required', JSON.stringify(r.body));
});

console.log('Uploading with UPLOAD_CONSENT=on');
config.policies.uploadConsent = true;
await check('no agreement: 409 consent-required, with the Terms version', async () => {
  const r = await upload(album, guest);
  assert.equal(r.status, 409); assert.equal(r.body.code, 'consent-required'); assert.equal(r.body.termsVersion, '2026-11-20');
});
let at;
await check('agreeing: 200 { ok, termsVersion, at }', async () => {
  const r = await call('POST', `${A}/consent`, guest, { termsVersion: '2026-11-20' });
  assert.equal(r.status, 200); assert.equal(r.body.ok, true); assert.equal(r.body.termsVersion, '2026-11-20'); assert.ok(r.body.at);
  at = r.body.at;
});
await check('the album now shows it (another device would not ask again)', async () => {
  const r = await call('GET', A, guest);
  assert.deepEqual(r.body.album.uploadConsent, { termsVersion: '2026-11-20', at });
});
await check('and the upload is let through (past the agreement check)', async () => {
  const r = await upload(album, guest);
  assert.notEqual(r.body?.code, 'consent-required', JSON.stringify(r.body));
});
await check('agreeing twice keeps one row', async () => {
  await call('POST', `${A}/consent`, guest, { termsVersion: '2026-11-20' });
  assert.equal(await UploadConsent.countDocuments({ album: album._id, user: guest.user._id }), 1);
});
await check('the host needs their own agreement', async () => {
  const r = await upload(album, host);
  assert.equal(r.body?.code, 'consent-required');
});
await check('new Terms: the old agreement no longer counts (asked again)', async () => {
  config.policies.tos = '2026-12-01';
  const r = await call('GET', A, guest);
  assert.equal(r.body.album.uploadConsent, null);
  assert.equal((await upload(album, guest)).body?.code, 'consent-required');
  config.policies.tos = '2026-11-20';
});

console.log('Cleaning up');
await check('deleting the album deletes its agreements', async () => {
  const other = await Album.create({ name: 'Gone', date: '2026-11-27', code: 'CONS002', host: host.user._id });
  await Membership.create({ album: other._id, user: host.user._id, role: 'host' });
  await call('POST', `/api/albums/${other.id}/consent`, host, { termsVersion: '2026-11-20' });
  assert.equal(await UploadConsent.countDocuments({ album: other._id }), 1);
  const r = await call('DELETE', `/api/albums/${other.id}`, host);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await UploadConsent.countDocuments({ album: other._id }), 0);
});
await check('the nightly orphans job removes agreements whose album or account is gone', async () => {
  const ghost = new (await import('mongoose')).default.Types.ObjectId();
  await UploadConsent.create([{ album: ghost, user: guest.user._id, termsVersion: 'x', at: new Date() }, { album: album._id, user: ghost, termsVersion: 'x', at: new Date() }]);
  const result = await orphans(new Date(), { force: true });
  assert.equal(result.uploadConsents, 2);
  assert.equal(await UploadConsent.countDocuments({ termsVersion: 'x' }), 0);
  assert.equal(await UploadConsent.countDocuments({ album: album._id, user: guest.user._id }), 1, 'real ones kept');
});

server.close();
await (await import('mongoose')).default.disconnect();
await mongo.stop();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
