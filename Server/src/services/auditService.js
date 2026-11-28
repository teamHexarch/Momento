import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { AuditLog } from '../models/AuditLog.js';
import { alert } from './securityAlerts.js';

// IPs are only ever stored as a salted hash: enough to tell "the same place" apart, not to find anyone
const ipKey = crypto.createHmac('sha256', config.jwtSecret).update('momento-ip-hash').digest();
export const ipHash = (ip) => (ip ? crypto.createHmac('sha256', ipKey).update(String(ip)).digest('hex').slice(0, 32) : undefined);

// Events that also go out as a security alert to staff
const ALERT = new Set(['legal.hold', 'legal.released', 'staff.plan-changed','staff.switches', 'staff.sessions-revoked', 'session.reuse', 'account.suspended']);

/**
 * Appends one security event. Never throws: a logging problem must not break what the person did.
 * audit('password.changed', { req })  ·  audit('takedown', { req, target: photoId, meta: { reason } })
 */
export async function audit(event, { req, actor, target, meta, reviewer, devSession } = {}) {
  try {
    await AuditLog.create({
      event, actor: actor ?? req?.user?._id, target: target == null ? undefined : String(target),
      ipHash: ipHash(req?.ip), requestId: req?.id, meta,
      // Dev Mode: the person behind the shared admin account (req.dev, from middleware/devMode.js)
      reviewer: reviewer ?? req?.dev?.reviewerLabel, devSession: devSession ?? req?.dev?.sessionId,
    });
    // Admin team actions are also logged against the person (models/AdminAuditLog.js)
    if (req?.admin) {
      const { logAdmin } = await import('./adminStaffService.js');
      await logAdmin(event, { req, target, meta });
    }
  } catch (err) {
    console.error(`Audit log failed (${event}): ${err.message}`);
  }
  if (ALERT.has(event)) alert(`Security event: ${event}`, [`Actor: ${actor ?? req?.user?._id ?? 'system'}`, `Target: ${target ?? '-'}`, meta ? `Details: ${JSON.stringify(meta)}` : '']);
}
