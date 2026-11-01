import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDB } from './config/db.js';
import User from './models/User.js';
import AccessGrant from './models/AccessGrant.js';
import LabReport from './models/LabReport.js';
import HealthReport from './models/HealthReport.js';
import Prescription from './models/Prescription.js';
import Appointment from './models/Appointment.js';
import Organization from './models/Organization.js';
import DoctorMembership from './models/DoctorMembership.js';
import DoctorSchedule from './models/DoctorSchedule.js';

await connectDB();
const passwordHash = await bcrypt.hash('Demo@123', 12);

const patient = await User.findOneAndUpdate(
  { email: 'patient@demo.com' },
  { name: 'Aarav Sharma', email: 'patient@demo.com', role: 'patient', passwordHash, active: true, patientProfile: { heightCm: 172, weightKg: 74, bloodGroup: 'B+', allergies: ['Penicillin'], conditions: ['Hypertension'], emergencyAccessEnabled: true } },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);
const doctor = await User.findOneAndUpdate(
  { email: 'doctor@demo.com' },
  { name: 'Dr. Meera Joshi', email: 'doctor@demo.com', role: 'doctor', passwordHash, active: true, verifiedDoctor: true, doctorProfile: { licenseNumber: 'DEMO-MCI-1001', speciality: 'Internal Medicine', registrationAuthority: 'Demo Medical Council', yearsExperience: 11, languages: ['English', 'Hindi', 'Marathi'] } },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);
const admin = await User.findOneAndUpdate(
  { email: 'admin@demo.com' },
  { name: 'MedVault Super Admin', email: 'admin@demo.com', role: 'admin', passwordHash, active: true, adminProfile: { permissions: ['user_admin', 'provider_admin', 'appointment_admin', 'compliance_read', 'clinical_data_read'] } },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);

let organization = await Organization.findOne({ name: 'MedVault Demo Hospital' });
if (!organization) {
  organization = await Organization.create({
    name: 'MedVault Demo Hospital', type: 'hospital', email: 'care@medvault.demo', phone: '+91-00000-00000', createdBy: admin._id,
    locations: [
      { name: 'Central OPD', timezone: 'Asia/Kolkata', address: { line1: '100 Demo Road', city: 'Mumbai', state: 'Maharashtra', country: 'India', postalCode: '400001' } },
      { name: 'North Clinic', timezone: 'Asia/Kolkata', address: { line1: '25 Health Avenue', city: 'Thane', state: 'Maharashtra', country: 'India', postalCode: '400601' } }
    ]
  });
}
const locationId = organization.locations[0]._id;

const membership = await DoctorMembership.findOneAndUpdate(
  { doctor: doctor._id, organization: organization._id },
  {
    doctor: doctor._id, organization: organization._id, locationIds: organization.locations.map(l => l._id), title: 'Consultant Physician',
    specialties: ['Internal Medicine', 'Preventive Care'], acceptingAppointments: true, status: 'active',
    services: [
      { name: 'General consultation', durationMinutes: 30, fee: 800, currency: 'INR', modes: ['in_person', 'video'] },
      { name: 'Report review', durationMinutes: 20, fee: 500, currency: 'INR', modes: ['video', 'in_person'] }
    ]
  },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);

await DoctorSchedule.findOneAndUpdate(
  { doctor: doctor._id, organization: organization._id, locationId },
  {
    doctor: doctor._id, organization: organization._id, locationId, timezone: 'Asia/Kolkata', slotMinutes: 30, bufferMinutes: 0, active: true,
    weekly: [1, 2, 3, 4, 5, 6].map(weekday => ({ weekday, windows: [{ start: '09:00', end: '13:00', modes: ['in_person', 'video'] }, { start: '15:00', end: '18:00', modes: ['in_person', 'video'] }] })),
    exceptions: []
  },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);

await AccessGrant.findOneAndUpdate({ patient: patient._id, doctor: doctor._id }, { status: 'active', grantedAt: new Date(), expiresAt: new Date(Date.now() + 7 * 86400000) }, { upsert: true });
await LabReport.deleteMany({ patient: patient._id });
await LabReport.insertMany([
  { patient: patient._id, reportDate: '2026-01-10', labName: 'Demo Lab', analytes: [
    { name: 'Hemoglobin', value: 13.9, unit: 'g/dL', referenceMin: 13, referenceMax: 17 },
    { name: 'HbA1c', value: 5.6, unit: '%', referenceMin: 4, referenceMax: 5.6 },
    { name: 'LDL Cholesterol', value: 136, unit: 'mg/dL', referenceMin: 0, referenceMax: 100 }
  ]},
  { patient: patient._id, reportDate: '2026-05-12', labName: 'Demo Lab', analytes: [
    { name: 'Hemoglobin', value: 13.6, unit: 'g/dL', referenceMin: 13, referenceMax: 17 },
    { name: 'HbA1c', value: 5.9, unit: '%', referenceMin: 4, referenceMax: 5.6 },
    { name: 'LDL Cholesterol', value: 121, unit: 'mg/dL', referenceMin: 0, referenceMax: 100 }
  ]},
  { patient: patient._id, reportDate: '2026-09-18', labName: 'Demo Lab', analytes: [
    { name: 'Hemoglobin', value: 13.3, unit: 'g/dL', referenceMin: 13, referenceMax: 17 },
    { name: 'HbA1c', value: 6.1, unit: '%', referenceMin: 4, referenceMax: 5.6 },
    { name: 'LDL Cholesterol', value: 105, unit: 'mg/dL', referenceMin: 0, referenceMax: 100 }
  ]}
]);

await HealthReport.deleteMany({ patient: patient._id });
await HealthReport.insertMany([
  { patient: patient._id, createdBy: patient._id, reportType: 'blood', title: 'Comprehensive blood panel - January', providerName: 'Demo Lab', reportDate: '2026-01-10', extraction: { status: 'structured_import', method: 'seed' }, metrics: [
    { name: 'Hemoglobin', value: 13.9, unit: 'g/dL', referenceMin: 13, referenceMax: 17, group: 'CBC', status: 'within_range' },
    { name: 'HbA1c', value: 5.6, unit: '%', referenceMin: 4, referenceMax: 5.6, group: 'Diabetes', status: 'within_range' },
    { name: 'LDL Cholesterol', value: 136, unit: 'mg/dL', referenceMin: 0, referenceMax: 100, group: 'Lipids', status: 'high' }
  ]},
  { patient: patient._id, createdBy: patient._id, reportType: 'blood', title: 'Comprehensive blood panel - September', providerName: 'Demo Lab', reportDate: '2026-09-18', extraction: { status: 'structured_import', method: 'seed' }, metrics: [
    { name: 'Hemoglobin', value: 13.3, unit: 'g/dL', referenceMin: 13, referenceMax: 17, group: 'CBC', status: 'within_range' },
    { name: 'HbA1c', value: 6.1, unit: '%', referenceMin: 4, referenceMax: 5.6, group: 'Diabetes', status: 'high' },
    { name: 'LDL Cholesterol', value: 105, unit: 'mg/dL', referenceMin: 0, referenceMax: 100, group: 'Lipids', status: 'high' }
  ]},
  { patient: patient._id, createdBy: patient._id, reportType: 'vitals', title: 'Annual wellness vitals', providerName: 'MedVault Demo Hospital', reportDate: '2026-07-02', extraction: { status: 'manual', method: 'seed' }, metrics: [
    { name: 'Systolic BP', value: 132, unit: 'mmHg', group: 'Vitals', status: 'unknown' },
    { name: 'Diastolic BP', value: 84, unit: 'mmHg', group: 'Vitals', status: 'unknown' },
    { name: 'Resting Heart Rate', value: 74, unit: 'bpm', group: 'Vitals', status: 'unknown' }
  ]},
  { patient: patient._id, createdBy: patient._id, reportType: 'echo', title: '2D Echocardiogram', providerName: 'MedVault Demo Hospital', reportDate: '2026-08-15', extraction: { status: 'manual', method: 'seed' }, metrics: [
    { name: 'LVEF', value: 60, unit: '%', referenceMin: 50, referenceMax: 70, group: 'Cardiac', status: 'within_range' }
  ], findings: [{ label: 'Valve assessment', value: 'No significant valvular abnormality documented in demo report', severity: 'info' }], impression: 'Demo structured echo summary for UI demonstration only.' },
  { patient: patient._id, createdBy: patient._id, reportType: 'radiology', title: 'Chest X-ray', providerName: 'MedVault Demo Hospital', reportDate: '2026-09-01', extraction: { status: 'manual', method: 'seed' }, findings: [{ label: 'Demo finding', value: 'No acute finding entered in this fictional sample.', severity: 'info' }], impression: 'Fictional demo radiology impression; not a clinical result.' }
]);

await Prescription.deleteMany({ patient: patient._id });
await Prescription.create({ patient: patient._id, doctor: doctor._id, diagnosis: 'Demo follow-up', medications: [{ name: 'Example medicine', dosage: '10 mg', frequency: 'Once daily', duration: '7 days', instructions: 'Demo data only' }], advice: 'This seeded prescription is fictional demo content.' });
await Appointment.deleteMany({ patient: patient._id });

const future = new Date(Date.now() + 2 * 86400000);
future.setHours(10, 0, 0, 0);
await Appointment.create({
  patient: patient._id, doctor: doctor._id, organization: organization._id, locationId,
  serviceId: membership.services[0]._id, serviceName: membership.services[0].name,
  startsAt: future, endsAt: new Date(future.getTime() + 30 * 60000), durationMinutes: 30, timezone: 'Asia/Kolkata',
  reason: 'Routine review', mode: 'video', status: 'confirmed', meetingLink: 'https://example.com/demo-meeting', slotKey: `${doctor._id}:${future.toISOString()}`, occupiedSlotKeys: Array.from({ length: 6 }, (_, i) => `${doctor._id}:${new Date(future.getTime() + i * 5 * 60000).toISOString()}`)
});

console.log('Seed complete');
console.log('Patient: patient@demo.com / Demo@123');
console.log('Doctor: doctor@demo.com / Demo@123');
console.log('Admin: admin@demo.com / Demo@123');
process.exit(0);
