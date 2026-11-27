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
// loose: camera RAW variants of TIFF (Olympus ORF, Panasonic RW2) use another number than 42 in the header.
// gpsAtRoot: the first directory IS the GPS directory (Canon CR3's CMT4 box).
function emptyGps(buf, t, end, { loose = false, gpsAtRoot = false } = {}) {
  if (t < 0 || t + 8 > end) return false;
  const order = buf.toString('latin1', t, t + 2);
  const le = order === 'II';
  if (!le && order !== 'MM') return false;
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  if (!loose && u16(t + 2) !== 42) return false;
  if (gpsAtRoot) return clearGpsDir(buf, t, t + u32(t + 4), end, u16, u32);
  const ifd0 = t + u32(t + 4);
  if (ifd0 + 2 > end) return false;
  const n = u16(ifd0);
  if (n > 1000 || ifd0 + 2 + n * 12 > end) return false;
  let removed = false;
  for (let i = 0; i < n; i++) {
    const e = ifd0 + 2 + i * 12;
    const tag = u16(e);
    if (PRIVATE_IFD0.has(tag)) blankEntry(buf, t, e, end, u16, u32);
    if (tag === 0x8769) blankPrivateIn(buf, t, t + u32(e + 8), end, u16, u32);   // the Exif directory
    if (tag !== 0x8825) continue;   // GPSInfo
    removed = clearGpsDir(buf, t, t + u32(e + 8), end, u16, u32) || removed;
  }
  return removed;
}

// Who took or owns the photo, and what identifies the camera: blanked like the location (since 2026-11-27, audit H2).
// Make, model, exposure, orientation and the date stay. IFD0: description, artist, copyright, Windows author/title/
// comment/keywords/subject. Exif directory: user comment, maker note (holds serial numbers), unique id, owner name,
// body and lens serial numbers.
const PRIVATE_IFD0 = new Set([0x010e, 0x013b, 0x8298, 0x9c9b, 0x9c9c, 0x9c9d, 0x9c9e, 0x9c9f]);
const PRIVATE_EXIF = new Set([0x9286, 0x927c, 0xa420, 0xa430, 0xa431, 0xa435]);
// Zeroes one entry's value (inside the entry when it's 4 bytes or less, else where it points), keeping every length
function blankEntry(buf, t, e, end, u16, u32) {
  const size = (TYPE_SIZE[u16(e + 2)] || 1) * u32(e + 4);
  if (size <= 4) { buf.fill(0, e + 8, e + 12); return; }
  const off = t + u32(e + 8);
  if (off >= t && off + size <= end) buf.fill(0, off, off + size);
}
function blankPrivateIn(buf, t, d, end, u16, u32) {
  if (d + 2 > end) return;
  const n = u16(d);
  if (n > 1000 || d + 2 + n * 12 > end) return;
  for (let i = 0; i < n; i++) {
    const e = d + 2 + i * 12;
    if (PRIVATE_EXIF.has(u16(e))) blankEntry(buf, t, e, end, u16, u32);
  }
}

// IPTC (JPEG APP13, Photoshop "8BIM" resource 0x0404): every dataset's value becomes spaces (by-line, copyright,
// contact, city, caption...), keeping the lengths
function blankIptc(buf, start, end) {
  for (let r = buf.indexOf('8BIM', start, 'latin1'); r !== -1 && r + 12 <= end; r = buf.indexOf('8BIM', r + 4, 'latin1')) {
    if (buf.readUInt16BE(r + 4) !== 0x0404) continue;
    const nameLen = buf[r + 6], nameEnd = r + 7 + nameLen + ((nameLen + 1) & 1);
    if (nameEnd + 4 > end) break;
    const size = buf.readUInt32BE(nameEnd), data = nameEnd + 4, stop = Math.min(end, data + size);
    for (let d = data; d + 5 <= stop && buf[d] === 0x1c;) {
      const len = buf.readUInt16BE(d + 3);
      if (len & 0x8000) break;   // extended datasets are not used by cameras or phones
      buf.fill(0x20, d + 5, Math.min(stop, d + 5 + len));
      d += 5 + len;
    }
  }
}
// Empties the GPS directory at g (offsets inside it count from the TIFF start t)
function clearGpsDir(buf, t, g, end, u16, u32) {
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
  return gn > 0;
}

// Blanks XMP location tags (exif:GPS…) between start and end, keeping the length
// Also blanks who made it and what identifies the camera (serial numbers, owner, creator, rights, contact details,
// person and face regions, location names); returns true only when there was GPS
const XMP_PRIVATE = '(?:exif(?:EX)?:GPS\\w*|aux:SerialNumber|aux:LensSerialNumber|aux:OwnerName|exifEX:BodySerialNumber|exifEX:LensSerialNumber|exifEX:CameraOwnerName|dc:creator|dc:rights|xmpRights:\\w+|photoshop:(?:AuthorsPosition|City|State|Country|Credit|Source|CaptionWriter)|Iptc4xmpCore:\\w+|Iptc4xmpExt:\\w+|mwg-rs:Regions|MP:RegionInfo|plus:\\w+)';
const XMP_ATTR_D = new RegExp(`(${XMP_PRIVATE}\\s*=\\s*")([^"]*)(")`, 'g');
const XMP_ATTR_S = new RegExp(`(${XMP_PRIVATE}\\s*=\\s*')([^']*)(')`, 'g');
const XMP_ELEMENT = new RegExp(`(<(${XMP_PRIVATE})\\b[^>]*>)([\\s\\S]*?)(<\\/\\2>)`, 'g');
function blankXmpGps(buf, start, end) {
  const text = buf.toString('latin1', start, end);
  const blank = (s) => ' '.repeat(s.length);
  const out = text
    .replace(XMP_ATTR_D, (m, a, v, b) => a + blank(v) + b)
    .replace(XMP_ATTR_S, (m, a, v, b) => a + blank(v) + b)
    .replace(XMP_ELEMENT, (m, open, tag, v, close) => open + blank(v) + close);
  if (out === text) return false;
  buf.write(out, start, 'latin1');
  return /exif(?:EX)?:GPS/.test(text);
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
    if (marker === 0xed) blankIptc(buf, body, end);   // APP13: IPTC
    if (marker === 0xfe) buf.fill(0x20, body, end);   // COM: a free-text comment (some editors write the author here)
    s += 2 + len;
  }
  return removed;
}

function png(buf) {
  let removed = false;
  for (let c = 8; c + 12 <= buf.length;) {
    const len = buf.readUInt32BE(c), type = buf.toString('latin1', c + 4, c + 8), data = c + 8, end = data + len;
    if (end + 4 > buf.length) break;
    const isXmp = type === 'iTXt' && buf.toString('latin1', data, data + 17) === 'XML:com.adobe.xmp';
    if (type === 'eXIf') removed = emptyGps(buf, isTiffAt(buf, data) ? data : data + 6, end) || removed;
    // XMP in an uncompressed iTXt chunk
    if (isXmp) removed = blankXmpGps(buf, data, end) || removed;
    // PNG chunks carry a checksum of their type and data (private details may have changed even without GPS)
    if (type === 'eXIf' || isXmp) buf.writeUInt32BE(zlib.crc32(buf.subarray(c + 4, end)) >>> 0, end);
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
  // Camera RAW files built on TIFF (CR2, NEF, ARW, DNG, ORF, RW2, PEF...): the GPS sits in the file's own first directory
  if ((buf[0] === 0x49 && buf[1] === 0x49) || (buf[0] === 0x4d && buf[1] === 0x4d)) removed = emptyGps(buf, 0, buf.length, { loose: true }) || removed;
  // Canon CR3: GPS is the CMT4 box (a TIFF block whose first directory is the GPS one)
  const cmt4 = buf.indexOf('CMT4', 0, 'latin1');
  if (cmt4 > 0 && cmt4 < 1048576) removed = emptyGps(buf, cmt4 + 4, buf.length, { loose: true, gpsAtRoot: true }) || removed;
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
export function stripLocation(input, { inPlace = false } = {}) {
  // inPlace: change the given buffer (an upload that's ours anyway) instead of a copy, so a big RAW file isn't held twice
  const buf = inPlace && Buffer.isBuffer(input) ? input : Buffer.from(input);
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
