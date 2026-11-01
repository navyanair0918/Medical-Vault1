import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import AccessGrant from '../models/AccessGrant.js';

export async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Authentication required' });
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me');
    const user = await User.findById(payload.sub).select('-passwordHash');
    if (!user || user.active === false) return res.status(401).json({ message: 'User no longer exists or is inactive' });
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.user?.role)
    ? next()
    : res.status(403).json({ message: 'Insufficient permissions' });
}

export function requireAdminPermission(...permissions) {
  return (req, res, next) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Administrator access required' });
    const granted = new Set(req.user.adminProfile?.permissions || []);
    if (!permissions.length || permissions.some(p => granted.has(p) || granted.has('*'))) return next();
    return res.status(403).json({ message: 'Administrator permission required' });
  };
}

export async function hasDoctorAccess(patientId, doctorId) {
  const now = new Date();
  return AccessGrant.findOne({
    patient: patientId,
    doctor: doctorId,
    status: 'active',
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
  });
}
