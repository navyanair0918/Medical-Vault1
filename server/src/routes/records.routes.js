import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import MedicalRecord from '../models/MedicalRecord.js';
import { auth, requireRole, hasDoctorAccess } from '../middleware/auth.js';
import { writeAudit } from '../utils/audit.js';

const router = Router();
const uploadDir = path.resolve('src/uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const maxMb = Number(process.env.MAX_UPLOAD_MB) || 10;
const allowedMime = new Set(['application/pdf', 'image/jpeg', 'image/png', 'text/csv', 'text/plain', 'application/json', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/dicom']);
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`)
});
const upload = multer({
  storage,
  limits: { fileSize: maxMb * 1024 * 1024 },
  fileFilter: (_, file, cb) => allowedMime.has(file.mimetype) ? cb(null, true) : cb(new Error('Allowed: PDF, JPG, PNG, CSV, TXT, JSON, DOCX and DICOM'))
});

async function canView(req, patientId) {
  if (req.user.role === 'patient') return req.user._id.toString() === patientId.toString();
  if (req.user.role === 'doctor') return Boolean(await hasDoctorAccess(patientId, req.user._id));
  return req.user.role === 'admin';
}

router.use(auth);

router.post('/', requireRole('patient'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'file is required' });
    const record = await MedicalRecord.create({
      patient: req.user._id,
      uploadedBy: req.user._id,
      title: req.body.title || req.file.originalname,
      category: req.body.category || 'other',
      recordDate: req.body.recordDate || new Date(),
      notes: req.body.notes,
      file: { originalName: req.file.originalname, storedName: req.file.filename, mimeType: req.file.mimetype, size: req.file.size, path: req.file.path }
    });
    await writeAudit(req, { patient: req.user._id, action: 'RECORD_UPLOADED', resourceType: 'MedicalRecord', resourceId: record._id });
    res.status(201).json(record);
  } catch (error) { next(error); }
});

router.get('/patient/:patientId', async (req, res, next) => {
  try {
    if (!(await canView(req, req.params.patientId))) return res.status(403).json({ message: 'No active access grant for this patient' });
    const records = await MedicalRecord.find({ patient: req.params.patientId }).select('-file.path').sort('-recordDate');
    await writeAudit(req, { patient: req.params.patientId, action: 'RECORD_LIST_VIEWED', resourceType: 'MedicalRecord' });
    res.json(records);
  } catch (error) { next(error); }
});

router.get('/:id/file', async (req, res, next) => {
  try {
    const record = await MedicalRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Record not found' });
    if (!(await canView(req, record.patient))) return res.status(403).json({ message: 'No active access grant for this patient' });
    await writeAudit(req, { patient: record.patient, action: 'RECORD_FILE_VIEWED', resourceType: 'MedicalRecord', resourceId: record._id });
    res.type(record.file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${record.file.originalName.replace(/"/g, '')}"`);
    res.sendFile(path.resolve(record.file.path));
  } catch (error) { next(error); }
});

router.delete('/:id', requireRole('patient'), async (req, res, next) => {
  try {
    const record = await MedicalRecord.findOneAndDelete({ _id: req.params.id, patient: req.user._id });
    if (!record) return res.status(404).json({ message: 'Record not found' });
    fs.promises.unlink(record.file.path).catch(() => {});
    await writeAudit(req, { patient: req.user._id, action: 'RECORD_DELETED', resourceType: 'MedicalRecord', resourceId: record._id });
    res.status(204).end();
  } catch (error) { next(error); }
});

export default router;
