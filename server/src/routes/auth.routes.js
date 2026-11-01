import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { auth } from '../middleware/auth.js';

const router = Router();

function issueToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role },
    process.env.JWT_SECRET || 'dev-secret-change-me',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, role = 'patient', speciality, licenseNumber } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'name, email and password are required' });
    if (!['patient', 'doctor'].includes(role)) return res.status(400).json({ message: 'Unsupported role' });
    if (await User.exists({ email: email.toLowerCase() })) return res.status(409).json({ message: 'Email already registered' });
    if (role === 'doctor' && !licenseNumber) return res.status(400).json({ message: 'Doctor license number is required' });

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      role,
      passwordHash: await bcrypt.hash(password, 12),
      verifiedDoctor: role === 'doctor' && process.env.AUTO_VERIFY_DOCTORS === 'true',
      doctorProfile: role === 'doctor' ? { speciality, licenseNumber } : undefined
    });
    const token = issueToken(user);
    res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, verifiedDoctor: user.verifiedDoctor } });
  } catch (error) { next(error); }
});

router.post('/login', async (req, res, next) => {
  try {
    const user = await User.findOne({ email: String(req.body.email || '').toLowerCase() });
    if (!user || !(await bcrypt.compare(req.body.password || '', user.passwordHash))) return res.status(401).json({ message: 'Invalid email or password' });
    const token = issueToken(user);
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, verifiedDoctor: user.verifiedDoctor } });
  } catch (error) { next(error); }
});

router.get('/me', auth, async (req, res) => res.json(req.user));

export default router;
