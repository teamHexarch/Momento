import crypto from 'node:crypto';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import { ZipArchive } from 'archiver';
import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { Photo } from '../models/Photo.js';
import { User } from '../models/User.js';
import { openPhoto, saveStream, removeFile } from './storageService.js';
import { sendEmail } from './emailService.js';
import { zipReadyHtml } from './emailTemplates.js';

// Big albums are zipped in the background instead of while the browser waits: the zip goes into the
// photo storage, and the person gets an email with a link (good for 3 days). One zip is built at a
// time, so a few big requests at once don't use up the server's memory.

// (ZIP_BIG_PHOTOS lowers the photo count, for tests)
export const BIG_PHOTOS = Number(process.env.ZIP_BIG_PHOTOS) || 300, BIG_BYTES = 1024 ** 3;
const KEEP_MS = 3 * 86400000;

const zipSchema = new mongoose.Schema({
  album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token: { type: String, required: true },
  key: String,
  name: String,
  status: { type: String, enum: ['queued', 'building', 'ready', 'failed'], default: 'queued' },
  photos: Number,
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
zipSchema.index({ album: 1, user: 1, status: 1 });
export const ZipFile = mongoose.models.ZipFile || mongoose.model('ZipFile', zipSchema);

// Is this album too big to zip while the browser waits?
export async function isBig(albumId, hidden = []) {
  const [s] = await Photo.aggregate([
    { $match: { album: albumId, _id: { $nin: hidden }, deletedAt: null } },
    { $group: { _id: null, n: { $sum: 1 }, bytes: { $sum: '$size' } } },
  ]);
  return !!s && (s.n > BIG_PHOTOS || s.bytes > BIG_BYTES);
}

// Starts (or reuses) a background zip for this person and album
export async function requestZip(album, user, hidden = []) {
  const busy = await ZipFile.findOne({ album: album._id, user: user._id, status: { $in: ['queued', 'building'] } });
  if (busy) return busy;
  const safe = album.name.replace(/[^\w\- ]+/g, '').trim() || 'album';
  const z = await ZipFile.create({ album: album._id, user: user._id, token: crypto.randomBytes(16).toString('hex'), name: `${safe}.zip`, expiresAt: new Date(Date.now() + KEEP_MS) });
  queue.push({ id: z._id, hidden });
  pump();
  return z;
}

const queue = [];
let running = false;
async function pump() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const job = queue.shift();
      await build(job).catch((err) => console.error(`Background zip failed: ${err.message}`));
    }
  } finally { running = false; }
}
// For tests: wait until the queue is empty
export const idle = async () => { while (running || queue.length) await new Promise((r) => setTimeout(r, 50)); };

async function build({ id, hidden }) {
  const z = await ZipFile.findByIdAndUpdate(id, { status: 'building' }, { returnDocument: 'after' }).populate('album', 'name');
  if (!z?.album) return;
  const photos = await Photo.find({ album: z.album._id, _id: { $nin: hidden }, deletedAt: null }, 'storageKey').sort({ createdAt: 1 });
  const key = `zips/${z.album._id}/${z.token}.zip`;
  try {
    const zip = new ZipArchive({ store: true });   // photos are already compressed
    const body = new PassThrough();
    zip.pipe(body);
    const saving = saveStream(key, body, 'application/zip');
    for (const [i, p] of photos.entries()) {
      const ext = p.storageKey.slice(p.storageKey.lastIndexOf('.'));
      zip.append(await openPhoto(p.storageKey), { name: `${String(i + 1).padStart(4, '0')}${ext}` });
      await once(zip, 'entry');
    }
    await zip.finalize();
    await saving;
    await ZipFile.updateOne({ _id: z._id }, { status: 'ready', key, photos: photos.length });
  } catch (err) {
    await ZipFile.updateOne({ _id: z._id }, { status: 'failed' });
    await removeFile(key).catch(() => {});
    throw err;
  }
  const user = await User.findById(z.user, 'name email');
  const link = `${config.publicUrl}/api/albums/${z.album._id}/zip/${z.token}`;
  if (user) await sendEmail({ to: user.email, subject: `Your download of ${z.album.name} is ready`, html: zipReadyHtml(user, z.album.name, photos.length, link) })
    .catch((err) => console.error(`Zip email failed: ${err.message}`));
}

// The hourly tidy: zips older than 3 days go (file and record)
export async function removeExpiredZips(now = new Date()) {
  const old = await ZipFile.find({ expiresAt: { $lt: now } }).limit(100);
  for (const z of old) {
    if (z.key) await removeFile(z.key).catch(() => {});
    await z.deleteOne();
  }
  return old.length;
}
