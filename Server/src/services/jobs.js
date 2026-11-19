import mongoose from 'mongoose';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { config } from '../config/env.js';
import { Album } from '../models/Album.js';
import { Membership } from '../models/Membership.js';
import { GroupMember } from '../models/GroupMember.js';
import { Photo } from '../models/Photo.js';
import { User } from '../models/User.js';
import { sendEmail } from './emailService.js';
import { closingHtml, recapHtml } from './emailTemplates.js';
import { saveFile, listFolders, removePrefix } from './storageService.js';
import { unsubscribeUrl } from '../controllers/privacyController.js';
import { notify } from './notifyService.js';

// Jobs the server runs by itself, once an hour (see server.js). Each one claims its work in the
// database before doing it, so nothing is sent twice even if the server restarts mid-way.
//  - "An album is about to close" emails (the switch under "Email me when")
//  - The weekly recap emails (the same, off by default)
//  - Tidying up: unconfirmed sign-ups after 7 days, join requests left waiting for 30 days
//  - A daily backup of the database, kept for a week, plus one per month (in the photo bucket)

const HOUR = 3600000, DAY = 24 * HOUR;
const gzip = promisify(zlib.gzip);

// Who is in an album (members, and the people in its friend group)
async function peopleIn(album) {
  const [rows, group] = await Promise.all([
    Membership.find({ album: album._id, via: { $ne: 'group' } }, 'user'),
    album.group ? GroupMember.find({ group: album.group }, 'user') : [],
  ]);
  return [...new Set([...rows, ...group].map((r) => String(r.user)))];
}
const mail = async (list) => {
  const results = await Promise.allSettled(list.map((m) => sendEmail(m)));
  results.filter((r) => r.status === 'rejected').forEach((r) => console.error(`Job email failed: ${r.reason?.message}`));
  return results.filter((r) => r.status === 'fulfilled').length;
};

// ---- "Your album closes soon": once per album, when uploads close within the next 12 hours ----
export async function closingSoon(now = new Date()) {
  const albums = await Album.find({ endsAt: { $gt: now, $lte: new Date(now.getTime() + 12 * HOUR) }, closingNoticeAt: null }).limit(50);
  let sent = 0;
  for (const a of albums) {
    // Claim it first: only one run ever sends for an album
    const claimed = await Album.findOneAndUpdate({ _id: a._id, closingNoticeAt: null }, { closingNoticeAt: now });
    if (!claimed) continue;
    const ids = await peopleIn(a);
    // Everyone in it gets it in their inbox too (the email only goes to those who didn't turn it off)
    for (const u of ids) await notify({ user: u, type: 'closing', album: a._id });
    const people = await User.find({ _id: { $in: ids }, emailVerified: true, 'notify.closing': { $ne: false } }, 'name email').limit(300);
    const hours = Math.max(1, Math.round((a.endsAt - now) / HOUR));
    const link = `${config.frontendUrl}/albums.html?album=${a.id}`;
    sent += await mail(people.map((p) => {
      const unsubscribe = unsubscribeUrl(p, 'closing');
      return { to: p.email, subject: `Last chance to add your photos to ${a.name}`, html: closingHtml(p, a, hours, link, unsubscribe), unsubscribe };
    }));
  }
  return sent;
}

// ---- The weekly recap: new photos from other people in your albums this past week ----
export async function weeklyRecap(now = new Date()) {
  const { albumIdsOf } = await import('../controllers/albumController.js');
  const due = await User.find({ emailVerified: true, 'notify.recap': true, $or: [{ recapAt: null }, { recapAt: { $lt: new Date(now - 7 * DAY) } }] }, 'name email').limit(100);
  let sent = 0;
  for (const u of due) {
    const claimed = await User.findOneAndUpdate({ _id: u._id, $or: [{ recapAt: null }, { recapAt: { $lt: new Date(now - 7 * DAY) } }] }, { recapAt: now });
    if (!claimed) continue;
    const ids = await albumIdsOf(u._id);
    if (!ids.length) continue;
    const rows = await Photo.aggregate([
      { $match: { album: { $in: ids }, uploader: { $ne: u._id }, deletedAt: null, createdAt: { $gte: new Date(now - 7 * DAY) } } },
      { $group: { _id: '$album', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]);
    const total = rows.reduce((t, r) => t + r.n, 0);
    if (!total) continue;   // nothing new: no email
    const names = new Map((await Album.find({ _id: { $in: rows.slice(0, 5).map((r) => r._id) } }, 'name')).map((a) => [String(a._id), a.name]));
    const top = rows.slice(0, 5).map((r) => ({ name: names.get(String(r._id)) || 'An album', n: r.n }));
    const unsubscribe = unsubscribeUrl(u, 'recap');
    sent += await mail([{ to: u.email, subject: `${total} new photo${total === 1 ? '' : 's'} in your Momento albums this week`, html: recapHtml(u, total, top, `${config.frontendUrl}/albums.html`, unsubscribe), unsubscribe }]);
  }
  return sent;
}

// ---- Tidying up ----
export async function tidy(now = new Date()) {
  const { deleteAccount } = await import('./accountService.js');
  // Sign-ups never confirmed after 7 days, that never made an album or added a photo
  let accounts = 0;
  const stale = await User.find({ emailVerified: false, createdAt: { $lt: new Date(now - 7 * DAY) } }).limit(50);
  for (const u of stale) {
    if (await Album.exists({ host: u._id }) || await Photo.exists({ uploader: u._id })) continue;
    await deleteAccount(u);
    accounts++;
  }
  // Requests to join that nobody answered in 30 days (declined ones stay: the decline sticks)
  const r = await Album.updateMany({ 'requests.status': 'pending', 'requests.at': { $lt: new Date(now - 30 * DAY) } },
    { $pull: { requests: { status: 'pending', at: { $lt: new Date(now - 30 * DAY) } } } });
  // Background zips older than 3 days
  const { removeExpiredZips } = await import('./zipService.js');
  const zips = await removeExpiredZips(now);
  // Expired logins come off every account
  const sessions = await User.updateMany({ 'sessions.expiresAt': { $lte: now } }, { $pull: { sessions: { expiresAt: { $lte: now } } } });
  // Account deletions that stopped halfway (the server restarted, storage was down) are finished
  let resumed = 0;
  for (const u of await User.find({ deletingAt: { $lt: new Date(now - 10 * 60000) } }).select('+deletingAt').limit(20)) {
    await deleteAccount(u);
    resumed++;
  }
  // Resolved reports older than a year go
  const { Report } = await import('../models/Report.js');
  const reports = await Report.deleteMany({ status: { $ne: 'open' }, updatedAt: { $lt: new Date(now - 365 * DAY) } });
  return { accounts, requests: r.modifiedCount, zips, sessions: sessions.modifiedCount, resumed, reports: reports.deletedCount };
}

// ---- Daily backup: every collection, as compressed JSON lines, into the photo storage ----
// backups/day-<Mon..Sun>/ is overwritten each week (the last 7 days); backups/month-<YYYY-MM>/ keeps
// the last one of every month. Restore with scripts/restoreBackup.js.
const JobState = mongoose.models.JobState || mongoose.model('JobState', new mongoose.Schema({ _id: String, at: Date }, { versionKey: false }));
export async function backup(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  // Once a day, whichever hourly run gets there first
  let claimed = (await JobState.updateOne({ _id: 'backup', at: { $lt: new Date(day) } }, { at: now })).modifiedCount === 1;
  if (!claimed && !(await JobState.exists({ _id: 'backup' }))) {
    try { await JobState.create({ _id: 'backup', at: now }); claimed = true; } catch { /* another run got there first */ }
  }
  if (!claimed) return null;
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  const month = now.toISOString().slice(0, 7);
  const { EJSON } = mongoose.mongo.BSON;
  const db = mongoose.connection.db;
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.'));
  let docs = 0;
  for (const name of names) {
    const lines = [];
    for await (const d of db.collection(name).find({})) { lines.push(EJSON.stringify(d, { relaxed: false })); docs++; }
    const file = await gzip(Buffer.from(lines.join('\n')));
    await saveFile(`backups/day-${weekday}/${name}.jsonl.gz`, file, 'application/gzip');
    await saveFile(`backups/month-${month}/${name}.jsonl.gz`, file, 'application/gzip');
  }
  await saveFile(`backups/day-${weekday}/_info.json`, Buffer.from(JSON.stringify({ at: now, collections: names, documents: docs }, null, 2)), 'application/json');
  // Monthly backups are kept 12 months, so a deleted account is gone from every backup within a year
  const oldest = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1)).toISOString().slice(0, 7);
  let expired = 0;
  for (const folder of await listFolders('backups/')) {
    const m = /backups\/month-(\d{4}-\d{2})\/$/.exec(folder);
    if (m && m[1] < oldest) { await removePrefix(folder); expired++; }
  }
  return { collections: names.length, documents: docs, expiredMonths: expired };
}

// Runs every job once (each catches its own errors)
export async function runJobs() {
  const step = async (name, fn) => {
    try {
      const r = await fn();
      if (r && (typeof r !== 'object' || Object.values(r).some(Boolean))) console.log(`Job ${name}: ${JSON.stringify(r)}`);
    } catch (err) { console.error(`Job ${name} failed: ${err.message}`); }
  };
  await step('closing-soon emails', () => closingSoon());
  await step('weekly recaps', () => weeklyRecap());
  await step('tidy', () => tidy());
  await step('backup', () => backup());
}
