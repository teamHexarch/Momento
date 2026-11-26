import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { config } from '../config/env.js';
import { SupportMessage } from '../models/SupportMessage.js';
import { sendTeamMail } from '../services/teamMail.js';
import { HttpError } from '../utils/httpError.js';

// POST /api/support  { topic, name, email, message }: the support page's "Send us a message" form.
// Open to everyone (people who can't log in need help most). It's emailed to SUPPORT_EMAIL with the
// sender as Reply-To, so "Reply" in Gmail answers them, and the subject always starts "[Momento support]"
// so a mail filter can label it and notify the team.
export const supportRoutes = Router();

const TOPICS = ['Joining an album', 'Uploads', 'Something else'];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const oneLine = (s) => String(s).replace(/[\r\n\t]+/g, ' ').trim();
const limit = rateLimit({
  windowMs: 60 * 60000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip)}`),
  message: { error: 'You’ve sent a few messages already. Wait an hour, or email support@hexarch.org.' },
});

supportRoutes.post('/', limit, async (req, res) => {
  const b = req.body || {};
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const topic = TOPICS.includes(b.topic) ? b.topic : 'Something else';
  const name = oneLine(str(b.name)).slice(0, 80);
  const email = str(b.email).toLowerCase();
  const message = str(b.message);
  if (!name) throw new HttpError(400, 'Enter your name so we know who to reply to.');
  if (email.length > 200 || !/^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/.test(email)) throw new HttpError(400, 'Enter an email address like name@example.com.');
  if (message.length < 10) throw new HttpError(400, 'Tell us a little more. A sentence or two is plenty.');
  if (message.length > 5000) throw new HttpError(400, 'Keep the message under 5,000 characters.');

  const saved = await SupportMessage.create({ topic, name, email, message, user: req.user?._id });
  const who = req.user ? `Logged in as ${esc(req.user.name)} (${esc(req.user.email)}), account ${req.user.id}` : 'Not logged in';
  try {
    await sendTeamMail({
      kind: 'support',
      replyTo: email,
      title: `Support · ${topic}: ${oneLine(name)}`,
      data: { topic, signedIn: !!req.user, text: message.slice(0, 1000) },
      html: `<p><b>${esc(name)}</b> &lt;${esc(email)}&gt; wrote about <b>${esc(topic)}</b>:</p>
        <blockquote style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #6C5FC7;background:#F6F4FA;white-space:pre-wrap">${esc(message)}</blockquote>
        <p style="color:#5C596B;font-size:13px">${who}. Sent ${new Date().toUTCString()}. Reply to this email to answer them.</p>`,
    });
    await SupportMessage.updateOne({ _id: saved._id }, { emailed: true });
  } catch (err) {
    // Kept in the database either way; the person still gets "sent"
    console.error(`Support message ${saved.id} saved but not emailed: ${err.message}`);
  }
  res.status(201).json({ ok: true });
});
