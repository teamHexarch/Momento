import { config } from './config/env.js';
import { connectDb } from './config/database.js';
import { isEmailConfigured, emailProviderName, emailFrom } from './services/emailService.js';
import { initStorage, storageName } from './services/storageService.js';
import { app } from './app.js';
import { purgeExpired } from './controllers/trashController.js';
import { runJobs } from './services/jobs.js';
import { warmUp } from './services/nsfwService.js';

await connectDb();
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
app.listen(config.port, () => console.log(`Momento running at ${config.publicUrl} (port ${config.port})`));
