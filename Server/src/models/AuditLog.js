import mongoose from 'mongoose';

// An append-only record of security events: password and email changes, logins being locked,
// data exports, account deletions, reports and takedowns, staff actions (role changes, safety
// switches, signing everyone out). Rows are never edited; the model refuses updates and deletes
// from the app. IPs are kept only as a salted hash. Rows go after 2 years.
const auditSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now, immutable: true },
  event: { type: String, required: true, immutable: true },
  // Who did it (null: the system, or someone not logged in) and who/what it was about
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', immutable: true },
  target: { type: String, immutable: true },
  ipHash: { type: String, immutable: true },
  requestId: { type: String, immutable: true },
  meta: { type: mongoose.Schema.Types.Mixed, immutable: true },
}, { versionKey: false });

auditSchema.index({ at: 1 }, { expireAfterSeconds: 2 * 365 * 86400 });
auditSchema.index({ actor: 1, at: -1 });
auditSchema.index({ event: 1, at: -1 });

const refuse = function () { throw new Error('Audit logs are append-only.'); };
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  auditSchema.pre(op, refuse);
}
auditSchema.pre('save', function () { if (!this.isNew) throw new Error('Audit logs are append-only.'); });

export const AuditLog = mongoose.model('AuditLog', auditSchema);
