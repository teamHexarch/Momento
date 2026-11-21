// Labelling tool: folder scan, event-preserving split, local-only access, saved labels, export, and that the
// exported manifests run through scripts/calibrateModeration.js in stage-one mode.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { scanPhotos, splitByEvent, startLabelServer } from './labelPhotos.js';

const root = await mkdtemp(path.join(os.tmpdir(), 'momento-labels-'));
const jpeg = (r, g, b) => sharp({ create: { width: 48, height: 48, channels: 3, background: { r, g, b } } }).jpeg().toBuffer();
const events = ['wedding', 'picnic', 'beach', 'party'];
let shade = 0;
for (const event of events) {
  await mkdir(path.join(root, event));
  for (let i = 0; i < 3; i++) { shade += 9; await writeFile(path.join(root, event, i + '.jpg'), await jpeg(shade, 255 - shade, 120)); }
}
await writeFile(path.join(root, 'loose.png'), await sharp({ create: { width: 30, height: 30, channels: 3, background: 'teal' } }).png().toBuffer());
await writeFile(path.join(root, 'party', 'copy.jpg'), await readFile(path.join(root, 'wedding', '0.jpg')));
await writeFile(path.join(root, 'notes.txt'), 'not a photo');
let server;
try {
  const { photos, duplicates } = await scanPhotos(root);
  assert.equal(photos.length, 13);
  assert.deepEqual(duplicates, [{ rel: 'wedding/0.jpg', sameAs: 'party/copy.jpg' }]);
  assert.equal(photos.find(p => p.rel === 'beach/1.jpg').event, 'beach');
  assert.equal(photos.find(p => p.rel === 'loose.png').event, 'loose.png');

  const labels = Object.fromEntries(photos.map((p, i) => [p.rel, i % 4 === 3 ? 50 : 0]));
  const split = splitByEvent(photos, labels);
  const eventsOf = rows => new Set(rows.map(row => row.image.includes('/') ? row.image.split('/')[0] : row.image));
  assert.equal(split.fit.length + split.holdout.length, 13);
  for (const event of eventsOf(split.fit)) assert.ok(!eventsOf(split.holdout).has(event), 'event in both splits: ' + event);
  const safe = rows => rows.filter(row => row.severity <= 50).length;
  assert.ok(Math.abs(safe(split.fit) - safe(split.holdout)) <= 3);
  assert.deepEqual(splitByEvent(photos, labels), split, 'split is repeatable');
  assert.equal(splitByEvent(photos, { 'beach/0.jpg': 7 }).fit.length, 0, 'invalid severities are ignored');

  ({ server } = await startLabelServer(root, 0));
  const port = server.address().port;
  const origin = 'http://127.0.0.1:' + port;
  const call = (url, body, headers = {}) => fetch(origin + url, body === undefined ? { headers } : {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', Origin: origin, ...headers } });
  assert.match(await (await call('/')).text(), /Momento 相片標記/);
  const state = await (await call('/api/state')).json();
  assert.equal(state.photos.length, 13);
  assert.ok(state.photos.every(p => p.severity === null && !('hash' in p)));
  const image = await call('/photo/0');
  assert.equal(image.status, 200);
  assert.match(image.headers.get('content-type'), /^image\//);
  assert.equal((await call('/photo/99')).status, 404);
  assert.equal((await call('/photo/..%2f..%2fnotes.txt')).status, 404);
  // Other websites and rebound host names are refused
  assert.equal((await call('/api/label', { id: 0, severity: 0 }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('/api/label', { id: 0, severity: 0 }, { 'Content-Type': 'text/plain' })).status, 403);
  const rebound = await new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port, path: '/api/state',
    headers: { Host: 'evil.example:' + port } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject));
  assert.equal(rebound, 403);
  assert.equal((await call('/api/label', { id: 0, severity: 33 })).status, 400);
  assert.equal((await call('/api/label', { id: 'x', severity: 0 })).status, 400);
  // One event only: export refuses, since fit and holdout must not share events
  const beach = state.photos.filter(p => p.event === 'beach');
  for (const p of beach) assert.equal((await call('/api/label', { id: p.id, severity: 0 })).status, 200);
  assert.equal((await call('/api/export', {})).status, 400);
  for (const p of state.photos) await call('/api/label', { id: p.id, severity: p.event === 'party' ? 100 : p.id % 2 ? 15 : 0 });
  await call('/api/label', { id: 0, severity: null });
  const saved = JSON.parse(await readFile(path.join(root, 'labels.json'), 'utf8'));
  assert.equal(Object.keys(saved).length, 12);
  assert.equal(saved[state.photos[0].rel], undefined);
  const exported = await (await call('/api/export', {})).json();
  assert.equal(exported.fit.total + exported.holdout.total, 12);
  const read = async name => (await readFile(path.join(root, name), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  const fit = await read('fit.jsonl'), holdout = await read('holdout.jsonl');
  assert.ok(fit.length && holdout.length);
  for (const event of eventsOf(fit)) assert.ok(!eventsOf(holdout).has(event));

  // Labels survive a restart
  server.close();
  ({ server } = await startLabelServer(root, 0));
  const again = await (await fetch('http://127.0.0.1:' + server.address().port + '/api/state')).json();
  assert.equal(again.photos.filter(p => p.severity !== null).length, 12);

  // The calibration script accepts the exported manifests (stage one only, MobileNetV2 in process)
  const table = path.join(root, 'calibration.json');
  await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./calibrateModeration.js', import.meta.url)),
    path.join(root, 'fit.jsonl'), path.join(root, 'holdout.jsonl'), table],
  { cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...process.env, NSFW_PIPELINE: 'stage-one', NSFW_CALIBRATION: '', NODE_ENV: 'development', S3_BUCKET: '',
    JWT_SECRET: 'test-only-isolated', MONGODB_URI: 'mongodb://127.0.0.1:9/unused' } });
  const calibration = JSON.parse(await readFile(table, 'utf8'));
  assert.deepEqual(Object.keys(calibration), ['1', 'scoreVersion']);
  assert.equal(calibration.scoreVersion, 4, 'the table records the score definition it was built with');
  assert.deepEqual(calibration[1].allow, [], 'a dozen photos cannot support 90% confidence');
  console.log('Passed: photo scan, duplicates, event split, local-only access, saved labels, export and stage-one calibration.');
} finally {
  server?.close();
  await rm(root, { recursive: true, force: true });
}
