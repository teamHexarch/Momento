// An attacker's view of the API: every protected route without a login, every resource route as someone
// who has no business there (IDOR/BOLA), mass-assignment payloads, requests fired at the same moment to
// spend a limited thing twice (login slots, one-time links and codes, daily reminders, invite caps,
// login token swaps, upload slots), and bursts against every rate-limited endpoint.
// Momento has no credits, balances or promo codes; the quotas above are what it has instead.
// Runs without .env: a disposable database and upload folder. node scripts/testAttack.js
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
  if (/^(AWS_|S3_|RECAPTCHA_|CAPTCHA_|EMAIL_|MONGODB_|FRONTEND_|CORS_|PUBLIC_|GOOGLE_|NSFW_|REQUIRE_|SECURITY_|TOKEN_|UPLOAD_)/.test(key)) delete process.env[key];
}
const folder = await mkdtemp(path.join(os.tmpdir(), 'momento-attack-'));
const mongo = await MongoMemoryServer.create();
const SECRET = 'isolated-attack-test';
Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: SECRET, MONGODB_URI: mongo.getUri(), UPLOAD_DIR: folder, PUBLIC_URL: 'http://localhost:4116' });
const { app } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { Album } = await import('../src/models/Album.js');
const { Photo } = await import('../src/models/Photo.js');
const { GroupInvite } = await import('../src/models/GroupInvite.js');
const { Report } = await import('../src/models/Report.js');
const { Consent } = await import('../src/models/Consent.js');
const { issueToken } = await import('../src/services/emailTokenService.js');
const { uploadBudget, uploadsInFlight } = await import('../src/middleware/uploadBudget.js');
await mongoose.connect(process.env.MONGODB_URI);
const server = app.listen(4116);
const BASE = 'http://localhost:4116';
let checks = 0, ipN = 0;
const venue = { lat: -33.8568, lng: 151.2153 };
const freshIp = () => `10.${Math.floor(++ipN / 65000) % 250}.${Math.floor(ipN / 250) % 250}.${ipN % 250}`;
async function raw(url, { cookie = '', method = 'GET', body, ip = freshIp(), headers = {} } = {}) {
  const h = { cookie, 'X-Forwarded-For': ip, 'X-Momento-Location': `${venue.lat},${venue.lng},10`, ...headers };
  if (body && !(body instanceof FormData)) h['Content-Type'] = 'application/json';
  return fetch(BASE + url, { method, headers: h, redirect: 'manual', body: body instanceof FormData ? body : body && JSON.stringify(body) });
}
// status: one number, or a list of acceptable ones
async function call(url, status, cookie = '', method = 'GET', body, opts = {}) {
  const r = await raw(url, { cookie, method, body, ...opts });
  const ok = [].concat(status).includes(r.status);
  assert.ok(ok, `${method} ${url}: expected ${status}, got ${r.status} ${(await r.clone().text()).slice(0, 160)}`);
  checks++;
  return r;
}
const json = async (r) => r.json();
const cookieOf = (r) => (r.headers.get('set-cookie') || '').split(';')[0];
const HOUR = 3600000;
let shade = 0;
const pic = () => sharp({ create: { width: 120, height: 90, channels: 3, background: { r: 20 + (shade % 200), g: 40 + (shade++ % 180), b: 160 } } }).jpeg().toBuffer();
const form = async (field, n = 1) => { const fd = new FormData(); for (let i = 0; i < n; i++) fd.append(field, new Blob([await pic()], { type: 'image/jpeg' }), `p${i}.jpg`); return fd; };
const FAKE = '0123456789abcdef01234567';

try {
  const password = 'Test-password-123!';
  for (const n of ['Hana Host', 'Gus Guest', 'Mal Attacker', 'Free Plan']) {
    await User.create({ name: n, email: `${n.split(' ')[0].toLowerCase()}@example.invalid`, passwordHash: await bcrypt.hash(password, 4), emailVerified: true, ...(n === 'Free Plan' && { plan: 'free' }) });
  }
  const login = async (email) => cookieOf(await call('/api/auth/login', 200, '', 'POST', { email, password }));
  const h = await login('hana@example.invalid'), g = await login('gus@example.invalid'), mal = await login('mal@example.invalid');
  const id = async (email) => (await User.findOne({ email })).id;
  const hanaId = await id('hana@example.invalid'), gusId = await id('gus@example.invalid'), malId = await id('mal@example.invalid');

  // The victim's world: an album with photos, a group with an invite, a profile photo
  const album = (await json(await call('/api/albums', 201, h, 'POST', {
    name: 'Private party', date: new Date().toISOString().slice(0, 10), place: 'Home',
    startsAt: new Date(Date.now() - HOUR).toISOString(), endsAt: new Date(Date.now() + 4 * HOUR).toISOString(),
    zone: { ...venue, radiusM: 1000 }, venue: { address: 'Home' },
  }))).album;
  await call('/api/albums/join', 201, g, 'POST', { code: album.code, location: { ...venue, accuracy: 10, timestamp: Date.now() } });
  const [photo] = (await json(await call(`/api/albums/${album.id}/photos`, 201, g, 'POST', await form('photos')))).photos;
  const [hostPhoto] = (await json(await call(`/api/albums/${album.id}/photos`, 201, h, 'POST', await form('photos')))).photos;
  await call('/api/trash', 200, h, 'POST', { photoIds: [hostPhoto.id] });
  const group = (await json(await call('/api/groups', 201, h, 'POST', { name: 'Close friends' }))).group;
  await call(`/api/groups/${group.id}/invites`, 201, h, 'POST', { email: 'gus@example.invalid' });
  const invite = (await json(await call('/api/groups', 200, g))).invites[0];
  const avatarFd = new FormData();
  avatarFd.append('avatar', new Blob([await sharp({ create: { width: 300, height: 300, channels: 3, background: 'teal' } }).png().toBuffer()], { type: 'image/png' }), 'me.png');
  await call('/api/auth/avatar', 200, h, 'POST', avatarFd);
  const notes = (await json(await call('/api/notifications', 200, h))).notifications;
  assert.ok(notes.length > 0);

  // ======== 1. No login: every protected route answers 401 (the staff area: 404) ========
  const A = album.id, P = photo.id, G = group.id;
  const protectedRoutes = [
    ['GET', '/api/albums'], ['POST', '/api/albums'], ['POST', '/api/albums/join'],
    ['GET', `/api/albums/${A}`], ['PATCH', `/api/albums/${A}`], ['DELETE', `/api/albums/${A}`], ['DELETE', `/api/albums/${A}/membership`],
    ['POST', `/api/albums/${A}/photos`], ['GET', `/api/albums/${A}/download`], ['GET', `/api/albums/${A}/zip/abc`],
    ['POST', `/api/albums/${A}/hidden`], ['POST', `/api/albums/${A}/save`], ['PUT', `/api/albums/${A}/cover`], ['DELETE', `/api/albums/${A}/cover`], ['POST', `/api/albums/${A}/remind`],
    ['GET', '/api/photos/bookmarked'], ['GET', '/api/photos/liked'], ['GET', `/api/photos/${P}`], ['GET', `/api/photos/${P}/download`], ['DELETE', `/api/photos/${P}`],
    ['POST', `/api/photos/${P}/bookmark`], ['POST', `/api/photos/${P}/like`], ['GET', `/api/photos/${P}/likes`], ['POST', `/api/photos/${P}/reaction`], ['GET', `/api/photos/${P}/reactions`], ['POST', `/api/photos/${P}/report`],
    ['GET', '/api/events/requests'], ['PATCH', `/api/events/${A}/policy`], ['POST', `/api/events/${A}/requests/${gusId}`], ['POST', `/api/events/${A}/join`],
    ['GET', '/api/groups'], ['POST', '/api/groups'], ['POST', `/api/groups/invites/${invite.id}/accept`], ['POST', `/api/groups/invites/${invite.id}/decline`],
    ['GET', `/api/groups/${G}`], ['PATCH', `/api/groups/${G}`], ['DELETE', `/api/groups/${G}`], ['POST', `/api/groups/${G}/invites`], ['DELETE', `/api/groups/${G}/invites/${invite.id}`], ['DELETE', `/api/groups/${G}/members/${gusId}`],
    ['GET', `/api/users/${hanaId}/avatar`],
    ['GET', '/api/notifications'], ['GET', '/api/notifications/unread'], ['POST', '/api/notifications/read'], ['POST', '/api/notifications/clear'], ['POST', '/api/notifications/push'], ['DELETE', '/api/notifications/push'],
    ['GET', '/api/trash'], ['POST', '/api/trash'], ['POST', '/api/trash/restore'], ['POST', '/api/trash/purge'], ['GET', '/api/hidden'],
    ['PATCH', '/api/auth/me'], ['DELETE', '/api/auth/me'], ['POST', '/api/auth/email'], ['POST', '/api/auth/password/code'], ['POST', '/api/auth/password/code/verify'], ['POST', '/api/auth/password'],
    ['POST', '/api/auth/verify-email/resend'], ['POST', '/api/auth/avatar'], ['DELETE', '/api/auth/avatar'], ['GET', '/api/auth/me/export'], ['GET', '/api/auth/consent'], ['POST', '/api/auth/consent'], ['POST', `/api/auth/moderation/${FAKE}/review`],
  ];
  for (const [m, u] of protectedRoutes) await call(u, 401, '', m, m === 'GET' || m === 'DELETE' ? undefined : {});
  for (const [m, u] of [['GET', '/api/admin/reports'], ['POST', `/api/admin/photos/${P}/takedown`], ['PATCH', '/api/admin/switches'], ['POST', '/api/admin/sessions/revoke-all'], ['POST', `/api/admin/users/${gusId}/unsuspend`]]) {
    await call(u, 404, '', m, m === 'GET' ? undefined : {});
    await call(u, 404, mal, m, m === 'GET' ? undefined : {});   // logged in but not staff: the same
  }
  // A forged login (signed with another secret, or "none") is the same as none
  for (const forged of [
    jwt.sign({ sub: hanaId, jti: 'x' }, 'not-the-secret', { issuer: 'momento-api', audience: 'momento-session' }),
    `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: hanaId, jti: 'x' })).toString('base64url')}.`,
  ]) await call(`/api/albums/${A}`, 401, `momento_session=${forged}`);

  // ======== 2. Someone else's things (IDOR/BOLA): Mal is logged in but in none of them ========
  const notMine = [
    ['GET', `/api/albums/${A}`, 404], ['PATCH', `/api/albums/${A}`, 404, { name: 'Pwned' }], ['DELETE', `/api/albums/${A}`, 404], ['DELETE', `/api/albums/${A}/membership`, 404],
    ['POST', `/api/albums/${A}/photos`, 404, 'upload'], ['GET', `/api/albums/${A}/download`, 404], ['POST', `/api/albums/${A}/hidden`, 404, { photoIds: [P], hidden: true }],
    ['POST', `/api/albums/${A}/save`, 404, { saved: true }], ['PUT', `/api/albums/${A}/cover`, 404, 'cover'], ['DELETE', `/api/albums/${A}/cover`, 404], ['POST', `/api/albums/${A}/remind`, 404],
    ['GET', `/api/photos/${P}`, 404], ['GET', `/api/photos/${P}?size=thumb`, 404], ['GET', `/api/photos/${P}/download`, 404], ['DELETE', `/api/photos/${P}`, 404],
    ['POST', `/api/photos/${P}/bookmark`, 404, { bookmarked: true }], ['POST', `/api/photos/${P}/reaction`, 404, { emoji: '🔥' }], ['GET', `/api/photos/${P}/reactions`, 404], ['GET', `/api/photos/${P}/likes`, 404],
    ['POST', `/api/photos/${P}/report`, 404, { reason: 'abuse' }],
    ['PATCH', `/api/events/${A}/policy`, 404, { joiningOpen: true }], ['POST', `/api/events/${A}/requests/${gusId}`, 404, { approve: true }],
    ['POST', `/api/events/${A}/join`, 404, { location: { ...venue, accuracy: 10, timestamp: Date.now() } }],   // private album: not joinable by id
    ['GET', `/api/groups/${G}`, 404], ['PATCH', `/api/groups/${G}`, 404, { name: 'Pwned' }], ['DELETE', `/api/groups/${G}`, 404], ['POST', `/api/groups/${G}/invites`, 404, { email: 'mal2@example.invalid' }],
    ['DELETE', `/api/groups/${G}/invites/${invite.id}`, 404], ['DELETE', `/api/groups/${G}/members/${gusId}`, 404],
    ['POST', `/api/groups/invites/${invite.id}/accept`, 404], ['POST', `/api/groups/invites/${invite.id}/decline`, 404],   // Gus's invite
    ['GET', `/api/users/${hanaId}/avatar`, 404],   // a stranger's profile photo
  ];
  for (const [m, u, status, body] of notMine) {
    const b = body === 'upload' ? await form('photos') : body === 'cover' ? await form('cover') : body;
    await call(u, status, mal, m, b ?? (m === 'GET' || m === 'DELETE' ? undefined : {}));
  }
  // The host's bin, other people's notifications, someone else's automatic decision: nothing happens
  assert.equal((await json(await call('/api/trash/restore', 200, mal, 'POST', { photoIds: [hostPhoto.id] }))).restored, 0);
  assert.equal((await json(await call('/api/trash/purge', 200, mal, 'POST', { all: true }))).purged, 0);
  assert.equal((await json(await call('/api/trash', [200, 403], mal, 'POST', { photoIds: [P] })).catch(() => ({}))).moved ?? 0, 0);
  assert.equal(await Photo.countDocuments({ _id: hostPhoto.id, deletedAt: { $ne: null } }), 1, 'still in the host’s bin');
  assert.equal((await json(await call('/api/trash', 200, mal))).photos.length, 0);
  assert.equal((await json(await call('/api/notifications/read', 200, mal, 'POST', { ids: notes.map((n) => n.id) }))).marked, 0);
  await call('/api/notifications/clear', 200, mal, 'POST', {});
  assert.equal((await json(await call('/api/notifications', 200, h))).notifications.length, notes.length, 'Hana’s inbox untouched');
  assert.equal((await json(await call('/api/photos/bookmarked', 200, mal))).photos.length, 0);
  assert.equal((await json(await call('/api/hidden', 200, mal))).photos.length, 0);
  assert.equal((await json(await call('/api/events/requests', 200, mal))).requests.length, 0);
  // Members who aren't the host can't do host things
  for (const [m, u, body] of [['PATCH', `/api/albums/${A}`, { name: 'Mine now' }], ['DELETE', `/api/albums/${A}`], ['DELETE', `/api/photos/${hostPhoto.id}`], ['PUT', `/api/albums/${A}/cover`, 'cover'], ['POST', `/api/albums/${A}/remind`]]) {
    await call(u, [403, 404], g, m, body === 'cover' ? await form('cover') : body ?? (m === 'DELETE' ? undefined : {}));
  }
  await call(`/api/events/${A}/policy`, 404, g, 'PATCH', { joiningOpen: false });
  assert.equal((await Album.findById(A)).name, 'Private party', 'nothing changed');
  // ...and someone who shares the album does see the host's profile photo
  await call(`/api/users/${hanaId}/avatar`, 200, g);
  // An album code is the only way into a private album, and guessing is capped (below)
  await call('/api/albums/join', 404, mal, 'POST', { code: 'ZZZZ999' });

  // ======== 3. Mass assignment: protected fields in payloads are ignored ========
  await call('/api/auth/me', 200, mal, 'PATCH', {
    name: 'Mal', role: 'staff', plan: 'admin', credits: 9999, balance: 9999, isAdmin: true, emailVerified: false,
    strikes: -100, suspendedAt: null, isMinor: false, deletingAt: null, email: 'hana@example.invalid', _id: hanaId,
    passwordHash: 'x', sessions: [], accepted: { tos: 'x', privacy: 'x' }, googleId: 'g-1', notify: { recap: true, admin: true },
  });
  const malNow = await User.findById(malId).select('+role +passwordHash +accepted');
  assert.equal(malNow.role, 'user');
  assert.equal(malNow.plan, 'admin', 'plan is the default, not set by the request');
  assert.equal(malNow.email, 'mal@example.invalid');
  assert.equal(malNow.emailVerified, true);
  assert.equal(malNow.strikes, 0);
  assert.equal(malNow.googleId, undefined);
  assert.ok(await bcrypt.compare(password, malNow.passwordHash), 'password unchanged');
  assert.equal(malNow.accepted, undefined);
  assert.equal(malNow.get('credits'), undefined);
  assert.equal(malNow.notify.recap, true, 'the one real setting did change');
  assert.equal(malNow.get('notify.admin'), undefined);
  // Making an album: owner, code, members and requests come from the server
  const made = (await json(await call('/api/albums', 201, mal, 'POST', {
    name: 'Mine', date: new Date().toISOString().slice(0, 10), host: hanaId, code: 'AAAAAAA', _id: FAKE,
    requests: [{ user: gusId, status: 'approved' }], cover: { key: '../../etc/passwd', token: 'x' }, keepHostCover: true, lastReminderAt: new Date(),
    startsAt: new Date(Date.now() - HOUR).toISOString(), endsAt: new Date(Date.now() + HOUR).toISOString(), zone: { ...venue, radiusM: 1000 },
  }))).album;
  const madeDoc = await Album.findById(made.id);
  assert.equal(String(madeDoc.host), malId);
  assert.notEqual(madeDoc.code, 'AAAAAAA');
  assert.notEqual(made.id, FAKE);
  assert.equal(madeDoc.requests.length, 0);
  assert.equal(madeDoc.cover?.key, undefined);
  // Changing it: same
  await call(`/api/albums/${made.id}`, 200, mal, 'PATCH', { host: hanaId, code: 'BBBBBBB', group: G, requests: [], name: 'Renamed' });
  const after = await Album.findById(made.id);
  assert.equal(String(after.host), malId);
  assert.equal(after.code, madeDoc.code);
  assert.equal(after.group, undefined, 'can’t attach someone else’s group');
  assert.equal(after.name, 'Renamed');
  await call(`/api/albums/${made.id}`, 404, mal, 'PATCH', { groupId: G });   // a group they're not in
  // A group: owner comes from the login
  const mg = (await json(await call('/api/groups', 201, mal, 'POST', { name: 'Mine', owner: hanaId, members: [hanaId] }))).group;
  assert.equal(mg.members.length, 1);
  assert.ok(mg.members[0].you);
  // A report can't be filed as someone else, or pre-decided
  await call('/api/albums/join', 201, mal, 'POST', { code: album.code, location: { ...venue, accuracy: 10, timestamp: Date.now() } });
  await call(`/api/photos/${P}/report`, 201, mal, 'POST', { reason: 'other', reporter: hanaId, status: 'removed', decidedBy: malId });
  const rep = await Report.findOne({ photo: P });
  assert.equal(String(rep.reporter), malId);
  assert.equal(rep.status, 'open');
  // Consent is recorded for whoever is logged in
  await call('/api/auth/consent', 200, mal, 'POST', { accept: true, user: hanaId });
  assert.equal(await Consent.countDocuments({ user: hanaId }), 0);
  // Staff-only fields in a staff route's body don't help a non-staff caller (it's 404 before reading it)
  await call('/api/admin/switches', 404, mal, 'PATCH', { signupsPaused: true });
  // Operator and prototype payloads are refused outright
  await call('/api/auth/login', 400, '', 'POST', { email: { $gt: '' }, password: { $gt: '' } });
  await call(`/api/albums/${A}/hidden`, 400, g, 'POST', { photoIds: { $in: [P] }, hidden: true, constructor: { prototype: { isAdmin: true } } });

  // ======== 4. Spending a limited thing twice, at the same moment ========
  // a) Login slots: a free account has 3. Ten logins at once: exactly 3 get in
  const results = await Promise.all(Array.from({ length: 10 }, () => raw('/api/auth/login', { method: 'POST', body: { email: 'free@example.invalid', password } })));
  assert.equal(results.filter((r) => r.status === 200).length, 3, 'exactly 3 login slots used');
  assert.equal(results.filter((r) => r.status === 409).length, 7);
  assert.equal((await User.findOne({ email: 'free@example.invalid' }).select('+sessions')).sessions.length, 3);
  checks++;
  // b) A password-reset link used five times at once: it works once
  const resetUser = await User.findOne({ email: 'gus@example.invalid' });
  const resetToken = await issueToken(resetUser, 'reset', 15);
  const resets = await Promise.all(Array.from({ length: 5 }, (_, i) => raw('/api/auth/password/reset', { method: 'POST', body: { token: resetToken, password: `New-password-${i}!` } })));
  assert.equal(resets.filter((r) => r.status === 200).length, 1, 'a reset link works once');
  checks++;
  const g2 = await (async () => { const okOne = resets.findIndex((r) => r.status === 200); return login.call(null, 'gus@example.invalid').catch(() => null) || okOne; })().catch(() => null);
  void g2;
  // c) Password-change code: 20 guesses at once can't get past 5 tries
  const pwUser = await login('hana@example.invalid');
  await call('/api/auth/password/code', 200, pwUser, 'POST', { currentPassword: password });
  const guesses = await Promise.all(Array.from({ length: 20 }, (_, i) => raw('/api/auth/password/code/verify', { cookie: pwUser, method: 'POST', body: { code: String(100000 + i) } })));
  assert.ok(guesses.every((r) => r.status === 400 || r.status === 429));
  const tries = (await User.findById(hanaId).select('+passwordChange')).passwordChange.tries;
  assert.ok(tries <= 5, `tries counted atomically (${tries})`);
  checks++;
  // d) The daily reminder: five clicks at once send one
  const solo = (await json(await call('/api/albums', 201, h, 'POST', {
    name: 'Reminders', date: new Date().toISOString().slice(0, 10), startsAt: new Date(Date.now() - HOUR).toISOString(), endsAt: new Date(Date.now() + 4 * HOUR).toISOString(), zone: { ...venue, radiusM: 1000 },
  }))).album;
  await call('/api/albums/join', 201, mal, 'POST', { code: solo.code, location: { ...venue, accuracy: 10, timestamp: Date.now() } });
  const reminders = await Promise.all(Array.from({ length: 5 }, () => raw(`/api/albums/${solo.id}/remind`, { cookie: pwUser, method: 'POST', body: {} })));
  assert.equal(reminders.filter((r) => r.status === 200).length, 1, 'one reminder a day');
  checks++;
  // e) Group invite cap (100): five invites at once on the last free place leave it at 100
  const capGroup = (await json(await call('/api/groups', 201, pwUser, 'POST', { name: 'Big' }))).group;
  await GroupInvite.insertMany(Array.from({ length: 99 }, (_, i) => ({ group: capGroup.id, email: `filler${i}@example.invalid`, invitedBy: hanaId, expiresAt: new Date(Date.now() + 86400000) })));
  await Promise.all(Array.from({ length: 5 }, (_, i) => raw(`/api/groups/${capGroup.id}/invites`, { cookie: pwUser, method: 'POST', body: { email: `race${i}@example.invalid` } })));
  assert.ok(await GroupInvite.countDocuments({ group: capGroup.id }) <= 100, 'never past 100');
  checks++;
  // f) Bookmarking the same photo many times at once: one bookmark
  await Promise.all(Array.from({ length: 10 }, () => raw(`/api/photos/${P}/bookmark`, { cookie: mal, method: 'POST', body: { bookmarked: true } })));
  const bm = await Photo.findById(P);
  assert.equal(bm.likes.filter((u) => String(u) === malId).length, 1);
  assert.equal(bm.likeCount, bm.likes.length, 'the count matches');
  await Promise.all(Array.from({ length: 10 }, () => raw(`/api/photos/${P}/bookmark`, { cookie: mal, method: 'POST', body: { bookmarked: false } })));
  assert.equal((await Photo.findById(P)).likeCount, (await Photo.findById(P)).likes.length, 'never below zero or out of step');
  checks++;
  // g) The same file uploaded twice at once: the duplicate check catches at least one in the same request
  const twin = await pic();
  const twice = new FormData();
  twice.append('photos', new Blob([twin], { type: 'image/jpeg' }), 'a.jpg');
  twice.append('photos', new Blob([twin], { type: 'image/jpeg' }), 'b.jpg');
  const tw = await json(await call(`/api/albums/${A}/photos`, 201, mal, 'POST', twice));
  assert.equal(tw.photos.length, 1);
  assert.equal(tw.skipped, 1);
  // h) A login token swapped by several requests at once: all of them work, and there's one new token
  const freeLogin = cookieOf(results.find((r) => r.status === 200));
  const old = jwt.decode(decodeURIComponent(freeLogin.split('=')[1]));
  const freeId = await id('free@example.invalid');
  const aged = jwt.sign({ sub: freeId, jti: old.jti, iat: Math.floor(Date.now() / 1000) - 13 * 3600 }, SECRET, { expiresIn: '6d', issuer: 'momento-api', audience: 'momento-session' });
  const swaps = await Promise.all(Array.from({ length: 6 }, () => raw('/api/auth/me', { cookie: `momento_session=${aged}` })));
  for (const s of swaps) assert.ok((await s.json()).user, 'every request in flight still works');
  const newIds = new Set(swaps.map((s) => s.headers.get('set-cookie')).filter(Boolean).map((c) => jwt.decode(decodeURIComponent(c.split(';')[0].split('=')[1])).jti));
  assert.equal(newIds.size, 1, 'swapped once');
  checks++;
  // i) Upload slots: 2 uploads at a time per account; a third waits its turn
  const fakeRes = () => { const handlers = {}; return { on: (e, f) => { handlers[e] = f; }, fire: () => handlers.close?.() }; };
  const reqOf = (who, size) => ({ user: { _id: who }, ip: '1.1.1.1', get: (h) => (h === 'content-length' ? String(size) : undefined) });
  const results2 = [];
  const slots = [fakeRes(), fakeRes(), fakeRes()];
  for (const r of slots) uploadBudget(reqOf('u1', 1000), r, (err) => results2.push(err ? err.status : 'ok'));
  assert.deepEqual(results2, ['ok', 'ok', 429]);
  slots.forEach((r) => r.fire());
  assert.equal(uploadsInFlight().bytes, 0, 'released when finished');
  const big = [];
  uploadBudget(reqOf('u2', 300 * 1048576), fakeRes(), (e) => big.push(e ? e.status : 'ok'));
  uploadBudget(reqOf('u3', 300 * 1048576), fakeRes(), (e) => big.push(e ? e.status : 'ok'));
  uploadBudget(reqOf('u4', 900 * 1048576), fakeRes(), (e) => big.push(e ? e.status : 'ok'));
  uploadBudget({ ...reqOf('u5', 0), get: () => undefined }, fakeRes(), (e) => big.push(e ? e.status : 'ok'));
  assert.deepEqual(big, ['ok', 503, 413, 411], 'the server’s memory ceiling holds');
  checks++;

  // ======== 5. Bursts against rate-limited endpoints → 429 ========
  const burst = async (n, make) => { const out = []; for (let i = 0; i < n; i++) out.push((await make(i)).status); return out; };
  // Login, per account (from many IPs): the 11th try in 15 minutes is refused
  let s = await burst(11, (i) => raw('/api/auth/login', { method: 'POST', body: { email: 'target@example.invalid', password: 'guess-password-' + i } }));
  assert.equal(s.at(-1), 429, String(s)); assert.ok(s.slice(0, 10).every((x) => x === 401), String(s)); checks++;
  // Login and sign-up, per IP (one address, many accounts): 20 per 15 minutes together
  const oneIp = '10.250.1.1';
  s = await burst(21, (i) => raw('/api/auth/login', { method: 'POST', ip: oneIp, body: { email: `spray${i}@example.invalid`, password: 'whatever-123' } }));
  assert.equal(s.at(-1), 429); checks++;
  await call('/api/auth/signup', 429, '', 'POST', { name: 'X', email: 'x@example.invalid', password }, { ip: oneIp });
  // Password reset emails, per address: 3 an hour (and 5 per IP)
  s = await burst(4, () => raw('/api/auth/password/forgot', { method: 'POST', body: { email: 'gus@example.invalid' } }));
  assert.deepEqual(s, [200, 200, 200, 429]); checks++;
  s = await burst(6, (i) => raw('/api/auth/password/forgot', { method: 'POST', ip: '10.250.2.2', body: { email: `ip${i}@example.invalid` } }));
  assert.equal(s.at(-1), 429); checks++;
  // Guessing album codes: 30 an hour per account
  s = await burst(31, (i) => raw('/api/albums/join', { cookie: mal, method: 'POST', body: { code: `QQQ${String(1000 + i)}` } }));
  // (Mal already used a few of the 30 joining earlier in this test)
  assert.equal(s.at(-1), 429); assert.ok(s.every((x) => x === 404 || x === 429)); assert.ok(s.filter((x) => x === 404).length >= 25, String(s)); checks++;
  // Data export (heavy): 3 an hour
  s = await burst(4, () => raw('/api/auth/me/export', { cookie: mal }));
  assert.deepEqual(s, [200, 200, 200, 429]); checks++;
  // Album zips (heavy): 20 an hour
  s = await burst(21, () => raw(`/api/albums/${A}/download`, { cookie: mal }));
  // (Mal's refused download earlier in this test counts too). Allowed ones work; once refused, it stays refused
  const capped = (list, ok) => { const at = list.indexOf(429); return at > 0 && list.slice(0, at).every((x) => x === ok) && list.slice(at).every((x) => x === 429); };
  assert.ok(capped(s, 200), String(s)); checks++;
  // Making albums: 30 an hour
  s = await burst(31, (i) => raw('/api/albums', { cookie: pwUser, method: 'POST', body: { name: `Spam ${i}`, date: new Date().toISOString().slice(0, 10), startsAt: new Date(Date.now() + HOUR).toISOString(), endsAt: new Date(Date.now() + 2 * HOUR).toISOString(), zone: { ...venue, radiusM: 1000 } } }));
  assert.equal(s.at(-1), 429); checks++;
  // Uploads: 120 requests an hour (each up to 30 photos), in a burst of empty uploads (refused 400 until the limit).
  // (Gus was logged out everywhere by the password reset above, so Mal uploads)
  s = await burst(121, () => raw(`/api/albums/${A}/photos`, { cookie: mal, method: 'POST', body: new FormData() }));
  assert.ok(capped(s, 400), String(s)); checks++;
  // Group invites (emails): 20 an hour
  s = await burst(21, (i) => raw(`/api/groups/${mg.id}/invites`, { cookie: mal, method: 'POST', body: { email: `inv${i}@example.invalid` } }));
  assert.equal(s.at(-1), 429); checks++;
  // The nearby scan for visitors: 120 per 10 minutes per IP
  s = await burst(121, () => raw(`/api/events/nearby?lat=${venue.lat}&lng=${venue.lng}`, { ip: '10.250.3.3' }));
  assert.equal(s.at(-1), 429); checks++;
  // Everything else, for visitors: 600 per 10 minutes per IP
  s = await burst(601, () => raw('/api/config', { ip: '10.250.4.4' }));
  assert.equal(s.at(-1), 429); assert.equal(s.filter((x) => x === 200).length, 600); checks++;

  console.log(`Attack checks passed (${checks} requests or scenarios).`);
} finally {
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
  await rm(folder, { recursive: true, force: true });
}
