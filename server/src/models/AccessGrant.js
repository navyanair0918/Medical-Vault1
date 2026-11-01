import mongoose from 'mongoose';

const accessGrantSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['pending', 'active', 'revoked'], default: 'pending' },
  scopes: { type: [String], default: ['summary', 'records', 'labs', 'prescriptions'] },
  expiresAt: Date,
  requestedAt: { type: Date, default: Date.now },
  grantedAt: Date
}, { timestamps: true });

accessGrantSchema.index({ patient: 1, doctor: 1 }, { unique: true });
export default mongoose.model('AccessGrant', accessGrantSchema);
