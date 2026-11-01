import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  durationMinutes: { type: Number, default: 30, min: 10, max: 240 },
  fee: { type: Number, min: 0 },
  currency: { type: String, default: 'INR' },
  modes: { type: [String], enum: ['in_person', 'video'], default: ['in_person'] }
}, { _id: true });

const membershipSchema = new mongoose.Schema({
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  locationIds: [{ type: mongoose.Schema.Types.ObjectId }],
  title: { type: String, default: 'Consultant' },
  specialties: { type: [String], default: [] },
  services: { type: [serviceSchema], default: [] },
  acceptingAppointments: { type: Boolean, default: true },
  status: { type: String, enum: ['active', 'inactive', 'pending'], default: 'active', index: true }
}, { timestamps: true });

membershipSchema.index({ doctor: 1, organization: 1 }, { unique: true });
export default mongoose.model('DoctorMembership', membershipSchema);
