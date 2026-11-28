// Restores the database from one of the server's own backups (see src/services/jobs.js):
// backups/day-<YYYY-MM-DD>/ (the last 14 days; older backups may be day-Mon … day-Sun) or backups/month-<YYYY-MM>/.
//
// Where it reads from: the backup bucket (BACKUP_BUCKET) with its own READ-ONLY key (BACKUP_READ_ACCESS_KEY_ID /
// BACKUP_READ_SECRET_ACCESS_KEY: s3:GetObject and s3:ListBucket on that bucket, nothing else; the server's own backup
// key can only add files). Without BACKUP_BUCKET, the older backups in the photo storage.
//
//   node scripts/restoreBackup.js day-2026-11-28                                   (shows what's in it)
//   node scripts/restoreBackup.js day-2026-11-28 --apply --into momento-restore-test --check --drop
//       restores into a spare database on the same cluster, checks every collection's count against the backup,
//       then deletes the spare database (the restore test, audit: "restore into a spare Atlas database once")
//   node scripts/restoreBackup.js day-2026-11-28 --apply --into-live [--only albums,photos]
//       REPLACES those collections in the live database. Can't be undone: take a fresh backup first.
// On the server: sudo docker compose -f /opt/momento/Server/deploy/docker-compose.yml exec api node scripts/restoreBackup.js …
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import mongoose from 'mongoose';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const [folder] = args.filter((a, i) => !a.startsWith('--') && !['--only', '--into'].includes(args[i - 1]));
const apply = flag('--apply'), intoLive = flag('--into-live'), into = value('--into');
const only = value('--only') ? new Set(value('--only').split(',')) : null;
const fail = (message) => { console.error(message); process.exit(1); };
if (!/^(day-\d{4}-\d{2}-\d{2}|day-[A-Z][a-z]{2}|month-\d{4}-\d{2})$/.test(folder || '')) {
  fail('Say which backup: day-YYYY-MM-DD (the last 14 days), or month-YYYY-MM. Example: node scripts/restoreBackup.js day-2026-11-28');
}
if (apply && !into && !intoLive) fail('Say where to restore: --into <spare database name> (safe), or --into-live (replaces the live data).');
if (into && intoLive) fail('Either --into <name> or --into-live, not both.');
if (into && !/^[A-Za-z0-9_-]{1,38}$/.test(into)) fail('--into needs a database name (letters, numbers, - and _).');

// ---- Reading the backup ----
let read;
if (process.env.BACKUP_BUCKET) {
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const id = process.env.BACKUP_READ_ACCESS_KEY_ID, secret = process.env.BACKUP_READ_SECRET_ACCESS_KEY;
  if (!id || !secret) fail('Set BACKUP_READ_ACCESS_KEY_ID and BACKUP_READ_SECRET_ACCESS_KEY (the read-only backup key) to read from BACKUP_BUCKET.');
  const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-southeast-2', credentials: { accessKeyId: id, secretAccessKey: secret } });
  read = async (key) => Buffer.from(await (await s3.send(new GetObjectCommand({ Bucket: process.env.BACKUP_BUCKET, Key: key }))).Body.transformToByteArray());
  console.log(`Reading from the backup bucket "${process.env.BACKUP_BUCKET}" with the read-only key.`);
} else {
  const { openPhoto } = await import('../src/services/storageService.js');
  read = async (key) => { const chunks = []; for await (const c of await openPhoto(key)) chunks.push(c); return Buffer.concat(chunks); };
  console.log('Reading from the photo storage (BACKUP_BUCKET isn’t set).');
}
const gunzip = promisify(zlib.gunzip);

await mongoose.connect(process.env.MONGODB_URI, into ? { dbName: into } : {});
const db = mongoose.connection.db;
const live = mongoose.connection.getClient().db().databaseName;
if (into && db.databaseName === live) fail(`"${into}" is the live database. Choose another name.`);
if (into && (await db.listCollections({}, { nameOnly: true }).toArray()).length) fail(`The database "${into}" isn't empty. Choose an unused name (or drop it first).`);

const { EJSON } = mongoose.mongo.BSON;
const info = JSON.parse((await read(`backups/${folder}/_info.json`).catch(() => Buffer.from('null'))).toString() || 'null');
if (!info) fail(`No backup found in backups/${folder}/ (its _info.json is missing).`);
console.log(`Backup from ${info.at}: ${info.collections.length} collections, ${info.documents} documents`
  + (apply ? `  (RESTORING into ${into ? `the spare database "${into}"` : `the LIVE database "${db.databaseName}"`})` : '  (dry run)'));
const counts = {};
for (const name of info.collections) {
  if (only && !only.has(name)) continue;
  const text = (await gunzip(await read(`backups/${folder}/${name}.jsonl.gz`))).toString();
  const docs = text ? text.split('\n').map((l) => EJSON.parse(l, { relaxed: false })) : [];
  counts[name] = docs.length;
  console.log(`  ${name.padEnd(28)} ${docs.length} documents`);
  if (!apply) continue;
  const coll = db.collection(name);
  if (intoLive) await coll.deleteMany({});
  if (docs.length) await coll.insertMany(docs, { ordered: false });
}

// ---- Checking: every collection has as many documents as the backup ----
if (apply && flag('--check')) {
  let bad = 0, total = 0;
  for (const [name, want] of Object.entries(counts)) {
    const got = await db.collection(name).countDocuments();
    total += got;
    if (got !== want) { bad++; console.log(`  MISMATCH ${name}: ${got} in the database, ${want} in the backup`); }
  }
  const expected = only ? Object.values(counts).reduce((a, b) => a + b, 0) : info.documents;
  console.log(bad || total !== expected ? `Restore check FAILED (${bad} collection(s) differ; ${total} of ${expected} documents).`
    : `Restore check passed: all ${Object.keys(counts).length} collections, ${total} documents, match the backup.`);
  if (bad || total !== expected) process.exitCode = 1;
}
if (apply && into && flag('--drop')) { await db.dropDatabase(); console.log(`The spare database "${into}" was deleted.`); }
console.log(apply ? 'Done.' : 'Nothing changed. Add --apply --into <spare database> to restore.');
await mongoose.disconnect();
