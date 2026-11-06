import { config } from './config/env.js';
import { connectDb } from './config/database.js';
import { isEmailConfigured, emailProviderName, emailFrom } from './services/emailService.js';
import { initStorage, storageName } from './services/storageService.js';
import { app } from './app.js';

await connectDb();
await initStorage();
console.log(storageName === 's3' ? `Photos: Amazon S3 bucket "${config.aws.s3Bucket}" (${config.aws.region})`
  : `Photos: on disk in ${config.uploadDir}`);
if (storageName === 'disk' && config.isProduction) {
  console.warn('Photos are on this machine’s disk, which a hosting provider can wipe on every deploy: set S3_BUCKET.');
}
if (isEmailConfigured()) console.log(`Email: ${emailProviderName}, from ${emailFrom}`);
else console.warn('Email isn’t set up (EMAIL_FROM + the AWS keys); confirm links will be printed here instead.');
app.listen(config.port, () => console.log(`Momento running at ${config.publicUrl} (port ${config.port})`));
