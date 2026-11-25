import sharp from 'sharp';
import { HttpError } from '../utils/httpError.js';
import { stripLocation } from '../utils/gpsStrip.js';

const TYPES = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
const MAX_PIXELS = 100_000_000;

// ---- Camera RAW files (Canon, Nikon, Sony, Fujifilm, Olympus/OM, Panasonic, Pentax, Leica, Hasselblad...) ----
// What people see comes from the full-size JPEG every camera stores inside its RAW files. Since 2026-11-25 the RAW
// itself isn't kept: that JPEG (up to 2560 px) is stored as the photo, and the 30-50 MB RAW is deleted after checking.
export const RAW_TYPES = {
  cr2: 'image/x-canon-cr2', cr3: 'image/x-canon-cr3', crw: 'image/x-canon-crw',
  nef: 'image/x-nikon-nef', nrw: 'image/x-nikon-nrw',
  arw: 'image/x-sony-arw', srf: 'image/x-sony-srf', sr2: 'image/x-sony-sr2',
  raf: 'image/x-fuji-raf', dng: 'image/x-adobe-dng',
  orf: 'image/x-olympus-orf', rw2: 'image/x-panasonic-rw2', raw: 'image/x-panasonic-raw', rwl: 'image/x-leica-rwl',
  pef: 'image/x-pentax-pef', srw: 'image/x-samsung-srw', x3f: 'image/x-sigma-x3f',
  '3fr': 'image/x-hasselblad-3fr', fff: 'image/x-hasselblad-fff', iiq: 'image/x-phaseone-iiq',
  erf: 'image/x-epson-erf', mef: 'image/x-mamiya-mef', mos: 'image/x-leaf-mos', mrw: 'image/x-minolta-mrw',
  kdc: 'image/x-kodak-kdc', dcr: 'image/x-kodak-dcr',
};
const extOf = (name = '') => { const s = String(name).toLowerCase(); const i = s.lastIndexOf('.'); return i < 0 ? '' : s.slice(i + 1); };
export const isRawName = (name) => Object.hasOwn(RAW_TYPES, extOf(name));

// The file really is a RAW (not just named like one): the first bytes every RAW format starts with
function looksRaw(b) {
  const at = (i, s) => b.length >= i + s.length && b.toString('latin1', i, i + s.length) === s;
  return at(0, 'II*\0') || at(0, 'MM\0*')                              // TIFF based: CR2, NEF, ARW, DNG, PEF, SRW, 3FR, IIQ...
    || at(0, 'IIRO') || at(0, 'IIRS') || at(0, 'MMOR') || at(0, 'IIU\0') // Olympus ORF, Panasonic RW2
    || at(0, 'FUJIFILMCCD-RAW') || (at(4, 'ftyp') && at(8, 'crx '))       // Fujifilm RAF, Canon CR3
    || at(0, 'FOVb') || at(0, '\0MRM') || at(6, 'HEAPCCDR');              // Sigma X3F, Minolta MRW, Canon CRW
}

// Orientation from the RAW's own TIFF block (most embedded previews don't carry one)
function tiffOrientation(b, t) {
  if (t < 0 || t + 8 > b.length) return 0;
  const le = b[t] === 0x49 && b[t + 1] === 0x49;
  if (!le && !(b[t] === 0x4d && b[t + 1] === 0x4d)) return 0;
  const u16 = (o) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o)), u32 = (o) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
  const ifd = t + u32(t + 4);
  if (ifd + 2 > b.length) return 0;
  const n = u16(ifd);
  if (n > 1000 || ifd + 2 + n * 12 > b.length) return 0;
  for (let i = 0; i < n; i++) if (u16(ifd + 2 + i * 12) === 0x0112) return u16(ifd + 2 + i * 12 + 8);
  return 0;
}
function rawOrientation(b) {
  const cmt1 = b.indexOf('CMT1', 0, 'latin1');   // Canon CR3 keeps its TIFF block in a CMT1 box
  return tiffOrientation(b, 0) || (cmt1 > 0 && cmt1 < 65536 ? tiffOrientation(b, cmt1 + 4) : 0);
}
const ROTATE = { 3: 180, 6: 90, 8: 270 };

// The biggest colour JPEG inside the RAW (the camera's full-size preview). Only headers are read for each
// candidate, so this is quick even for a 100 MB file.
const SOI = Buffer.from([0xff, 0xd8, 0xff]);
async function embeddedJpeg(b) {
  let best = null, tries = 0;
  for (let i = b.indexOf(SOI); i !== -1 && tries < 80; i = b.indexOf(SOI, i + 3)) {
    tries++;
    try {
      const m = await sharp(b.subarray(i), { failOn: 'none', limitInputPixels: MAX_PIXELS }).metadata();
      if (m.format !== 'jpeg' || m.channels !== 3 || !m.width || !m.height) continue;
      if (m.width / m.height > 4 || m.height / m.width > 4) continue;
      if (!best || m.width * m.height > best.area) best = { at: i, area: m.width * m.height, orientation: m.orientation };
    } catch { /* not a JPEG start, just bytes that look like one */ }
  }
  return best && { jpeg: b.subarray(best.at), orientation: best.orientation };
}

// The 320px-wide "mini" picture shown in grids: from an upright, metadata-free picture (the preview), so it
// carries no EXIF or GPS; WebP at quality 75, never enlarged
export const MINI_WIDTH = 320;
export const makeMini = (input) => sharp(input, { limitInputPixels: MAX_PIXELS }).autoOrient()
  .resize({ width: MINI_WIDTH, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();

// Validate the full image before preserving original bytes for downloads.
// Generated previews apply orientation and discard private metadata.
// The decoder detects the format from bytes, never the filename or client MIME (a RAW must also start
// with a real RAW header). Encoding the preview decodes all of the pixel data, so a corrupt or fake file
// fails here before the caller is allowed to persist anything.
// opts.name: the file's name (for RAW files); opts.inPlace: the buffer is ours to change (uploads), so
// removing GPS doesn't need a second copy of a big file in memory.
// When it was taken (the camera's DateTimeOriginal, else CreateDate), or undefined. Never fails an upload.
export async function takenAtOf(buffer) {
  try {
    const exifr = (await import('exifr')).default;
    const tags = await exifr.parse(buffer, { pick: ['DateTimeOriginal', 'CreateDate'], gps: false, xmp: false, icc: false, iptc: false });
    const at = tags?.DateTimeOriginal || tags?.CreateDate;
    return at instanceof Date && !Number.isNaN(at.getTime()) && at.getFullYear() > 1990 && at <= new Date(Date.now() + 86400000) ? at : undefined;
  } catch { return undefined; }
}

// HEIC/HEIF from iPhones (HEVC inside): sharp's built-in HEIF support only reads AVIF, so these are turned into a
// JPEG first (heic-convert, pure JavaScript) to make the preview and thumbnails. The HEIC itself is kept as the original.
const isHeicBytes = (b) => b.length > 12 && b.toString('latin1', 4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(b.toString('latin1', 8, 12));
async function heicToJpeg(buffer) {
  const convert = (await import('heic-convert')).default;
  return Buffer.from(await convert({ buffer, format: 'JPEG', quality: 0.92 }));
}

export const PREVIEW_EDGE = 2560;
export async function sanitizePhoto(input, { name = '', inPlace = false } = {}) {
  const takenAt = await takenAtOf(input);
  // The original is kept as uploaded, minus where it was taken (GPS); see utils/gpsStrip.js
  const { buffer } = stripLocation(input, { inPlace });
  const raw = isRawName(name) && looksRaw(buffer);
  try {
    let source = buffer, rotate = 0;
    // An iPhone HEIC sharp can't read: decoded to JPEG first (it keeps the photo's orientation in its pixels)
    if (!raw && isHeicBytes(buffer)) {
      try { await sharp(buffer).metadata().then((m) => { if (m.format !== 'heif') throw new Error('not heif'); return sharp(buffer).resize(8).toBuffer(); }); }
      catch { source = await heicToJpeg(buffer); }
    }
    if (raw) {
      const found = await embeddedJpeg(buffer);
      if (found) {
        source = found.jpeg;
        if (!found.orientation) rotate = ROTATE[rawOrientation(buffer)] || 0;
      }
      // No preview inside (rare, e.g. some DNGs): the TIFF reader may still manage
    }
    const image = sharp(source, { animated: !raw, limitInputPixels: MAX_PIXELS, failOn: raw ? 'none' : 'warning' });
    const metadata = await image.metadata();
    if (!raw && !TYPES[metadata.format] && metadata.format !== 'heif' && source === buffer) throw new Error('Unsupported format');
    const animated = !raw && metadata.pages > 1;
    const format = !raw && (metadata.hasAlpha || animated || metadata.format === 'webp') ? 'webp' : 'jpeg';
    const output = (rotate ? image.rotate(rotate) : image.autoOrient())
      .resize({ width: PREVIEW_EDGE, height: PREVIEW_EDGE, fit: 'inside', withoutEnlargement: true });
    if (format === 'jpeg') output.jpeg({ quality: 82, mozjpeg: true });
    else output.webp({ quality: 82 });
    const preview = await output.toBuffer();
    // The thumbnail comes from the preview (already small and upright): much quicker than the original
    const thumbnail = await sharp(preview).resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
    // The mini (320px wide, same shape) for grids and strips, where the 600px thumbnail is far bigger than shown
    const mini = await makeMini(preview);
    // A camera RAW: the JPEG preview becomes the photo itself (the RAW is not kept)
    if (raw) return { buffer: preview, mimeType: 'image/jpeg', size: preview.length, thumbnail, mini, preview, previewMimeType: TYPES[format], raw, rawDropped: true, ext: '.jpg', takenAt };
    const mimeType = source !== buffer ? 'image/heif' : TYPES[metadata.format] || (metadata.compression === 'av1' ? 'image/avif' : 'image/heif');
    return { buffer, mimeType, size: buffer.length, thumbnail, mini, preview, previewMimeType: TYPES[format], raw, ext: '', takenAt };
  } catch {
    throw new HttpError(400, raw
      ? 'This RAW file could not be read. Try exporting it as JPEG and uploading again.'
      : 'This photo could not be processed safely. Try exporting it as JPEG or PNG and uploading again.', 'unreadable');
  }
}
