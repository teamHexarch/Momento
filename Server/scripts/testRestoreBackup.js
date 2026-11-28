// The restore test (scripts/restoreBackup.js): a backup made by the daily job (services/jobs.js) restores into a spare
// database with every count matching, and the live database is never touched. Throwaway database, backups on disk.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

const dir = await mkdtemp(path.join(os.tmpdir(), 'momento-restore-'));
const mongo = await MongoMemoryServer.create();
const env = { ...process.env, NODE_ENV: 'test', MONGODB_URI: mongo.getUri('momento'), JWT_SECRET: 'test-only-isolated-restore-test',
  S3_BUCKET: '', BACKUP_BUCKET: '', UPLOAD_DIR: dir, PUBLIC_URL: 'http://localhost:4000' };
Object.assign(process.env, env);
await mongoose.connect(env.MONGODB_URI);
const { backup } = await import('../src/services/jobs.js');
const { initStorage } = await import('../src/services/storageService.js');
await initStorage();
const restore = (...a) => {
  try { return { ok: true, out: execFileSync(process.execPath, ['scripts/restoreBackup.js', ...a], { env, encoding: 'utf8', stdio: 'pipe' }) }; }
  catch (e) { return { ok: false, out: `${e.stdout}${e.stderr}` }; }
};

try {
  // Some live data, and the day's backup of it
  const live = mongoose.connection.db;
  await live.collection('albums').insertMany([{ name: 'One' }, { name: 'Two', at: new Date('2026-11-28T00:00:00Z') }]);
  await live.collection('users').insertOne({ email: 'a@example.invalid', n: 7 });
  const made = await backup(new Date('2026-11-28T03:00:00Z'));
  assert.ok(made && made.documents >= 3, 'a backup was made');

  // Dry run: shows it, changes nothing
  const dry = restore('day-2026-11-28');
  assert.ok(dry.ok, dry.out);
  assert.match(dry.out, /dry run/);
  // --apply needs a target; the live database's name is refused as a spare one
  assert.match(restore('day-2026-11-28', '--apply').out, /Say where to restore/);
  assert.match(restore('day-2026-11-28', '--apply', '--into', 'momento').out, /is the live database/);
  assert.match(restore('day-2026-99-99').out, /Say which backup|No backup found/);

  // Into a spare database, checked, kept for a look
  const spare = restore('day-2026-11-28', '--apply', '--into', 'momento-restore-test', '--check');
  assert.ok(spare.ok, spare.out);
  assert.match(spare.out, /Restore check passed/);
  const copy = mongoose.connection.getClient().db('momento-restore-test');
  assert.equal(await copy.collection('albums').countDocuments(), 2);
  const two = await copy.collection('albums').findOne({ name: 'Two' });
  assert.ok(two.at instanceof Date && two.at.toISOString() === '2026-11-28T00:00:00.000Z', 'dates come back as dates');
  // A spare database that isn't empty is refused
  assert.match(restore('day-2026-11-28', '--apply', '--into', 'momento-restore-test').out, /isn't empty/);
  // --drop deletes the spare database afterwards
  const dropped = restore('day-2026-11-28', '--apply', '--into', 'momento-restore-test-2', '--check', '--drop');
  assert.match(dropped.out, /Restore check passed[\s\S]*was deleted/);
  const dbs = (await mongoose.connection.getClient().db().admin().listDatabases()).databases.map((d) => d.name);
  assert.ok(!dbs.includes('momento-restore-test-2'));
  // The live data is exactly as it was
  assert.equal(await live.collection('albums').countDocuments(), 2);
  assert.equal(await live.collection('users').countDocuments(), 1);
  console.log('Passed: restore test (backup → spare database, counts checked, dates intact, live data untouched, safe defaults).');
} finally {
  await mongoose.disconnect();
  await mongo.stop();
  await rm(dir, { recursive: true, force: true });
}
