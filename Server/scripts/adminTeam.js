// The admin team from the server's command line (the same as the owner's /api/admin/team).
// At most 6 people; each has their own 6-character code, shown once when it's made and never stored readable.
//   node scripts/adminTeam.js list
//   node scripts/adminTeam.js add <slot 1-6> <email> "<name>" [owner|moderator]   → prints the new code once
//   node scripts/adminTeam.js rotate <slot>                                      → prints the new code once
//   node scripts/adminTeam.js revoke <slot>
//   node scripts/adminTeam.js totp <slot>          → sets up (or replaces) an authenticator app for that person; prints
//                                                    the secret and an otpauth:// link once. Owners must then give its
//                                                    6-digit code after their own code.
//   node scripts/adminTeam.js totp-off <slot>      → removes it (a lost phone)
// On the Lightsail server: sudo docker compose -f /opt/momento/Server/deploy/docker-compose.yml exec api node scripts/adminTeam.js list
// The person also needs a Momento account with that email (email confirmed), to sign in before entering the code.
import mongoose from 'mongoose';
import { config } from '../src/config/env.js';
import { listTeam, assignSlot, rotateCode, revokeSlot, setupTotp, removeTotp } from '../src/services/adminStaffService.js';
import { logAdmin } from '../src/services/adminStaffService.js';

const [cmd, a, b, c, d] = process.argv.slice(2);
await mongoose.connect(config.mongoUri);
try {
  if (cmd === 'list' || !cmd) {
    const { used, max, slots } = await listTeam();
    console.log(`Admin team: ${used} of ${max}`);
    for (const s of slots) console.log(s.empty ? `  ${s.slot}. (empty)` : `  ${s.slot}. ${s.name} <${s.email}> ${s.role}${s.lastLoginAt ? `, last code entry ${new Date(s.lastLoginAt).toISOString()}` : ''}`);
  } else if (cmd === 'add') {
    const { staff, code } = await assignSlot(a, { email: b, name: c, role: d });
    await logAdmin('team.assigned', { staff: { slot: 0, name: 'server command line' }, target: `slot:${staff.slot}`, meta: { email: staff.email, role: staff.role } });
    console.log(`Slot ${staff.slot}: ${staff.name} <${staff.email}> (${staff.role}). Their code: ${code}  (shown once; give it to them privately)`);
  } else if (cmd === 'rotate') {
    const { staff, code } = await rotateCode(a);
    await logAdmin('team.code-rotated', { staff: { slot: 0, name: 'server command line' }, target: `slot:${staff.slot}` });
    console.log(`Slot ${staff.slot} (${staff.name}): new code ${code}  (shown once). Their old code and open passes no longer work.`);
  } else if (cmd === 'revoke') {
    const gone = await revokeSlot(a, 0);
    await logAdmin('team.revoked', { staff: { slot: 0, name: 'server command line' }, target: `slot:${gone.slot}`, meta: { email: gone.email } });
    console.log(`Slot ${gone.slot} (${gone.name}) removed.`);
  } else if (cmd === 'totp') {
    const { staff, secret, url } = await setupTotp(a);
    await logAdmin('team.totp-set', { staff: { slot: 0, name: 'server command line' }, target: `slot:${staff.slot}` });
    console.log(`Slot ${staff.slot} (${staff.name}): add this to an authenticator app (shown once).`);
    console.log(`  Secret (type it in, "time-based"): ${secret}`);
    console.log(`  Or turn this link into a QR code on this computer and scan it: ${url}`);
    console.log(staff.role === 'owner' ? 'From now on their 6-digit code is asked for after their admin code.'
      : 'They are a moderator: the code is only asked for owners.');
  } else if (cmd === 'totp-off') {
    const staff = await removeTotp(a);
    await logAdmin('team.totp-removed', { staff: { slot: 0, name: 'server command line' }, target: `slot:${staff.slot}` });
    console.log(`Slot ${staff.slot} (${staff.name}): authenticator app removed. Run "totp ${staff.slot}" to set up a new one.`);
  } else {
    console.log('Use: list | add <slot> <email> "<name>" [owner|moderator] | rotate <slot> | revoke <slot> | totp <slot> | totp-off <slot>');
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
