import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import accessRoutes from './routes/access.routes.js';
import recordsRoutes from './routes/records.routes.js';
import prescriptionsRoutes from './routes/prescriptions.routes.js';
import appointmentsRoutes from './routes/appointments.routes.js';
import wellnessRoutes from './routes/wellness.routes.js';
import labsRoutes from './routes/labs.routes.js';
import qrRoutes from './routes/qr.routes.js';
import adminRoutes from './routes/admin.routes.js';
import healthReportsRoutes from './routes/health-reports.routes.js';
import { notFound, errorHandler } from './middleware/error.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_, res) => res.json({ ok: true, service: 'medical-vault-api', time: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/access', accessRoutes);
app.use('/api/records', recordsRoutes);
app.use('/api/prescriptions', prescriptionsRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/wellness', wellnessRoutes);
app.use('/api/labs', labsRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/health-reports', healthReportsRoutes);
app.use(notFound);
app.use(errorHandler);

const port = process.env.PORT || 5000;
connectDB().then(() => app.listen(port, () => console.log(`Medical Vault API running on http://localhost:${port}`))).catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
