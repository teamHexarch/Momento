import { config } from './config/env.js';
import { connectDb } from './config/database.js';
import { isEmailConfigured, emailProviderName, emailFrom } from './services/emailService.js';
import { initStorage, storageName } from './services/storageService.js';
import { app } from './app.js';

await connectDb();
await initStorage();
console.log(storageName === 'r2' ? `Photos: Cloudflare R2 bucket "${config.r2.bucket}"` : `Photos: on disk in ${config.uploadDir}`);
if (storageName === 'disk' && config.isProduction) {
  console.warn('Photos are on this machine’s disk. On Render that is wiped on every deploy: set the R2_* settings.');
}
if (isEmailConfigured()) console.log(`Email: ${emailProviderName}, from ${emailFrom}`);
else console.warn('Email isn’t set up (RESEND_API_KEY + EMAIL_FROM, or the MS_* settings, in .env); confirm links will be printed here instead.');
app.listen(config.port, () => console.log(`Momento running at ${config.publicUrl} (port ${config.port})`));
