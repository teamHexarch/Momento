// Friend groups: joining a group gives access to all its albums; leaving takes it away again, and
// that's checked on every album open, photo read and upload.
// Runs without .env: a disposable database and upload folder. node scripts/testGroups.js
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
const folder = await mkdtemp(path.join(os.tmpdir(), 'momento-groups-'));
const mongo = await MongoMemoryServer.create();
Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'isolated-group-test', MONGODB_URI: mongo.getUri(), UPLOAD_DIR: folder, PUBLIC_URL: 'http://localhost:4107' });
const { app } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { Membership } = await import('../src/models/Membership.js');
const { GroupMember } = await import('../src/models/GroupMember.js');
await mongoose.connect(process.env.MONGODB_URI);
const server = app.listen(4107);
let checks = 0;
// Uploads carry where the phone is (inside the zone of the test albums)
async function call(url, status, cookie = '', method = 'GET', body) {
  const h = { cookie, 'X-Momento-Location': '-33.89,151.27,20' };
  if (body && !(body instanceof FormData)) h['Content-Type'] = 'application/json';
  const r = await fetch('http://localhost:4107' + url, { method, headers: h, body: body instanceof FormData ? body : body && JSON.stringify(body) });
  const text = await r.clone().text();
  assert.equal(r.status, status, `${method} ${url}: ${text}`);
  checks++;
  return r;
}
const json = async (r) => r.json();
const cookieOf = (r) => r.headers.get('set-cookie').split(';')[0];
const HOUR = 3600000;

try {
  const password = 'Test-password-123!';
  const passwordHash = await bcrypt.hash(password, 12);
  for (const n of ['owner', 'friend', 'other', 'stranger']) {
    await User.create({ name: n[0].toUpperCase() + n.slice(1), email: `${n}@example.invalid`, passwordHash, emailVerified: true });
  }
  const login = async (email) => cookieOf(await call('/api/auth/login', 200, '', 'POST', { email, password }));
  const o = await login('owner@example.invalid'), f = await login('friend@example.invalid');
  const x = await login('other@example.invalid'), s = await login('stranger@example.invalid');

  // Creating a group
  await call('/api/groups', 400, o, 'POST', { name: '  ' });
  await call('/api/groups', 400, o, 'POST', { name: 'x'.repeat(61) });
  let group = (await json(await call('/api/groups', 201, o, 'POST', { name: 'Uni friends' }))).group;
  assert.equal(group.role, 'owner');
  assert.equal(group.members.length, 1);
  assert.equal(group.albums.length, 0);

  // A group album (only members can put albums in it)
  const base = {
    name: 'Beach day', date: new Date().toISOString().slice(0, 10), place: 'Bondi',
    startsAt: new Date(Date.now() - HOUR).toISOString(), endsAt: new Date(Date.now() + 5 * HOUR).toISOString(),
    zone: { lat: -33.89, lng: 151.27, radiusM: 1000 },
  };
  await call('/api/albums', 404, f, 'POST', { ...base, groupId: group.id });
  await call('/api/albums', 404, o, 'POST', { ...base, groupId: 'not-an-id' });
  const album = (await json(await call('/api/albums', 201, o, 'POST', { ...base, groupId: group.id }))).album;
  assert.equal(album.group.name, 'Uni friends');
  {
    const pub = (await json(await call('/api/albums', 201, o, 'POST', { ...base, name: 'Not public', groupId: group.id, visibility: 'public' }))).album;
    assert.equal(pub.visibility, 'invite', 'group albums are never public');
    await call(`/api/albums/${pub.id}`, 400, o, 'PATCH', { visibility: 'public' });
    await call(`/api/albums/${pub.id}`, 200, o, 'DELETE');
  }
  const bytes = await sharp({ create: { width: 300, height: 200, channels: 3, background: 'red' } }).jpeg().toBuffer();
  const photo = () => { const fd = new FormData(); fd.append('photos', new Blob([bytes], { type: 'image/jpeg' }), 'p.jpg'); return fd; };
  const [p1] = (await json(await call(`/api/albums/${album.id}/photos`, 201, o, 'POST', photo()))).photos;

  // Not in the group yet: no access at all
  await call(`/api/albums/${album.id}`, 404, f);
  await call(`/api/photos/${p1.id}`, 404, f);
  await call(`/api/albums/${album.id}/photos`, 404, f, 'POST', photo());

  // Inviting: members only, a real address, not someone already in
  await call(`/api/groups/${group.id}/invites`, 404, s, 'POST', { email: 'friend@example.invalid' });
  await call(`/api/groups/${group.id}/invites`, 400, o, 'POST', { email: 'nope' });
  await call(`/api/groups/${group.id}/invites`, 400, o, 'POST', { email: 'owner@example.invalid' });
  group = (await json(await call(`/api/groups/${group.id}/invites`, 201, o, 'POST', { email: 'friend@example.invalid' }))).group;
  assert.equal(group.invites.length, 1);

  // The invite waits for the friend, and only for them
  let mine = await json(await call('/api/groups', 200, f));
  assert.equal(mine.invites.length, 1);
  assert.equal(mine.invites[0].group.name, 'Uni friends');
  assert.equal(mine.invites[0].albums, 1);
  const inviteId = mine.invites[0].id;
  await call(`/api/groups/invites/${inviteId}/accept`, 404, s, 'POST');

  // Accepting grants access to every group album straight away
  group = (await json(await call(`/api/groups/invites/${inviteId}/accept`, 200, f, 'POST'))).group;
  assert.equal(group.role, 'member');
  assert.equal(group.members.length, 2);
  assert.equal(group.albums.length, 1);
  const list = await json(await call('/api/albums', 200, f));
  assert.ok(list.albums.some((a) => a.id === album.id && a.role === 'guest' && a.group?.name === 'Uni friends'));
  const shown = await json(await call(`/api/albums/${album.id}`, 200, f));
  assert.equal(shown.photos.length, 1);
  assert.equal(shown.album.anywhere, true, 'group members can add photos from anywhere');
  await call(`/api/photos/${p1.id}?size=thumb`, 200, f);
  await call(`/api/albums/${album.id}/photos`, 201, f, 'POST', photo());
  {
    const fd = photo();
    const r = await fetch(`http://localhost:4107/api/albums/${album.id}/photos`, { method: 'POST', headers: { cookie: f }, body: fd });
    assert.equal(r.status, 201, 'group members can add photos from anywhere');
    checks++;
  }
  await call(`/api/photos/${p1.id}/like`, 200, f, 'POST', { liked: true });

  // An album added to the group later shows up for members too
  const later = (await json(await call('/api/albums', 201, f, 'POST', { ...base, name: 'Picnic', groupId: group.id }))).album;
  await call(`/api/albums/${later.id}`, 200, o);
  // And an album moved into the group by its host
  const solo = (await json(await call('/api/albums', 201, o, 'POST', { ...base, name: 'Solo' }))).album;
  await call(`/api/albums/${solo.id}`, 404, f);
  await call(`/api/albums/${solo.id}`, 200, o, 'PATCH', { groupId: group.id });
  await call(`/api/albums/${solo.id}`, 200, f);
  // ...and out again: access goes with it
  await call(`/api/albums/${solo.id}`, 200, o, 'PATCH', { groupId: null });
  await call(`/api/albums/${solo.id}`, 404, f);

  // Group albums can't be left one by one
  await call(`/api/albums/${album.id}/membership`, 400, f, 'DELETE');

  // Membership is checked live: a stale group row in the database doesn't keep access
  await GroupMember.deleteOne({ user: (await User.findOne({ email: 'friend@example.invalid' }))._id });
  await call(`/api/photos/${p1.id}`, 404, f);
  await call(`/api/albums/${album.id}`, 404, f);
  await call(`/api/albums/${album.id}/photos`, 404, f, 'POST', photo());
  assert.equal(await Membership.countDocuments({ user: (await User.findOne({ email: 'friend@example.invalid' }))._id, album: album.id, via: 'group' }), 0);

  // Back in through a second invite; then leaving the normal way
  group = (await json(await call(`/api/groups/${group.id}/invites`, 201, o, 'POST', { email: 'friend@example.invalid' }))).group;
  mine = await json(await call('/api/groups', 200, f));
  await call(`/api/groups/invites/${mine.invites[0].id}/accept`, 200, f, 'POST');
  await call(`/api/albums/${album.id}`, 200, f);
  // The owner can't leave; members can
  await call(`/api/groups/${group.id}/members/me`, 400, o, 'DELETE');
  await call(`/api/groups/${group.id}/members/me`, 200, f, 'DELETE');
  await call(`/api/albums/${album.id}`, 404, f);
  await call(`/api/photos/${p1.id}`, 404, f);
  // The album the friend hosted left the group with them: the owner lost it, the friend kept it
  await call(`/api/albums/${later.id}`, 404, o);
  await call(`/api/albums/${later.id}`, 200, f);
  const after = await json(await call('/api/albums', 200, f));
  assert.ok(!after.albums.some((a) => a.id === album.id));

  // Someone who joined with the code keeps the album even after leaving the group
  group = (await json(await call(`/api/groups/${group.id}/invites`, 201, o, 'POST', { email: 'other@example.invalid' }))).group;
  mine = await json(await call('/api/groups', 200, x));
  await call(`/api/groups/invites/${mine.invites[0].id}/decline`, 200, x, 'POST');
  assert.equal((await json(await call('/api/groups', 200, x))).invites.length, 0);
  group = (await json(await call(`/api/groups/${group.id}/invites`, 201, o, 'POST', { email: 'other@example.invalid' }))).group;
  mine = await json(await call('/api/groups', 200, x));
  await call(`/api/groups/invites/${mine.invites[0].id}/accept`, 200, x, 'POST');
  await call(`/api/albums/${album.id}`, 200, x);
  await call('/api/albums/join', 200, x, 'POST', { code: album.code, location: { lat: -33.89, lng: 151.27, accuracy: 10 } });
  // The owner removes them: they keep it, because they had the code
  const xId = (await User.findOne({ email: 'other@example.invalid' })).id;
  const oId = (await User.findOne({ email: 'owner@example.invalid' })).id;
  await call(`/api/groups/${group.id}/members/${oId}`, 403, x, 'DELETE');   // members can't remove people
  await call(`/api/groups/${group.id}/members/${xId}`, 404, f, 'DELETE');   // nor can people who left
  group = (await json(await call(`/api/groups/${group.id}/members/${xId}`, 200, o, 'DELETE'))).group;
  assert.equal(group.members.length, 1);
  await call(`/api/albums/${album.id}`, 200, x);

  // Profile photos: upload, shown beside the owner's name in the group and the chat, removed again
  {
    const fd = new FormData();
    fd.append('avatar', new Blob([await sharp({ create: { width: 800, height: 600, channels: 3, background: 'blue' } }).png().toBuffer()], { type: 'image/png' }), 'me.png');
    const me = (await json(await call('/api/auth/avatar', 200, o, 'POST', fd))).user;
    assert.match(me.avatarUrl, /\/api\/users\/[0-9a-f]{24}\/avatar\?v=/);
    assert.equal(me.hasAvatar, true);
    const pic = await call(new URL(me.avatarUrl).pathname + new URL(me.avatarUrl).search, 200, s);
    assert.equal((await sharp(Buffer.from(await pic.arrayBuffer())).metadata()).width, 256);
    await call(new URL(me.avatarUrl).pathname, 401, '');   // only for people who are logged in
    const bad = new FormData();
    bad.append('avatar', new Blob([Buffer.from('not an image')], { type: 'image/png' }), 'x.png');
    await call('/api/auth/avatar', 400, o, 'POST', bad);
    const g = (await json(await call(`/api/groups/${group.id}`, 200, o))).group;
    assert.equal(g.members.find((m) => m.you).avatarUrl, me.avatarUrl);
  }

  // The group chat: members only, checked on every read and send
  const chatUrl = `/api/groups/${group.id}/messages`;
  await call(chatUrl, 400, o, 'POST', { text: '   ' });
  const said = (await json(await call(chatUrl, 201, o, 'POST', { text: 'Photos from the beach are up' }))).message;
  assert.equal(said.you, true);
  await call(chatUrl, 404, s);
  await call(chatUrl, 404, s, 'POST', { text: 'let me in' });
  await call(chatUrl, 404, f);   // left the group earlier
  await call(chatUrl, 404, x);   // removed just now
  const chat = await json(await call(chatUrl, 200, o));
  assert.equal(chat.messages.length, 1);
  assert.ok(chat.messages[0].avatarUrl, 'messages carry the sender’s photo');

  // Typing and unread: a second member sees the owner typing, gets an unread count, reads it
  {
    group = (await json(await call(`/api/groups/${group.id}/invites`, 201, o, 'POST', { email: 'stranger@example.invalid' }))).group;
    const inv = (await json(await call('/api/groups', 200, s))).invites[0];
    await call(`/api/groups/invites/${inv.id}/accept`, 200, s, 'POST');
    await call(`/api/groups/${group.id}/typing`, 404, f, 'POST', {});   // not a member
    await call(`/api/groups/${group.id}/typing`, 200, o, 'POST', {});
    const seen = await json(await call(chatUrl, 200, s));
    assert.deepEqual(seen.typing.map((t) => t.name), ['Owner']);
    assert.equal((await json(await call(chatUrl, 200, o))).typing.length, 0, 'you never see yourself typing');
    await call(chatUrl, 201, o, 'POST', { text: 'One more' });
    assert.equal((await json(await call(chatUrl, 200, s))).typing.length, 0, 'sending ends typing');
    await call(chatUrl, 201, o, 'POST', { text: 'And another' });
    const u = await json(await call('/api/groups/unread', 200, s));
    assert.equal(u.total, 1);
    assert.equal(u.groups[0].latest.text, 'And another');
    assert.equal((await json(await call(`/api/groups/${group.id}`, 200, s))).group.unread, 1);
    await call(chatUrl, 200, s);   // reading marks it read
    assert.equal((await json(await call('/api/groups/unread', 200, s))).total, 0);
    assert.equal((await json(await call('/api/groups/unread', 200, o))).total, 0, 'your own messages are never unread');
    await call(`/api/groups/${group.id}/members/me`, 200, s, 'DELETE');
    await call('/api/auth/avatar', 200, o, 'DELETE');
  }
  assert.equal(chat.messages[0].text, 'Photos from the beach are up');
  await call(`/api/groups/${group.id}`, 404, s);

  // Rename and delete: owner only. Deleting keeps the album with its host
  await call(`/api/groups/${group.id}`, 404, f, 'PATCH', { name: 'Hijack' });
  group = (await json(await call(`/api/groups/${group.id}`, 200, o, 'PATCH', { name: 'Old uni friends' }))).group;
  assert.equal(group.name, 'Old uni friends');
  await call(`/api/groups/${group.id}`, 404, s, 'DELETE');
  await call(`/api/groups/${group.id}`, 200, o, 'DELETE');
  const kept = await json(await call(`/api/albums/${album.id}`, 200, o));
  assert.equal(kept.album.group, undefined);
  assert.equal((await json(await call('/api/groups', 200, o))).groups.length, 0);

  console.log(`Friend group checks passed (${checks} requests).`);
} finally {
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
  await rm(folder, { recursive: true, force: true });
}
