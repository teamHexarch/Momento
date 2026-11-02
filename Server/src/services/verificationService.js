import { config } from '../config/env.js';
import { sendEmail, isEmailConfigured } from './emailService.js';
import { issueToken, redeemToken } from './emailTokenService.js';
import { verificationHtml } from './emailTemplates.js';

const LINK_HOURS = 24;

/**
 * Emails the person a fresh confirm link (older links stop working).
 * Without email settings, outside production, the link is printed to the server log instead.
 * Returns { sent: true } or { sent: false } when only logged.
 */
export async function sendVerificationEmail(user) {
  const token = await issueToken(user, 'verify', LINK_HOURS * 60);
  const link = `${config.publicUrl}/api/auth/verify-email?token=${token}`;
  if (!isEmailConfigured() && !config.isProduction) {
    console.log(`[email not set up] Confirm link for ${user.email}: ${link}`);
    return { sent: false };
  }
  await sendEmail({ to: user.email, subject: 'Confirm your email for Momento', html: verificationHtml(user, link, LINK_HOURS) });
  return { sent: true };
}

// Marks the account verified if the token is real and unexpired; returns the user or null
export async function confirmEmail(token) {
  const user = await redeemToken(token, 'verify');
  if (!user) return null;
  user.emailVerified = true;
  await user.save();
  return user;
}
