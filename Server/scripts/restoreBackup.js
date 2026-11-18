// Restores the database from one of the server's own backups (see src/services/jobs.js):
// backups/day-<Mon..Sun>/ (the last 7 days) or backups/month-<YYYY-MM>/, in the photo storage.
//
//   node --env-file=.env scripts/restoreBackup.js day-Mon                 (shows what's in it)
//   node --env-file=.env scripts/restoreBackup.js day-Mon --apply         (REPLACES every collection)
//   node --env-file=.env scripts/restoreBackup.js day-Mon --apply --only albums,photos
//
// --apply empties each collection it restores, then puts the backup's documents back. Can't be undone:
// take a fresh backup first if the current data matters.
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import mongoose from 'mongoose';
import { openPhoto } from '../src/services/storageService.js';

const [folder] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const apply = process.argv.includes('--apply');
const onlyArg = process.argv.find((a, i) => process.argv[i - 1] === '--only');
const only = onlyArg ? new Set(onlyArg.split(',')) : null;
if (!/^(day-[A-Z][a-z]{2}|month-\d{4}-\d{2})$/.test(folder || '')) {
  console.error('Say which backup: day-Mon … day-Sun, or month-YYYY-MM. Example: node --env-file=.env scripts/restoreBackup.js day-Mon');
  process.exit(1);
}
const gunzip = promisify(zlib.gunzip);
const read = async (key) => { const chunks = []; for await (const c of await openPhoto(key)) chunks.push(c); return Buffer.concat(chunks); };

await mongoose.connect(process.env.MONGODB_URI);
const { EJSON } = mongoose.mongo.BSON;
const info = JSON.parse((await read(`backups/${folder}/_info.json`).catch(() => Buffer.from('null'))).toString() || 'null');
if (!info) { console.error(`No backup found in backups/${folder}/ (its _info.json is missing).`); process.exit(1); }
console.log(`Backup from ${info.at}: ${info.collections.length} collections, ${info.documents} documents${apply ? '  (RESTORING)' : '  (dry run)'}`);
for (const name of info.collections) {
  if (only && !only.has(name)) continue;
  const text = (await gunzip(await read(`backups/${folder}/${name}.jsonl.gz`))).toString();
  const docs = text ? text.split('\n').map((l) => EJSON.parse(l, { relaxed: false })) : [];
  console.log(`  ${name.padEnd(20)} ${docs.length} documents`);
  if (!apply) continue;
  const coll = mongoose.connection.db.collection(name);
  await coll.deleteMany({});
  if (docs.length) await coll.insertMany(docs, { ordered: false });
}
console.log(apply ? 'Restored.' : 'Nothing changed. Add --apply to restore.');
await mongoose.disconnect();
