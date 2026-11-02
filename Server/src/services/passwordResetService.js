import bcrypt from 'bcryptjs';
import { config } from '../config/env.js';
import { sendEmail, isEmailConfigured } from './emailService.js';
import { issueToken, redeemToken } from './emailTokenService.js';
import { resetHtml, passwordChangedHtml } from './emailTemplates.js';

const LINK_MINUTES = 60;

// Emails a reset link (older ones stop working). Outside production without email settings,
// the link is printed to the server log instead.
export async function sendResetEmail(user) {
  const token = await issueToken(user, 'reset', LINK_MINUTES);
  // The token rides in the page address; the page removes it from the address bar at once,
  // and the Referrer-Policy keeps it from being sent to other sites
  const link = `${config.frontendUrl}/?reset=${token}`;
  if (!isEmailConfigured() && !config.isProduction) {
    console.log(`[email not set up] Reset link for ${user.email}: ${link}`);
    return;
  }
  await sendEmail({ to: user.email, subject: 'Reset your Momento password', html: resetHtml(user, link, LINK_MINUTES) });
}

/**
 * Sets a new password if the token is good; returns the user, or null for a bad or used link.
 * Every existing login (other devices included) stops working, and the person gets a heads-up email.
 */
export async function resetPassword(token, newPassword) {
  const user = await redeemToken(token, 'reset');
  if (!user) return null;
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.passwordChangedAt = new Date();
  // Opening the link proved they own the address
  user.emailVerified = true;
  await user.save();
  if (isEmailConfigured()) {
    sendEmail({ to: user.email, subject: 'Your Momento password was changed', html: passwordChangedHtml(user) })
      .catch((err) => console.error(`Password-changed email to ${user.email} failed: ${err.message}`));
  }
  return user;
}
