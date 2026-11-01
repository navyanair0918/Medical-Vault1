import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', index: true },
  locationId: mongoose.Schema.Types.ObjectId,
  serviceId: mongoose.Schema.Types.ObjectId,
  serviceName: String,
  startsAt: { type: Date, required: true, index: true },
  endsAt: { type: Date, required: true },
  timezone: { type: String, default: 'Asia/Kolkata' },
  durationMinutes: { type: Number, default: 30 },
  reason: String,
  mode: { type: String, enum: ['in_person', 'video'], default: 'video' },
  meetingLink: String,
  status: { type: String, enum: ['requested', 'confirmed', 'completed', 'cancelled', 'no_show'], default: 'requested', index: true },
  notes: String,
  slotKey: { type: String, unique: true, sparse: true },
  occupiedSlotKeys: { type: [String], default: [] }
}, { timestamps: true });

appointmentSchema.index({ doctor: 1, startsAt: 1, endsAt: 1 });
appointmentSchema.index({ occupiedSlotKeys: 1 }, { unique: true, sparse: true });
appointmentSchema.index({ patient: 1, startsAt: -1 });
export default mongoose.model('Appointment', appointmentSchema);
