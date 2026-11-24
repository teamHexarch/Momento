import { Router } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';
import { Review, REVIEW_AREAS, REVIEW_ROLES, REVIEW_EVENTS, MAX_REVIEW_BODY } from '../models/Review.js';
import { requireUser, requireStaff } from '../middleware/authMiddleware.js';
import { sendEmail } from '../services/emailService.js';
import { HttpError } from '../utils/httpError.js';

// The Reviews page (/reviews): private feedback for the team. Nobody sees anyone else's review.
// The shapes are in Client/BACKEND-NOTES-NEXT.md and Client/src/lib/api.ts.
//   GET    /api/reviews          anyone (signed out: mine is null)   { mine }
//   POST   /api/reviews  { rating, role?, event?, worked?, better?, body? }   signed in   { review }
//   DELETE /api/reviews/:id      signed in, own review only   { ok }
//   GET    /api/reviews/stats    staff only (404 for everyone else)   { summary }
// Each review is emailed to SUPPORT_EMAIL so the team sees feedback as it arrives.
export const reviewRoutes = Router();

const AREA_NAMES = { join: 'Joining', upload: 'Adding photos', quality: 'Photo quality', find: 'Finding photos', guests: 'Guests joining in', privacy: 'Privacy' };
const EVENT_PHRASE = { wedding: 'a wedding', birthday: 'a birthday', party: 'a party', work: 'a work event', trip: 'a trip', other: 'another kind of event' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const postLimit = rateLimit({
  windowMs: 60 * 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: { error: 'You’ve changed your review a lot in the last hour. Wait a while, then try again.' },
});

/** Your own review, as the page sees it */
function shape(r) {
  const out = { id: String(r._id), rating: r.rating, worked: r.worked || [], better: r.better || [], createdAt: r.createdAt.toISOString() };
  if (r.role) out.role = r.role;
  if (r.event) out.event = r.event;
  if (r.body) out.body = r.body;
  if (r.editedAt) out.updatedAt = r.editedAt.toISOString();
  return out;
}

/** The team's numbers for every review that isn't hidden: the stars, each checklist area, hosts and guests, events */
async function summarize() {
  const [s] = await Review.aggregate([
    { $match: { hidden: { $ne: true } } },
    { $facet: {
      ratings: [{ $group: { _id: '$rating', n: { $sum: 1 } } }],
      worked: [{ $unwind: '$worked' }, { $group: { _id: '$worked', n: { $sum: 1 } } }],
      better: [{ $unwind: '$better' }, { $group: { _id: '$better', n: { $sum: 1 } } }],
      roles: [{ $match: { role: { $in: REVIEW_ROLES } } }, { $group: { _id: '$role', n: { $sum: 1 } } }],
      events: [{ $match: { event: { $in: REVIEW_EVENTS } } }, { $group: { _id: '$event', n: { $sum: 1 } } }],
      comments: [{ $match: { body: { $gt: '' } } }, { $count: 'n' }],
    } },
  ]);
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0, total = 0;
  for (const { _id, n } of s.ratings) if (counts[_id] !== undefined) { counts[_id] = n; count += n; total += _id * n; }
  const areas = Object.fromEntries(REVIEW_AREAS.map((a) => [a, { worked: 0, better: 0 }]));
  for (const { _id, n } of s.worked) if (areas[_id]) areas[_id].worked = n;
  for (const { _id, n } of s.better) if (areas[_id]) areas[_id].better = n;
  const roles = Object.fromEntries(REVIEW_ROLES.map((r) => [r, 0]));
  for (const { _id, n } of s.roles) roles[_id] = n;
  const events = Object.fromEntries(REVIEW_EVENTS.map((e) => [e, 0]));
  for (const { _id, n } of s.events) events[_id] = n;
  return { average: count ? Math.round((total / count) * 10) / 10 : 0, count, counts, areas, roles, events, comments: s.comments[0]?.n ?? 0 };
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
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'Choose from one to five stars.');
  const body = typeof b.body === 'string' ? b.body.trim() : '';
  if (body.length > MAX_REVIEW_BODY) throw new HttpError(400, 'Keep your comment under 1,500 characters.');
  const one = (v, list) => (typeof v === 'string' && list.includes(v) ? v : undefined);
  const many = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && REVIEW_AREAS.includes(x)))] : []);
  // An area is either working well or could be better; if both were sent, "could be better" wins
  const better = many(b.better);
  const worked = many(b.worked).filter((a) => !better.includes(a));
  const role = one(b.role, REVIEW_ROLES), event = one(b.event, REVIEW_EVENTS);

  const set = { rating, worked, better, body };
  const unset = {};
  if (role) set.role = role; else unset.role = 1;
  if (event) set.event = event; else unset.event = 1;
  const had = await Review.exists({ user: req.user._id });
  if (had) set.editedAt = new Date();
  const update = { $set: set, $setOnInsert: { user: req.user._id, createdAt: new Date() } };
  if (Object.keys(unset).length) update.$unset = unset;
  let review;
  try {
    review = await Review.findOneAndUpdate({ user: req.user._id }, update, { upsert: true, returnDocument: 'after', runValidators: true });
  } catch (err) {
    // Two sends at the same moment: the other one made the review, so this one changes it
    if (err?.code !== 11000) throw err;
    delete update.$setOnInsert;
    review = await Review.findOneAndUpdate({ user: req.user._id }, update, { returnDocument: 'after', runValidators: true });
  }

  const list = (keys) => keys.map((k) => esc(AREA_NAMES[k])).join(', ') || 'nothing ticked';
  const who = req.user.name ? `${esc(req.user.name)} (${esc(req.user.email)})` : esc(req.user.email);
  sendEmail({
    to: config.support.inbox,
    replyTo: req.user.email,
    subject: `[Momento review] ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)} ${rating}/5${had ? ' (changed)' : ''}`,
    html: `<p><b>${who}</b> gave Momento <b>${rating} out of 5</b>${role ? ` as the ${role}` : ''}${event ? ` at ${EVENT_PHRASE[event]}` : ''}.</p>
      <p>Worked well: ${list(worked)}<br>Could be better: ${list(better)}</p>
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
