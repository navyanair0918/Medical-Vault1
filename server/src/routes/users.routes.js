import { Router } from 'express';
import User from '../models/User.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

router.get('/doctors', async (req, res, next) => {
  try {
    const doctors = await User.find({ role: 'doctor' }).select('name doctorProfile verifiedDoctor').sort('name');
    res.json(doctors);
  } catch (error) { next(error); }
});

router.patch('/patient-profile', async (req, res, next) => {
  try {
    if (req.user.role !== 'patient') return res.status(403).json({ message: 'Patient account required' });
    const allowed = ['dob', 'gender', 'heightCm', 'weightKg', 'bloodGroup', 'allergies', 'conditions', 'medications', 'emergencyContact', 'emergencyAccessEnabled'];
    const updates = {};
    for (const key of allowed) if (key in req.body) updates[`patientProfile.${key}`] = req.body[key];
    const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true }).select('-passwordHash');
    res.json(user);
  } catch (error) { next(error); }
});

export default router;
