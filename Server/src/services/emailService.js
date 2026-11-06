import { config } from '../config/env.js';
import * as ses from './email/sesEmail.js';

export { EmailError } from './email/emailError.js';
import { EmailError } from './email/emailError.js';

// Momento's emails go through Amazon SES (EMAIL_FROM plus the AWS keys). Everything else just calls
// sendEmail(). Without those settings (e.g. on this PC), emails are printed instead of sent.
const driver = ses.isConfigured() ? ses : null;

export const isEmailConfigured = () => Boolean(driver);
export const emailProviderName = driver?.name || 'none';
// The address emails come from, for logs and test messages
export const emailFrom = config.email.from;

/**
 * Sends one email. `to` is an address or a list of them; `html` is the body.
 * Replies go to EMAIL_REPLY_TO unless replyTo says otherwise.
 * Throws EmailError with a readable reason when SES refuses.
 */
export async function sendEmail({ to, subject, html, replyTo = config.email.replyTo }) {
  if (!driver) {
    // Locally, with no AWS settings, emails are printed instead so every feature can still be tried
    if (!config.isProduction) {
      console.log(`[email not set up] To: ${[].concat(to).join(', ')} | Subject: ${subject}${replyTo ? ` | Reply-To: ${replyTo}` : ''}`);
      return;
    }
    throw new EmailError('Email isn’t set up: set EMAIL_FROM, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.');
  }
  const recipients = [].concat(to).filter(Boolean);
  if (!recipients.length) throw new EmailError('No recipient given.');
  await driver.send({ to: recipients, subject, html, replyTo });
}
