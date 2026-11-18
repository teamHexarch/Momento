// Removes data the server no longer uses: the chat (groups and events), photo comments and album
// email invites, and leftover fields on other records. By default it only COUNTS what it would
// remove; add --apply to really delete. Uses MONGODB_URI from Server/.env.
//
//   node --env-file=.env scripts/cleanOldData.js           (shows what would go)
//   node --env-file=.env scripts/cleanOldData.js --apply   (deletes it; can't be undone)
//
// Make a backup first (Atlas, or the server's own daily backup in the photo bucket).
import mongoose from 'mongoose';

const apply = process.argv.includes('--apply');
const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI is not set. Run it with: node --env-file=.env scripts/cleanOldData.js'); process.exit(1); }

const COLLECTIONS = [
  ['groupmessages', 'group chat messages'],
  ['eventmessages', 'event chat messages'],
  ['comments', 'photo comments (replaced by emoji reactions)'],
  ['invites', 'album email invites (albums are shared by link now)'],
];
const FIELDS = [
  ['albums', 'chatEnabled', 'the event chat switch'],
  ['albums', 'messages', 'old event chat messages kept on albums'],
  ['memberships', 'chatReadAt', 'when someone last read an event chat'],
  ['groupmembers', 'lastReadAt', 'when someone last read a group chat'],
  ['photos', 'commentCount', 'comment counts'],
];

await mongoose.connect(uri);
const db = mongoose.connection.db;
const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
console.log(`Database: ${db.databaseName}${apply ? '  (APPLYING)' : '  (dry run: nothing is changed)'}\n`);

let total = 0;
console.log('Collections:');
for (const [name, what] of COLLECTIONS) {
  if (!existing.has(name)) { console.log(`  ${name.padEnd(15)} not there (nothing to do)`); continue; }
  const n = await db.collection(name).countDocuments();
  total += n;
  console.log(`  ${name.padEnd(15)} ${String(n).padStart(6)} documents  ${what}`);
  if (apply) { await db.collection(name).drop(); console.log(`  ${''.padEnd(15)} dropped`); }
}
console.log('\nLeftover fields:');
for (const [coll, field, what] of FIELDS) {
  if (!existing.has(coll)) continue;
  const filter = { [field]: { $exists: true } };
  const n = await db.collection(coll).countDocuments(filter);
  total += n;
  console.log(`  ${`${coll}.${field}`.padEnd(26)} on ${String(n).padStart(6)} documents  ${what}`);
  if (apply && n) { const r = await db.collection(coll).updateMany(filter, { $unset: { [field]: '' } }); console.log(`  ${''.padEnd(26)} removed from ${r.modifiedCount}`); }
}
console.log(apply ? '\nDone.' : `\n${total ? 'Run again with --apply to remove these.' : 'Nothing to clean.'}`);
await mongoose.disconnect();
