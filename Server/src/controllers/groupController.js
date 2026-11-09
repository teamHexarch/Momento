import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { Album } from '../models/Album.js';
import { Group } from '../models/Group.js';
import { GroupMember } from '../models/GroupMember.js';
import { GroupInvite } from '../models/GroupInvite.js';
import { GroupMessage } from '../models/GroupMessage.js';
import { User } from '../models/User.js';
import { sendEmail } from '../services/emailService.js';
import { groupInviteHtml } from '../services/emailTemplates.js';
import { dropGroupRows } from '../services/groupAccess.js';
import { avatarOf, AVATAR_FIELDS } from '../services/avatarService.js';
import { HttpError } from '../utils/httpError.js';
import { albumSummaries } from './albumController.js';

// Friend groups. Every request starts from the logged-in user (requireVerified on the routes),
// then checks their GroupMember row for the group: outsiders get a 404, so group ids can't be
// probed, and members who aren't the owner get a 403 for owner-only actions.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_DAYS = 30;
const firstName = (name) => (name || '').trim().split(/\s+/)[0] || 'Someone';
const notFound = () => new HttpError(404, 'Group not found.');

function readName(body) {
  const name = String(body?.name ?? '').trim();
  if (!name) throw new HttpError(400, 'Give the group a name.');
  if (name.length > 60) throw new HttpError(400, 'Keep the name under 60 characters.');
  return name;
}

// The group and the caller's row in it, or a 404
async function memberOf(req, groupId = req.params.id) {
  if (!mongoose.isValidObjectId(groupId)) throw notFound();
  const [group, me] = await Promise.all([Group.findById(groupId), GroupMember.findOne({ group: groupId, user: req.user._id })]);
  if (!group || !me) throw notFound();
  return { group, me };
}
async function ownerOf(req) {
  const found = await memberOf(req);
  if (found.me.role !== 'owner') throw new HttpError(403, 'Only the person who made the group can do that.');
  return found;
}

// A group as its members see it: people, invites still waiting, and the shared albums
async function view(group, userId) {
  const [members, invites, albums] = await Promise.all([
    GroupMember.find({ group: group._id }).sort({ createdAt: 1 }).populate('user', AVATAR_FIELDS),
    GroupInvite.find({ group: group._id, expiresAt: { $gt: new Date() } }).sort({ createdAt: 1 }).populate('invitedBy', 'name'),
    Album.find({ group: group._id }).sort({ date: -1 }),
  ]);
  const me = members.find((m) => m.user?._id.equals(userId));
  const owner = me?.role === 'owner';
  return {
    id: group.id,
    name: group.name,
    role: me?.role || 'member',
    members: members.filter((m) => m.user).map((m) => ({
      id: m.user.id,
      name: m.user._id.equals(userId) ? 'You' : (m.user.name || '').trim() || 'Someone',
      you: m.user._id.equals(userId),
      avatarUrl: avatarOf(m.user),
      role: m.role,
      since: m.createdAt,
    })),
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      by: i.invitedBy?._id.equals(userId) ? 'you' : firstName(i.invitedBy?.name),
      canCancel: owner || !!i.invitedBy?._id.equals(userId),
      at: i.createdAt,
    })),
    albums: await albumSummaries(albums, userId),
    unread: me ? await unreadIn(group._id, me) : 0,
  };
}

// Messages from other people since this member last read the chat
function unreadIn(groupId, me) {
  return GroupMessage.countDocuments({ group: groupId, user: { $ne: me.user?._id || me.user }, createdAt: { $gt: me.lastReadAt || me.createdAt } });
}

// Takes someone out of a group: albums they host leave the group with them, and the rows that
// remembered what they hid in the group's albums are cleared
async function takeOut(groupId, userId) {
  const shared = await Album.find({ group: groupId }, '_id host');
  const theirs = shared.filter((a) => a.host.equals(userId)).map((a) => a._id);
  if (theirs.length) {
    await Album.updateMany({ _id: { $in: theirs } }, { $unset: { group: 1 } });
    await dropGroupRows({ album: { $in: theirs } });
  }
  await dropGroupRows({ user: userId, album: { $in: shared.map((a) => a._id) } });
  await GroupMember.deleteOne({ group: groupId, user: userId });
}

// Deletes a group; its albums stay with their hosts
async function deleteGroup(group) {
  const shared = await Album.find({ group: group._id }, '_id');
  await Album.updateMany({ group: group._id }, { $unset: { group: 1 } });
  await Promise.all([
    dropGroupRows({ album: { $in: shared.map((a) => a._id) } }),
    GroupMember.deleteMany({ group: group._id }),
    GroupInvite.deleteMany({ group: group._id }),
    GroupMessage.deleteMany({ group: group._id }),
  ]);
  typingNow.delete(group.id);
  await group.deleteOne();
}

// When an account is deleted: groups it made go, and it leaves the rest
export async function deleteGroupsOf(user) {
  for (const g of await Group.find({ owner: user._id })) await deleteGroup(g);
  for (const m of await GroupMember.find({ user: user._id })) await takeOut(m.group, user._id);
  await Promise.all([
    GroupInvite.deleteMany({ $or: [{ invitedBy: user._id }, { email: user.email }] }),
    GroupMessage.deleteMany({ user: user._id }),
  ]);
}

// ---- Groups ----

// Your groups, and invites waiting for you
export async function list(req, res) {
  const mine = await GroupMember.find({ user: req.user._id }).sort({ createdAt: 1 });
  const groups = await Group.find({ _id: { $in: mine.map((m) => m.group) } });
  const order = new Map(mine.map((m, i) => [String(m.group), i]));
  groups.sort((a, b) => order.get(a.id) - order.get(b.id));
  // Only for a confirmed address: anyone can sign up with an email they don't own
  const waiting = req.user.emailVerified
    ? await GroupInvite.find({ email: req.user.email, expiresAt: { $gt: new Date() }, group: { $nin: groups.map((g) => g._id) } })
      .sort({ createdAt: -1 }).limit(20).populate('group').populate('invitedBy', 'name')
    : [];
  const live = waiting.filter((i) => i.group);
  const [memberCounts, albumCounts] = await Promise.all([
    GroupMember.aggregate([{ $match: { group: { $in: live.map((i) => i.group._id) } } }, { $group: { _id: '$group', n: { $sum: 1 } } }]),
    Album.aggregate([{ $match: { group: { $in: live.map((i) => i.group._id) } } }, { $group: { _id: '$group', n: { $sum: 1 } } }]),
  ]);
  const count = (rows) => new Map(rows.map((r) => [String(r._id), r.n]));
  const people = count(memberCounts), albums = count(albumCounts);
  res.json({
    groups: await Promise.all(groups.map((g) => view(g, req.user._id))),
    invites: live.map((i) => ({
      id: i.id,
      group: { id: i.group.id, name: i.group.name },
      by: firstName(i.invitedBy?.name),
      members: people.get(i.group.id) || 0,
      albums: albums.get(i.group.id) || 0,
      at: i.createdAt,
    })),
  });
}

export async function create(req, res) {
  const name = readName(req.body);
  if (await GroupMember.countDocuments({ user: req.user._id }) >= 50) throw new HttpError(400, 'You’re in 50 groups already. Leave one to make another.');
  const group = await Group.create({ name, owner: req.user._id });
  await GroupMember.create({ group: group._id, user: req.user._id, role: 'owner' });
  res.status(201).json({ group: await view(group, req.user._id) });
}

export async function show(req, res) {
  const { group } = await memberOf(req);
  res.json({ group: await view(group, req.user._id) });
}

export async function rename(req, res) {
  const { group } = await ownerOf(req);
  group.name = readName(req.body);
  await group.save();
  res.json({ group: await view(group, req.user._id) });
}

export async function remove(req, res) {
  const { group } = await ownerOf(req);
  await deleteGroup(group);
  res.json({ ok: true });
}

// ---- Invites ----

// Any member can invite someone by email; it waits on their Groups page and is emailed to them
export async function invite(req, res) {
  const { group } = await memberOf(req);
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'Enter an email address like name@example.com.');
  if (!req.user.emailVerified) throw new HttpError(403, 'Confirm your email first: we sent you a link when you signed up (My albums can send it again).');
  const existing = await User.findOne({ email }, '_id');
  if (existing && await GroupMember.exists({ group: group._id, user: existing._id })) {
    throw new HttpError(400, existing._id.equals(req.user._id) ? 'You’re in this group already.' : 'They’re in this group already.');
  }
  if (await GroupInvite.countDocuments({ group: group._id }) >= 100) throw new HttpError(400, 'This group has a lot of invites waiting. Take some back first.');
  await GroupInvite.findOneAndUpdate(
    { group: group._id, email },
    { invitedBy: req.user._id, expiresAt: new Date(Date.now() + INVITE_DAYS * 86400000) },
    { upsert: true, setDefaultsOnInsert: true },
  );
  try {
    await sendEmail({
      to: email,
      subject: `${firstName(req.user.name)} invited you to ${group.name} on Momento`,
      html: groupInviteHtml(group.name, req.user.name, `${config.frontendUrl}/groups.html`),
    });
  } catch (err) {
    // The invite still waits on their Groups page
    console.error(`Group invite email failed: ${err.message}`);
  }
  res.status(201).json({ group: await view(group, req.user._id) });
}

// The owner, or whoever sent it, can take an invite back
export async function cancelInvite(req, res) {
  const { group, me } = await memberOf(req);
  if (!mongoose.isValidObjectId(req.params.inviteId)) throw new HttpError(404, 'Invite not found.');
  const inv = await GroupInvite.findOne({ _id: req.params.inviteId, group: group._id });
  if (!inv) throw new HttpError(404, 'Invite not found.');
  if (me.role !== 'owner' && !inv.invitedBy.equals(req.user._id)) throw new HttpError(403, 'Only the person who sent it or the group’s owner can take it back.');
  await inv.deleteOne();
  res.json({ group: await view(group, req.user._id) });
}

// An invite is valid only for the person it was sent to (confirmed address), for this group,
// while the group still exists and before it expires
async function inviteFor(req) {
  const id = req.params.inviteId;
  if (!req.user.emailVerified || !mongoose.isValidObjectId(id)) throw new HttpError(404, 'Invite not found.');
  const inv = await GroupInvite.findOne({ _id: id, email: req.user.email, expiresAt: { $gt: new Date() } });
  const group = inv && await Group.findById(inv.group);
  if (!group) throw new HttpError(404, 'That invite has expired or was taken back.');
  return { inv, group };
}

export async function accept(req, res) {
  const { inv, group } = await inviteFor(req);
  // One membership per person per group: accepting twice (or two taps at once) changes nothing
  try {
    await GroupMember.updateOne({ group: group._id, user: req.user._id }, { $setOnInsert: { role: 'member' } }, { upsert: true });
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
  await inv.deleteOne();
  res.json({ group: await view(group, req.user._id) });
}

export async function decline(req, res) {
  const { inv } = await inviteFor(req);
  await inv.deleteOne();
  res.json({ ok: true });
}

// ---- People ----

// DELETE /:id/members/me: leave. DELETE /:id/members/:userId: the owner removes someone.
export async function removeMember(req, res) {
  const self = req.params.userId === 'me' || req.params.userId === req.user.id;
  const { group, me } = await memberOf(req);
  if (self) {
    if (me.role === 'owner') throw new HttpError(400, 'You made this group. Delete it instead, or it would have no one to look after it.');
    await takeOut(group._id, req.user._id);
    return res.json({ ok: true });
  }
  if (me.role !== 'owner') throw new HttpError(403, 'Only the person who made the group can remove people.');
  if (!mongoose.isValidObjectId(req.params.userId)) throw new HttpError(404, 'They’re not in this group.');
  if (!(await GroupMember.exists({ group: group._id, user: req.params.userId }))) throw new HttpError(404, 'They’re not in this group.');
  await takeOut(group._id, new mongoose.Types.ObjectId(req.params.userId));
  res.json({ group: await view(group, req.user._id) });
}

// ---- The group's chat: members only, checked on every read and send ----

const messageOut = (m, userId) => ({
  id: m.id,
  text: m.text,
  avatarUrl: avatarOf(m.user),
  by: m.user?._id.equals(userId) ? 'You' : (m.user?.name || '').trim() || 'Someone',
  you: !!m.user?._id.equals(userId),
  at: m.createdAt,
});

// The newest 50 messages (oldest first), or the 50 before ?before=<ISO time>
export async function messages(req, res) {
  const { group } = await memberOf(req);
  const before = req.query.before ? new Date(String(req.query.before)) : null;
  const filter = { group: group._id, ...(before && !Number.isNaN(before.getTime()) && { createdAt: { $lt: before } }) };
  const list = await GroupMessage.find(filter).sort({ createdAt: -1 }).limit(50).populate('user', AVATAR_FIELDS);
  if (!before) await GroupMember.updateOne({ group: group._id, user: req.user._id }, { lastReadAt: new Date() });
  res.json({ messages: list.reverse().map((m) => messageOut(m, req.user._id)), more: list.length === 50, typing: typingIn(group.id, req.user.id) });
}

// Who is typing, kept in memory for a few seconds (one server process). POST /:id/typing says
// "I'm typing"; it lasts 6 seconds unless sent again, and ends when the message is sent.
const typingNow = new Map();   // group id -> Map(user id -> { name, avatarUrl, until })
const TYPING_MS = 6000;
function typingIn(groupId, exceptUserId) {
  const people = typingNow.get(groupId);
  if (!people) return [];
  const now = Date.now(), out = [];
  for (const [id, t] of people) {
    if (t.until < now) people.delete(id);
    else if (id !== exceptUserId) out.push({ name: t.name, avatarUrl: t.avatarUrl });
  }
  if (!people.size) typingNow.delete(groupId);
  return out;
}
export async function typing(req, res) {
  const { group } = await memberOf(req);
  if (!typingNow.has(group.id)) typingNow.set(group.id, new Map());
  const stop = req.body?.typing === false;
  if (stop) typingNow.get(group.id).delete(req.user.id);
  else typingNow.get(group.id).set(req.user.id, { name: firstName(req.user.name), avatarUrl: avatarOf(req.user), until: Date.now() + TYPING_MS });
  res.json({ typing: typingIn(group.id, req.user.id) });
}

// For the notifications on every page: unread chat messages in each of your groups, with the newest
export async function unread(req, res) {
  const mine = await GroupMember.find({ user: req.user._id }).populate('group', 'name');
  const groups = [];
  for (const me of mine) {
    if (!me.group) continue;
    const since = me.lastReadAt || me.createdAt;
    const filter = { group: me.group._id, user: { $ne: req.user._id }, createdAt: { $gt: since } };
    const n = await GroupMessage.countDocuments(filter);
    if (!n) continue;
    const latest = await GroupMessage.findOne(filter).sort({ createdAt: -1 }).populate('user', AVATAR_FIELDS);
    groups.push({ id: me.group.id, name: me.group.name, unread: n, latest: latest && messageOut(latest, req.user._id) });
  }
  res.json({ total: groups.reduce((t, g) => t + g.unread, 0), groups });
}

export async function sendMessage(req, res) {
  const { group } = await memberOf(req);
  const text = String(req.body?.text ?? '').trim();
  if (!text) throw new HttpError(400, 'Write a message first.');
  if (text.length > 1000) throw new HttpError(400, 'Keep messages under 1,000 characters.');
  const m = await GroupMessage.create({ group: group._id, user: req.user._id, text });
  await m.populate('user', AVATAR_FIELDS);
  typingNow.get(group.id)?.delete(req.user.id);
  await GroupMember.updateOne({ group: group._id, user: req.user._id }, { lastReadAt: new Date() });
  res.status(201).json({ message: messageOut(m, req.user._id) });
}
