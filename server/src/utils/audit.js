import AuditLog from '../models/AuditLog.js';

export async function writeAudit(req, { patient, action, resourceType, resourceId, reason, metadata }) {
  try {
    await AuditLog.create({
      actor: req.user?._id,
      patient,
      action,
      resourceType,
      resourceId: resourceId?.toString(),
      reason,
      metadata,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
  } catch (error) {
    console.error('Audit write failed', error.message);
  }
}
