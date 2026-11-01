import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const userSchema = new mongoose.Schema({
  role: { type: String, enum: ['patient', 'doctor', 'admin'], required: true, index: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  active: { type: Boolean, default: true, index: true },
  verifiedDoctor: { type: Boolean, default: false, index: true },
  patientProfile: {
    publicQrId: { type: String, default: uuidv4 },
    dob: Date,
    gender: { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say'] },
    heightCm: Number,
    weightKg: Number,
    bloodGroup: String,
    allergies: [String],
    conditions: [String],
    medications: [String],
    emergencyContact: { name: String, phone: String },
    emergencyAccessEnabled: { type: Boolean, default: false }
  },
  doctorProfile: {
    licenseNumber: String,
    speciality: String,
    clinic: String,
    registrationAuthority: String,
    yearsExperience: Number,
    languages: [String]
  },
  adminProfile: {
    permissions: {
      type: [String],
      default: []
    }
  }
}, { timestamps: true });

userSchema.index({ 'patientProfile.publicQrId': 1 }, { sparse: true, unique: true });
userSchema.index({ name: 'text', email: 'text' });
export default mongoose.model('User', userSchema);
