import { config } from '../config/env.js';
import { sendEmail } from './emailService.js';
import { Album } from '../models/Album.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KIND = { photo: 'An album photo', cover: 'An album cover picture', avatar: 'A profile picture' };

// Emails staff (STAFF_REVIEW_EMAIL, team@hexarch.org unless set) when someone asks for a declined picture to be
// reviewed, with a link to the review page. No picture in the email: staff look at it on review.html.
export async function tellStaffAboutReview({ decision, fileName, user }) {
  const album = decision.album ? await Album.findById(decision.album, 'name').lean() : null;
  const link = `${config.frontendUrl}/review.html`;
  const rows = [
    ['What', KIND[decision.kind] || 'A picture'],
    ['File', fileName || '(not stored)'],
    ['Album', album?.name || '(none)'],
    ['Asked by', `${user.name || ''} (account id ${user._id})`],
    ['Why it was declined', decision.reason || 'The automatic nudity check'],
    ['When', new Date().toUTCString()],
  ];
  await sendEmail({
    to: config.staffReview.inbox,
    subject: `[Momento review] ${KIND[decision.kind] || 'A picture'} is waiting for review`,
    html: `<p>Someone asked for a declined picture to be reviewed by a person.</p>
      <table cellpadding="6" style="border-collapse:collapse;font-size:14px">${rows.map(([k, v]) => `<tr><td style="color:#5C596B;vertical-align:top">${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join('')}</table>
      <p><a href="${esc(link)}" style="display:inline-block;padding:12px 22px;border-radius:100px;background:#2E2C3A;color:#F8F7FA;text-decoration:none;font-weight:600">Open the review page</a></p>
      <p style="color:#5C596B;font-size:13px">${esc(link)} (staff accounts only)</p>`,
  });
}
