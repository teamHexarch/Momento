// Decodes one iPhone/Samsung HEIC off the main thread (services/imageService.js starts it). Decoding is slow,
// all-at-once WebAssembly work: on the main thread it froze every other request while it ran.
// In: { id, buffer, maxPixels }. Out: { id, width, height, data } (RGBA pixels, upright) or { id, error }.
import { parentPort } from 'node:worker_threads';
import decode from 'heic-decode';

parentPort.on('message', async ({ id, buffer, maxPixels }) => {
  try {
    const images = await decode.all({ buffer: Buffer.from(buffer) });
    try {
      const first = images[0];
      if (!first?.width || !first?.height) throw new Error('HEIC has no picture');
      // The size comes from the file's structure, checked before any pixels are decoded
      if (first.width * first.height > maxPixels) throw new Error(`HEIC too large: ${first.width} x ${first.height}`);
      const { width, height, data } = await first.decode();   // libheif applies the photo's rotation
      parentPort.postMessage({ id, width, height, data }, [data.buffer]);
    } finally { images.dispose?.(); }
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});
