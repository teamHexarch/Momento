// For the test scripts: unlock the admin area (photo moderation) for a logged-in account. The account is put in an
// admin team slot (models/AdminStaff.js) with a test code, then the code is entered like on the review page.
// const staff = await withAdmin(origin, cookie)  → the cookie header with the 4-hour admin pass added
// (withDevMode is the old name, kept so older tests still work.)
import { AdminStaff } from '../src/models/AdminStaff.js';
import { assignSlot } from '../src/services/adminStaffService.js';

export const TEST_CODE = 'TEST26';

// Puts this person in the first free slot (or keeps theirs), with this code
export async function addStaff(name, email, code = TEST_CODE, role = 'owner') {
  const mine = await AdminStaff.findOne({ email: email.toLowerCase() });
  if (mine) return assignSlot(mine.slot, { name, email, role }, code);
  const used = new Set((await AdminStaff.find({}, 'slot').lean()).map((s) => s.slot));
  const slot = [1, 2, 3, 4, 5, 6].find((n) => !used.has(n));
  return assignSlot(slot, { name, email, role }, code);
}

export async function withAdmin(origin, cookie, name = 'Reviewer_T', code = TEST_CODE) {
  const me = await (await fetch(origin + '/api/auth/me', { headers: { cookie } })).json();
  if (!me.user?.email) throw new Error('withAdmin: that cookie is not logged in');
  if (!(await AdminStaff.exists({ email: me.user.email.toLowerCase() }))) await addStaff(name, me.user.email, code);
  const response = await fetch(origin + '/api/admin/verify-code', {
    method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: me.user.email, code }),
  });
  if (response.status !== 200) throw new Error(`The admin code wasn't accepted: ${response.status} ${await response.text()}`);
  const pass = response.headers.getSetCookie().find((c) => c.startsWith('momento_admin=')).split(';')[0];
  return `${cookie}; ${pass}`;
}
export const withDevMode = withAdmin;
