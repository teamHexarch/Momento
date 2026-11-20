import mongoose from 'mongoose';

// Only a published Photo can be read through album, thumbnail, cover and zip routes.
const schema = new mongoose.Schema({
  album: { type: mongoose.Schema.Types.ObjectId, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, required: true },
  hash: { type: String, required: true },
  originalName: String,
  rawKey: { type: String, select: false },
  files: { type: mongoose.Schema.Types.Mixed, select: false },
  state: { type: String, enum: ['checking', 'review', 'publish', 'published', 'rejected', 'failed', 'discarding'], default: 'checking' },
  stage: { type: Number, default: 1 },
  severity: Number,
  history: { type: [mongoose.Schema.Types.Mixed], default: [] },
  due: { type: Date, default: Date.now },
  claim: String,
  attempts: { type: Number, default: 0 },
  expires: Date,
}, { timestamps: true });
schema.index({ album: 1, user: 1, hash: 1 }, { unique: true });
schema.index({ state: 1, stage: 1, due: 1 });
schema.index({ album: 1, user: 1, state: 1, createdAt: -1 });
schema.index({ expires: 1 }, { expireAfterSeconds: 0 });
export const UploadCheck = mongoose.model('UploadCheck', schema);
