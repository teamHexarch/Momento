import mongoose from 'mongoose';

const photoSchema = new mongoose.Schema({
  album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
  uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Path inside the upload folder, e.g. "<albumId>/<random>.jpg"
  storageKey: { type: String, required: true },
  originalName: { type: String, default: '' },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
}, { timestamps: true });

photoSchema.index({ album: 1, createdAt: -1 });

export const Photo = mongoose.model('Photo', photoSchema);
