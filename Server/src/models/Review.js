import mongoose from 'mongoose';

// Reviews of Momento (the Reviews page, /reviews): private feedback for the team, never shown to other people.
// One per account: sending again replaces it. Only the stars are required. The rest are one-tap answers the team
// can count: who they were at the event, what kind of event it was, and a checklist of the parts that worked well
// or could be better (an area is in one list or the other, never both), plus an optional comment.
// Staff can set `hidden` in the database to leave a review (spam, a test) out of the numbers.
export const REVIEW_AREAS = ['join', 'upload', 'quality', 'find', 'guests', 'privacy'];
export const REVIEW_ROLES = ['host', 'guest'];
export const REVIEW_EVENTS = ['wedding', 'birthday', 'party', 'work', 'trip', 'other'];
export const MAX_REVIEW_BODY = 1500;

const reviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  role: { type: String, enum: REVIEW_ROLES },
  event: { type: String, enum: REVIEW_EVENTS },
  worked: { type: [{ type: String, enum: REVIEW_AREAS }], default: [] },
  better: { type: [{ type: String, enum: REVIEW_AREAS }], default: [] },
  body: { type: String, default: '', maxlength: MAX_REVIEW_BODY },
  hidden: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  editedAt: Date,
});

export const Review = mongoose.model('Review', reviewSchema);
