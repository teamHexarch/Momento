import mongoose from 'mongoose';

// Which of the 6 admin team members did what: code checks (passed and failed), moderation decisions, threshold
// changes, code changes, team changes, takedowns, switches. Append-only, like the main audit log (models/AuditLog.js).
// Only the start of the IP address is kept (ip_prefix: 203.0.113.x, or the first 3 IPv6 groups). Kept 2 years.
const schema = new mongoose.Schema({
  at: { type: Date, default: Date.now, immutable: true },
  action: { type: String, required: true, immutable: true },
  adminSlot: { type: Number, immutable: true },
  adminName: { type: String, immutable: true },
  adminEmail: { type: String, immutable: true },
  target: { type: String, immutable: true },
  meta: { type: mongoose.Schema.Types.Mixed, immutable: true },
  ipPrefix: { type: String, immutable: true },
}, { collection: 'admin_audit_logs', versionKey: false });

schema.index({ at: 1 }, { expireAfterSeconds: 2 * 365 * 86400 });
schema.index({ adminSlot: 1, at: -1 });
schema.index({ action: 1, at: -1 });

const refuse = function () { throw new Error('Admin audit logs are append-only.'); };
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  schema.pre(op, refuse);
}
schema.pre('save', function () { if (!this.isNew) throw new Error('Admin audit logs are append-only.'); });

export const AdminAuditLog = mongoose.model('AdminAuditLog', schema);

// "203.0.113.x" / "2001:db8:85a3::x": enough to tell places apart, not to find anyone
export function ipPrefix(ip) {
  const s = String(ip || '').replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) return s.split('.').slice(0, 3).join('.') + '.x';
  if (s.includes(':')) return s.split(':').slice(0, 3).join(':') + '::x';
  return undefined;
}
