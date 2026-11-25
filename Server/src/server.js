import { config } from './config/env.js';
import { connectDb } from './config/database.js';
import { isEmailConfigured, emailProviderName, emailFrom } from './services/emailService.js';
import { initStorage, storageName } from './services/storageService.js';
import { app } from './app.js';
import { purgeExpired } from './controllers/trashController.js';
import { runJobs } from './services/jobs.js';
import { warmUp, usesRekognition } from './services/nsfwService.js';
import { startUploadChecks, calibratedBins, calibrationError, activeTable, PUBLISH_BELOW, HARD_DECLINE_AT } from './services/uploadChecks.js';
import { loadLearned, startLearning, relearnHours } from './services/stageOneLearning.js';
import { startRefusalCleanup } from './services/albumAudit.js';
import { moveStaffRoleToPlan } from './services/planMigration.js';
import { seedFromEnv, listTeam, MAX_ADMIN_STAFF } from './services/adminStaffService.js';

await connectDb();
await moveStaffRoleToPlan();
await initStorage();
console.log(storageName === 's3' ? `Photos: Amazon S3 bucket "${config.aws.s3Bucket}" (${config.aws.region})`
  : `Photos: on disk in ${config.uploadDir}`);
if (storageName === 'disk' && config.isProduction) {
  console.warn('Photos are on this machine’s disk, which a hosting provider can wipe on every deploy: set S3_BUCKET.');
}
if (isEmailConfigured()) console.log(`Email: ${emailProviderName}, from ${emailFrom}`);
else console.warn('Email isn’t set up (EMAIL_FROM + the AWS keys); confirm links will be printed here instead.');
const emptyBin = () => purgeExpired()
  .then((n) => n && console.log(`Recently deleted: removed ${n} photo(s) older than 30 days`))
  .catch((err) => console.error(`Emptying the bin failed: ${err.message}`));
setTimeout(emptyBin, 60000).unref();
setInterval(emptyBin, 6 * 3600000).unref();
// Every hour: "closes soon" emails, weekly recaps, tidying, and the daily backup (see services/jobs.js)
setTimeout(runJobs, 2 * 60000).unref();
setInterval(runJobs, 3600000).unref();
// The nudity check's model loads in the background, so the first upload isn't slow
setTimeout(warmUp, 5000).unref();
// The nudity check for album photos runs its queue here, with the same in-process model (services/uploadChecks.js)
await loadLearned().catch((error) => console.error('Photo check learning:', error.message));
startUploadChecks();
startRefusalCleanup();
if (usesRekognition()) {
  console.log('Photo checks: AWS Rekognition (7 levels). 0-75 publish, 85-95 stay private (the uploader may '
    + 'ask for a review), 100 is never published. Thresholds learn from staff decisions.');
} else {
  const { source } = activeTable(), bins = calibratedBins();
  console.log(`Photo checks: NSFW.js MobileNetV2 on this server. Risk under ${Math.round(PUBLISH_BELOW * 100)}% publishes; `
    + `Porn or Hentai ${Math.round(HARD_DECLINE_AT * 100)}%+ is declined for good; the rest waits for the uploader's Request review`
    + (source === 'file' ? `, except ${bins} score range(s) from the table file ${process.env.NSFW_CALIBRATION}`
      : source === 'learned' ? `, except ${bins} score range(s) learned from staff reviews` : '')
    + `. Relearns from staff reviews every ${relearnHours} h.`);
  if (calibrationError) console.error('The calibration table file could not be read: only the thresholds apply until it is fixed.');
}
startLearning();
// The admin team (at most 6, each with their own code): empty slots filled from ADMIN_STAFF_JSON / ADMIN_OWNER_* at start-up
try {
  const added = await seedFromEnv();
  const { used } = await listTeam();
  console.log(`Admin team: ${used} of ${MAX_ADMIN_STAFF} slots used${added ? ` (${added} added from the env)` : ''}.`
    + (used ? '' : ' Set ADMIN_OWNER_EMAIL and ADMIN_OWNER_CODE to add the owner; until then /api/admin is closed.'));
} catch (error) { console.error(`Admin team: ${error.message}`); }
const server = app.listen(config.port, () => console.log(`Momento running at ${config.publicUrl} (port ${config.port})`));

// ---- Stopping cleanly (an update or restart sends SIGTERM) ----
// New connections stop at once, requests already running (an upload) get up to 25 seconds to finish, then
// the database connection closes. Docker waits 30 seconds before forcing it.
let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: finishing requests in progress, then stopping`);
  const force = setTimeout(() => { console.error('Still busy after 25 s: stopping anyway'); process.exit(1); }, 25000);
  force.unref();
  server.close(async () => {
    try { const { default: mongoose } = await import('mongoose'); await mongoose.disconnect(); } catch { /* already closed */ }
    process.exit(0);
  });
  server.closeIdleConnections?.();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
// A promise nobody caught is logged (with the redaction in utils/logRedaction.js) instead of passing silently
process.on('unhandledRejection', (err) => console.error(`Unhandled rejection: ${err?.stack || err}`));
