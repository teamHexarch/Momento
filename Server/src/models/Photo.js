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
  // Hidden by an automated album audit (no longer run; kept so any photo it hid stays hidden until staff decide)
  auditHidden: Boolean,
  // How many comments it has (models/PhotoComment.js), kept up to date so grids don't count
  commentCount: { type: Number, default: 0 },
  // When it was taken (the camera's own date), for sorting by capture date; uploads without one sort by upload date
  takenAt: Date,
}, { timestamps: true });

photoSchema.index({ album: 1, createdAt: -1 });
// The album's newest change, for live updates (GET /api/albums/:id/version)
photoSchema.index({ album: 1, updatedAt: -1 });
photoSchema.index({ album: 1, likeCount: -1, createdAt: -1 });
photoSchema.index({ deletedAt: 1 }, { partialFilterExpression: { deletedAt: { $type: 'date' } } });
photoSchema.index({ 'likeLog.user': 1 });
photoSchema.index({ album: 1, hash: 1 }, { partialFilterExpression: { hash: { $type: 'string' } } });
photoSchema.index({ hash: 1 }, { partialFilterExpression: { hash: { $type: 'string' } } });

// Deleting photos, however it happens (bin, host, takedown, account deletion), removes their comments too
async function idsOf(query) { return query.model.find(query.getFilter(), '_id').lean().then((rows) => rows.map((r) => r._id)); }
const dropComments = async (ids) => {
  if (!ids?.length) return;
  const [{ PhotoComment }, { GameEntry, GameVote, GameResponse }] = await Promise.all([import('./PhotoComment.js'), import('./Game.js')]);
  // Their comments, their place in any photo battle (with the votes on them), and any bingo tile they claimed
  await Promise.all([PhotoComment.deleteMany({ photo: { $in: ids } }), GameEntry.deleteMany({ photo: { $in: ids } }),
    GameVote.deleteMany({ $or: [{ winner: { $in: ids } }, { loser: { $in: ids } }] }), GameResponse.deleteMany({ photo: { $in: ids } })]);
};
photoSchema.pre(['deleteOne', 'deleteMany'], { query: true, document: false }, async function () { this._goneIds = await idsOf(this); });
photoSchema.post(['deleteOne', 'deleteMany'], { query: true, document: false }, async function () { await dropComments(this._goneIds); });
photoSchema.post('deleteOne', { document: true, query: false }, async function () { await dropComments([this._id]); });

export const Photo = mongoose.model('Photo', photoSchema);
