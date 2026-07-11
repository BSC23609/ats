import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { pool, q } from './db.js';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COMPANIES = [
  ['BSC', 'Bharat Steel Chennai Pvt. Ltd.', '#2563A8', 'Chennai, Tamil Nadu', 'bharatsteels.in'],
  ['METFRAA', 'Metfraa Steel Buildings Pvt. Ltd.', '#E2600B', 'Chennai, Tamil Nadu', 'metfraa.com'],
  ['CRAYON', 'Crayon Roofings & Structures', '#0F8A78', 'Chennai, Tamil Nadu', 'crayonroofings.com'],
  ['G2', 'G2 (Group Services)', '#6B4EA8', 'Chennai, Tamil Nadu', null],
];

const run = async () => {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await q(sql);
  console.log('schema created');

  for (const [code, name, colour, address, website] of COMPANIES) {
    await q('INSERT INTO companies (code, name, colour, address, website) VALUES ($1,$2,$3,$4,$5)',
      [code, name, colour, address, website]);
  }

  const password = process.env.SEED_PASSWORD || 'Bharat@2026';
  const hash = await bcrypt.hash(password, 10);

  await q(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ('Group Super Admin', 'superadmin@bharatsteels.in', $1, 'SUPER_ADMIN')`,
    [hash]
  );

  // One HR admin per company to start with. Any of them can be given more companies later,
  // and one admin can hold all four — the super admin decides on the HR admins page.
  for (const [code] of COMPANIES) {
    const { rows } = await q(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'HR_ADMIN') RETURNING id`,
      [`${code} HR Admin`, `hr.${code.toLowerCase()}@bharatsteels.in`, hash]
    );
    await q(
      `INSERT INTO user_companies (user_id, company_id)
       VALUES ($1, (SELECT id FROM companies WHERE code = $2))`,
      [rows[0].id, code]
    );
  }

  await q(`INSERT INTO jobs (company_id, title, department, location, min_experience, description)
    VALUES
      ((SELECT id FROM companies WHERE code='METFRAA'), 'Design Engineer - PEB', 'Design', 'Chennai', 2, 'STAAD.Pro portal frame design, IS 800 / IS 875 compliance.'),
      ((SELECT id FROM companies WHERE code='METFRAA'), 'Site Engineer', 'Projects', 'Tamil Nadu', 3, 'PEB erection supervision at customer sites.'),
      ((SELECT id FROM companies WHERE code='BSC'), 'Sales Executive - Steel', 'Sales', 'Chennai', 1, 'TMT and structural steel dealer sales.'),
      ((SELECT id FROM companies WHERE code='CRAYON'), 'Stores Executive', 'Stores', 'Chennai', 2, 'Roofing sheet and accessories inventory control.')`);

  console.log(`\nSeeded. Every user password: ${password}`);
  console.log('  superadmin@bharatsteels.in       (SUPER_ADMIN — all companies)');
  COMPANIES.forEach(([c]) => console.log(`  hr.${c.toLowerCase()}@bharatsteels.in`.padEnd(35) + `(HR_ADMIN — ${c})`));
  await pool.end();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
