import mongoose from 'mongoose';

const medicalRecordSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  category: {
    type: String,
    enum: ['lab', 'blood', 'urinalysis', 'vitals', 'imaging', 'radiology', 'pathology', 'ecg', 'echo', 'discharge', 'prescription', 'vaccination', 'other'],
    default: 'other'
  },
  recordDate: { type: Date, default: Date.now },
  notes: String,
  file: {
    originalName: String,
    storedName: String,
    mimeType: String,
    size: Number,
    path: String
  }
}, { timestamps: true });

export default mongoose.model('MedicalRecord', medicalRecordSchema);
