// For the test scripts: unlock Dev Mode (photo moderation) for a logged-in staff cookie. The test sets
// DEV_MODE_ADMIN_EMAIL to that staff account's email before the app loads.
// const staff = await withDevMode(origin, staffCookie, 'Reviewer_T')  → the cookie header with Dev Mode added
import { Reviewer } from '../src/models/Reviewer.js';
import { hashCode } from '../src/services/devModeService.js';
import { config } from '../src/config/env.js';

export const TEST_CODE = 'TEST-CODE-0001';

export async function addReviewer(label, code = TEST_CODE) {
  await Reviewer.create({ label, adminEmail: config.devMode.adminEmail, codeHash: await hashCode(code) });
}

export async function withDevMode(origin, cookie, label = 'Reviewer_T', code = TEST_CODE) {
  if (!(await Reviewer.exists({ label }))) await addReviewer(label, code);
  const response = await fetch(origin + '/api/dev/enter', {
    method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
  });
  if (response.status !== 200) throw new Error(`Dev Mode didn't unlock: ${response.status} ${await response.text()}`);
  const dev = response.headers.getSetCookie().find((c) => c.startsWith('momento_dev=')).split(';')[0];
  return `${cookie}; ${dev}`;
}
