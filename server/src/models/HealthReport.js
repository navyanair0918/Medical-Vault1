import mongoose from 'mongoose';

const metricSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  value: Number,
  textValue: String,
  unit: String,
  referenceMin: Number,
  referenceMax: Number,
  referenceText: String,
  group: String,
  status: { type: String, enum: ['low', 'high', 'within_range', 'abnormal', 'normal', 'unknown'], default: 'unknown' }
}, { _id: false });

const findingSchema = new mongoose.Schema({
  label: String,
  value: String,
  severity: { type: String, enum: ['info', 'mild', 'moderate', 'severe', 'unknown'], default: 'info' }
}, { _id: false });

const healthReportSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sourceRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalRecord' },
  reportType: {
    type: String,
    enum: ['blood', 'lab', 'urinalysis', 'vitals', 'imaging', 'radiology', 'pathology', 'ecg', 'echo', 'discharge_summary', 'prescription', 'vaccination', 'other'],
    default: 'other',
    index: true
  },
  title: { type: String, required: true },
  providerName: String,
  reportDate: { type: Date, required: true, index: true },
  metrics: { type: [metricSchema], default: [] },
  findings: { type: [findingSchema], default: [] },
  impression: String,
  summary: String,
  extraction: {
    status: { type: String, enum: ['manual', 'structured_import', 'ai_extracted', 'needs_extraction'], default: 'manual' },
    method: String,
    confidence: Number,
    modelVersion: String
  }
}, { timestamps: true });

healthReportSchema.index({ patient: 1, reportDate: 1, reportType: 1 });
export default mongoose.model('HealthReport', healthReportSchema);
