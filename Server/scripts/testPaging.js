// Local only (gitignored): album paging (?limit/?before/?since, audit B1) and the version ETag/304 + rate limit (M4).
// Usage (from Server/): node scripts/testPaging.js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri('momento');
process.env.JWT_SECRET ||= crypto.randomBytes(48).toString('base64');
process.env.NODE_ENV = 'test';
const jwt = (await import('jsonwebtoken')).default;
const { connectDb } = await import('../src/config/database.js');
const { app } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { Album } = await import('../src/models/Album.js');
const { Membership } = await import('../src/models/Membership.js');
const { Photo } = await import('../src/models/Photo.js');
await connectDb();

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
let failed = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`  ok   ${name}`); } catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`); }
};

async function login(email, name) {
  const sid = crypto.randomUUID();
  const user = await User.create({ email, name, emailVerified: true, sessions: [{ id: sid, expiresAt: new Date(Date.now() + 86400000) }] });
  const token = jwt.sign({ sub: user.id, jti: sid }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: 3600, issuer: 'momento-api', audience: 'momento-session' });
  return { user, cookie: `momento_session=${token}` };
}
const host = await login('host@example.test', 'Hana Host');
const guest = await login('guest@example.test', 'Gus Guest');
const album = await Album.create({ name: 'Paging', date: '2026-11-27', code: 'PAGE001', host: host.user._id });
await Membership.create([{ album: album._id, user: host.user._id, role: 'host' }, { album: album._id, user: guest.user._id, role: 'guest' }]);

// 1,234 photos; some share a createdAt to the millisecond (ties must not be lost or repeated between pages)
const N = 1234, t0 = Date.UTC(2026, 0, 1);
await Photo.insertMany(Array.from({ length: N }, (_, i) => ({
  album: album._id, uploader: i % 3 ? host.user._id : guest.user._id, storageKey: `k${i}`, mimeType: 'image/jpeg', size: 1000 + i,
  originalName: `IMG_${String((i * 7919) % N).padStart(4, '0')}.jpg`, takenAt: new Date(t0 + ((i * 104729) % N) * 1000),
  createdAt: new Date(t0 + Math.floor(i / 3) * 60000), updatedAt: new Date(t0 + Math.floor(i / 3) * 60000),
})), { timestamps: false });

const get = async (path, who = host, headers = {}) => {
  const r = await fetch(base + path, { headers: { cookie: who.cookie, ...headers } });
  return { status: r.status, headers: r.headers, body: r.status === 304 ? null : await r.json() };
};
const A = `/api/albums/${album.id}`;
async function walk(query) {
  const ids = []; let before, pages = 0, total;
  do {
    const r = await get(`${A}?${query}${before ? `&before=${encodeURIComponent(before)}` : ''}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    ids.push(...r.body.photos.map((p) => p.id)); before = r.body.nextBefore; total = r.body.total; pages++;
  } while (before);
  return { ids, pages, total };
}

console.log('Album paging (B1)');
const all = await get(A);
await check('no limit: every photo at once, as before (no paging fields)', () => {
  assert.equal(all.body.photos.length, N);
  assert.equal(all.body.nextBefore, undefined);
  assert.equal(all.body.total, undefined);
});
for (const sort of ['uploaded', 'name', 'uploader', 'taken']) for (const order of ['asc', 'desc']) {
  await check(`limit=200 sort_by=${sort} order=${order}: same photos in the same order as the all-at-once answer`, async () => {
    const full = (await get(`${A}?sort_by=${sort}&order=${order}`)).body.photos.map((p) => p.id);
    const { ids, pages, total } = await walk(`limit=200&sort_by=${sort}&order=${order}`);
    assert.equal(total, N); assert.equal(pages, Math.ceil(N / 200));
    assert.equal(new Set(ids).size, N, 'no repeats');
    if (sort === 'uploaded') assert.deepEqual(ids, full); // other orders may tie-break differently, but none lost
    else assert.deepEqual([...ids].sort(), [...full].sort());
  });
}
await check('default order (uploaded, newest first) pages match the full list exactly', async () => {
  assert.deepEqual((await walk('limit=97')).ids, all.body.photos.map((p) => p.id));
});
await check('limit is capped at 500', async () => {
  const r = await get(`${A}?limit=100000`);
  assert.equal(r.body.photos.length, 500);
});
await check('bad limit / before / since are a 400, not a crash', async () => {
  for (const q of ['limit=0', 'limit=abc', 'limit=200&before=nonsense', 'limit=200&sort_by=name&before=xyz', 'since=garbage'])
    assert.equal((await get(`${A}?${q}`)).status, 400, q);
});
await check('a plain ISO date works as ?before= (the handoff spec)', async () => {
  const r = await get(`${A}?limit=5&before=${new Date(t0 + 10 * 60000).toISOString()}`);
  assert.ok(r.body.photos.every((p) => new Date(p.at) < new Date(t0 + 10 * 60000)));
  assert.equal(r.body.photos.length, 5);
});
await check('hidden photos stay out of pages and totals', async () => {
  const some = all.body.photos.slice(0, 10).map((p) => p.id);
  await Membership.updateOne({ album: album._id, user: host.user._id }, { hidden: some });
  const { ids, total } = await walk('limit=300');
  assert.equal(total, N - 10); assert.ok(!some.some((id) => ids.includes(id)));
  await Membership.updateOne({ album: album._id, user: host.user._id }, { hidden: [] });
});
await check('someone not in the album gets 404', async () => {
  const stranger = await login('x@example.test', 'X');
  assert.equal((await get(`${A}?limit=10`, stranger)).status, 404);
});

console.log('Live updates (?since=)');
const first = await get(`${A}?limit=50`);
await check('a paged answer gives nextSince', () => assert.equal(typeof first.body.nextSince, 'number'));
await check('nothing changed: empty photos and removed', async () => {
  const r = await get(`${A}?since=${first.body.nextSince + 1}`);
  assert.equal(r.status, 200); assert.deepEqual(r.body.photos, []); assert.deepEqual(r.body.removed, []); assert.equal(r.body.total, N);
});
let since = first.body.nextSince;
await new Promise((r) => setTimeout(r, 5));
const [pA, pB] = all.body.photos.slice(0, 2).map((p) => p.id);
await Photo.updateOne({ _id: pA }, { $inc: { commentCount: 1 } });
await Photo.updateOne({ _id: pB }, { deletedAt: new Date() });
const added = await Photo.create({ album: album._id, uploader: guest.user._id, storageKey: 'new', mimeType: 'image/jpeg', size: 5 });
await check('changed, deleted and new photos come back, and only those', async () => {
  const r = await get(`${A}?since=${since}`);
  assert.deepEqual(r.body.photos.map((p) => p.id).sort(), [pA, added.id].sort());
  assert.deepEqual(r.body.removed, [pB]);
  assert.equal(r.body.total, N); // one deleted, one added
  assert.equal(r.body.photos.find((p) => p.id === pA).commentCount, 1);
  since = r.body.nextSince;
});
await check('asking again with the new nextSince: at most the last one again ($gte), nothing older', async () => {
  const r = await get(`${A}?since=${since}`);
  assert.ok(r.body.photos.length + r.body.removed.length <= 1);
});
await check('more changes than the cap: tooMany', async () => {
  const r = await get(`${A}?since=0&limit=10`);
  assert.equal(r.body.tooMany, true); assert.equal(r.body.photos.length + r.body.removed.length, 10);
});

console.log('Version check (M4)');
const v1 = await get(`${A}/version`);
await check('200 with an ETag and Cache-Control: private, no-cache', () => {
  assert.equal(v1.status, 200); assert.ok(v1.headers.get('etag'));
  assert.equal(v1.headers.get('cache-control'), 'private, no-cache'); assert.equal(v1.headers.get('pragma'), null);
});
await check('same ETag back: 304, no body', async () => {
  const r = await get(`${A}/version`, host, { 'If-None-Match': v1.headers.get('etag') });
  assert.equal(r.status, 304);
});
await check('weak or listed ETags match too', async () => {
  const r = await get(`${A}/version`, host, { 'If-None-Match': `"old", W/${v1.headers.get('etag')}` });
  assert.equal(r.status, 304);
});
await check('a change shows within about a second (the in-memory stamp)', async () => {
  await Photo.updateOne({ _id: pA }, { $inc: { commentCount: 1 } });
  await new Promise((r) => setTimeout(r, 1100));
  const r = await get(`${A}/version`, host, { 'If-None-Match': v1.headers.get('etag') });
  assert.equal(r.status, 200); assert.notEqual(r.body.version, v1.body.version);
});
await check('an album change (not a photo) changes it at once', async () => {
  const before = (await get(`${A}/version`)).body.version;
  await Album.updateOne({ _id: album._id }, { name: 'Renamed' });
  const after = (await get(`${A}/version`)).body.version;
  assert.notEqual(after, before);
});
await check('not in the album: 404 (the cache never answers for strangers)', async () => {
  const stranger = await login('y@example.test', 'Y');
  assert.equal((await get(`${A}/version`, stranger)).status, 404);
});
await check('60 a minute per account, then 429', async () => {
  const g = await login('poll@example.test', 'P');
  await Membership.create({ album: album._id, user: g.user._id, role: 'guest' });
  const codes = [];
  for (let i = 0; i < 61; i++) codes.push((await get(`${A}/version`, g)).status);
  assert.equal(codes.filter((c) => c === 200).length, 60); assert.equal(codes.at(-1), 429);
});

server.close();
await (await import('mongoose')).default.disconnect();
await mongo.stop();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
