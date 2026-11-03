import assert from 'node:assert/strict';
import sharp from 'sharp';
import { savePhoto, openPhoto, deletePhoto, storageName } from '../src/services/storageService.js';

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
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.xmp, undefined);
  assert.equal(metadata.iptc, undefined);
  assert.equal(metadata.width, 10);
  assert.equal(metadata.height, 20);
  assert.equal(downloaded.length, stored.size);
  assert.equal(stored.mimeType, 'image/png');
  console.log(`PASS: ${storageName} upload/download has no EXIF, XMP or IPTC; orientation and size correct.`);
} finally {
  if (key) {
    await deletePhoto(key);
    console.log('Removed synthetic test object.');
  }
}
