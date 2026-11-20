import { config } from './config/env.js';
import { connectDb } from './config/database.js';
import { isEmailConfigured, emailProviderName, emailFrom } from './services/emailService.js';
import { initStorage, storageName } from './services/storageService.js';
import { app } from './app.js';
import { purgeExpired } from './controllers/trashController.js';
import { runJobs } from './services/jobs.js';
import { warmUp } from './services/nsfwService.js';
import { stageOneOnly, startUploadChecks, calibratedBins, calibrationError } from './services/uploadChecks.js';
import { startRefusalCleanup } from './services/albumAudit.js';
import { moveStaffRoleToPlan } from './services/planMigration.js';

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
// Stage-one moderation runs its queue here (it uses the same in-process model), unless a separate worker
// runs it instead (NSFW_SEPARATE_WORKER=1)
if (stageOneOnly && process.env.NSFW_SEPARATE_WORKER !== '1') {
  startUploadChecks();
  startRefusalCleanup();
  const bins = calibratedBins(1);
  console.log('Photo checks: stage one only (MobileNetV2)' + (!process.env.NSFW_CALIBRATION
    ? '. No calibration table yet (NSFW_CALIBRATION), so every upload waits for staff review.'
    : calibrationError ? '. The calibration table could not be read, so every upload waits for staff review.'
      : `. Calibrated: ${bins} score range(s) publish at once` + (bins ? ', the rest wait for staff review.' : ', so every upload waits for staff review.')));
}
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
