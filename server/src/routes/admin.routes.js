import { Router } from 'express';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import DoctorMembership from '../models/DoctorMembership.js';
import DoctorSchedule from '../models/DoctorSchedule.js';
import Appointment from '../models/Appointment.js';
import MedicalRecord from '../models/MedicalRecord.js';
import HealthReport from '../models/HealthReport.js';
import Prescription from '../models/Prescription.js';
import AuditLog from '../models/AuditLog.js';
import { auth, requireAdminPermission } from '../middleware/auth.js';
import { writeAudit } from '../utils/audit.js';

const router = Router();
router.use(auth);
router.use(requireAdminPermission());

router.get('/overview', async (req, res, next) => {
  try {
    const [users, patients, doctors, verifiedDoctors, organizations, appointments, records, reports] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'patient' }),
      User.countDocuments({ role: 'doctor' }),
      User.countDocuments({ role: 'doctor', verifiedDoctor: true }),
      Organization.countDocuments({ active: true }),
      Appointment.countDocuments(),
      MedicalRecord.countDocuments(),
      HealthReport.countDocuments()
    ]);
    res.json({ users, patients, doctors, verifiedDoctors, organizations, appointments, records, reports });
  } catch (error) { next(error); }
});

router.get('/users', requireAdminPermission('user_admin', '*'), async (req, res, next) => {
  try {
    const query = {};
    if (req.query.role) query.role = req.query.role;
    if (req.query.q) query.$or = [
      { name: { $regex: req.query.q, $options: 'i' } },
      { email: { $regex: req.query.q, $options: 'i' } }
    ];
    const users = await User.find(query).select('-passwordHash -patientProfile.publicQrId').sort('-createdAt').limit(250);
    res.json(users);
  } catch (error) { next(error); }
});

router.patch('/users/:id', requireAdminPermission('user_admin', '*'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if ('active' in req.body) user.active = Boolean(req.body.active);
    if (user.role === 'doctor' && 'verifiedDoctor' in req.body) user.verifiedDoctor = Boolean(req.body.verifiedDoctor);
    await user.save();
    await writeAudit(req, { patient: user.role === 'patient' ? user._id : undefined, action: 'ADMIN_USER_UPDATED', resourceType: 'User', resourceId: user._id, metadata: { active: user.active, verifiedDoctor: user.verifiedDoctor } });
    res.json(user);
  } catch (error) { next(error); }
});

router.get('/organizations', requireAdminPermission('provider_admin', '*'), async (req, res, next) => {
  try {
    res.json(await Organization.find().sort('name'));
  } catch (error) { next(error); }
});

router.post('/organizations', requireAdminPermission('provider_admin', '*'), async (req, res, next) => {
  try {
    if (!req.body.name || !req.body.type) return res.status(400).json({ message: 'name and type are required' });
    const organization = await Organization.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json(organization);
  } catch (error) { next(error); }
});

router.post('/memberships', requireAdminPermission('provider_admin', '*'), async (req, res, next) => {
  try {
    const doctor = await User.findOne({ _id: req.body.doctorId, role: 'doctor' });
    const organization = await Organization.findById(req.body.organizationId);
    if (!doctor || !organization) return res.status(404).json({ message: 'Doctor or organization not found' });
    const membership = await DoctorMembership.findOneAndUpdate(
      { doctor: doctor._id, organization: organization._id },
      {
        doctor: doctor._id,
        organization: organization._id,
        locationIds: req.body.locationIds || [],
        title: req.body.title || 'Consultant',
        specialties: req.body.specialties?.length ? req.body.specialties : [doctor.doctorProfile?.speciality].filter(Boolean),
        services: req.body.services || [],
        acceptingAppointments: req.body.acceptingAppointments !== false,
        status: req.body.status || 'active'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).populate('doctor', 'name email doctorProfile verifiedDoctor').populate('organization');
    res.status(201).json(membership);
  } catch (error) { next(error); }
});

router.post('/schedules', requireAdminPermission('provider_admin', '*'), async (req, res, next) => {
  try {
    const schedule = await DoctorSchedule.findOneAndUpdate(
      { doctor: req.body.doctorId, organization: req.body.organizationId, locationId: req.body.locationId },
      {
        doctor: req.body.doctorId,
        organization: req.body.organizationId,
        locationId: req.body.locationId,
        timezone: req.body.timezone || 'Asia/Kolkata',
        slotMinutes: req.body.slotMinutes || 30,
        bufferMinutes: req.body.bufferMinutes || 0,
        weekly: req.body.weekly || [],
        exceptions: req.body.exceptions || [],
        active: req.body.active !== false
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json(schedule);
  } catch (error) { next(error); }
});

router.get('/appointments', requireAdminPermission('appointment_admin', '*'), async (req, res, next) => {
  try {
    const appointments = await Appointment.find().populate('patient', 'name email').populate('doctor', 'name email doctorProfile').populate('organization', 'name type locations').sort('-startsAt').limit(300);
    res.json(appointments);
  } catch (error) { next(error); }
});

router.get('/patient/:patientId/clinical-data', requireAdminPermission('clinical_data_read', '*'), async (req, res, next) => {
  try {
    const patient = await User.findOne({ _id: req.params.patientId, role: 'patient' }).select('-passwordHash');
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    const [records, reports, prescriptions, appointments] = await Promise.all([
      MedicalRecord.find({ patient: patient._id }).select('-file.path').sort('-recordDate'),
      HealthReport.find({ patient: patient._id }).sort('-reportDate'),
      Prescription.find({ patient: patient._id }).populate('doctor', 'name doctorProfile').sort('-createdAt'),
      Appointment.find({ patient: patient._id }).populate('doctor', 'name doctorProfile').populate('organization', 'name').sort('-startsAt')
    ]);
    await writeAudit(req, { patient: patient._id, action: 'ADMIN_CLINICAL_DATA_VIEWED', resourceType: 'Patient', resourceId: patient._id, metadata: { reason: req.query.reason || 'admin_review' } });
    res.json({ patient, records, reports, prescriptions, appointments, warning: 'Privileged clinical-data access is audited. Production systems should require least-privilege authorization and a stated access reason.' });
  } catch (error) { next(error); }
});

router.get('/audits', requireAdminPermission('compliance_read', '*'), async (req, res, next) => {
  try {
    const query = req.query.patientId ? { patient: req.query.patientId } : {};
    const logs = await AuditLog.find(query).populate('actor', 'name email role').populate('patient', 'name email').sort('-createdAt').limit(500);
    res.json(logs);
  } catch (error) { next(error); }
});

export default router;
