import mongoose from 'mongoose';

const medicationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  dosage: String,
  frequency: String,
  duration: String,
  instructions: String
}, { _id: false });

const prescriptionSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  diagnosis: String,
  medications: { type: [medicationSchema], default: [] },
  advice: String,
  followUpDate: Date
}, { timestamps: true });

export default mongoose.model('Prescription', prescriptionSchema);
