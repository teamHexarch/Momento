import mongoose from 'mongoose';

// A comment under a photo. Anyone in the album can read, write, reply to and like them; the writer or
// the album's host can remove one. Replies are one level deep: `parent` is always a top-level comment.
const commentSchema = new mongoose.Schema({
  photo: { type: mongoose.Schema.Types.ObjectId, ref: 'Photo', required: true },
  album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, trim: true, maxlength: 500 },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
  likes: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  likeCount: { type: Number, default: 0 },
}, { timestamps: true });

commentSchema.index({ photo: 1, createdAt: 1 });
commentSchema.index({ album: 1 });
commentSchema.index({ user: 1 });
commentSchema.index({ parent: 1 });

export const Comment = mongoose.model('Comment', commentSchema);
