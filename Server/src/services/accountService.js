import { config } from '../config/env.js';
import { User } from '../models/User.js';
import { Album } from '../models/Album.js';
import { Membership } from '../models/Membership.js';
import { deleteGroupsOf } from '../controllers/groupController.js';
import { removeFile } from './storageService.js';
import { Photo } from '../models/Photo.js';
import { EmailToken } from '../models/EmailToken.js';
import { sendEmail, isEmailConfigured } from './emailService.js';
import { issueToken, redeemTokenRow, peekTokenRow } from './emailTokenService.js';
import { deletePhotos } from './storageService.js';
import { emailApproveHtml, emailChangeHtml, emailChangedHtml } from './emailTemplates.js';

const CHANGE_HOURS = 24;
const CHANGE_PURPOSES = ['email-approve', 'email'];

// Moving an account to a new email takes three steps, so a borrowed or stolen login can't do it alone:
//   1. the current inbox gets an approval link (it opens a page with Approve / Not me buttons, so a
//      mail scanner that opens links can't approve anything by itself);
//   2. once approved, the new inbox gets a confirm link;
//   3. confirming moves the account, logs every device out and tells the old inbox.
// Any pending change is dropped when the password is changed or reset (see dropEmailChange).

const logEveryoneOut = (user) => { user.sessions = []; user.passwordChangedAt = new Date(); };

export async function dropEmailChange(user) {
  await EmailToken.deleteMany({ user: user._id, purpose: { $in: CHANGE_PURPOSES } });
}

// Step 1: the approval email goes to the address the account has now
export async function startEmailChange(user, newEmail) {
  await EmailToken.deleteMany({ user: user._id, purpose: 'email' });
  const token = await issueToken(user, 'email-approve', CHANGE_HOURS * 60, { newEmail });
  const link = `${config.frontendUrl}/?email-approve=${token}`;
  if (!isEmailConfigured() && !config.isProduction) console.log(`[email not set up] Email change approval link for ${user.email} -> ${newEmail}: ${link}`);
  await sendEmail({ to: user.email, subject: 'Approve the new email for your Momento account', html: emailApproveHtml(user, link, newEmail, CHANGE_HOURS) });
}

// What an approval link would do, without using it up
export async function peekEmailApproval(token) {
  const found = await peekTokenRow(token, 'email-approve');
  return found?.row.newEmail ? { newEmail: found.row.newEmail, email: found.user.email } : null;
}

// Step 2: approved from the current inbox, so the new address gets its confirm link.
// Returns 'approved', 'taken' or 'invalid'.
export async function approveEmailChange(token) {
  const found = await redeemTokenRow(token, 'email-approve');
  if (!found?.row.newEmail) return 'invalid';
  const { user, row } = found;
  if (await User.exists({ email: row.newEmail, _id: { $ne: user._id } })) return 'taken';
  const confirm = await issueToken(user, 'email', CHANGE_HOURS * 60, { newEmail: row.newEmail });
  const link = `${config.publicUrl}/api/auth/email/confirm?token=${confirm}`;
  if (!isEmailConfigured() && !config.isProduction) console.log(`[email not set up] Email change confirm link for ${user.email} -> ${row.newEmail}: ${link}`);
  await sendEmail({ to: row.newEmail, subject: 'Confirm your new email for Momento', html: emailChangeHtml(user, link, row.newEmail, CHANGE_HOURS) });
  return 'approved';
}

// "Not me" from the current inbox: the change is dropped and every device is logged out,
// since someone else may be using the account. Returns 'cancelled' or 'invalid'.
export async function cancelEmailChange(token) {
  const found = await redeemTokenRow(token, 'email-approve');
  if (!found) return 'invalid';
  const { user } = found;
  await dropEmailChange(user);
  logEveryoneOut(user);
  await user.save();
  return 'cancelled';
}

// Step 3: moves the account to the confirmed address. Returns 'changed', 'taken' or 'invalid'.
export async function finishEmailChange(token) {
  const found = await redeemTokenRow(token, 'email');
  if (!found?.row.newEmail) return 'invalid';
  const { user, row } = found;
  if (await User.exists({ email: row.newEmail, _id: { $ne: user._id } })) return 'taken';
  const oldEmail = user.email;
  user.email = row.newEmail;
  user.emailVerified = true;
  // A new address for the account: every device logs in again with it
  logEveryoneOut(user);
  try {
    await user.save();
  } catch (err) {
    if (err.code === 11000) return 'taken';
    throw err;
  }
  // Any confirm or reset link still out there was for the old address
  await EmailToken.deleteMany({ user: user._id });
  sendEmail({ to: oldEmail, subject: 'Your Momento email was changed', html: emailChangedHtml(user, row.newEmail) })
    .catch((err) => console.error(`Email-changed notice to ${oldEmail} failed: ${err.message}`));
  return 'changed';
}

// "Right to be forgotten": everything about the person goes, files included: albums they host (with
// every photo in them), photos they added to other albums, their reactions and bookmarks, memberships,
// groups they made, invites, notifications, push devices, consents, reports they made, automatic
// decisions about them, zips, their profile photo, then the account itself.
// Kept, without anything that identifies them: audit-log rows (an account id and a hashed IP, for
// security; they expire after 2 years) and takedown records (the legal record of a complaint).
// Backups: the daily ones roll over within a week, monthly ones within 12 months.
//
// It's resumable: the account is marked first (no login works from then on), every step can run again
// safely, and the hourly job finishes any deletion that stopped halfway.
export async function deleteAccount(user) {
  await User.updateOne({ _id: user._id }, { $set: { deletingAt: new Date(), sessions: [] } });
  // Groups they made are deleted (albums stay with their hosts); they leave every other group
  await deleteGroupsOf(user);
  const { forgetUser } = await import('./notifyService.js');
  await forgetUser(user._id);
  const hosted = await Album.find({ host: user._id }, '_id cover');
  const { removeCoverFiles } = await import('./coverService.js');
  await removeCoverFiles(hosted.flatMap((a) => [a.cover?.key, a.cover?.thumbKey]));
  const hostedIds = hosted.map((a) => a._id);
  const { discardChecks } = await import('./uploadChecks.js');
  await discardChecks({ $or: [{ album: { $in: hostedIds } }, { user: user._id }] });
  const photos = await Photo.find({ $or: [{ album: { $in: hostedIds } }, { uploader: user._id }] }, 'storageKey');
  await deletePhotos(photos.map((p) => p.storageKey));
  // Their likes and reactions come off other people's photos
  await Photo.updateMany({ likes: user._id }, { $pull: { likes: user._id, likeLog: { user: user._id } }, $inc: { likeCount: -1 } });
  await Photo.updateMany({ 'reactions.user': user._id }, { $pull: { reactions: { user: user._id } } });
  // Games: those in albums they host, and their own answers and points elsewhere
  const { removeGamesFor } = await import('./gameService.js');
  await removeGamesFor({ albums: hostedIds, user: user._id });
  // Their comments on other people's photos (the counts go down with them)
  const { PhotoComment } = await import('../models/PhotoComment.js');
  const written = await PhotoComment.aggregate([{ $match: { author: user._id } }, { $group: { _id: '$photo', n: { $sum: 1 } } }]);
  for (const w of written) {
    await Photo.updateOne({ _id: w._id }, { $inc: { commentCount: -w.n } });
    await Photo.updateOne({ _id: w._id, commentCount: { $lt: 0 } }, { $set: { commentCount: 0 } });
  }
  await PhotoComment.deleteMany({ author: user._id });
  // Zips they asked for, and zips of the albums they host
  const { ZipFile } = await import('./zipService.js');
  const zips = await ZipFile.find({ $or: [{ user: user._id }, { album: { $in: hostedIds } }] }, 'key');
  await Promise.all(zips.map((z) => z.key && removeFile(z.key).catch(() => {})));
  const [{ Consent }, { Report }, { ModerationDecision }, { UploadConsent }] = await Promise.all([
    import('../models/Consent.js'), import('../models/Report.js'), import('../models/ModerationDecision.js'),
    import('../models/UploadConsent.js'),
  ]);
  await Promise.all([
    Photo.deleteMany({ _id: { $in: photos.map((p) => p._id) } }),
    Membership.deleteMany({ $or: [{ album: { $in: hostedIds } }, { user: user._id }] }),
    EmailToken.deleteMany({ user: user._id }),
    Album.deleteMany({ _id: { $in: hostedIds } }),
    ZipFile.deleteMany({ _id: { $in: zips.map((z) => z._id) } }),
    Consent.deleteMany({ user: user._id }),
    // Their upload agreements, and everyone's for the albums they host
    UploadConsent.deleteMany({ $or: [{ user: user._id }, { album: { $in: hostedIds } }] }),
    Report.deleteMany({ $or: [{ reporter: user._id }, { album: { $in: hostedIds } }] }),
    ModerationDecision.deleteMany({ user: user._id }),
    // Join requests they left in other people's albums
    Album.updateMany({ 'requests.user': user._id }, { $pull: { requests: { user: user._id } } }),
  ]);
  const avatarKey = user.avatarKey || (await User.findById(user._id, 'avatarKey'))?.avatarKey;
  if (avatarKey) await removeFile(avatarKey).catch(() => {});
  await User.deleteOne({ _id: user._id });
}
