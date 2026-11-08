import mongoose from 'mongoose';

const photoSchema = new mongoose.Schema({
  album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
  uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Path inside the upload folder, e.g. "<albumId>/<random>.jpg"
  storageKey: { type: String, required: true },
  thumbnailKey: String,
  previewKey: String,
  previewMimeType: String,
  originalName: { type: String, default: '' },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  // People who liked the photo, and running counts kept beside them (sorting by likeCount picks the cover)
  likes: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  likeCount: { type: Number, default: 0 },
  commentCount: { type: Number, default: 0 },
}, { timestamps: true });

photoSchema.index({ album: 1, createdAt: -1 });
photoSchema.index({ album: 1, likeCount: -1, createdAt: -1 });

export const Photo = mongoose.model('Photo', photoSchema);
