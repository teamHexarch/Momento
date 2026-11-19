import assert from 'node:assert/strict';
import sharp from 'sharp';
import os from 'node:os';
import path from 'node:path';

// Without settings (no .env), it uses a temporary folder on this computer instead of real storage
if (!process.env.JWT_SECRET) Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'isolated-privacy-test', MONGODB_URI: 'mongodb://unused', UPLOAD_DIR: path.join(os.tmpdir(), 'momento-privacy-test') });
const { savePhoto, openPhoto, deletePhoto, storageName } = await import('../src/services/storageService.js');
const { hasLocation } = await import('../src/utils/gpsStrip.js');

// Only creates and deletes its own randomly named synthetic test object.
let key;
try {
  const input = await sharp({ create: { width: 20, height: 10, channels: 3, background: 'red' } })
    .jpeg().withMetadata({ orientation: 6 })
    .withExifMerge({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '22/1 18/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '114/1 10/1 0/1' } })
    .toBuffer();
  assert.ok((await sharp(input).metadata()).exif);
  const stored = await savePhoto('test-upload', input);
  key = stored.storageKey;
  const chunks = [];
  for await (const chunk of await openPhoto(key)) chunks.push(Buffer.from(chunk));
  const downloaded = Buffer.concat(chunks);
  const metadata = await sharp(downloaded).metadata();
  // The original is kept as uploaded except where it was taken: the GPS is gone, nothing else moved
  assert.ok(hasLocation(input), 'the test photo has a location');
  assert.ok(!hasLocation(downloaded), 'the stored original has no location');
  assert.equal(downloaded.length, input.length, 'same size: nothing else removed');
  let differ = 0;
  for (let i = 0; i < input.length; i++) if (input[i] !== downloaded[i]) differ++;
  assert.ok(differ > 0 && differ < 200, `only the location bytes changed (${differ})`);
  assert.equal(metadata.orientation, 6, 'orientation kept');
  // A photo without a location is stored byte for byte
  const plain = await sharp({ create: { width: 20, height: 10, channels: 3, background: 'blue' } }).jpeg().withMetadata({ orientation: 3 }).toBuffer();
  const plainStored = await savePhoto('test-upload', plain);
  const pc = [];
  for await (const chunk of await openPhoto(plainStored.storageKey)) pc.push(Buffer.from(chunk));
  assert.deepEqual(Buffer.concat(pc), plain);
  await deletePhoto(plainStored.storageKey);
  assert.equal(downloaded.length, stored.size);
  assert.equal(stored.mimeType, 'image/jpeg');
  const previewChunks = [];
  for await (const chunk of await openPhoto(stored.thumbnailKey)) previewChunks.push(Buffer.from(chunk));
  const thumb = await sharp(Buffer.concat(previewChunks)).metadata();
  assert.equal(thumb.exif, undefined);
  assert.equal(thumb.xmp, undefined);
  console.log('PASS: original kept as uploaded minus its location, and metadata-free thumbnail.');
} finally {
  if (key) {
    await deletePhoto(key);
    console.log('Removed synthetic test object.');
  }
}
