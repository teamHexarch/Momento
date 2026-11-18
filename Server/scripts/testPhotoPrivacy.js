import assert from 'node:assert/strict';
import sharp from 'sharp';
import os from 'node:os';
import path from 'node:path';

// Without settings (no .env), it uses a temporary folder on this computer instead of real storage
if (!process.env.JWT_SECRET) Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'isolated-privacy-test', MONGODB_URI: 'mongodb://unused', UPLOAD_DIR: path.join(os.tmpdir(), 'momento-privacy-test') });
const { savePhoto, openPhoto, deletePhoto, storageName } = await import('../src/services/storageService.js');

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
  assert.deepEqual(downloaded, input);
  assert.equal(downloaded.length, stored.size);
  assert.equal(stored.mimeType, 'image/jpeg');
  const previewChunks = [];
  for await (const chunk of await openPhoto(stored.thumbnailKey)) previewChunks.push(Buffer.from(chunk));
  const thumb = await sharp(Buffer.concat(previewChunks)).metadata();
  assert.equal(thumb.exif, undefined);
  assert.equal(thumb.xmp, undefined);
  console.log('PASS: exact original download and metadata-free thumbnail.');
} finally {
  if (key) {
    await deletePhoto(key);
    console.log('Removed synthetic test object.');
  }
}
