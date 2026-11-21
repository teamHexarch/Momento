// Local preview of the photo review page with Dev Mode, on a throwaway in-memory database (wiped when it stops).
// Nothing here touches the live database, S3 or email. Run:  npm run preview:review   then open
// http://localhost:4000/index.html, sign in with the test admin account below, and open review.html.
// TEST VALUES ONLY: they exist just in this temporary database.
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import os from 'node:os';
import path from 'node:path';

export const PREVIEW_ADMIN = { email: 'staff@example.test', password: 'preview-pass-123' };
// Seven reviewers, so the 6-session limit can be tried (the 7th is refused)
export const PREVIEW_REVIEWERS = Array.from('ABCDEFG', (l) => ({ label: `Reviewer_${l}`, code: `TEST-${l}${l}${l}${l}-2026` }));

for (const k of Object.keys(process.env)) if (/^(AWS_|S3_|MONGODB_|EMAIL_|RECAPTCHA_|CAPTCHA_|FRONTEND_|CORS_|GOOGLE_|VAPID_|SECURITY_|DEV_MODE_)/.test(k)) delete process.env[k];
const mongo = await MongoMemoryServer.create();
Object.assign(process.env, {
  MONGODB_URI: mongo.getUri('preview'), JWT_SECRET: 'local-preview-only-secret-xxxxxxxxxxxxxxxx', PORT: '4000', PUBLIC_URL: 'http://localhost:4000',
  CLIENT_DIR: process.env.CLIENT_DIR || '../Client/Momento V.2.9.9.5', UPLOAD_DIR: path.join(os.tmpdir(), 'momento-preview-uploads'), NSFW_CHECK: 'off',
  DEV_MODE_ADMIN_EMAIL: PREVIEW_ADMIN.email,
});
await mongoose.connect(process.env.MONGODB_URI);
const { User } = await import('../src/models/User.js');
const { ModerationDecision } = await import('../src/models/ModerationDecision.js');
const { addReviewer } = await import('./devModeTestKit.js');
const admin = await User.create({ name: 'Preview Admin', email: PREVIEW_ADMIN.email, passwordHash: await bcrypt.hash(PREVIEW_ADMIN.password, 4), emailVerified: true, plan: 'staff' });
for (const { label, code } of PREVIEW_REVIEWERS) await addReviewer(label, code);
const samples = [
  { Neutral: .3, Drawing: 0, Sexy: .5, Porn: .15, Hentai: .05 }, { Neutral: .1, Drawing: 0, Sexy: .3, Porn: .5, Hentai: .1 },
  { Neutral: .6, Drawing: .05, Sexy: .3, Porn: .05, Hentai: 0 }, { Neutral: .2, Drawing: 0, Sexy: .7, Porn: .1, Hentai: 0 },
  { Neutral: .05, Drawing: .1, Sexy: .2, Porn: .4, Hentai: .25 }, { Neutral: .45, Drawing: 0, Sexy: .45, Porn: .1, Hentai: 0 },
];
for (const [i, classes] of samples.entries()) {
  await ModerationDecision.create({ user: admin._id, kind: 'photo', hash: 'preview' + i, model: 'NSFW.js MobileNetV2', scores: { classes },
    status: 'review-requested', requestedAt: new Date(), at: new Date(Date.now() - (i + 1) * 3600e3) });
}
await mongoose.disconnect();
console.log(`Review preview: sign in as ${PREVIEW_ADMIN.email}; reviewer codes are in scripts/reviewPreview.js (test values).`);
await import('../src/server.js');
