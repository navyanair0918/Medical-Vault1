import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import HealthReport from '../models/HealthReport.js';
import MedicalRecord from '../models/MedicalRecord.js';
import { auth, hasDoctorAccess } from '../middleware/auth.js';
import { writeAudit } from '../utils/audit.js';

const router = Router();
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });
router.use(auth);

async function canAccess(req, patientId) {
  if (req.user.role === 'patient') return req.user._id.toString() === patientId.toString();
  if (req.user.role === 'doctor') return Boolean(await hasDoctorAccess(patientId, req.user._id));
  if (req.user.role === 'admin') return (req.user.adminProfile?.permissions || []).some(p => ['clinical_data_read', '*'].includes(p));
  return false;
}

function metricStatus(metric) {
  if (Number.isFinite(metric.value)) {
    if (Number.isFinite(metric.referenceMin) && metric.value < metric.referenceMin) return 'low';
    if (Number.isFinite(metric.referenceMax) && metric.value > metric.referenceMax) return 'high';
    if (Number.isFinite(metric.referenceMin) || Number.isFinite(metric.referenceMax)) return 'within_range';
  }
  return metric.status || 'unknown';
}

function linearTrend(points) {
  if (points.length < 2) return { slopePerDay: 0, direction: 'insufficient_data' };
  const base = new Date(points[0].date).getTime();
  const xs = points.map(p => (new Date(p.date).getTime() - base) / 86400000);
  const ys = points.map(p => p.value);
  const xm = xs.reduce((a, b) => a + b, 0) / xs.length;
  const ym = ys.reduce((a, b) => a + b, 0) / ys.length;
  const den = xs.reduce((s, x) => s + ((x - xm) ** 2), 0);
  const slope = den ? xs.reduce((s, x, i) => s + (x - xm) * (ys[i] - ym), 0) / den : 0;
  const scale = Math.max(Math.abs(ym), 1);
  return { slopePerDay: Number(slope.toFixed(5)), direction: Math.abs(slope / scale) < 0.001 ? 'stable' : slope > 0 ? 'increasing' : 'decreasing' };
}

function buildMetricTrends(reports) {
  const map = new Map();
  for (const report of reports) {
    for (const metric of report.metrics || []) {
      if (!Number.isFinite(metric.value)) continue;
      const key = `${metric.name.trim().toLowerCase()}|${metric.unit || ''}`;
      if (!map.has(key)) map.set(key, { name: metric.name, unit: metric.unit, group: metric.group, reportTypes: new Set(), points: [] });
      const entry = map.get(key);
      entry.reportTypes.add(report.reportType);
      entry.points.push({
        date: report.reportDate,
        value: metric.value,
        referenceMin: metric.referenceMin,
        referenceMax: metric.referenceMax,
        status: metricStatus(metric),
        reportId: report._id,
        reportType: report.reportType
      });
    }
  }
  return [...map.values()].map(entry => {
    entry.points.sort((a, b) => new Date(a.date) - new Date(b.date));
    return {
      name: entry.name,
      unit: entry.unit,
      group: entry.group,
      reportTypes: [...entry.reportTypes],
      points: entry.points,
      latest: entry.points.at(-1),
      trend: linearTrend(entry.points)
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function parseCsv(buffer) {
  const lines = buffer.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const headers = lines.shift()?.split(',').map(h => h.trim());
  if (!headers) return [];
  return lines.map(line => {
    const parts = line.split(',').map(v => v.trim());
    return Object.fromEntries(headers.map((h, i) => [h, parts[i] ?? '']));
  });
}

function reportTypeFromCategory(category) {
  const map = { discharge: 'discharge_summary' };
  return map[category] || category || 'other';
}

router.post('/', async (req, res, next) => {
  try {
    const patientId = req.user.role === 'patient' ? req.user._id : req.body.patientId;
    if (!patientId || !(await canAccess(req, patientId))) return res.status(403).json({ message: 'Access denied' });
    if (!req.body.title || !req.body.reportDate) return res.status(400).json({ message: 'title and reportDate are required' });
    const metrics = (req.body.metrics || []).map(m => ({ ...m, status: metricStatus(m) }));
    const report = await HealthReport.create({
      patient: patientId,
      createdBy: req.user._id,
      sourceRecord: req.body.sourceRecord,
      reportType: req.body.reportType || 'other',
      title: req.body.title,
      providerName: req.body.providerName,
      reportDate: req.body.reportDate,
      metrics,
      findings: req.body.findings || [],
      impression: req.body.impression,
      summary: req.body.summary,
      extraction: req.body.extraction || { status: 'manual', method: 'manual_structured_entry' }
    });
    await writeAudit(req, { patient: patientId, action: 'HEALTH_REPORT_CREATED', resourceType: 'HealthReport', resourceId: report._id, metadata: { reportType: report.reportType } });
    res.status(201).json(report);
  } catch (error) { next(error); }
});

router.post('/import-csv', csvUpload.single('file'), async (req, res, next) => {
  try {
    if (req.user.role !== 'patient') return res.status(403).json({ message: 'Patient account required for CSV import' });
    if (!req.file) return res.status(400).json({ message: 'CSV file is required' });
    const rows = parseCsv(req.file.buffer);
    const required = ['reportDate', 'reportType', 'title', 'metricName', 'value'];
    if (!rows.length || required.some(k => !(k in rows[0]))) return res.status(400).json({ message: `CSV must include: ${required.join(', ')}. Optional: providerName, unit, referenceMin, referenceMax, group.` });
    const grouped = new Map();
    for (const row of rows) {
      const key = `${row.reportDate}|${row.reportType}|${row.title}|${row.providerName || ''}`;
      if (!grouped.has(key)) grouped.set(key, { reportDate: row.reportDate, reportType: row.reportType, title: row.title, providerName: row.providerName, metrics: [] });
      const metric = {
        name: row.metricName,
        value: Number(row.value),
        unit: row.unit,
        referenceMin: row.referenceMin === '' ? undefined : Number(row.referenceMin),
        referenceMax: row.referenceMax === '' ? undefined : Number(row.referenceMax),
        group: row.group
      };
      metric.status = metricStatus(metric);
      grouped.get(key).metrics.push(metric);
    }
    const reports = await HealthReport.insertMany([...grouped.values()].map(r => ({ ...r, patient: req.user._id, createdBy: req.user._id, extraction: { status: 'structured_import', method: 'csv' } })));
    await writeAudit(req, { patient: req.user._id, action: 'HEALTH_REPORT_CSV_IMPORTED', resourceType: 'HealthReport', metadata: { count: reports.length } });
    res.status(201).json({ imported: reports.length, reports });
  } catch (error) { next(error); }
});

router.post('/extract/:recordId', async (req, res, next) => {
  try {
    const record = await MedicalRecord.findById(req.params.recordId);
    if (!record) return res.status(404).json({ message: 'Medical record not found' });
    if (!(await canAccess(req, record.patient))) return res.status(403).json({ message: 'Access denied' });

    const existing = await HealthReport.findOne({ sourceRecord: record._id });
    if (existing && req.query.force !== 'true') return res.json({ ...existing.toObject(), alreadyProcessed: true });
    if (existing && req.query.force === 'true') await HealthReport.deleteMany({ sourceRecord: record._id });

    if (record.file.mimeType === 'text/csv') {
      const rows = parseCsv(fs.readFileSync(record.file.path));
      const metrics = rows.filter(r => r.name || r.metricName || r.testName).map(r => {
        const m = {
          name: r.name || r.metricName || r.testName,
          value: Number(r.value),
          unit: r.unit,
          referenceMin: r.referenceMin === '' ? undefined : Number(r.referenceMin),
          referenceMax: r.referenceMax === '' ? undefined : Number(r.referenceMax),
          group: r.group
        };
        return { ...m, status: metricStatus(m) };
      }).filter(m => m.name && Number.isFinite(m.value));
      const report = await HealthReport.create({
        patient: record.patient, createdBy: req.user._id, sourceRecord: record._id,
        reportType: reportTypeFromCategory(record.category), title: record.title, reportDate: record.recordDate,
        metrics, summary: `Imported ${metrics.length} numeric metrics from CSV.`,
        extraction: { status: 'structured_import', method: 'record_csv' }
      });
      return res.status(201).json(report);
    }

    if (process.env.DOCUMENT_AI_URL) {
      try {
        const bytes = fs.readFileSync(record.file.path);
        const form = new FormData();
        form.append('file', new Blob([bytes], { type: record.file.mimeType }), record.file.originalName);
        form.append('reportType', reportTypeFromCategory(record.category));
        const response = await fetch(`${process.env.DOCUMENT_AI_URL}/extract-report`, { method: 'POST', body: form, signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`Document AI returned ${response.status}`);
        const extracted = await response.json();
        const metrics = (extracted.metrics || []).map(m => ({ ...m, status: metricStatus(m) }));
        const report = await HealthReport.create({
          patient: record.patient, createdBy: req.user._id, sourceRecord: record._id,
          reportType: extracted.reportType || reportTypeFromCategory(record.category), title: extracted.title || record.title,
          providerName: extracted.providerName, reportDate: extracted.reportDate || record.recordDate,
          metrics, findings: extracted.findings || [], impression: extracted.impression,
          summary: extracted.summary,
          extraction: { status: 'ai_extracted', method: extracted.method || 'document_ai', confidence: extracted.confidence, modelVersion: extracted.modelVersion }
        });
        return res.status(201).json(report);
      } catch (error) {
        return res.status(502).json({ message: `Document extraction service failed: ${error.message}` });
      }
    }

    const placeholder = await HealthReport.create({
      patient: record.patient, createdBy: req.user._id, sourceRecord: record._id,
      reportType: reportTypeFromCategory(record.category), title: record.title, reportDate: record.recordDate,
      summary: 'File is securely stored. Configure DOCUMENT_AI_URL to enable OCR/AI extraction for PDF/image reports, or add structured findings manually.',
      extraction: { status: 'needs_extraction', method: 'none' }
    });
    res.status(202).json(placeholder);
  } catch (error) { next(error); }
});

router.get('/patient/:patientId', async (req, res, next) => {
  try {
    if (!(await canAccess(req, req.params.patientId))) return res.status(403).json({ message: 'Access denied' });
    const query = { patient: req.params.patientId };
    if (req.query.type) query.reportType = req.query.type;
    const reports = await HealthReport.find(query).sort('-reportDate');
    res.json(reports);
  } catch (error) { next(error); }
});

router.get('/overview/:patientId', async (req, res, next) => {
  try {
    if (!(await canAccess(req, req.params.patientId))) return res.status(403).json({ message: 'Access denied' });
    const reports = await HealthReport.find({ patient: req.params.patientId }).sort('reportDate');
    const trends = buildMetricTrends(reports);
    const byType = reports.reduce((acc, r) => { acc[r.reportType] = (acc[r.reportType] || 0) + 1; return acc; }, {});
    const flaggedMetrics = trends.filter(t => ['low', 'high', 'abnormal'].includes(t.latest?.status));
    const narrative = reports.filter(r => r.impression || r.summary || r.findings?.length).slice(-20).reverse().map(r => ({
      id: r._id, date: r.reportDate, type: r.reportType, title: r.title, providerName: r.providerName,
      impression: r.impression, summary: r.summary, findings: r.findings, extraction: r.extraction
    }));

    let ml = null;
    if (process.env.ML_SERVICE_URL && trends.length) {
      try {
        const response = await fetch(`${process.env.ML_SERVICE_URL}/analyze-series`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ series: trends.map(t => ({ name: t.name, unit: t.unit, points: t.points })) }),
          signal: AbortSignal.timeout(3000)
        });
        if (response.ok) ml = await response.json();
      } catch { /* analytics remains functional without ML service */ }
    }
    await writeAudit(req, { patient: req.params.patientId, action: 'HEALTH_REPORT_OVERVIEW_VIEWED', resourceType: 'HealthReport' });
    res.json({
      totalReports: reports.length,
      byType,
      trends,
      flaggedMetrics,
      narrative,
      ml,
      disclaimer: 'Automated extraction, range flags, trends, forecasts and anomaly detection are decision-support only. They do not diagnose disease and must be reviewed in clinical context.'
    });
  } catch (error) { next(error); }
});

export default router;
