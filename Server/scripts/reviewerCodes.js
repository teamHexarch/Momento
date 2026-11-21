// Personal Dev Mode access codes for the shared admin account (DEV_MODE_ADMIN_EMAIL). Run on the server, never
// through the website. A new code is printed once: give it to that person privately; only its bcrypt hash is kept.
//   node --env-file=.env scripts/reviewerCodes.js add Reviewer_A "Chelsea"     a new reviewer and their code
//   node --env-file=.env scripts/reviewerCodes.js reset Reviewer_A ["Name"]    a new code (the old one stops working)
//   node --env-file=.env scripts/reviewerCodes.js revoke Reviewer_A            no more Dev Mode (ends their session)
//   node --env-file=.env scripts/reviewerCodes.js list                         reviewers, and the sessions in use
// On the Lightsail server:
//   cd /opt/momento/Server/deploy && sudo docker compose exec api node scripts/reviewerCodes.js add Reviewer_A "Name"
import crypto from 'node:crypto';
import mongoose from 'mongoose';

const [command, label, name] = process.argv.slice(2);
const usage = () => { console.log('Usage: node scripts/reviewerCodes.js add <Label> [name] | reset <Label> | revoke <Label> | list'); process.exit(1); };
if (!['add', 'reset', 'revoke', 'list'].includes(command) || (command !== 'list' && !label)) usage();
if (label && !/^[A-Za-z0-9_-]{2,40}$/.test(label)) { console.log('A label is 2-40 letters, digits, _ or - (e.g. Reviewer_A).'); process.exit(1); }

const { config } = await import('../src/config/env.js');
if (!config.devMode.adminEmail) { console.log('Set DEV_MODE_ADMIN_EMAIL (the shared admin account) first.'); process.exit(1); }
const { Reviewer } = await import('../src/models/Reviewer.js');
const { DevSlot } = await import('../src/models/DevSlot.js');
const { hashCode, endSession } = await import('../src/services/devModeService.js');
const { audit } = await import('../src/services/auditService.js');
await mongoose.connect(config.mongoUri);

// 12 characters from 31 easy-to-read ones (no 0/O, 1/I/L), shown as XXXX-XXXX-XXXX: about 59 bits
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.randomBytes(12), (b) => ALPHABET[b % ALPHABET.length]).join('').replace(/(.{4})(?=.)/g, '$1-');
const show = (code, who) => console.log(`\nAccess code for ${who}:\n\n    ${code}\n\nGive it to them privately. It is not stored and can't be shown again.\n`);
const endTheirSessions = async (reviewer) => {
  for (const slot of await DevSlot.find({ reviewer: reviewer._id, sessionId: { $ne: null } }).lean()) await endSession(slot, 'logout', null, command === 'revoke' ? 'revoked' : 'code reset');
};

try {
  if (command === 'list') {
    const reviewers = await Reviewer.find({ adminEmail: config.devMode.adminEmail }).sort({ label: 1 }).lean();
    const slots = await DevSlot.find({ sessionId: { $ne: null } }).lean();
    console.log(`Admin account: ${config.devMode.adminEmail}\n`);
    for (const r of reviewers) {
      const live = slots.filter((s) => String(s.reviewer) === String(r._id)).length;
      console.log(`${r.label.padEnd(16)} ${(r.name || '').padEnd(20)} ${r.active ? 'active ' : 'revoked'}  last used ${r.lastUsedAt ? r.lastUsedAt.toISOString() : 'never'}${live ? `  (${live} session open)` : ''}`);
    }
    if (!reviewers.length) console.log('No reviewers yet: add one with  add Reviewer_A "Name"');
    console.log(`\nDev Mode sessions in use: ${slots.length} of ${config.devMode.maxSessions}`);
  } else if (command === 'add') {
    if (await Reviewer.exists({ label })) { console.log(`${label} already exists (use reset for a new code).`); process.exit(1); }
    const code = newCode();
    await Reviewer.create({ label, name, adminEmail: config.devMode.adminEmail, codeHash: await hashCode(code) });
    await audit('devmode.code-added', { reviewer: label, meta: { by: 'server script' } });
    show(code, label);
  } else {
    const reviewer = await Reviewer.findOne({ label });
    if (!reviewer) { console.log(`No reviewer called ${label}.`); process.exit(1); }
    await endTheirSessions(reviewer);
    if (command === 'reset') {
      // reset Reviewer_B "New name": a new code, and (optionally) the person it now belongs to
      const code = newCode();
      await Reviewer.updateOne({ _id: reviewer._id }, { $set: { codeHash: await hashCode(code), active: true, ...(name && { name }) }, $unset: { revokedAt: 1 } });
      await audit('devmode.code-reset', { reviewer: label, meta: { by: 'server script', ...(name && { name }) } });
      show(code, label);
    } else {
      await Reviewer.updateOne({ _id: reviewer._id }, { $set: { active: false, revokedAt: new Date() } });
      await audit('devmode.code-revoked', { reviewer: label, meta: { by: 'server script' } });
      console.log(`${label} can no longer use Dev Mode.`);
    }
  }
} finally {
  await mongoose.disconnect();
}
