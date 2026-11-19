import { config } from '../config/env.js';

// Security alerts for staff: by email (SECURITY_ALERT_EMAIL) and/or a webhook (SECURITY_ALERT_WEBHOOK,
// e.g. a Slack or Discord incoming webhook), and always in the server log. Each kind of alert goes out
// at most once an hour, so an attack doesn't also flood the inbox.
//
// Watched: spikes of 401 (not logged in), 403 (not allowed) and 429 (rate limited) answers, reused
// login tokens, staff actions (role changes, safety switches, signing everyone out), suspensions,
// and lots of data exports in a short time.

const WINDOW_MS = 5 * 60000;
const LIMITS = {
  401: Number(process.env.ALERT_401_PER_5MIN) || 300,
  403: Number(process.env.ALERT_403_PER_5MIN) || 200,
  429: Number(process.env.ALERT_429_PER_5MIN) || 200,
  export: Number(process.env.ALERT_EXPORTS_PER_HOUR) || 30,
};
const counts = new Map();   // key -> { n, since }
const lastSent = new Map(); // subject -> time

function bump(key, windowMs) {
  const now = Date.now();
  const c = counts.get(key);
  if (!c || now - c.since > windowMs) { counts.set(key, { n: 1, since: now }); return 1; }
  return ++c.n;
}

// Called for every answer the API sends
export function countStatus(status) {
  if (!LIMITS[status]) return;
  if (bump(status, WINDOW_MS) === LIMITS[status]) {
    alert(`Unusual number of ${status} responses`, [`${LIMITS[status]} in under 5 minutes. Someone may be guessing passwords, probing for data, or hammering the API.`]);
  }
}

export function countExport() {
  if (bump('export', 60 * 60000) === LIMITS.export) alert('Many data exports', [`${LIMITS.export} account data exports in the last hour.`]);
}

export async function alert(subject, lines = []) {
  const now = Date.now();
  if (now - (lastSent.get(subject) || 0) < 60 * 60000) return;
  lastSent.set(subject, now);
  const text = [subject, ...lines.filter(Boolean)].join('\n');
  console.warn(`[security alert] ${text.replace(/\n/g, ' | ')}`);
  const { alertEmail, alertWebhook } = config.security;
  try {
    if (alertEmail) {
      const { sendEmail } = await import('./emailService.js');
      const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      await sendEmail({ to: alertEmail, subject: `[Momento security] ${subject}`, html: `<pre style="font-family:monospace">${esc(text)}</pre>` });
    }
    if (alertWebhook) {
      // A fixed address from the settings (never from a request); no redirects, 5 second limit
      await fetch(alertWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), redirect: 'error', signal: AbortSignal.timeout(5000) });
    }
  } catch (err) {
    console.error(`Security alert could not be sent: ${err.message}`);
  }
}

// For tests
export function resetAlerts() { counts.clear(); lastSent.clear(); }
