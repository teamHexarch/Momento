// Changes an account's plan (utils/plans.js). 'staff' = everything 'admin' has, plus moderation, takedowns and the
// emergency switches. Run on the server, never through the website, so a stolen login can't make itself staff:
//   node --env-file=.env scripts/setPlan.js someone@example.com staff
//   node --env-file=.env scripts/setPlan.js someone@example.com admin     (takes staff away again)
// On the Lightsail server:
//   cd /opt/momento/Server/deploy && sudo docker compose exec api node scripts/setPlan.js someone@example.com staff
// The change is written to the audit log and sent as a security alert.
import mongoose from 'mongoose';
import { PLANS } from '../src/utils/plans.js';

const [email, plan] = process.argv.slice(2);
if (!email || !PLANS.includes(plan)) {
  console.log(`Usage: node scripts/setPlan.js <email> <${PLANS.join('|')}>`);
  process.exit(1);
}
const { config } = await import('../src/config/env.js');
const { User } = await import('../src/models/User.js');
const { audit } = await import('../src/services/auditService.js');
await mongoose.connect(config.mongoUri);
const user = await User.findOne({ email: email.trim().toLowerCase() });
if (!user) { console.log('No account with that email.'); process.exit(1); }
if (plan === 'staff' && !user.emailVerified) { console.log('Confirm that account’s email first.'); process.exit(1); }
const before = user.plan;
await User.updateOne({ _id: user._id }, { $set: { plan } });
await audit('staff.plan-changed', { actor: null, target: user._id, meta: { from: before, to: plan, by: 'server script' } });
console.log(`${user.name || 'That account'} is now on the ${plan} plan (was ${before}).`);
await mongoose.disconnect();
