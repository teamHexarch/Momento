import { config } from '../config/env.js';
import * as resend from './email/resendEmail.js';
import * as graph from './email/graphEmail.js';

export { EmailError } from './email/emailError.js';
import { EmailError } from './email/emailError.js';

// Who sends Momento's emails. Resend when RESEND_API_KEY and EMAIL_FROM are set, otherwise
// Microsoft Graph from SENDER_EMAIL's mailbox. Everything else just calls sendEmail().
const driver = [resend, graph].find((d) => d.isConfigured()) || null;

export const isEmailConfigured = () => Boolean(driver);
export const emailProviderName = driver?.name || 'none';
// The address emails come from, for logs and test messages
export const emailFrom = driver === resend ? config.email.from : config.email.sender;

/**
 * Sends one email. `to` is an address or a list of them; `html` is the body.
 * Replies go to EMAIL_REPLY_TO (or the team mailbox) unless replyTo says otherwise.
 * Throws EmailError with a readable reason when the provider refuses.
 */
export async function sendEmail({ to, subject, html, replyTo = config.email.replyTo }) {
  if (!driver) throw new EmailError('Email isn’t set up: fill in RESEND_API_KEY and EMAIL_FROM (or the MS_* settings) in .env.');
  const recipients = [].concat(to).filter(Boolean);
  if (!recipients.length) throw new EmailError('No recipient given.');
  await driver.send({ to: recipients, subject, html, replyTo });
}
