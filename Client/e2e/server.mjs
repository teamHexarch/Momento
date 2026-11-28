// The API for the website's smoke test (e2e/smoke.spec.mjs): the real server code from ../Server, on a throwaway
// in-memory database, with the photo check's test mode (every photo passes, no AWS) and photos on a temporary disk
// folder. Never touches production. Listens on :4000, where the website looks for the API when it runs locally.
// Writes what the test needs (the people, the event's code, a test photo) to e2e/.run/seed.json.
//   node e2e/server.mjs        (Playwright starts it; needs `npm ci` in ../Server first)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../../Server');
const fromServer = createRequire(path.join(serverDir, 'package.json'));
const load = async (name) => import(pathToFileURL(fromServer.resolve(name)).href);
const server = (file) => import(pathToFileURL(path.join(serverDir, file)).href);

// Nothing from a developer's own settings leaks in (a real database, AWS keys, email)
for (const key of Object.keys(process.env)) {
  if (/^(AWS_|S3_|RECAPTCHA_|CAPTCHA_|EMAIL_|MONGODB_|FRONTEND_|CORS_|PUBLIC_|GOOGLE_|NSFW_|DEV_MODE_|VAPID_|UPLOAD_|ADMIN_)/.test(key)) delete process.env[key];
}
// The database program is downloaded once into the server's own cache, shared with its tests
process.env.MONGOMS_DOWNLOAD_DIR ||= path.join(serverDir, 'node_modules', '.cache', 'mongodb-memory-server');
const { MongoMemoryServer } = await load('mongodb-memory-server');
const mongo = await MongoMemoryServer.create();
const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'momento-e2e-'));
Object.assign(process.env, {
  NODE_ENV: 'test', NSFW_CHECK: 'off', JWT_SECRET: 'momento-e2e-only-secret-not-used-anywhere-else-000',
  MONGODB_URI: mongo.getUri(), PORT: '4000', PUBLIC_URL: 'http://localhost:4000', FRONTEND_URL: 'http://localhost:3000',
  UPLOAD_DIR: uploads,
  // The shared staff account (e2e/staff-code.spec.mjs): everyone signs in to it, and their own code says who it is
  ADMIN_ACCOUNT_EMAIL: 'staff@example.invalid',
  // Uploads need the upload agreement on record (the website records it when the box is ticked)
  UPLOAD_CONSENT: 'on',
  // Google's scripts load for real, so the Content-Security-Policy check (e2e/csp.spec.mjs) sees them: reCAPTCHA's
  // public test keys (they work on localhost and always pass), and placeholder sign-in and Maps keys (their scripts
  // load, then report the key isn't valid; nothing else needs them here)
  RECAPTCHA_SITE_KEY: '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI', RECAPTCHA_SECRET_KEY: '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe',
  GOOGLE_CLIENT_ID: '000000000000-momentoe2e.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'e2e-placeholder',
  GOOGLE_MAPS_API_KEY: 'e2e-placeholder-maps-key',
});

const mongoose = (await load('mongoose')).default;
const bcrypt = (await load('bcryptjs')).default;
const sharp = (await load('sharp')).default;
await mongoose.connect(process.env.MONGODB_URI);
const { app } = await server('src/app.js');
const { initStorage } = await server('src/services/storageService.js');
const { startUploadChecks } = await server('src/services/uploadChecks.js');
const { User } = await server('src/models/User.js');
const { Album } = await server('src/models/Album.js');
const { Membership } = await server('src/models/Membership.js');
await initStorage();
startUploadChecks();

// The people and the event: a host, and a guest who joins with the code. Location checks are off, so joining
// doesn't ask for the browser's location.
const password = 'E2e-correct-horse-9';
const hash = await bcrypt.hash(password, 4);
const person = (name, email) => User.create({ name, email, passwordHash: hash, emailVerified: true });
const host = await person('Hana Host', 'host@example.invalid');
// One guest per test and browser (desktop, phone), each with photos of their own
const GUESTS = ['desktop', 'phone', 'desktop-retry', 'phone-retry', 'desktop-offline', 'phone-offline', 'desktop-csp', 'phone-csp', 'desktop-join', 'phone-join', 'desktop-i18n', 'phone-i18n', 'desktop-paging', 'phone-paging'];
for (const g of GUESTS) await person(`Gus ${g}`, `guest-${g}@example.invalid`);
const now = Date.now();
const album = await Album.create({
  name: 'Smoke test party', date: new Date(now).toISOString().slice(0, 10), place: 'Test venue', kind: 'event', games: true,
  startsAt: new Date(now - 3600000), endsAt: new Date(now + 6 * 3600000), uploadLeadMin: 0, eventUploadWindow: true,
  zone: { lat: -37.81, lng: 144.96, radiusM: 1000 }, locationRequired: false, code: 'E2ETEST', host: host._id,
});
await Membership.create({ album: album._id, user: host._id, role: 'host' });

// Real photos to upload (made here, so no picture file lives in the repo); a different colour each, so neither is
// taken for a copy of the other
const photos = {};
for (const [i, g] of GUESTS.entries()) {
  photos[g] = [];
  for (let n = 0; n < 4; n++) {
    const file = path.join(uploads, `smoke-${g}-${n + 1}.jpg`);
    await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: (40 * i + 13 * n) % 256, g: (90 + 50 * n) % 256, b: (200 - 30 * i) % 256 } } }).jpeg().toFile(file);
    photos[g].push(file);
  }
}

// The staff team: the shared account, and one person per browser with a fresh link to choose their own code
// (the link's key is what the emailed link carries; email isn't set up here)
await person('Staff account', 'staff@example.invalid');
const { inviteSlot } = await server('src/services/adminStaffService.js');
const staff = {};
for (const [i, g] of ['desktop', 'phone'].entries()) {
  const name = g === 'desktop' ? 'Desi Reviewer' : 'Phoebe Reviewer';
  staff[g] = { name, token: (await inviteSlot(i + 1, { name, email: `reviewer-${g}@example.invalid`, role: 'moderator' })).token };
}

fs.mkdirSync(path.join(here, '.run'), { recursive: true });
fs.writeFileSync(path.join(here, '.run', 'seed.json'), JSON.stringify({
  api: 'http://localhost:4000', site: 'http://localhost:3000', password,
  host: 'host@example.invalid', guests: Object.fromEntries(GUESTS.map((g) => [g, `guest-${g}@example.invalid`])),
  albumId: album.id, code: album.displayCode, photos,
  staffAccount: 'staff@example.invalid', staff,
}, null, 2));

const listener = app.listen(4000, () => console.log('e2e API ready on http://localhost:4000'));
const stop = async () => { listener.close(); await mongoose.disconnect(); await mongo.stop(); fs.rmSync(uploads, { recursive: true, force: true }); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
