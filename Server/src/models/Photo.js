import mongoose from 'mongoose';

const photoSchema = new mongoose.Schema({
  album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
  uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Path inside the upload folder, e.g. "<albumId>/<random>.jpg"
  storageKey: { type: String, required: true },
  thumbnailKey: String,
  // The 320px-wide mini for grids (photos from before minis get one from scripts/makeMinis.js)
  miniKey: String,
  previewKey: String,
  previewMimeType: String,
  originalName: { type: String, default: '' },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  // People who liked the photo, and running counts kept beside them (sorting by likeCount picks the cover)
  likes: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  likeCount: { type: Number, default: 0 },
  // When each like happened, for the Liked tab (newest first)
  likeLog: { type: [{ _id: false, user: mongoose.Schema.Types.ObjectId, at: Date }], default: [] },
  // Emoji reactions: one per person, any single emoji, with when it was made (older ones have no time)
  reactions: { type: [{ _id: false, user: mongoose.Schema.Types.ObjectId, emoji: String, at: Date }], default: [] },
  // A fingerprint of the file as uploaded (SHA-256), so the same photo added twice to an album is skipped
  hash: String,
  // In the "Recently deleted" bin since then (by the host); removed for good after 30 days
  deletedAt: { type: Date, default: null },
  deletedBy: mongoose.Schema.Types.ObjectId,
  // Hidden from everyone because several people reported it, until staff decide (the host can't bring it back)
  flaggedAt: Date,
  nextAudit: Date,
  auditRequested: Boolean,
  auditHidden: Boolean,
}, { timestamps: true });

photoSchema.index({ album: 1, createdAt: -1 });
photoSchema.index({ deletedAt: 1, nextAudit: 1 });
photoSchema.index({ auditRequested: 1, nextAudit: 1 });
photoSchema.index({ album: 1, likeCount: -1, createdAt: -1 });
photoSchema.index({ deletedAt: 1 }, { partialFilterExpression: { deletedAt: { $type: 'date' } } });
photoSchema.index({ 'likeLog.user': 1 });
photoSchema.index({ album: 1, hash: 1 }, { partialFilterExpression: { hash: { $type: 'string' } } });
photoSchema.index({ hash: 1 }, { partialFilterExpression: { hash: { $type: 'string' } } });

export const Photo = mongoose.model('Photo', photoSchema);
