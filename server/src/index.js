import 'express-async-errors'; // must come before the routes are imported
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import applicationRoutes from './routes/applications.js';
import { employees, jobs, users } from './routes/admin.js';
import { describeStorage } from './services/storage.js';
import { isInitialised, initDb } from './init-db.js';
import { q } from './db.js';

dotenv.config();

const app = express();
app.set('trust proxy', 1); // Render and Vercel both sit behind a proxy

// In production the frontend lives on another origin (Vercel), so it must be named explicitly.
// WEB_ORIGINS is a comma-separated list. Left unset, any origin is allowed — fine for local work.
const origins = (process.env.WEB_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : true }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', async (_req, res) => {
  const health = {
    ok: true,
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
    storage: describeStorage(),
    database: 'unknown',
    users: null,
  };
  // A health check that does not touch the database is not a health check.
  try {
    const { rows } = await q('SELECT count(*)::int AS n FROM users');
    health.database = 'connected';
    health.users = rows[0].n;
    if (rows[0].n === 0) health.ok = false;
  } catch (err) {
    health.ok = false;
    health.database = err.code === '42P01' ? 'connected, but no tables' : `unreachable — ${err.message}`;
  }
  res.status(health.ok ? 200 : 503).json(health);
});
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/employees', employees);
app.use('/api/jobs', jobs);
app.use('/api/users', users);

// Every failure lands here — including rejected promises, thanks to express-async-errors —
// so the browser always gets a readable reason instead of a blank 500.
app.use((err, req, res, _next) => {
  console.error(`✗ ${req.method} ${req.path} —`, err.message);

  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 400 : 500);

  // Postgres speaks in codes. Translate the ones that actually happen in practice.
  let message = err.message || 'Something went wrong on the server.';
  if (err.code === '42P01')
    message = 'The database has no tables yet. Restart the API — it creates them on an empty database.';
  else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND')
    message = 'The API cannot reach the database. Check DATABASE_URL.';
  else if (err.code === '28P01')
    message = 'The database rejected the API password. Check DATABASE_URL.';

  res.status(status).json({ error: message });
});

/**
 * On a fresh database, create the tables and seed the companies and logins automatically.
 * This is what lets the whole thing be deployed from a web dashboard with no terminal.
 *
 * It only ever fires when the database is EMPTY — `isInitialised()` checks for the companies
 * table first. It will never wipe a database that already has candidates in it.
 */
async function bootstrap() {
  try {
    if (await isInitialised()) {
      console.log('Database ready.');
      return;
    }
    console.log('Empty database — creating tables and seed data…');
    const { password } = await initDb();
    console.log('');
    console.log('  ┌──────────────────────────────────────────────────────┐');
    console.log('  │  Set up. Sign in with:                               │');
    console.log('  │    superadmin@bharatsteels.in                        │');
    console.log(`  │    ${String(password).padEnd(50)}│`);
    console.log('  │                                                      │');
    console.log('  │  CHANGE THIS PASSWORD IMMEDIATELY.                   │');
    console.log('  └──────────────────────────────────────────────────────┘');
    console.log('');
  } catch (err) {
    console.error('Could not reach the database:', err.message);
    console.error('Check DATABASE_URL. The API will start, but nothing will work until this is fixed.');
  }
}

const port = process.env.PORT || 4000;
app.listen(port, async () => {
  console.log(`ATS API listening on ${port}`);
  await bootstrap();
});
