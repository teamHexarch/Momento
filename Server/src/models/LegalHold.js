import mongoose from 'mongoose';

// Evidence kept for law enforcement (suspected child sexual abuse material, or a police request), see
// docs/legal/csam-procedure.md. Holding a photo copies the original file to legal-hold/<id>/ in storage (nothing
// else ever deletes that prefix), removes the photo everywhere, bans the file's fingerprint and quietly suspends the
// uploader. This record keeps a snapshot of who uploaded it, where and when, so the evidence survives even if the
// account or album is deleted later. It has no expiry: only the owner can release it, after the police say so.
const legalHoldSchema = new mongoose.Schema({
  kind: { type: String, enum: ['upload', 'photo'], required: true },
  reason: { type: String, enum: ['csam', 'police-request', 'other'], required: true },
  note: { type: String, maxlength: 2000, default: '' },
  // The preserved file and its fingerprint
  fileKey: { type: String, required: true },
  mimeType: String,
  size: Number,
  hash: { type: String, index: true },
  // What it was: ids plus a snapshot (account email/name, album name/code), taken when the hold was placed
  source: { type: mongoose.Schema.Types.ObjectId },
  album: { type: mongoose.Schema.Types.ObjectId },
  albumName: String,
  albumCode: String,
  uploader: { type: mongoose.Schema.Types.ObjectId },
  uploaderName: String,
  uploaderEmail: String,
  uploadedAt: Date,
  fileName: String,
  // Who held it, and the report to the authorities (agency, reference number, when)
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  at: { type: Date, default: Date.now },
  report: { agency: String, reference: String, at: Date, by: mongoose.Schema.Types.ObjectId },
  releasedAt: Date,
  releasedBy: mongoose.Schema.Types.ObjectId,
  releaseNote: String,
}, { versionKey: false });

legalHoldSchema.index({ releasedAt: 1, at: -1 });

export const LegalHold = mongoose.model('LegalHold', legalHoldSchema);
