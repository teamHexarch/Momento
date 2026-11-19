import mongoose from 'mongoose';

// A photo staff removed (a copyright notice, or abuse), kept as the record of the notice. Its file's
// SHA-256 is kept so the same file can't be uploaded again anywhere on Momento. The uploader gets a
// strike; 3 strikes suspend the account. No personal data beyond ids: the notice text is what the
// complainant sent.
const takedownSchema = new mongoose.Schema({
  hash: { type: String, required: true, index: true },
  photo: mongoose.Schema.Types.ObjectId,
  album: mongoose.Schema.Types.ObjectId,
  uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reason: { type: String, enum: ['copyright', 'abuse', 'nudity', 'privacy', 'other'], required: true },
  notice: { type: String, maxlength: 5000, default: '' },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  at: { type: Date, default: Date.now },
}, { versionKey: false });

export const Takedown = mongoose.model('Takedown', takedownSchema);
