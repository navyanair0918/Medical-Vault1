import { Router } from 'express';
import multer from 'multer';
import LabReport from '../models/LabReport.js';
import { auth, hasDoctorAccess } from '../middleware/auth.js';
import { writeAudit } from '../utils/audit.js';

const router = Router();
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
router.use(auth);

async function canAccess(req, patientId) {
  if (req.user.role === 'patient') return req.user._id.toString() === patientId.toString();
  if (req.user.role === 'doctor') return Boolean(await hasDoctorAccess(patientId, req.user._id));
  return req.user.role === 'admin';
}

function linearTrend(points) {
  if (points.length < 2) return { slopePerDay: 0, direction: 'insufficient_data' };
  const base = new Date(points[0].date).getTime();
  const xs = points.map(p => (new Date(p.date).getTime() - base) / 86400000);
  const ys = points.map(p => p.value);
  const xMean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const yMean = ys.reduce((a, b) => a + b, 0) / ys.length;
  const denominator = xs.reduce((s, x) => s + Math.pow(x - xMean, 2), 0);
  const slope = denominator === 0 ? 0 : xs.reduce((s, x, i) => s + (x - xMean) * (ys[i] - yMean), 0) / denominator;
  const scale = Math.max(Math.abs(yMean), 1);
  const normalized = slope / scale;
  return { slopePerDay: Number(slope.toFixed(4)), direction: Math.abs(normalized) < 0.001 ? 'stable' : slope > 0 ? 'increasing' : 'decreasing' };
}

function statusFor(point) {
  if (Number.isFinite(point.referenceMin) && point.value < point.referenceMin) return 'low';
  if (Number.isFinite(point.referenceMax) && point.value > point.referenceMax) return 'high';
  return 'within_range';
}

function groupTrends(reports) {
  const map = new Map();
  for (const report of reports) {
    for (const a of report.analytes) {
      const key = a.name.trim().toLowerCase();
      if (!map.has(key)) map.set(key, { name: a.name, unit: a.unit, points: [] });
      map.get(key).points.push({ date: report.reportDate, value: a.value, referenceMin: a.referenceMin, referenceMax: a.referenceMax, status: statusFor(a) });
    }
  }
  return [...map.values()].map(item => {
    item.points.sort((a, b) => new Date(a.date) - new Date(b.date));
    const latest = item.points[item.points.length - 1];
    return { ...item, latest, trend: linearTrend(item.points) };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

router.post('/', async (req, res, next) => {
  try {
    const patientId = req.user.role === 'patient' ? req.user._id : req.body.patientId;
    if (!patientId) return res.status(400).json({ message: 'patientId is required' });
    if (!(await canAccess(req, patientId))) return res.status(403).json({ message: 'Access denied' });
    if (!req.body.reportDate || !Array.isArray(req.body.analytes) || !req.body.analytes.length) return res.status(400).json({ message: 'reportDate and analytes are required' });
    const report = await LabReport.create({ patient: patientId, reportDate: req.body.reportDate, labName: req.body.labName, sourceRecord: req.body.sourceRecord, analytes: req.body.analytes });
    await writeAudit(req, { patient: patientId, action: 'LAB_REPORT_CREATED', resourceType: 'LabReport', resourceId: report._id });
    res.status(201).json(report);
  } catch (error) { next(error); }
});

router.post('/import-csv', csvUpload.single('file'), async (req, res, next) => {
  try {
    if (req.user.role !== 'patient') return res.status(403).json({ message: 'Patient account required for CSV import' });
    if (!req.file) return res.status(400).json({ message: 'CSV file required' });
    const lines = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    const headers = lines.shift()?.split(',').map(x => x.trim());
    const expected = ['reportDate', 'labName', 'testName', 'value', 'unit', 'referenceMin', 'referenceMax'];
    if (!headers || expected.some(x => !headers.includes(x))) return res.status(400).json({ message: `CSV headers must include: ${expected.join(', ')}` });
    const rows = lines.map(line => {
      const parts = line.split(',').map(x => x.trim());
      return Object.fromEntries(headers.map((h, i) => [h, parts[i] ?? '']));
    });
    const grouped = new Map();
    for (const row of rows) {
      const key = `${row.reportDate}|${row.labName}`;
      if (!grouped.has(key)) grouped.set(key, { reportDate: row.reportDate, labName: row.labName, analytes: [] });
      grouped.get(key).analytes.push({ name: row.testName, value: Number(row.value), unit: row.unit, referenceMin: row.referenceMin === '' ? undefined : Number(row.referenceMin), referenceMax: row.referenceMax === '' ? undefined : Number(row.referenceMax) });
    }
    const reports = await LabReport.insertMany([...grouped.values()].map(r => ({ ...r, patient: req.user._id })));
    await writeAudit(req, { patient: req.user._id, action: 'LAB_CSV_IMPORTED', resourceType: 'LabReport', metadata: { count: reports.length } });
    res.status(201).json({ imported: reports.length, reports });
  } catch (error) { next(error); }
});

router.get('/patient/:patientId', async (req, res, next) => {
  try {
    if (!(await canAccess(req, req.params.patientId))) return res.status(403).json({ message: 'Access denied' });
    const reports = await LabReport.find({ patient: req.params.patientId }).sort('reportDate');
    res.json(reports);
  } catch (error) { next(error); }
});

router.get('/trends/:patientId', async (req, res, next) => {
  try {
    if (!(await canAccess(req, req.params.patientId))) return res.status(403).json({ message: 'Access denied' });
    const reports = await LabReport.find({ patient: req.params.patientId }).sort('reportDate');
    const trends = groupTrends(reports);
    let ml = null;
    if (process.env.ML_SERVICE_URL && trends.length) {
      try {
        const response = await fetch(`${process.env.ML_SERVICE_URL}/analyze-labs`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ series: trends.map(t => ({ name: t.name, unit: t.unit, points: t.points })) }),
          signal: AbortSignal.timeout(2500)
        });
        if (response.ok) ml = await response.json();
      } catch { /* local analytics remains available */ }
    }
    await writeAudit(req, { patient: req.params.patientId, action: 'LAB_TRENDS_VIEWED', resourceType: 'LabReport' });
    res.json({ trends, ml, disclaimer: 'Automated trend and anomaly flags are decision-support only and must not be used as a diagnosis.' });
  } catch (error) { next(error); }
});

export default router;
