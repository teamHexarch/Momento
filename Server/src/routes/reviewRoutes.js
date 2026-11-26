import { Router } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';
import { Review, REVIEW_PARTS, REVIEW_ROLES, MAX_REVIEW_BODY } from '../models/Review.js';
import { requireUser, requireStaff } from '../middleware/authMiddleware.js';
import { sendTeamMail } from '../services/teamMail.js';
import { HttpError } from '../utils/httpError.js';

// The Reviews page (/reviews): private feedback for the team, all out of 5 stars. Nobody sees anyone else's review.
// The shapes are in Client/BACKEND-NOTES-NEXT.md and Client/src/lib/api.ts.
//   GET    /api/reviews          anyone (signed out: mine is null)   { mine }
//   POST   /api/reviews  { rating, scores?: { join, upload, quality, find }, role?, body? }   signed in   { review }
//   DELETE /api/reviews/:id      signed in, own review only   { ok }
//   GET    /api/reviews/stats    staff only (404 for everyone else)   { summary }
// Each review is emailed to the team inbox (TEAM_EMAIL) as user input (services/teamMail.js), with its numbers on a
// data line for the feedback sheet (Server/docs/feedback-sheet.gs).
export const reviewRoutes = Router();

const PART_NAMES = { join: 'Joining the album', upload: 'Adding photos', quality: 'Photo quality', find: 'Finding photos' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stars = (n) => `${'★'.repeat(n)}${'☆'.repeat(5 - n)} ${n}/5`;
const isStar = (v) => Number.isInteger(v) && v >= 1 && v <= 5;
const round1 = (n) => Math.round(n * 10) / 10;
const postLimit = rateLimit({
  windowMs: 60 * 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: { error: 'You’ve changed your review a lot in the last hour. Wait a while, then try again.' },
});

/** Only the parts that were rated, as { join: 4, … } */
const scoresOf = (r) => Object.fromEntries(REVIEW_PARTS.filter((p) => isStar(r.scores?.[p])).map((p) => [p, r.scores[p]]));

/** Your own review, as the page sees it */
function shape(r) {
  const out = { id: String(r._id), rating: r.rating, scores: scoresOf(r), createdAt: r.createdAt.toISOString() };
  if (r.role) out.role = r.role;
  if (r.body) out.body = r.body;
  if (r.editedAt) out.updatedAt = r.editedAt.toISOString();
  return out;
}

/** The team's numbers for every review that isn't hidden: overall stars, each part's average, hosts and guests */
async function summarize() {
  const part = (p) => [{ $match: { [`scores.${p}`]: { $gte: 1, $lte: 5 } } }, { $group: { _id: null, average: { $avg: `$scores.${p}` }, count: { $sum: 1 } } }];
  const [s] = await Review.aggregate([
    { $match: { hidden: { $ne: true } } },
    { $facet: {
      ratings: [{ $group: { _id: '$rating', n: { $sum: 1 } } }],
      ...Object.fromEntries(REVIEW_PARTS.map((p) => [`part_${p}`, part(p)])),
      roles: [{ $match: { role: { $in: REVIEW_ROLES } } }, { $group: { _id: '$role', n: { $sum: 1 } } }],
      comments: [{ $match: { body: { $gt: '' } } }, { $count: 'n' }],
    } },
  ]);
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0, total = 0;
  for (const { _id, n } of s.ratings) if (counts[_id] !== undefined) { counts[_id] = n; count += n; total += _id * n; }
  const parts = Object.fromEntries(REVIEW_PARTS.map((p) => {
    const g = s[`part_${p}`][0];
    return [p, { average: g ? round1(g.average) : 0, count: g?.count ?? 0 }];
  }));
  const roles = Object.fromEntries(REVIEW_ROLES.map((r) => [r, 0]));
  for (const { _id, n } of s.roles) roles[_id] = n;
  return { average: count ? round1(total / count) : 0, count, counts, parts, roles, comments: s.comments[0]?.n ?? 0 };
}

reviewRoutes.get('/', async (req, res) => {
  const mine = req.user ? await Review.findOne({ user: req.user._id }).lean() : null;
  res.set('Cache-Control', 'no-store');
  res.json({ mine: mine ? shape(mine) : null });
});

reviewRoutes.get('/stats', requireStaff, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ summary: await summarize() });
});

reviewRoutes.post('/', requireUser, postLimit, async (req, res) => {
  const b = req.body || {};
  const rating = Number(b.rating);
  if (!isStar(rating)) throw new HttpError(400, 'Choose from one to five stars.');
  const body = typeof b.body === 'string' ? b.body.trim() : '';
  if ([...body].length > MAX_REVIEW_BODY) throw new HttpError(400, `Keep your comment to ${MAX_REVIEW_BODY} characters.`, 'TEXT_TOO_LONG', { max: MAX_REVIEW_BODY });
  const role = typeof b.role === 'string' && REVIEW_ROLES.includes(b.role) ? b.role : undefined;
  // Each part: a whole number of stars from 1 to 5, or left out (anything else is dropped)
  const given = b.scores && typeof b.scores === 'object' && !Array.isArray(b.scores) ? b.scores : {};
  const scores = Object.fromEntries(REVIEW_PARTS.filter((p) => isStar(given[p])).map((p) => [p, given[p]]));

  // A new answer replaces the old one completely, so parts or a role left out this time are cleared
  const set = { rating, scores, body };
  const update = { $set: set, $setOnInsert: { user: req.user._id, createdAt: new Date() } };
  if (role) set.role = role; else update.$unset = { role: 1 };
  const had = await Review.exists({ user: req.user._id });
  if (had) set.editedAt = new Date();
  let review;
  try {
    review = await Review.findOneAndUpdate({ user: req.user._id }, update, { upsert: true, returnDocument: 'after', runValidators: true });
  } catch (err) {
    // Two sends at the same moment: the other one made the review, so this one changes it
    if (err?.code !== 11000) throw err;
    delete update.$setOnInsert;
    review = await Review.findOneAndUpdate({ user: req.user._id }, update, { returnDocument: 'after', runValidators: true });
  }

  const who = req.user.name ? `${esc(req.user.name)} (${esc(req.user.email)})` : esc(req.user.email);
  const rows = REVIEW_PARTS.map((p) => `${PART_NAMES[p]}: ${scores[p] ? stars(scores[p]) : 'not rated'}`).join('<br>');
  // The weakest part rated, in the subject, so the inbox shows at a glance what someone found bad
  const lowest = Object.entries(scores).sort((x, y) => x[1] - y[1])[0];
  sendTeamMail({
    kind: 'review',
    replyTo: req.user.email,
    title: `Review ${rating}/5${lowest && lowest[1] < rating ? ` · lowest: ${PART_NAMES[lowest[0]]} ${lowest[1]}/5` : ''}${had ? ' (changed)' : ''}`,
    data: { rating, ...Object.fromEntries(REVIEW_PARTS.map((p) => [p, scores[p] ?? null])), role: role || null, changed: !!had, text: body || '' },
    html: `<p><b>${who}</b>${role ? `, the ${role},` : ''} gave Momento <b>${rating} out of 5</b> overall.</p>
      <p>${rows}</p>
      ${body ? `<blockquote style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #6C5FC7;background:#F6F4FA;white-space:pre-wrap">${esc(body)}</blockquote>` : '<p>No comment.</p>'}
      <p style="color:#5C596B;font-size:13px">Review ${review.id}. Reply to this email to answer them. To leave it out of the numbers, set hidden: true on it.</p>`,
  }).catch((err) => console.error(`Review ${review.id} saved but not emailed: ${err.message}`));

  res.status(had ? 200 : 201).json({ review: shape(review) });
});

reviewRoutes.delete('/:id', requireUser, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'That review has already been deleted.');
  const review = await Review.findById(req.params.id);
  if (!review) throw new HttpError(404, 'That review has already been deleted.');
  if (String(review.user) !== String(req.user._id)) throw new HttpError(403, 'You can only delete your own review.');
  await review.deleteOne();
  res.json({ ok: true });
});
