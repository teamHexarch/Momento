import { config } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';
import { sendEmail } from '../services/emailService.js';
import { supportHtml } from '../services/emailTemplates.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOPICS = ['Joining an album', 'Uploads', 'Something else'];

// The support page's form: emailed to the team, with Reply going straight back to the person
export async function send(req, res) {
  const name = String(req.body?.name ?? '').trim();
  const email = String(req.body?.email ?? '').trim();
  const message = String(req.body?.message ?? '').trim();
  const topic = TOPICS.includes(req.body?.topic) ? req.body.topic : 'Something else';
  if (!name || name.length > 80) throw new HttpError(400, 'Enter your name so we know who to reply to.');
  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'Enter an email address like name@example.com.');
  if (message.length < 10) throw new HttpError(400, 'Tell us a little more. A sentence or two is plenty.');
  if (message.length > 5000) throw new HttpError(400, 'Keep the message under 5,000 characters.');
  if (!config.supportEmail) throw new HttpError(503, 'Messages can’t be sent right now. Please email us instead.');
  await sendEmail({
    to: config.supportEmail,
    subject: `Momento support: ${topic} (${name})`,
    html: supportHtml({ name, email, topic, message, account: req.user?.email }),
    replyTo: email,
  });
  res.json({ ok: true });
}
