// The staff team on one shared account: each person chooses their own code from an emailed one-time link, and the code
// says who it is (services/adminStaffService.js). Local only.
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const mongo = await MongoMemoryServer.create();
Object.assign(process.env, { NODE_ENV: 'test', S3_BUCKET: '', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-only-isolated-staff-codes',
  PUBLIC_URL: 'http://localhost:4000', FRONTEND_URL: 'http://localhost:3000', ADMIN_ACCOUNT_EMAIL: 'team@example.invalid' });
await mongoose.connect(process.env.MONGODB_URI);
const { app } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { AdminStaff } = await import('../src/models/AdminStaff.js');
const { AdminAuditLog } = await import('../src/models/AdminAuditLog.js');
const team = await import('../src/services/adminStaffService.js');
const totp = await import('../src/utils/totp.js');
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const call = async (url, cookie, body, method) => {
  const r = await fetch(origin + url, { method: method || (body ? 'POST' : 'GET'), headers: { cookie, ...(body && { 'Content-Type': 'application/json' }) }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null), cookie: r.headers.get('set-cookie') };
};
// Emails are printed in tests ("[email not set up] To: ... | Subject: ...")
const mails = [];
const log = console.log;
console.log = (...a) => { const l = a.join(' '); if (l.startsWith('[email not set up]')) mails.push(l); else log(...a); };

try {
  const password = 'test-staff-password-123';
  const mk = (email) => User.create({ name: email.split('@')[0], email, passwordHash: bcrypt.hashSync(password, 4), emailVerified: true });
  await mk('team@example.invalid'); await mk('someone@example.invalid'); await mk('imaad@example.invalid');
  const login = async (email) => (await call('/api/auth/login', '', { email, password })).cookie.split(';')[0];
  const shared = await login('team@example.invalid');

  // ---- Invites: an email with a one-time link; no code exists until they choose it ----
  const owner = await team.inviteSlot(1, { name: 'Cheung Chi', email: 'cheungchi@example.invalid', role: 'owner' });
  const imaad = await team.inviteSlot(2, { name: 'Imaad', email: 'imaad@example.invalid', role: 'moderator' });
  const hamza = await team.inviteSlot(3, { name: 'Hamza', email: 'hamza@example.invalid', role: 'moderator' });
  assert.equal(mails.length, 3);
  assert.match(mails[0], /To: cheungchi@example\.invalid \| Subject: Choose your Momento staff code/);
  assert.equal(team.setupLink(owner.token), `http://localhost:3000/set-code#${owner.token}`);
  assert.equal((await AdminStaff.findOne({ slot: 1 }).select('+codeHash +setupTokenHash').lean()).codeHash, undefined, 'no code yet');
  assert.notEqual((await AdminStaff.findOne({ slot: 1 }).select('+setupTokenHash').lean()).setupTokenHash, owner.token, 'only a hash of the link is kept');
  const listed = (await team.listTeam()).slots;
  assert.deepEqual([listed[0].codeChosen, listed[0].waiting], [false, true]);
  assert.equal('codeHash' in listed[0], false, 'the hash never leaves the server');

  // ---- Choosing a code from the link (no sign-in) ----
  const info = await call('/api/admin-setup/' + imaad.token, '');
  assert.deepEqual([info.status, info.body.name, info.body.slot], [200, 'Imaad', 2]);
  assert.equal((await call('/api/admin-setup/' + imaad.token, '', { code: 'abc' })).body.code, 'ADMIN_CODE_INVALID');
  assert.equal((await call('/api/admin-setup/' + imaad.token, '', { code: 'ABCDEF' })).body.code, 'ADMIN_CODE_INVALID', 'needs a digit');
  const chose = await call('/api/admin-setup/' + imaad.token, '', { code: 'imaad7' });
  assert.deepEqual([chose.status, chose.body.name], [200, 'Imaad']);
  assert.equal((await call('/api/admin-setup/' + imaad.token, '', { code: 'IMAAD8' })).status, 410, 'a link works once');
  assert.equal((await call('/api/admin-setup/' + imaad.token, '')).status, 410);
  assert.equal((await call('/api/admin-setup/not-a-real-link-not-a-real-link-xx', '')).status, 410);
  // Someone else's code can't be chosen twice (codes say who you are)
  assert.equal((await call('/api/admin-setup/' + hamza.token, '', { code: 'IMAAD7' })).body.code, 'ADMIN_CODE_TAKEN');
  assert.equal((await call('/api/admin-setup/' + hamza.token, '', { code: 'HAMZA5' })).status, 200);
  assert.equal((await call('/api/admin-setup/' + owner.token, '', { code: 'OWNER1' })).status, 200);
  // 5 refused codes end a link
  const fyz = await team.inviteSlot(4, { name: 'Fairooz', email: 'fairooz@example.invalid' });
  for (let i = 0; i < 4; i++) assert.equal((await call('/api/admin-setup/' + fyz.token, '', { code: 'bad' })).status, 400);
  assert.equal((await call('/api/admin-setup/' + fyz.token, '', { code: 'bad' })).body.code, 'ADMIN_SETUP_EXPIRED');
  assert.equal((await call('/api/admin-setup/' + fyz.token, '', { code: 'FAIR00' })).status, 410);
  // An expired link
  const late = await team.reinviteSlot(4);
  await AdminStaff.updateOne({ slot: 4 }, { $set: { setupExpires: new Date(Date.now() - 1000) } });
  assert.equal((await call('/api/admin-setup/' + late.token, '')).status, 410);

  // ---- The shared account: the code alone says who it is ----
  const s0 = (await call('/api/admin/session', shared)).body;
  assert.deepEqual([s0.shared, s0.staff, s0.verified], [true, null, false], 'nobody known before a code');
  const asImaad = await call('/api/admin/verify-code', shared, { code: 'imaad7' });
  assert.deepEqual([asImaad.status, asImaad.body.staff.name], [200, 'Imaad']);
  const imaadPass = `${shared}; ${asImaad.cookie.split(';')[0]}`;
  const s1 = (await call('/api/admin/session', imaadPass)).body;
  assert.deepEqual([s1.verified, s1.staff.name], [true, 'Imaad'], 'the pass knows who it is');
  // What they do is recorded under their name
  await call('/api/admin/moderation-status', imaadPass);
  assert.ok(await AdminAuditLog.exists({ action: 'code.verified', adminName: 'Imaad' }));
  // Another person on the same account, same browser: their own name
  const asHamza = await call('/api/admin/verify-code', shared, { code: 'HAMZA5' });
  assert.equal(asHamza.body.staff.name, 'Hamza');
  // Wrong code; an old-style { email } is ignored
  assert.equal((await call('/api/admin/verify-code', shared, { code: 'ZZZZ99' })).body.code, 'ADMIN_CODE_WRONG');
  assert.equal((await call('/api/admin/verify-code', shared, { email: 'imaad@example.invalid', code: 'HAMZA5' })).body.staff.name, 'Hamza');

  // ---- Other accounts: only the account with a slot's own email, and only with that slot's code ----
  const other = await login('someone@example.invalid');
  assert.equal((await call('/api/admin/session', other)).status, 404, 'not staff: nothing there');
  assert.equal((await call('/api/admin/verify-code', other, { code: 'IMAAD7' })).status, 404);
  const ownImaad = await login('imaad@example.invalid');
  assert.equal((await call('/api/admin/verify-code', ownImaad, { code: 'HAMZA5' })).body.code, 'ADMIN_CODE_WRONG', 'not someone else’s code');
  assert.equal((await call('/api/admin/verify-code', ownImaad, { code: 'IMAAD7' })).status, 200);
  // A shared-account pass doesn't work on another account
  assert.equal((await call('/api/admin/moderation-status', `${other}; ${asImaad.cookie.split(';')[0]}`)).status, 404);

  // ---- Owner: authenticator after the code; owners manage the team without ever seeing a code ----
  // Before the owner has an authenticator: they can review, but not manage the team
  const ownerNoApp = await call('/api/admin/verify-code', shared, { code: 'OWNER1' });
  assert.equal(ownerNoApp.status, 200);
  const noAppPass = `${shared}; ${ownerNoApp.cookie.split(';')[0]}`;
  assert.equal((await call('/api/admin/moderation-status', noAppPass)).status, 200);
  assert.equal((await call('/api/admin/team', noAppPass)).body.code, 'ADMIN_TOTP_SETUP_NEEDED');
  const { secret } = await team.setupTotp(1);
  assert.equal((await call('/api/admin/verify-code', shared, { code: 'OWNER1' })).body.code, 'ADMIN_TOTP_REQUIRED');
  const asOwner = await call('/api/admin/verify-code', shared, { code: 'OWNER1', totp: totp.codeAt(secret, totp.stepAt()) });
  assert.equal(asOwner.body.staff.name, 'Cheung Chi');
  const ownerPass = `${shared}; ${asOwner.cookie.split(';')[0]}`;
  assert.equal((await call('/api/admin/team', imaadPass)).status, 403, 'moderators can’t manage the team');
  const put = await call('/api/admin/team/5', ownerPass, { name: 'Yusuf', email: 'yusuf@example.invalid', role: 'moderator' }, 'PUT');
  assert.deepEqual([put.status, put.body.emailed, 'code' in put.body], [200, true, false], 'emailed, no code in the answer');
  assert.ok(mails.some((m) => m.includes('To: yusuf@example.invalid')));
  // A forgotten code: a new link, and the old code stops at once (and their open pass)
  const rot = await call('/api/admin/team/2/rotate', ownerPass, {});
  assert.deepEqual([rot.status, 'code' in rot.body], [200, false]);
  assert.equal((await call('/api/admin/verify-code', shared, { code: 'IMAAD7' })).body.code, 'ADMIN_CODE_WRONG');
  assert.equal((await call('/api/admin/moderation-status', imaadPass)).status, 403, 'the old pass ended');
  // A different person in a slot doesn't get the last one's authenticator
  await team.inviteSlot(1, { name: 'New Owner', email: 'newowner@example.invalid', role: 'owner' });
  assert.equal((await AdminStaff.findOne({ slot: 1 }).lean()).totpEnabledAt, undefined);
  // ---- No owner at all: everyone a moderator (the team is then managed from the server's command line) ----
  // A role change ends open passes: the owner's pass stops, and a moderator made owner signs in again
  const hamzaPass = `${shared}; ${(await call('/api/admin/verify-code', shared, { code: 'HAMZA5' })).cookie.split(';')[0]}`;
  assert.equal((await call('/api/admin/moderation-status', hamzaPass)).status, 200);
  await team.setRole(3, 'owner');
  assert.equal((await call('/api/admin/moderation-status', hamzaPass)).status, 403, 'role change ended the pass');
  const hamzaOwner = `${shared}; ${(await call('/api/admin/verify-code', shared, { code: 'HAMZA5' })).cookie.split(';')[0]}`;
  assert.equal((await call('/api/admin/team', hamzaOwner)).body.code, 'ADMIN_TOTP_SETUP_NEEDED', 'a new owner without an authenticator can’t manage the team');
  for (const st of await AdminStaff.find({ role: 'owner' })) await team.setRole(st.slot, 'moderator');
  assert.equal(await AdminStaff.countDocuments({ role: 'owner' }), 0);
  assert.equal((await call('/api/admin/verify-code', shared, { code: 'HAMZA5' })).body.staff.role, 'moderator', 'still works with no owner');
  await team.revokeSlot(5, 0);
  console.log = log;
  console.log('Passed: staff codes (emailed one-time links, self-chosen codes, shared account where the code says who, names in the log, owner 2FA, no code ever shown).');
} finally {
  console.log = log;
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  await mongo.stop();
}
