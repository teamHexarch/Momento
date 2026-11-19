import { Router } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { requireVerified } from '../middleware/authMiddleware.js';
import { Notification } from '../models/Notification.js';
import { PushSubscription } from '../models/PushSubscription.js';
import { describe, isPushConfigured } from '../services/notifyService.js';
import { config } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

// The notifications inbox, and turning phone/computer push on or off
export const notificationRoutes = Router();

// The public half of the push key (browsers need it to subscribe). No login needed
notificationRoutes.get('/push/key', (req, res) => res.json({ key: isPushConfigured() ? config.push.publicKey : null }));

notificationRoutes.use(requireVerified);

// Old "liked your photo" notifications aren't shown: likes are private bookmarks now
const SHOWN = { type: { $ne: 'like' } };
const unreadOf = (userId) => Notification.countDocuments({ user: userId, read: false, ...SHOWN });

// GET /api/notifications[?before=<ISO time>]  The newest 30 (or the 30 before), and how many are unread
notificationRoutes.get('/', async (req, res) => {
  const before = req.query.before ? new Date(String(req.query.before)) : null;
  const filter = { user: req.user._id, ...SHOWN, ...(before && !Number.isNaN(before.getTime()) && { at: { $lt: before } }) };
  const [list, unread] = await Promise.all([
    Notification.find(filter).sort({ at: -1 }).limit(30),
    unreadOf(req.user._id),
  ]);
  res.set('Cache-Control', 'no-store').json({ notifications: await describe(list), unread, more: list.length === 30 });
});

// GET /api/notifications/unread  Just the count, for a badge (cheap enough to check often)
notificationRoutes.get('/unread', async (req, res) => {
  res.set('Cache-Control', 'no-store').json({ unread: await unreadOf(req.user._id) });
});

// POST /api/notifications/read  { ids: [...] } marks those; { album } those about that album; {} (or { all: true }) every one
notificationRoutes.post('/read', async (req, res) => {
  const filter = { user: req.user._id, read: false };
  // { album } : the person opened that album, so what's about it has been seen (not join requests, which
  // still wait for an answer)
  if (req.body?.album !== undefined) {
    if (!mongoose.isValidObjectId(req.body.album)) throw new HttpError(400, 'That album isn’t valid.');
    const r = await Notification.updateMany({ ...filter, album: req.body.album, type: { $ne: 'request' } }, { read: true });
    return res.json({ marked: r.modifiedCount, unread: await unreadOf(req.user._id) });
  }
  if (req.body?.all !== true && Array.isArray(req.body?.ids)) {
    const ids = req.body.ids.filter((id) => mongoose.isValidObjectId(id)).slice(0, 200);
    if (!ids.length) return res.json({ marked: 0, unread: await unreadOf(req.user._id) });
    filter._id = { $in: ids };
  }
  const r = await Notification.updateMany(filter, { read: true });
  res.json({ marked: r.modifiedCount, unread: await unreadOf(req.user._id) });
});

// POST /api/notifications/clear  { before: <ISO time> }  "Clear all": deletes your notifications up to that
// time (the newest one the inbox showed), so one that arrived meanwhile stays. Without before: all of them.
notificationRoutes.post('/clear', async (req, res) => {
  const before = req.body?.before ? new Date(String(req.body.before)) : null;
  if (before && Number.isNaN(before.getTime())) throw new HttpError(400, 'That time isn’t valid.');
  const r = await Notification.deleteMany({ user: req.user._id, ...(before && { at: { $lte: before } }) });
  res.json({ cleared: r.deletedCount, unread: await unreadOf(req.user._id) });
});

// Push: a browser hands over its subscription (from PushManager.subscribe), or takes it back
const pushLimit = rateLimit({ windowMs: 60 * 60000, limit: 30, keyGenerator: (req) => 'user:' + req.user.id, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many tries. Wait a while.' } });
notificationRoutes.post('/push', pushLimit, async (req, res) => {
  if (!isPushConfigured()) throw new HttpError(503, 'Push notifications aren’t set up on this server yet.');
  const s = req.body?.subscription;
  const endpoint = String(s?.endpoint || '');
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !s?.keys?.p256dh || !s?.keys?.auth) throw new HttpError(400, 'That push subscription isn’t valid.');
  await PushSubscription.findOneAndUpdate({ endpoint }, { user: req.user._id, endpoint, keys: { p256dh: String(s.keys.p256dh), auth: String(s.keys.auth) } }, { upsert: true });
  res.status(201).json({ ok: true });
});
notificationRoutes.delete('/push', async (req, res) => {
  await PushSubscription.deleteOne({ endpoint: String(req.body?.endpoint || ''), user: req.user._id });
  res.json({ ok: true });
});
