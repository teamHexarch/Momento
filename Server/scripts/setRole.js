// Makes someone staff (moderation, takedowns, emergency switches) or takes it away. Run on the server,
// never through the website, so a stolen login can't make itself staff:
//   node --env-file=.env scripts/setRole.js someone@example.com staff
//   node --env-file=.env scripts/setRole.js someone@example.com user
// On the Lightsail server:
//   cd /opt/momento/Server/deploy && sudo docker compose exec api node scripts/setRole.js someone@example.com staff
// The change is written to the audit log and sent as a security alert.
import mongoose from 'mongoose';

const [email, role] = process.argv.slice(2);
if (!email || !['staff', 'user'].includes(role)) {
  console.log('Usage: node scripts/setRole.js <email> <staff|user>');
  process.exit(1);
}
const { config } = await import('../src/config/env.js');
const { User } = await import('../src/models/User.js');
const { audit } = await import('../src/services/auditService.js');
await mongoose.connect(config.mongoUri);
const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+role');
if (!user) { console.log('No account with that email.'); process.exit(1); }
if (!user.emailVerified) { console.log('Confirm that account’s email first.'); process.exit(1); }
const before = user.role || 'user';
await User.updateOne({ _id: user._id }, { $set: { role } });
await audit('staff.role-changed', { actor: null, target: user._id, meta: { from: before, to: role, by: 'server script' } });
console.log(`${user.name || 'That account'} is now: ${role} (was ${before}).`);
await mongoose.disconnect();
