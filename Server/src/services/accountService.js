import { config } from '../config/env.js';
import { User } from '../models/User.js';
import { Album } from '../models/Album.js';
import { Membership } from '../models/Membership.js';
import { Photo } from '../models/Photo.js';
import { Invite } from '../models/Invite.js';
import { EmailToken } from '../models/EmailToken.js';
import { sendEmail, isEmailConfigured } from './emailService.js';
import { issueToken, redeemTokenRow } from './emailTokenService.js';
import { deletePhotos } from './storageService.js';
import { emailChangeHtml, emailChangeNoticeHtml } from './emailTemplates.js';

const CHANGE_HOURS = 24;

// Emails a confirm link to the new address and a heads-up to the current one.
// The account keeps its email until the link is opened.
export async function startEmailChange(user, newEmail) {
  const token = await issueToken(user, 'email', CHANGE_HOURS * 60, { newEmail });
  const link = `${config.publicUrl}/api/auth/email/confirm?token=${token}`;
  // Locally without email, the link is printed so the change can still be tried (the emails below
  // are then printed too)
  if (!isEmailConfigured() && !config.isProduction) console.log(`[email not set up] Email change link for ${user.email} -> ${newEmail}: ${link}`);
  await sendEmail({ to: newEmail, subject: 'Confirm your new email for Momento', html: emailChangeHtml(user, link, newEmail, CHANGE_HOURS) });
  sendEmail({ to: user.email, subject: 'Your Momento email is about to change', html: emailChangeNoticeHtml(user, newEmail) })
    .catch((err) => console.error(`Email-change notice to ${user.email} failed: ${err.message}`));
}

// Moves the account to the confirmed address. Returns 'changed', 'taken' or 'invalid'.
export async function finishEmailChange(token) {
  const found = await redeemTokenRow(token, 'email');
  if (!found?.row.newEmail) return 'invalid';
  const { user, row } = found;
  if (await User.exists({ email: row.newEmail, _id: { $ne: user._id } })) return 'taken';
  user.email = row.newEmail;
  user.emailVerified = true;
  try {
    await user.save();
  } catch (err) {
    if (err.code === 11000) return 'taken';
    throw err;
  }
  // Any confirm or reset link still out there was for the old address
  await EmailToken.deleteMany({ user: user._id });
  return 'changed';
}

// Everything the person owns goes: albums they host (with every photo in them), photos they
// added to other albums, their memberships and invites, then the account itself.
export async function deleteAccount(user) {
  const hosted = await Album.find({ host: user._id }, '_id');
  const hostedIds = hosted.map((a) => a._id);
  const photos = await Photo.find({ $or: [{ album: { $in: hostedIds } }, { uploader: user._id }] }, 'storageKey');
  await deletePhotos(photos.map((p) => p.storageKey));
  await Promise.all([
    Photo.deleteMany({ _id: { $in: photos.map((p) => p._id) } }),
    Membership.deleteMany({ $or: [{ album: { $in: hostedIds } }, { user: user._id }] }),
    Invite.deleteMany({ $or: [{ album: { $in: hostedIds } }, { invitedBy: user._id }, { email: user.email }] }),
    EmailToken.deleteMany({ user: user._id }),
    Album.deleteMany({ _id: { $in: hostedIds } }),
  ]);
  await user.deleteOne();
}
