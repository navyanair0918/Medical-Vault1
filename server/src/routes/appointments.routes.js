import { Router } from 'express';
import Appointment from '../models/Appointment.js';
import Organization from '../models/Organization.js';
import DoctorMembership from '../models/DoctorMembership.js';
import DoctorSchedule from '../models/DoctorSchedule.js';
import { auth, requireRole } from '../middleware/auth.js';
import { writeAudit } from '../utils/audit.js';
import { clockToMinutes, minutesToClock, zonedLocalToUtc } from '../utils/timezone.js';

const router = Router();
router.use(auth);

function weekdayForDate(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

function occupiedKeys(doctorId, startsAt, endsAt, bucketMinutes = 5) {
  const keys = [];
  const step = bucketMinutes * 60000;
  for (let t = startsAt.getTime(); t < endsAt.getTime(); t += step) keys.push(`${doctorId}:${new Date(t).toISOString()}`);
  return keys;
}

async function buildSlots({ doctorId, organizationId, locationId, date, mode = 'in_person', serviceId }) {
  const membership = await DoctorMembership.findOne({
    doctor: doctorId,
    organization: organizationId,
    status: 'active',
    acceptingAppointments: true,
    locationIds: locationId
  }).populate('doctor', 'name doctorProfile verifiedDoctor').populate('organization');
  if (!membership || !membership.doctor?.verifiedDoctor) return { membership: null, schedule: null, slots: [] };

  const schedule = await DoctorSchedule.findOne({ doctor: doctorId, organization: organizationId, locationId, active: true });
  if (!schedule) return { membership, schedule: null, slots: [] };
  const service = serviceId ? membership.services.id(serviceId) : membership.services[0];
  const durationMinutes = service?.durationMinutes || schedule.slotMinutes || 30;
  if (service?.modes?.length && !service.modes.includes(mode)) return { membership, schedule, service, slots: [] };

  const exception = schedule.exceptions.find(e => e.date === date);
  let windows = [];
  if (exception) windows = exception.unavailable ? [] : exception.windows;
  else windows = schedule.weekly.find(w => w.weekday === weekdayForDate(date))?.windows || [];
  windows = windows.filter(w => !w.modes?.length || w.modes.includes(mode));

  const dayStart = zonedLocalToUtc(date, '00:00', schedule.timezone);
  const dayEnd = zonedLocalToUtc(date, '23:59', schedule.timezone);
  const booked = await Appointment.find({
    doctor: doctorId,
    status: { $in: ['requested', 'confirmed'] },
    startsAt: { $lte: dayEnd },
    endsAt: { $gte: dayStart }
  }).select('startsAt endsAt');

  const slots = [];
  const increment = Math.max(schedule.slotMinutes || durationMinutes, durationMinutes);
  for (const window of windows) {
    const startMin = clockToMinutes(window.start);
    const endMin = clockToMinutes(window.end);
    for (let minute = startMin; minute + durationMinutes <= endMin; minute += increment + (schedule.bufferMinutes || 0)) {
      const startClock = minutesToClock(minute);
      const endClock = minutesToClock(minute + durationMinutes);
      const startsAt = zonedLocalToUtc(date, startClock, schedule.timezone);
      const endsAt = zonedLocalToUtc(date, endClock, schedule.timezone);
      const isPast = startsAt.getTime() <= Date.now();
      const conflict = booked.some(b => overlaps(startsAt, endsAt, b.startsAt, b.endsAt));
      if (!isPast && !conflict) slots.push({ startsAt, endsAt, localTime: startClock, durationMinutes });
    }
  }
  return { membership, schedule, service, slots };
}

router.get('/directory', requireRole('patient', 'doctor', 'admin'), async (req, res, next) => {
  try {
    const orgQuery = { active: true };
    if (req.query.organizationId) orgQuery._id = req.query.organizationId;
    if (req.query.type) orgQuery.type = req.query.type;
    const organizations = await Organization.find(orgQuery).sort('name');
    const orgIds = organizations.map(o => o._id);
    const membershipQuery = { organization: { $in: orgIds }, status: 'active', acceptingAppointments: true };
    if (req.query.doctorId) membershipQuery.doctor = req.query.doctorId;
    if (req.query.speciality) membershipQuery.specialties = { $regex: req.query.speciality, $options: 'i' };
    const memberships = await DoctorMembership.find(membershipQuery)
      .populate({ path: 'doctor', match: { verifiedDoctor: true, active: true }, select: 'name doctorProfile verifiedDoctor' })
      .populate('organization');
    res.json(memberships.filter(m => m.doctor).map(m => ({
      _id: m._id,
      doctor: m.doctor,
      organization: m.organization,
      locationIds: m.locationIds,
      title: m.title,
      specialties: m.specialties,
      services: m.services,
      acceptingAppointments: m.acceptingAppointments
    })));
  } catch (error) { next(error); }
});

router.get('/availability', requireRole('patient', 'doctor', 'admin'), async (req, res, next) => {
  try {
    const { doctorId, organizationId, locationId, date, mode = 'in_person', serviceId } = req.query;
    if (!doctorId || !organizationId || !locationId || !date) return res.status(400).json({ message: 'doctorId, organizationId, locationId and date are required' });
    const result = await buildSlots({ doctorId, organizationId, locationId, date, mode, serviceId });
    if (!result.membership) return res.status(404).json({ message: 'Active verified doctor membership not found' });
    res.json({
      doctor: result.membership.doctor,
      organization: result.membership.organization,
      service: result.service,
      timezone: result.schedule?.timezone,
      slots: result.slots
    });
  } catch (error) { next(error); }
});

router.post('/', requireRole('patient'), async (req, res, next) => {
  try {
    const { doctorId, organizationId, locationId, serviceId, startsAt, date, mode = 'in_person', reason } = req.body;
    if (!doctorId || !organizationId || !locationId || !startsAt) return res.status(400).json({ message: 'doctorId, organizationId, locationId and startsAt are required' });
    const localDate = date || new Date(startsAt).toISOString().slice(0, 10);
    const result = await buildSlots({ doctorId, organizationId, locationId, date: localDate, mode, serviceId });
    const requestedStart = new Date(startsAt);
    const slot = result.slots.find(s => s.startsAt.getTime() === requestedStart.getTime());
    if (!slot) return res.status(409).json({ message: 'That appointment slot is no longer available' });

    const locationExists = result.membership.organization.locations.some(l => l._id.toString() === locationId && l.active !== false);
    if (!locationExists) return res.status(400).json({ message: 'Invalid or inactive provider location' });

    const appointment = await Appointment.create({
      patient: req.user._id,
      doctor: doctorId,
      organization: organizationId,
      locationId,
      serviceId: result.service?._id,
      serviceName: result.service?.name || 'Consultation',
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      timezone: result.schedule?.timezone || 'Asia/Kolkata',
      durationMinutes: slot.durationMinutes,
      reason,
      mode,
      slotKey: `${doctorId}:${slot.startsAt.toISOString()}`,
      occupiedSlotKeys: occupiedKeys(doctorId, slot.startsAt, slot.endsAt)
    });
    await writeAudit(req, { patient: req.user._id, action: 'APPOINTMENT_BOOKED', resourceType: 'Appointment', resourceId: appointment._id, metadata: { doctorId, organizationId, mode } });
    res.status(201).json(await appointment.populate('doctor', 'name doctorProfile').then(a => a.populate('organization', 'name type locations')));
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'That appointment slot was just booked by someone else. Please choose another slot.' });
    next(error);
  }
});

router.get('/mine', async (req, res, next) => {
  try {
    const query = req.user.role === 'doctor' ? { doctor: req.user._id } : req.user.role === 'patient' ? { patient: req.user._id } : {};
    const appointments = await Appointment.find(query)
      .populate('doctor', 'name doctorProfile')
      .populate('patient', 'name email patientProfile.bloodGroup')
      .populate('organization', 'name type locations')
      .sort('startsAt');
    res.json(appointments);
  } catch (error) { next(error); }
});

router.get('/schedule/mine', requireRole('doctor'), async (req, res, next) => {
  try {
    const schedules = await DoctorSchedule.find({ doctor: req.user._id }).populate('organization', 'name type locations');
    res.json(schedules);
  } catch (error) { next(error); }
});

router.put('/schedule/:organizationId/:locationId', requireRole('doctor'), async (req, res, next) => {
  try {
    const membership = await DoctorMembership.findOne({ doctor: req.user._id, organization: req.params.organizationId, status: 'active', locationIds: req.params.locationId });
    if (!membership) return res.status(403).json({ message: 'You are not an active doctor at this location' });
    const schedule = await DoctorSchedule.findOneAndUpdate(
      { doctor: req.user._id, organization: req.params.organizationId, locationId: req.params.locationId },
      {
        doctor: req.user._id,
        organization: req.params.organizationId,
        locationId: req.params.locationId,
        timezone: req.body.timezone || 'Asia/Kolkata',
        slotMinutes: req.body.slotMinutes || 30,
        bufferMinutes: req.body.bufferMinutes || 0,
        weekly: req.body.weekly || [],
        exceptions: req.body.exceptions || [],
        active: req.body.active !== false
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json(schedule);
  } catch (error) { next(error); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });
    const isDoctor = req.user.role === 'doctor' && appointment.doctor.toString() === req.user._id.toString();
    const isPatient = req.user.role === 'patient' && appointment.patient.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isDoctor && !isPatient && !isAdmin) return res.status(403).json({ message: 'Access denied' });
    const allowedStatus = isAdmin ? ['requested', 'confirmed', 'completed', 'cancelled', 'no_show'] : isDoctor ? ['confirmed', 'completed', 'cancelled', 'no_show'] : ['cancelled'];
    if (req.body.status && !allowedStatus.includes(req.body.status)) return res.status(400).json({ message: 'Status change not allowed' });
    for (const key of ['status', 'meetingLink', 'notes']) if (key in req.body) appointment[key] = req.body[key];
    if (req.body.status === 'cancelled') { appointment.slotKey = undefined; appointment.occupiedSlotKeys = []; }
    await appointment.save();
    await writeAudit(req, { patient: appointment.patient, action: 'APPOINTMENT_UPDATED', resourceType: 'Appointment', resourceId: appointment._id, metadata: { status: appointment.status } });
    res.json(appointment);
  } catch (error) { next(error); }
});

export default router;
