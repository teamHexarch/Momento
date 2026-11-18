// Runs the server against a throwaway in-memory MongoDB: handy before Atlas is set up.
// Everything (accounts, albums) is lost when it stops. Photos still go to the upload folder.
import { MongoMemoryServer } from 'mongodb-memory-server';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// Use the project's sign-in settings while keeping database and storage local.
const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) {
  const settings = parseEnv(readFileSync(envFile, 'utf8'));
  for (const key of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'RECAPTCHA_SITE_KEY', 'RECAPTCHA_SECRET_KEY', 'CAPTCHA_HOSTNAMES']) {
    if (settings[key]) process.env[key] ??= settings[key];
  }
}

const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri('momento');
process.env.JWT_SECRET ||= 'dev-only-secret';
console.log('Using an in-memory MongoDB. Data is lost when this stops.');
await import('../src/server.js');
