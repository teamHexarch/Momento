import mongoose from 'mongoose';

// Reviews of Momento (the Reviews page, /reviews): private feedback for the team, never shown to other people.
// One per account: sending again replaces it. Everything is out of 5 stars: the overall rating is required, and
// each part of Momento (scores) is optional, for the parts the person used. Host or guest and a comment are optional.
// Staff can set `hidden` in the database to leave a review (spam, a test) out of the numbers.
// (Reviews sent before November 2026 may also hold worked / better / event from the earlier checklist; no longer read.)
export const REVIEW_PARTS = ['join', 'upload', 'quality', 'find'];
export const REVIEW_ROLES = ['host', 'guest'];
export const MAX_REVIEW_BODY = 1500;

const star = { type: Number, min: 1, max: 5 };
const reviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  rating: { ...star, required: true },
  scores: Object.fromEntries(REVIEW_PARTS.map((p) => [p, star])),
  role: { type: String, enum: REVIEW_ROLES },
  body: { type: String, default: '', maxlength: MAX_REVIEW_BODY },
  hidden: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  editedAt: Date,
});

export const Review = mongoose.model('Review', reviewSchema);
