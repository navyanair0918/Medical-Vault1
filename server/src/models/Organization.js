import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: String,
  timezone: { type: String, default: 'Asia/Kolkata' },
  address: {
    line1: String,
    line2: String,
    city: String,
    state: String,
    country: { type: String, default: 'India' },
    postalCode: String
  },
  active: { type: Boolean, default: true }
}, { _id: true });

const organizationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, index: true },
  type: { type: String, enum: ['hospital', 'clinic', 'private_practice', 'diagnostic_center', 'telehealth'], required: true },
  email: String,
  phone: String,
  website: String,
  active: { type: Boolean, default: true, index: true },
  locations: { type: [locationSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

organizationSchema.index({ name: 'text', type: 1 });
export default mongoose.model('Organization', organizationSchema);
