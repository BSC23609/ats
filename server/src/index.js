import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import applicationRoutes from './routes/applications.js';
import { employees, jobs, users } from './routes/admin.js';
import { describeStorage } from './services/storage.js';

dotenv.config();

const app = express();
app.set('trust proxy', 1); // Render and Vercel both sit behind a proxy

// In production the frontend lives on another origin (Vercel), so it must be named explicitly.
// WEB_ORIGINS is a comma-separated list. Left unset, any origin is allowed — fine for local work.
const origins = (process.env.WEB_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : true }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, ai: Boolean(process.env.ANTHROPIC_API_KEY), storage: describeStorage() })
);
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/employees', employees);
app.use('/api/jobs', jobs);
app.use('/api/users', users);

// Multer and unexpected failures land here, so the UI always gets a readable message.
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 400 : 500);
  res.status(status).json({ error: err.message || 'Something went wrong on the server.' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`ATS API on http://localhost:${port}`));
