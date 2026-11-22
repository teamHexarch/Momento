import mongoose from 'mongoose';

// Training data for Momento's own decision layer (the step after MobileNetV2's 1280 features), collected from
// every album photo the automatic check scores. No picture is kept: only the 1280 numbers the model computed from
// it (FEATURE_LAYER in services/nsfwService.js, stored as Float32, about 5 KB), which can't be turned back into the
// photo. Staff's rating on review.html (level 0-100, publish or keep private, reasons) is added when they review it.
// Unrated samples go after 90 days; rated ones are kept a year (they are what the layer learns from). Deleted with
// the uploader's account (services/accountService.js).
const sampleSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,   // the upload's id (UploadCheck, and its ModerationDecision when declined)
  user: { type: mongoose.Schema.Types.ObjectId, required: true },
  album: mongoose.Schema.Types.ObjectId,
  hash: { type: String, required: true },
  layer: { type: String, required: true },   // which layer the features came from
  scoreVersion: { type: Number, required: true },   // what image was scored (uploadChecks.js SCORE_VERSION)
  features: { type: Buffer, required: true },   // Float32Array (little-endian) of FEATURE_SIZE numbers
  classes: mongoose.Schema.Types.Mixed,   // MobileNetV2's own five scores for the same image
  auto: { type: String, enum: ['allow', 'decline'] },   // what the automatic check did
  explicit: Boolean,
  // Staff's rating (review.html)
  level: Number,
  allowed: Boolean,
  reasons: { type: [String], default: undefined },
  reviewer: String,
  labelledAt: Date,
  expires: Date,
  at: { type: Date, default: Date.now },
}, { versionKey: false });

sampleSchema.index({ labelledAt: 1 });
sampleSchema.index({ user: 1 });
sampleSchema.index({ expires: 1 }, { expireAfterSeconds: 0 });

export const UNLABELLED_DAYS = 90, LABELLED_DAYS = 365;
export const TrainingSample = mongoose.model('TrainingSample', sampleSchema);

// Stored and read back (a Mongoose Buffer, or the driver's Binary from .lean())
export const packFeatures = (floats) => Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength);
export function featuresOf(sample) {
  const f = sample.features;
  const bytes = Buffer.isBuffer(f) ? f : Buffer.from(f.buffer ?? f);
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
