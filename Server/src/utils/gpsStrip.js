import zlib from 'node:zlib';

// Removes where a photo was taken (GPS) from an uploaded original, without changing anything else.
//
// Originals are kept byte for byte so "download the original" really is the original (quality,
// camera details, orientation). Location is the exception: phones write the exact spot, often
// someone's home, and every member of an album can download originals. So the GPS part of the
// photo's EXIF is emptied in place, and any XMP location tags are blanked, keeping every length
// the same. Nothing moves inside the file, so JPEG, PNG, WebP and HEIC/AVIF stay valid.

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4 };

// Empties the GPS directory of the TIFF/EXIF block that starts at `t` (ending before `end`).
// Returns true when there was location to remove. Anything that doesn't look like real EXIF is left alone.
function emptyGps(buf, t, end) {
  if (t < 0 || t + 8 > end) return false;
  const order = buf.toString('latin1', t, t + 2);
  const le = order === 'II';
  if (!le && order !== 'MM') return false;
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  if (u16(t + 2) !== 42) return false;
  const ifd0 = t + u32(t + 4);
  if (ifd0 + 2 > end) return false;
  const n = u16(ifd0);
  if (n > 1000 || ifd0 + 2 + n * 12 > end) return false;
  let removed = false;
  for (let i = 0; i < n; i++) {
    const e = ifd0 + 2 + i * 12;
    if (u16(e) !== 0x8825) continue;   // GPSInfo
    const g = t + u32(e + 8);
    if (g + 2 > end) return false;
    const gn = u16(g);
    if (gn > 500 || g + 2 + gn * 12 + 4 > end) return false;
    // Each value stored outside its entry is zeroed, then the entries, leaving an empty directory
    for (let j = 0; j < gn; j++) {
      const ge = g + 2 + j * 12;
      const size = (TYPE_SIZE[u16(ge + 2)] || 1) * u32(ge + 4);
      if (size > 4) {
        const off = t + u32(ge + 8);
        if (off >= t && off + size <= end) buf.fill(0, off, off + size);
      }
    }
    buf.fill(0, g, g + 2 + gn * 12 + 4);   // count 0, no entries, no next directory
    removed = removed || gn > 0;
  }
  return removed;
}

// Blanks XMP location tags (exif:GPS…) between start and end, keeping the length
function blankXmpGps(buf, start, end) {
  const text = buf.toString('latin1', start, end);
  if (!/GPS/.test(text)) return false;
  const blank = (s) => ' '.repeat(s.length);
  const out = text
    .replace(/(exif(?:EX)?:GPS\w*\s*=\s*")([^"]*)(")/g, (m, a, v, b) => a + blank(v) + b)
    .replace(/(exif(?:EX)?:GPS\w*\s*=\s*')([^']*)(')/g, (m, a, v, b) => a + blank(v) + b)
    .replace(/(<(exif(?:EX)?:GPS\w*)\b[^>]*>)([\s\S]*?)(<\/\2>)/g, (m, open, tag, v, close) => open + blank(v) + close);
  if (out === text) return false;
  buf.write(out, start, 'latin1');
  return true;
}

const EXIF_HEADER = Buffer.from('Exif\0\0', 'latin1');
const isTiffAt = (buf, i) => i + 4 <= buf.length
  && ((buf[i] === 0x49 && buf[i + 1] === 0x49 && buf[i + 2] === 0x2a && buf[i + 3] === 0) || (buf[i] === 0x4d && buf[i + 1] === 0x4d && buf[i + 2] === 0 && buf[i + 3] === 0x2a));

function jpeg(buf) {
  let removed = false;
  for (let s = 2; s + 4 <= buf.length;) {
    if (buf[s] !== 0xff) break;
    const marker = buf[s + 1];
    if (marker === 0xda || marker === 0xd9) break;   // the picture data starts: no more metadata
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) { s += marker === 0xff ? 1 : 2; continue; }
    const len = buf.readUInt16BE(s + 2), body = s + 4, end = Math.min(buf.length, s + 2 + len);
    if (marker === 0xe1) {
      if (buf.compare(EXIF_HEADER, 0, 6, body, body + 6) === 0) removed = emptyGps(buf, body + 6, end) || removed;
      else removed = blankXmpGps(buf, body, end) || removed;
    }
    s += 2 + len;
  }
  return removed;
}

function png(buf) {
  let removed = false;
  for (let c = 8; c + 12 <= buf.length;) {
    const len = buf.readUInt32BE(c), type = buf.toString('latin1', c + 4, c + 8), data = c + 8, end = data + len;
    if (end + 4 > buf.length) break;
    let changed = false;
    if (type === 'eXIf') changed = emptyGps(buf, isTiffAt(buf, data) ? data : data + 6, end);
    // XMP in an uncompressed iTXt chunk
    if (type === 'iTXt' && buf.toString('latin1', data, data + 17) === 'XML:com.adobe.xmp') changed = blankXmpGps(buf, data, end);
    if (changed) {
      // PNG chunks carry a checksum of their type and data
      buf.writeUInt32BE(zlib.crc32(buf.subarray(c + 4, end)) >>> 0, end);
      removed = true;
    }
    if (type === 'IEND') break;
    c = end + 4;
  }
  return removed;
}

function webp(buf) {
  let removed = false;
  for (let c = 12; c + 8 <= buf.length;) {
    const type = buf.toString('latin1', c, c + 4), len = buf.readUInt32LE(c + 4), data = c + 8, end = Math.min(buf.length, data + len);
    if (type === 'EXIF') removed = emptyGps(buf, isTiffAt(buf, data) ? data : data + 6, end) || removed;
    if (type === 'XMP ') removed = blankXmpGps(buf, data, end) || removed;
    c = data + len + (len & 1);
  }
  return removed;
}

// HEIC/AVIF (and anything else): EXIF blocks are found by their "Exif\0\0" + TIFF header, and XMP
// by its <x:xmpmeta> wrapper. Only blocks that parse as real EXIF are touched.
function scan(buf) {
  let removed = false;
  for (let i = buf.indexOf(EXIF_HEADER); i !== -1; i = buf.indexOf(EXIF_HEADER, i + 6)) {
    if (isTiffAt(buf, i + 6)) removed = emptyGps(buf, i + 6, buf.length) || removed;
  }
  for (let i = buf.indexOf('<x:xmpmeta', 0, 'latin1'); i !== -1; i = buf.indexOf('<x:xmpmeta', i + 10, 'latin1')) {
    const close = buf.indexOf('</x:xmpmeta>', i, 'latin1');
    if (close === -1) break;
    removed = blankXmpGps(buf, i, close) || removed;
  }
  return removed;
}

/**
 * A copy of the photo with its location removed. { buffer, removed } (removed: there was location).
 */
export function stripLocation(input) {
  const buf = Buffer.from(input);
  let removed;
  if (buf[0] === 0xff && buf[1] === 0xd8) removed = jpeg(buf);
  else if (buf.toString('latin1', 1, 4) === 'PNG') removed = png(buf);
  else if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') removed = webp(buf);
  else removed = scan(buf);
  return { buffer: buf, removed };
}

// For tests and checks: does this file still say where it was taken?
export function hasLocation(input) {
  const copy = Buffer.from(input);
  return stripLocation(copy).removed;
}
