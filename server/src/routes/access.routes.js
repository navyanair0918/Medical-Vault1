import { Router } from 'express';
import AccessGrant from '../models/AccessGrant.js';
import User from '../models/User.js';
import { auth, requireRole } from '../middleware/auth.js';
import { writeAudit } from '../utils/audit.js';

const router = Router();
router.use(auth);

router.post('/request', requireRole('doctor'), async (req, res, next) => {
  try {
    const patient = await User.findOne({ role: 'patient', 'patientProfile.publicQrId': req.body.publicQrId });
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    const grant = await AccessGrant.findOneAndUpdate(
      { patient: patient._id, doctor: req.user._id },
      { $set: { status: 'pending', requestedAt: new Date(), expiresAt: null }, $setOnInsert: { scopes: ['summary', 'records', 'labs', 'prescriptions'] } },
      { upsert: true, new: true }
    );
    await writeAudit(req, { patient: patient._id, action: 'ACCESS_REQUESTED', resourceType: 'AccessGrant', resourceId: grant._id });
    res.status(201).json({ message: 'Access request sent', grant });
  } catch (error) { next(error); }
});

router.post('/grant-by-email', requireRole('patient'), async (req, res, next) => {
  try {
    const doctor = await User.findOne({ role: 'doctor', email: String(req.body.doctorEmail || '').toLowerCase() });
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    const hours = Math.min(Math.max(Number(req.body.hours) || 24, 1), 24 * 30);
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    const grant = await AccessGrant.findOneAndUpdate(
      { patient: req.user._id, doctor: doctor._id },
      { status: 'active', grantedAt: new Date(), expiresAt, scopes: ['summary', 'records', 'labs', 'prescriptions'] },
      { upsert: true, new: true }
    );
    await writeAudit(req, { patient: req.user._id, action: 'ACCESS_GRANTED', resourceType: 'AccessGrant', resourceId: grant._id });
    res.status(201).json(grant);
  } catch (error) { next(error); }
});

router.get('/mine', async (req, res, next) => {
  try {
    const query = req.user.role === 'patient' ? { patient: req.user._id } : { doctor: req.user._id };
    const grants = await AccessGrant.find(query)
      .populate('patient', 'name email patientProfile.publicQrId')
      .populate('doctor', 'name email doctorProfile verifiedDoctor')
      .sort('-updatedAt');
    res.json(grants);
  } catch (error) { next(error); }
});

router.patch('/:id', requireRole('patient'), async (req, res, next) => {
  try {
    const grant = await AccessGrant.findOne({ _id: req.params.id, patient: req.user._id });
    if (!grant) return res.status(404).json({ message: 'Access request not found' });
    const status = req.body.status;
    if (!['active', 'revoked'].includes(status)) return res.status(400).json({ message: 'status must be active or revoked' });
    grant.status = status;
    if (status === 'active') {
      const hours = Math.min(Math.max(Number(req.body.hours) || 24, 1), 24 * 30);
      grant.grantedAt = new Date();
      grant.expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    }
    await grant.save();
    await writeAudit(req, { patient: req.user._id, action: status === 'active' ? 'ACCESS_GRANTED' : 'ACCESS_REVOKED', resourceType: 'AccessGrant', resourceId: grant._id });
    res.json(grant);
  } catch (error) { next(error); }
});

export default router;
