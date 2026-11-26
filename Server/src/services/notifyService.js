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
// How long until a time, in words: "3 days", "5 hours", "20 minutes"
const until = (t) => {
  const mins = Math.max(1, Math.round((new Date(t) - Date.now()) / 60000));
  if (mins >= 2 * 1440) return `${Math.round(mins / 1440)} days`;
  if (mins >= 90) return `${Math.round(mins / 60)} hours`;
  return mins >= 60 ? '1 hour' : `${mins} minute${mins === 1 ? '' : 's'}`;
};
const TEXT = {
  like: (n) => `${n.by} liked your photo in ${n.albumName}`,
  reaction: (n) => `${n.by} reacted ${n.emoji} to your photo in ${n.albumName}`,
  joined: (n) => `${n.by} joined ${n.albumName}`,
  request: (n) => `${n.by} asked to join ${n.albumName}`,
  approved: (n) => `You’re in! ${n.albumName} is ready for your photos`,
  photos: (n) => `${n.by} added ${n.count === 1 ? 'a photo' : `${n.count} photos`} to ${n.albumName}`,
  invite: (n) => `${n.by} invited you to ${n.groupName}`,
  'review-approved': (n) => `Your photo was approved and is now in ${n.albumName || 'the album'}`,
  'review-declined': (n) => `Our team reviewed your photo for ${n.albumName || 'the album'} and declined it`,
  'game-won': (n) => `You won ${n.gameTitle || 'a game'} at ${n.albumName}! 🏆`,
  closing: (n) => (n.endsAt && new Date(n.endsAt) > Date.now()
    ? `${n.albumName} stops taking photos in ${until(n.endsAt)}`
    : `${n.albumName} has stopped taking photos`),
};
const BODY = {
  request: () => 'Approve or decline them here, or in the album’s settings.',
  'review-approved': () => 'Thanks for asking. Everyone in the album can see it now.',
  'review-declined': () => 'It stays private and is deleted after 30 days.',
  'game-won': () => 'Open the event to see the final standings.',
  closing: (n) => (n.endsAt && new Date(n.endsAt) > Date.now() ? 'Add any last photos before it’s kept for good.' : undefined),
};
export const textOf = (n) => (TEXT[n.type] || (() => 'Something new on Momento'))(n);

// Settings → "Activity on my public albums" (notify.activity): when the host turns it off, joins and new
// photos in the public albums they host don't reach their inbox. Returns the people who still want to hear.
const ACTIVITY = new Set(['joined', 'photos']);
async function wantActivity(users, album) {
  if (!album || !users.length) return users;
  const [{ Album }, { User }] = await Promise.all([import('../models/Album.js'), import('../models/User.js')]);
  const a = await Album.findById(album, 'visibility host').lean();
  if (a?.visibility !== 'public' || !users.some((u) => String(u) === String(a.host))) return users;
  const off = await User.exists({ _id: a.host, 'notify.activity': false });
  return off ? users.filter((u) => String(u) !== String(a.host)) : users;
}

// Reactions, likes and new photos only reach people who are in that album (joined it, host it, or are in
// its group): someone who left, or was removed, hears nothing more about it
const MEMBERS_ONLY = new Set(['like', 'reaction', 'photos']);
async function inAlbum(users, album) {
  if (!album || !users.length) return users;
  const [{ Album }, { Membership }, { GroupMember }] = await Promise.all([
    import('../models/Album.js'), import('../models/Membership.js'), import('../models/GroupMember.js')]);
  const a = await Album.findById(album, 'host group').lean();
  if (!a) return [];
  const [rows, group] = await Promise.all([
    // ('group' rows only remember hidden photos; group access is checked through the group itself)
    Membership.find({ album, user: { $in: users }, via: { $ne: 'group' } }, 'user').lean(),
    a.group ? GroupMember.find({ group: a.group, user: { $in: users } }, 'user').lean() : [],
  ]);
  const ok = new Set([String(a.host), ...rows.map((r) => String(r.user)), ...group.map((r) => String(r.user))]);
  return users.filter((u) => ok.has(String(u)));
}

// notify({ user, type, actor, album, photo, emoji })   user: who it's for. Never for your own actions.
export async function notify({ user, type, actor, album, photo, emoji, group, game, gameTitle }) {
  try {
    if (!user || (actor && String(actor) === String(user))) return;
    if (MEMBERS_ONLY.has(type) && !(await inAlbum([user], album)).length) return;
    if (ACTIVITY.has(type) && !(await wantActivity([user], album)).length) return;
    // One reaction per person per photo (a change updates it and makes it unread again); one join, request,
    // group invite and "closing soon" per album or group
    const key = { user, type, ...(actor && { actor }), ...(album && { album }), ...(photo && { photo }), ...(group && { group }), ...(game && { game }) };
    const n = ['like', 'reaction', 'joined', 'request', 'invite', 'closing'].includes(type)
      ? await Notification.findOneAndUpdate(key, { $set: { emoji, read: false, at: new Date() } }, { upsert: true, returnDocument: 'after' })
      : await Notification.create({ ...key, emoji, ...(gameTitle && { gameTitle }) });
    if (pushReady) sendPush(n).catch((err) => console.error(`Push failed: ${err.message}`));
  } catch (err) {
    console.error(`Notification failed: ${err.message}`);
  }
}

// New photos in an album: everyone else in it hears, in one notification per person per album and
// uploader ("Gus added 5 photos"). While it's unread the count adds up. A push goes out the first time,
// once they've read it, or an hour after the last one, so a long upload doesn't buzz phones over and over.
export async function notifyPhotos({ users, actor, album, count, photoIds = [] }) {
  try {
    const targets = await wantActivity(await inAlbum([...new Set(users.map(String))].filter((u) => u !== String(actor)), album), album);
    if (!targets.length || !count) return;
    const filter = { type: 'photos', actor, album };
    const before = new Map((await Notification.find({ ...filter, user: { $in: targets } }, 'user read at')).map((n) => [String(n.user), n]));
    const now = new Date();
    const ids = photoIds.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(String(id)));
    await Notification.bulkWrite(targets.map((u) => ({
      updateOne: {
        filter: { ...filter, user: u },
        update: [{ $set: {
          user: new mongoose.Types.ObjectId(u), type: 'photos', actor, album,
          count: { $cond: [{ $eq: ['$read', false] }, { $add: [{ $ifNull: ['$count', 0] }, count] }, count] },
          // Which ones: added to the list while it's unread (the newest 60), a fresh list once it was read
          photos: { $slice: [{ $cond: [{ $eq: ['$read', false] }, { $concatArrays: [{ $ifNull: ['$photos', []] }, ids] }, ids] }, -60] },
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

// Takes one back (a reaction removed, a group invite answered or taken back)
export async function unnotify({ user, type, actor, photo, group }) {
  await Notification.deleteMany({ user, type, ...(actor && { actor }), ...(photo && { photo }), ...(group && { group }) }).catch(() => {});
}

// Where tapping it goes (push notifications; the inbox works this out itself from the fields below)
export function linkOf(item) {
  if (item.type === 'invite') return `${config.frontendUrl}/events#needs`;
  // A game win: the event, with its Games window open at that game
  if (item.type === 'game-won' && item.albumId) return `${config.frontendUrl}/albums#album=${item.albumId}${item.gameId ? `&game=${item.gameId}` : ''}`;
  if (item.type === 'request' && item.albumId) return `${config.frontendUrl}/albums#requests=${item.albumId}${item.actor?.id ? `&guest=${item.actor.id}` : ''}`;
  return `${config.frontendUrl}/albums${item.albumId ? `?album=${item.albumId}` : ''}`;
}

// The inbox's view of a notification
export async function describe(list) {
  await Notification.populate(list, [
    { path: 'actor', select: 'name avatarKey avatarUrl' }, { path: 'album', select: 'name endsAt' }, { path: 'group', select: 'name' },
  ]);
  const { avatarOf } = await import('./avatarService.js');
  return list.map((n) => {
    const photoIds = n.type === 'photos' ? (n.photos || []).map(String) : n.photo ? [String(n.photo)] : undefined;
    const out = {
      id: n.id, type: n.type, read: n.read, at: n.at, emoji: n.emoji || undefined, count: n.count || undefined,
      // Who it's about (id: so a join request can be answered right from the inbox)
      actor: n.actor ? { id: n.actor.id, name: (n.actor.name || '').trim() || 'Someone', avatarUrl: avatarOf(n.actor) || undefined } : undefined,
      by: firstName(n.actor?.name), avatarUrl: avatarOf(n.actor),
      // An invite goes to "Needs you" (they aren't in the group yet), so no groupId to open
      albumId: n.album?.id, albumName: n.album?.name || 'an album', endsAt: n.album?.endsAt, groupName: n.group?.name || 'a group',
      photoIds: photoIds?.length ? photoIds : undefined,
      photoId: n.photo ? String(n.photo) : undefined,
      gameId: n.game ? String(n.game) : undefined, gameTitle: n.gameTitle || undefined,
      thumbUrl: n.photo ? `${config.publicUrl}/api/photos/${n.photo}?size=thumb` : undefined,
    };
    out.title = out.text = textOf(out);
    out.body = BODY[n.type]?.(out);
    delete out.endsAt; delete out.groupName;
    return out;
  });
}

// ---- Push ----
async function sendPush(n) {
  const subs = await PushSubscription.find({ user: n.user });
  if (!subs.length) return;
  const [item] = await describe([n]);
  const url = linkOf(item);
  const payload = JSON.stringify({ title: 'Momento', body: item.text, url, tag: `momento-${n.type}-${n.photo || n.album || n.group}`, icon: item.avatarUrl || undefined });
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
