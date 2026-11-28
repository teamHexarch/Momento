// Staff owner second step (audit L3): an authenticator app's 6-digit code after the admin code. Local only.
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const mongo = await MongoMemoryServer.create();
Object.assign(process.env, { NODE_ENV: 'test', S3_BUCKET: '', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-only-isolated-secret-for-totp',
  PUBLIC_URL: 'http://localhost:4000' });
await mongoose.connect(process.env.MONGODB_URI);
const totp = await import('../src/utils/totp.js');
const { app } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { AdminStaff } = await import('../src/models/AdminStaff.js');
const team = await import('../src/services/adminStaffService.js');
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const call = async (url, cookie, body) => {
  const r = await fetch(origin + url, { method: body ? 'POST' : 'GET', headers: { cookie, ...(body && { 'Content-Type': 'application/json' }) }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null), cookie: r.headers.get('set-cookie') };
};

try {
  // RFC 6238 test vector (SHA-1): secret "12345678901234567890", T = 59 s → 94287082 (last 6 digits 287082)
  const rfc = totp.base32(Buffer.from('12345678901234567890'));
  assert.equal(rfc, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.equal(totp.codeAt(rfc, totp.stepAt(59000)), '287082');
  assert.equal(totp.codeAt(rfc, totp.stepAt(1111111109000)), '081804');
  assert.equal(totp.verifyCode(rfc, '287082', -1, 59000), 1);
  assert.equal(totp.verifyCode(rfc, '287082', 1, 59000), null, 'a used code can’t be used again');
  assert.equal(totp.openSecret(totp.sealSecret(rfc)), rfc);
  assert.equal(totp.openSecret('gcm$AAAA$AAAA$AAAA'), null);

  const password = 'test-owner-password-123';
  const owner = await User.create({ name: 'Owner', email: 'owner@example.invalid', passwordHash: await bcrypt.hash(password, 4), emailVerified: true });
  const { code } = await team.assignSlot(1, { name: 'Owner', email: owner.email, role: 'owner' });
  const login = (await call('/api/auth/login', '', { email: owner.email, password })).cookie.split(';')[0];

  // No app set up: the code alone opens it, as before
  assert.equal((await call('/api/admin/session', login)).body.totpRequired, false);
  assert.equal((await call('/api/admin/verify-code', login, { email: owner.email, code })).status, 200);

  // Set up: the code alone is no longer enough
  const { secret } = await team.setupTotp(1);
  assert.equal((await AdminStaff.findOne({ slot: 1 }).select('+totpSecret').lean()).totpSecret.startsWith('gcm$'), true, 'kept encrypted');
  assert.equal((await call('/api/admin/session', login)).body.totpRequired, true);
  const missing = await call('/api/admin/verify-code', login, { email: owner.email, code });
  assert.deepEqual([missing.status, missing.body.code], [401, 'ADMIN_TOTP_REQUIRED']);
  const wrong = await call('/api/admin/verify-code', login, { email: owner.email, code, totp: '000000' === totp.codeAt(secret, totp.stepAt()) ? '111111' : '000000' });
  assert.deepEqual([wrong.status, wrong.body.code], [401, 'ADMIN_TOTP_WRONG']);
  // A wrong admin code with a right app code still fails on the admin code
  const now = totp.codeAt(secret, totp.stepAt());
  assert.equal((await call('/api/admin/verify-code', login, { email: owner.email, code: 'ZZZZ99', totp: now })).body.code, 'ADMIN_CODE_WRONG');
  const ok = await call('/api/admin/verify-code', login, { email: owner.email, code, totp: now });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const pass = ok.cookie.split(';')[0];
  assert.equal((await call('/api/admin/moderation-status', `${login}; ${pass}`)).status, 200, 'the pass works');
  const again = await call('/api/admin/verify-code', login, { email: owner.email, code, totp: now });
  assert.equal(again.body.code, 'ADMIN_TOTP_WRONG', 'the same code can’t open a second pass');

  // Moderators aren't asked, even with an app set up
  const mod = await User.create({ name: 'Mod', email: 'mod@example.invalid', passwordHash: await bcrypt.hash(password, 4), emailVerified: true });
  const { code: modCode } = await team.assignSlot(2, { name: 'Mod', email: mod.email, role: 'moderator' });
  await team.setupTotp(2);
  const modLogin = (await call('/api/auth/login', '', { email: mod.email, password })).cookie.split(';')[0];
  assert.equal((await call('/api/admin/verify-code', modLogin, { email: mod.email, code: modCode })).status, 200);

  // Removing it (a lost phone): the code alone works again, and open passes end
  await team.removeTotp(1);
  assert.equal((await call('/api/admin/moderation-status', `${login}; ${pass}`)).status, 403, 'old passes end');
  assert.equal((await call('/api/admin/verify-code', login, { email: owner.email, code })).status, 200);
  console.log('Passed: owner authenticator codes (RFC 6238 vectors, required once set up, no reuse, moderators not asked, removal).');
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  await mongo.stop();
}
