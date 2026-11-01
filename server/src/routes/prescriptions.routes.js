import { Router } from 'express';
import Prescription from '../models/Prescription.js';
import { auth, requireRole, hasDoctorAccess } from '../middleware/auth.js';
import { writeAudit } from '../utils/audit.js';

const router = Router();
router.use(auth);

router.post('/', requireRole('doctor'), async (req, res, next) => {
  try {
    const { patientId, diagnosis, medications = [], advice, followUpDate } = req.body;
    if (!(await hasDoctorAccess(patientId, req.user._id))) return res.status(403).json({ message: 'Patient access is required before prescribing' });
    const prescription = await Prescription.create({ patient: patientId, doctor: req.user._id, diagnosis, medications, advice, followUpDate });
    await writeAudit(req, { patient: patientId, action: 'PRESCRIPTION_CREATED', resourceType: 'Prescription', resourceId: prescription._id });
    res.status(201).json(prescription);
  } catch (error) { next(error); }
});

router.get('/patient/:patientId', async (req, res, next) => {
  try {
    const own = req.user.role === 'patient' && req.user._id.toString() === req.params.patientId;
    const granted = req.user.role === 'doctor' && await hasDoctorAccess(req.params.patientId, req.user._id);
    if (!own && !granted) return res.status(403).json({ message: 'Access denied' });
    const prescriptions = await Prescription.find({ patient: req.params.patientId }).populate('doctor', 'name doctorProfile').sort('-createdAt');
    res.json(prescriptions);
  } catch (error) { next(error); }
});

export default router;
