import mongoose from 'mongoose';
import webpush from 'web-push';
import { config } from '../config/env.js';
import { Notification } from '../models/Notification.js';
import { PushSubscription } from '../models/PushSubscription.js';

// Notifications: saved for the inbox (GET /api/notifications), and sent as a phone or computer push
// when the person has turned push on (Web Push, free; needs VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).
// Nothing here ever stops the thing that caused it (a like, a join): failures are only logged.

const pushReady = Boolean(config.push.publicKey && config.push.privateKey);
if (pushReady) webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey);
export const isPushConfigured = () => pushReady;

const firstName = (name) => (name || '').trim().split(/\s+/)[0] || 'Someone';
const TEXT = {
  like: (n) => `${n.by} liked your photo in ${n.albumName}`,
  reaction: (n) => `${n.by} reacted ${n.emoji} to your photo in ${n.albumName}`,
  joined: (n) => `${n.by} joined ${n.albumName}`,
  request: (n) => `${n.by} is asking to join ${n.albumName}`,
  approved: (n) => `You’re in! ${n.albumName} is ready for your photos`,
  photos: (n) => `${n.by} added ${n.count === 1 ? 'a photo' : `${n.count} photos`} to ${n.albumName}`,
};
export const textOf = (n) => (TEXT[n.type] || (() => 'Something new on Momento'))(n);

// notify({ user, type, actor, album, photo, emoji })   user: who it's for. Never for your own actions.
export async function notify({ user, type, actor, album, photo, emoji }) {
  try {
    if (!user || (actor && String(actor) === String(user))) return;
    // One like and one reaction per person per photo: a change updates it (and makes it unread again)
    const key = { user, type, actor, album, ...(photo && { photo }) };
    const n = ['like', 'reaction', 'joined', 'request'].includes(type)
      ? await Notification.findOneAndUpdate(key, { $set: { emoji, read: false, at: new Date() } }, { upsert: true, returnDocument: 'after' })
      : await Notification.create({ ...key, emoji });
    if (pushReady) sendPush(n).catch((err) => console.error(`Push failed: ${err.message}`));
  } catch (err) {
    console.error(`Notification failed: ${err.message}`);
  }
}

// New photos in an album: everyone else in it hears, in one notification per person per album and
// uploader ("Gus added 5 photos"). While it's unread the count adds up. A push goes out the first time,
// once they've read it, or an hour after the last one, so a long upload doesn't buzz phones over and over.
export async function notifyPhotos({ users, actor, album, count }) {
  try {
    const targets = [...new Set(users.map(String))].filter((u) => u !== String(actor));
    if (!targets.length || !count) return;
    const filter = { type: 'photos', actor, album };
    const before = new Map((await Notification.find({ ...filter, user: { $in: targets } }, 'user read at')).map((n) => [String(n.user), n]));
    const now = new Date();
    await Notification.bulkWrite(targets.map((u) => ({
      updateOne: {
        filter: { ...filter, user: u },
        update: [{ $set: {
          user: new mongoose.Types.ObjectId(u), type: 'photos', actor, album,
          count: { $cond: [{ $eq: ['$read', false] }, { $add: [{ $ifNull: ['$count', 0] }, count] }, count] },
          read: false, at: now,
        } }],
        upsert: true,
      },
    })));
    if (!pushReady) return;
    const pushTo = targets.filter((u) => { const b = before.get(u); return !b || b.read || now - b.at > 3600000; });
    if (!pushTo.length) return;
    const fresh = await Notification.find({ ...filter, user: { $in: pushTo } });
    for (const n of fresh) sendPush(n).catch((err) => console.error(`Push failed: ${err.message}`));
  } catch (err) {
    console.error(`Photo notifications failed: ${err.message}`);
  }
}

// Takes one back (a like undone, a reaction removed)
export async function unnotify({ user, type, actor, photo }) {
  await Notification.deleteOne({ user, type, actor, photo }).catch(() => {});
}

// The inbox's view of a notification
export async function describe(list) {
  await Notification.populate(list, [{ path: 'actor', select: 'name avatarKey avatarUrl' }, { path: 'album', select: 'name' }]);
  const { avatarOf } = await import('./avatarService.js');
  return list.map((n) => {
    const out = {
      id: n.id, type: n.type, read: n.read, at: n.at, emoji: n.emoji || undefined, count: n.count || undefined,
      by: firstName(n.actor?.name), avatarUrl: avatarOf(n.actor),
      albumId: n.album?.id, albumName: n.album?.name || 'an album',
      photoId: n.photo ? String(n.photo) : undefined,
      thumbUrl: n.photo ? `${config.publicUrl}/api/photos/${n.photo}?size=thumb` : undefined,
    };
    out.text = textOf(out);
    return out;
  });
}

// ---- Push ----
async function sendPush(n) {
  const subs = await PushSubscription.find({ user: n.user });
  if (!subs.length) return;
  const [item] = await describe([n]);
  const url = `${config.frontendUrl}/albums.html${item.albumId ? `?album=${item.albumId}` : ''}`;
  const payload = JSON.stringify({ title: 'Momento', body: item.text, url, tag: `momento-${n.type}-${n.photo || n.album}`, icon: item.avatarUrl || undefined });
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 24 * 3600 });
    } catch (err) {
      // That browser turned push off or the subscription expired: forget it
      if (err.statusCode === 404 || err.statusCode === 410) await s.deleteOne();
      else throw err;
    }
  }));
}

// When an account is deleted
export async function forgetUser(userId) {
  await Promise.all([Notification.deleteMany({ $or: [{ user: userId }, { actor: userId }] }), PushSubscription.deleteMany({ user: userId })]);
}
