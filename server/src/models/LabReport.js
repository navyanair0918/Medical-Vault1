import mongoose from 'mongoose';

const analyteSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  value: { type: Number, required: true },
  unit: String,
  referenceMin: Number,
  referenceMax: Number
}, { _id: false });

const labReportSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  reportDate: { type: Date, required: true, index: true },
  labName: String,
  sourceRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalRecord' },
  analytes: { type: [analyteSchema], default: [] }
}, { timestamps: true });

export default mongoose.model('LabReport', labReportSchema);
