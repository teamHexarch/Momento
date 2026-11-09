import { GroupMember } from '../models/GroupMember.js';
import { Membership } from '../models/Membership.js';

// Friend-group access, looked up live on every request: a person can see and add to an album
// shared with a group only while they have a GroupMember row for that group. Nothing is copied
// into album memberships, so leaving or being removed takes access away at once.

// Whether this person is in the group the album is shared with
export async function hasGroupAccess(userId, album) {
  if (!album?.group) return false;
  return !!(await GroupMember.exists({ group: album.group, user: userId }));
}

// The groups this person is in
export async function groupIdsOf(userId) {
  return (await GroupMember.find({ user: userId }, 'group')).map((g) => g.group);
}

// Clears the "what I've hidden" rows group members keep for albums they no longer reach through
// a group (they never granted access; this just tidies up)
export async function dropGroupRows(filter) {
  await Membership.deleteMany({ ...filter, via: 'group' });
}
