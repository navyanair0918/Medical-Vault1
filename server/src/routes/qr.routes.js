import { Router } from 'express';
import QRCode from 'qrcode';
import User from '../models/User.js';
import MedicalRecord from '../models/MedicalRecord.js';
import Prescription from '../models/Prescription.js';
import LabReport from '../models/LabReport.js';
import Appointment from '../models/Appointment.js';
import { auth, requireRole, hasDoctorAccess } from '../middleware/auth.js';
import { writeAudit } from '../utils/audit.js';

const router = Router();
router.use(auth);

router.get('/me', requireRole('patient'), async (req, res, next) => {
  try {
    const publicQrId = req.user.patientProfile?.publicQrId;
    const configuredAppUrl = process.env.PUBLIC_APP_URL || req.get('origin') || process.env.CLIENT_URL || 'http://localhost:5173';
    const appUrl = new URL(configuredAppUrl);
    const url = `${appUrl.origin}/scan/${publicQrId}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 320, margin: 1 });
    res.json({ publicQrId, url, dataUrl });
  } catch (error) { next(error); }
});

router.get('/:publicQrId', requireRole('doctor'), async (req, res, next) => {
  try {
    const patient = await User.findOne({ role: 'patient', 'patientProfile.publicQrId': req.params.publicQrId }).select('-passwordHash');
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    let accessMode = 'grant';
    const grant = await hasDoctorAccess(patient._id, req.user._id);
    if (!grant) {
      const reason = String(req.query.reason || '').trim();
      const breakGlass = req.query.emergency === 'true' && patient.patientProfile?.emergencyAccessEnabled && reason.length >= 8;
      if (!breakGlass) {
        return res.status(403).json({
          message: 'Patient approval is required before full records can be opened.',
          patient: { name: patient.name },
          canRequestAccess: true,
          emergencyAccessAvailable: Boolean(patient.patientProfile?.emergencyAccessEnabled)
        });
      }
      accessMode = 'break_glass';
      await writeAudit(req, { patient: patient._id, action: 'BREAK_GLASS_ACCESS', resourceType: 'Patient', resourceId: patient._id, reason });
    }

    const [records, prescriptions, labs, appointments] = await Promise.all([
      MedicalRecord.find({ patient: patient._id }).select('-file.path').sort('-recordDate').limit(30),
      Prescription.find({ patient: patient._id }).populate('doctor', 'name doctorProfile').sort('-createdAt').limit(20),
      LabReport.find({ patient: patient._id }).sort('-reportDate').limit(20),
      Appointment.find({ patient: patient._id }).populate('doctor', 'name doctorProfile').sort('-startsAt').limit(10)
    ]);

    await writeAudit(req, { patient: patient._id, action: 'QR_PATIENT_PROFILE_VIEWED', resourceType: 'Patient', resourceId: patient._id, metadata: { accessMode } });
    res.json({ accessMode, patient, records, prescriptions, labs, appointments });
  } catch (error) { next(error); }
});

export default router;
