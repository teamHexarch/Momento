import { config } from '../config/env.js';
import { sendEmail } from './emailService.js';

// Emails to the Momento team, in two kinds you can file apart in Gmail (or any mail app):
//
//   user input  what people send us: reviews, support messages, photo reports, photo review requests
//               subject "[Momento input] …", header List-Id: <user-input.momento.hexarch.org>
//   system      what Momento itself reports: security alerts, staff review reminders
//               subject "[Momento system] …", header List-Id: <system.momento.hexarch.org>
//
// Gmail filters: "list:user-input.momento.hexarch.org" → label "Momento/User input", and
// "list:system.momento.hexarch.org" → label "Momento/System" (Server/docs/team-email.md has the steps).
// Every user-input email ends with one machine-readable line, "momento-data: {…}", which the Google Sheet in
// Server/docs/feedback-sheet.gs reads to chart ratings, the weakest parts of Momento and why photos are reported.
// The data line never carries a name or email address.

export const INPUT_LIST = 'user-input.momento.hexarch.org';
export const SYSTEM_LIST = 'system.momento.hexarch.org';
const LISTS = { input: ['Momento user input', INPUT_LIST], system: ['Momento system', SYSTEM_LIST] };
const PREFIX = { input: '[Momento input]', system: '[Momento system]' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * One email to the team.
 *   group   'input' (something a person sent us) or 'system' (Momento reporting on itself)
 *   kind    short name for the type: review, support, report, review-request, security, review-reminder
 *   title   the subject after the prefix, e.g. "Review 2/5 · Adding photos 1/5"
 *   data    (user input) the numbers and words to chart, written as the momento-data line
 *   to      who gets it (the team inbox unless said otherwise)
 */
export async function sendTeamMail({ group = 'input', kind, title, html, data, replyTo, to = config.support.inbox }) {
  const [name, id] = LISTS[group] || LISTS.input;
  const line = data ? `<p style="margin-top:24px;color:#9A95AE;font:11px/1.4 monospace">momento-data: ${esc(JSON.stringify({ kind, at: new Date().toISOString(), ...data }))}</p>` : '';
  return sendEmail({
    to, replyTo,
    subject: `${PREFIX[group] || PREFIX.input} ${title}`,
    html: html + line,
    headers: [
      { Name: 'List-Id', Value: `${name} <${id}>` },
      { Name: 'X-Momento-Kind', Value: String(kind || group) },
    ],
  });
}
