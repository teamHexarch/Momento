import sharp from 'sharp';
import { HttpError } from '../utils/httpError.js';

const TYPES = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

// Decode and re-encode before storage. Never retain EXIF, XMP or IPTC, which
// can contain location data. Apply orientation before discarding metadata.
// The decoder detects the format from bytes, never the filename or client MIME.
// Reading metadata alone is insufficient: toBuffer must decode the pixel data
// successfully before the caller is allowed to persist anything.
export async function sanitizePhoto(buffer) {
  try {
    const image = sharp(buffer, { animated: true, limitInputPixels: 100_000_000, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!TYPES[metadata.format] && metadata.format !== 'heif') throw new Error('Unsupported format');
    // Full-resolution download: no additional lossy encoding. PNG for stills,
    // lossless WebP for animation. Orientation and metadata removal still apply.
    const animated = metadata.pages > 1;
    const original = image.clone().autoOrient();
    const data = await (animated ? original.webp({ lossless: true }) : original.png()).toBuffer();
    const format = metadata.hasAlpha || animated || metadata.format === 'webp' ? 'webp' : 'jpeg';
    const output = image.autoOrient().resize({ width: 2500, height: 2500, fit: 'inside', withoutEnlargement: true });
    if (format === 'jpeg') output.jpeg({ quality: 82, mozjpeg: true });
    else output.webp({ quality: 82 });
    const preview = await output.toBuffer();
    // A still thumbnail keeps album grids small, including for animated uploads.
    const thumbnail = await sharp(data).resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
    return { buffer: data, mimeType: animated ? 'image/webp' : 'image/png', size: data.length, thumbnail, preview, previewMimeType: TYPES[format] };
  } catch {
    throw new HttpError(400, 'This photo could not be processed safely. Try exporting it as JPEG or PNG and uploading again.');
  }
}
