import { Router } from 'express';
import mongoose from 'mongoose';
import { requireUser } from '../middleware/authMiddleware.js';
import { User } from '../models/User.js';
import { Album } from '../models/Album.js';
import { Membership } from '../models/Membership.js';
import { GroupMember } from '../models/GroupMember.js';
import { GroupInvite } from '../models/GroupInvite.js';
import { Notification } from '../models/Notification.js';
import { sendPhoto } from '../services/storageService.js';
import { HttpError } from '../utils/httpError.js';

// Profile photos. Only for people who have a reason to see that person: themselves, someone sharing an
// album or a friend group with them, a host whose album they asked to join, someone they invited to a
// group, or someone they appear in a notification for. Anyone else gets 404, as if there were no photo,
// so profile photos can't be collected by walking through account ids.
export const userRoutes = Router();
userRoutes.use(requireUser);

export async function canSeeProfile(viewer, targetId) {
  const target = new mongoose.Types.ObjectId(String(targetId));
  if (viewer._id.equals(target)) return true;
  const [rows, groups] = await Promise.all([
    Membership.find({ user: viewer._id }, 'album').lean(),
    GroupMember.find({ user: viewer._id }, 'group').lean(),
  ]);
  const albumIds = rows.map((r) => r.album), groupIds = groups.map((g) => g.group);
  // Albums the viewer reaches through their groups, and the groups of the albums they're in
  const [groupAlbums, myAlbums] = await Promise.all([
    groupIds.length ? Album.find({ group: { $in: groupIds } }, '_id host').lean() : [],
    albumIds.length ? Album.find({ _id: { $in: albumIds } }, 'host group').lean() : [],
  ]);
  const reachable = [...albumIds, ...groupAlbums.map((a) => a._id)];
  if ([...groupAlbums, ...myAlbums].some((a) => a.host?.equals(target))) return true;
  const albumGroups = myAlbums.map((a) => a.group).filter(Boolean);
  const checks = [
    reachable.length && Membership.exists({ user: target, album: { $in: reachable } }),
    groupIds.length && GroupMember.exists({ user: target, group: { $in: groupIds } }),
    albumGroups.length && GroupMember.exists({ user: target, group: { $in: albumGroups } }),
    Album.exists({ host: viewer._id, 'requests.user': target }),
    GroupInvite.exists({ email: viewer.email, invitedBy: target }),
    Notification.exists({ user: viewer._id, actor: target }),
  ];
  for (const c of checks) if (c && await c) return true;
  return false;
}

userRoutes.get('/:id/avatar', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'No photo.');
  if (!(await canSeeProfile(req.user, req.params.id))) throw new HttpError(404, 'No photo.');
  const user = await User.findById(req.params.id, 'avatarKey');
  if (!user?.avatarKey || !(await sendPhoto(res, user.avatarKey, 'image/webp'))) throw new HttpError(404, 'No photo.');
});
