import mongoose from 'mongoose';
import { connectDb } from '../src/config/database.js';
import { initStorage } from '../src/services/storageService.js';
process.env.NSFW_WORKER = '1';
const { startUploadChecks, cascadeEnabled, stageOneOnly } = await import('../src/services/uploadChecks.js');
const { startAlbumAudits, startRefusalCleanup } = await import('../src/services/albumAudit.js');
const { verifyModerationModels } = await import('../src/services/moderationReadiness.js');

if (!cascadeEnabled) throw new Error('Set NSFW_PIPELINE=three-stage (or stage-one) for the moderation worker.');
await verifyModerationModels();
await connectDb();
await initStorage();
const stopUploads = startUploadChecks();
const stopAudits = stageOneOnly ? startRefusalCleanup() : startAlbumAudits();
const shutdown = () => {
  stopUploads();
  stopAudits();
  // Leases allow another worker to recover unfinished work after a forced stop.
  setTimeout(() => mongoose.disconnect().finally(() => process.exit(0)), 5000).unref();
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
