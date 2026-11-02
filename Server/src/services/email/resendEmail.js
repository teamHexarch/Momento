import { config } from '../../config/env.js';
import { EmailError } from './emailError.js';

// Sends mail through Resend (https://resend.com), a service for app emails, from EMAIL_FROM
// (e.g. "Momento <no-reply@hexarch.org>"). The domain must be verified in Resend first.

export const name = 'resend';

export const isConfigured = () => Boolean(config.email.resendApiKey && config.email.from);

// Resend's errors are short; this says what to fix
function explain(status, body) {
  const msg = body?.message || body?.error || '';
  if (status === 401 || status === 403) {
    if (/domain/i.test(msg)) return `Resend won't send from EMAIL_FROM (${config.email.from}): ${msg} Check the domain is Verified in Resend > Domains, and the API key may use it.`;
    return 'Resend rejected the API key. Check RESEND_API_KEY (it starts with re_) and that it has Sending access.';
  }
  if (status === 422) return `Resend couldn't accept the email: ${msg}`;
  if (status === 429) return 'Resend is rate-limiting sends (free plan: 100 a day). Try again later.';
  return `Resend error ${status}${msg ? `: ${msg}` : ''}`;
}

export async function send({ to, subject, html, replyTo }) {
  let res;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.email.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.email.from, to, subject, html, ...(replyTo && { reply_to: replyTo }) }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new EmailError(`Couldn't reach Resend: ${err.message}`, { cause: err });
  }
  if (!res.ok) throw new EmailError(explain(res.status, await res.json().catch(() => ({}))));
}
