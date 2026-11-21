import { expireRefusals } from './uploadChecks.js';

// Declined uploads (uploadChecks.js) that nobody asked staff to review, or that staff declined, are deleted
// 30 days later. Checked every hour.
export function startRefusalCleanup() {
  const run = () => expireRefusals().catch(error => console.error('Refusal cleanup:', error.message));
  const timer = setInterval(run, 3600000);
  timer.unref();
  setTimeout(run, 5 * 60000).unref();
  return () => clearInterval(timer);
}
