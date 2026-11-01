import mongoose from 'mongoose';

const windowSchema = new mongoose.Schema({
  start: { type: String, required: true },
  end: { type: String, required: true },
  modes: { type: [String], enum: ['in_person', 'video'], default: ['in_person', 'video'] }
}, { _id: false });

const weeklySchema = new mongoose.Schema({
  weekday: { type: Number, min: 0, max: 6, required: true },
  windows: { type: [windowSchema], default: [] }
}, { _id: false });

const exceptionSchema = new mongoose.Schema({
  date: { type: String, required: true },
  unavailable: { type: Boolean, default: true },
  windows: { type: [windowSchema], default: [] },
  note: String
}, { _id: false });

const scheduleSchema = new mongoose.Schema({
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  locationId: { type: mongoose.Schema.Types.ObjectId, required: true },
  timezone: { type: String, default: 'Asia/Kolkata' },
  slotMinutes: { type: Number, default: 30, min: 10, max: 240 },
  bufferMinutes: { type: Number, default: 0, min: 0, max: 120 },
  weekly: { type: [weeklySchema], default: [] },
  exceptions: { type: [exceptionSchema], default: [] },
  active: { type: Boolean, default: true }
}, { timestamps: true });

scheduleSchema.index({ doctor: 1, organization: 1, locationId: 1 }, { unique: true });
export default mongoose.model('DoctorSchedule', scheduleSchema);
