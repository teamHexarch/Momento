import { createHash, randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { saveStream, removeFile } from './storageService.js';

// Multer starts the private write while bytes are arriving. Backpressure bounds memory per file.
export const quarantineStorage = {
  _handleFile(req, file, done) {
    const rawKey = 'quarantine/' + randomUUID();
    const hash = createHash('sha256');
    let size = 0;
    const counter = new Transform({ transform(chunk, encoding, callback) {
      size += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    } });
    const interrupted = () => counter.destroy(new Error('Upload interrupted'));
    // (one listener per file: up to 30 files in an upload)
    if (req.getMaxListeners() < 40) req.setMaxListeners(40);
    req.once('aborted', interrupted);
    const write = saveStream(rawKey, counter, 'application/octet-stream').catch(error => {
      counter.destroy(error);
      throw error;
    });
    Promise.allSettled([pipeline(file.stream, counter), write]).then(async results => {
      const failure = results.find(r => r.status === 'rejected');
      if (failure) {
        await removeFile(rawKey);
        throw failure.reason;
      }
      return { rawKey, hash: hash.digest('hex'), size };
    }).finally(() => req.off('aborted', interrupted)).then(info => done(null, info), done);
  },
  _removeFile(req, file, done) {
    removeFile(file.rawKey).then(() => done(null), done);
  },
};
