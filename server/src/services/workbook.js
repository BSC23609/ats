import ExcelJS from 'exceljs';
import { q } from '../db.js';
import * as graph from './graph.js';

const FILE = process.env.GRAPH_WORKBOOK_NAME || 'Bharat Steel Group - Employee Master.xlsx';

const INK = 'FF14181C';
const BLUE = 'FF0064A0';

function styleHeader(sheet) {
  const row = sheet.getRow(1);
  row.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
  row.alignment = { vertical: 'middle' };
  row.height = 22;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];      // header stays put when scrolling
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columnCount },
  };
}

/**
 * Rebuilds the whole workbook from the database each time. The dataset is small — a few
 * hundred rows — so a full rebuild is simpler and safer than trying to patch cells in place,
 * and it means the sheet can never drift out of step with the system.
 */
export async function buildWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bharat Steel Group ATS';
  wb.created = new Date();

  /* ---------- Sheet 1: Employees — the full printed form, one row each ---------- */
  const emp = wb.addWorksheet('Employees', { properties: { tabColor: { argb: BLUE } } });
  emp.columns = [
    { header: 'Employee code', key: 'emp_code', width: 16 },
    { header: 'Company', key: 'company', width: 10 },
    { header: 'Name', key: 'full_name', width: 26 },
    { header: 'Designation', key: 'designation', width: 24 },
    { header: 'Department', key: 'department', width: 16 },
    { header: 'Date of joining', key: 'doj', width: 14 },
    { header: 'Annual salary', key: 'ctc', width: 14 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Mobile', key: 'phone', width: 14 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Date of birth', key: 'dob', width: 13 },
    { header: 'Age', key: 'age', width: 6 },
    { header: 'Blood group', key: 'blood', width: 11 },
    { header: 'PAN', key: 'pan', width: 13 },
    { header: 'Aadhaar', key: 'aadhaar', width: 16 },
    { header: 'Native place', key: 'native', width: 16 },
    { header: 'Marital status', key: 'marital', width: 13 },
    { header: 'Spouse', key: 'spouse', width: 20 },
    { header: 'Children', key: 'children', width: 26 },
    { header: "Father", key: 'father', width: 22 },
    { header: 'Mother', key: 'mother', width: 22 },
    { header: 'Present address', key: 'present_address', width: 40 },
    { header: 'Permanent address', key: 'permanent_address', width: 40 },
    { header: 'Emergency contact', key: 'emergency', width: 30 },
    { header: 'Highest qualification', key: 'education', width: 30 },
    { header: 'Previous employer', key: 'prev_employer', width: 30 },
    { header: 'Reason for leaving', key: 'prev_reason', width: 26 },
    { header: 'State of health', key: 'health', width: 13 },
    { header: 'Exit date', key: 'exit_date', width: 12 },
    { header: 'Exit reason', key: 'exit_reason', width: 24 },
  ];

  const { rows: employees } = await q(
    `SELECT e.*, c.code AS company_code
       FROM employees e JOIN companies c ON c.id = e.company_id
      ORDER BY c.code, e.date_of_joining DESC NULLS LAST`
  );

  for (const e of employees) {
    const d = e.details || {};
    const lastJob = (d.employment || [])[0] || {};
    const lastEdu = (d.education || []).slice(-1)[0] || {};

    emp.addRow({
      emp_code: e.emp_code,
      company: e.company_code,
      full_name: e.full_name,
      designation: e.designation,
      department: e.department,
      doj: e.date_of_joining,
      ctc: e.annual_ctc,
      status: e.status,
      phone: e.phone,
      email: e.email,
      dob: e.date_of_birth || d.date_of_birth,
      age: d.age,
      blood: e.blood_group,
      pan: e.pan,
      aadhaar: e.aadhaar,
      native: d.native_place,
      marital: d.marital_status,
      spouse: [d.spouse_name, d.spouse_occupation].filter(Boolean).join(' — '),
      children: (d.children || []).map((c) => `${c.name}${c.dob ? ` (${c.dob})` : ''}`).join('; '),
      father: [d.father_name, d.father_occupation].filter(Boolean).join(' — '),
      mother: [d.mother_name, d.mother_occupation].filter(Boolean).join(' — '),
      present_address: d.present_address,
      permanent_address: d.permanent_address,
      emergency: e.emergency_contact,
      education: [lastEdu.exam, lastEdu.institution].filter(Boolean).join(' — '),
      prev_employer: [lastJob.employer, lastJob.designation_leaving].filter(Boolean).join(' — '),
      prev_reason: lastJob.reason_for_leaving,
      health: d.state_of_health,
      exit_date: e.exit_date,
      exit_reason: e.exit_reason,
    });
  }

  emp.getColumn('ctc').numFmt = '#,##0';
  emp.getColumn('doj').numFmt = 'dd-mmm-yyyy';
  emp.getColumn('dob').numFmt = 'dd-mmm-yyyy';
  emp.getColumn('exit_date').numFmt = 'dd-mmm-yyyy';
  styleHeader(emp);

  /* ---------- Sheet 2: Candidates — everyone in the pipeline ---------- */
  const cand = wb.addWorksheet('Candidates');
  cand.columns = [
    { header: 'Reference', key: 'ref', width: 18 },
    { header: 'Company', key: 'company', width: 10 },
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Applied for', key: 'role', width: 26 },
    { header: 'Status', key: 'status', width: 13 },
    { header: 'Match score', key: 'score', width: 11 },
    { header: 'Experience', key: 'exp', width: 10 },
    { header: 'Expected salary', key: 'expected', width: 15 },
    { header: 'Offered salary', key: 'offered', width: 14 },
    { header: 'Notice (days)', key: 'notice', width: 12 },
    { header: 'Mobile', key: 'phone', width: 14 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Area', key: 'area', width: 18 },
    { header: 'City / Town', key: 'city', width: 16 },
    { header: 'PIN code', key: 'pincode', width: 10 },
    { header: 'Applied on', key: 'applied', width: 13 },
    { header: 'Form submitted', key: 'form', width: 14 },
    { header: 'Offer sent', key: 'offer_sent', width: 13 },
    { header: 'Resume summary', key: 'headline', width: 52 },
  ];

  const { rows: apps } = await q(
    `SELECT a.*, c.code AS company_code
       FROM applications a JOIN companies c ON c.id = a.company_id
      ORDER BY a.created_at DESC`
  );

  for (const a of apps) {
    cand.addRow({
      ref: a.ref_code,
      company: a.company_code,
      name: a.full_name,
      role: a.position_applied,
      status: a.status,
      score: a.ai_summary?.score ?? null,
      exp: a.total_experience,
      expected: a.expected_ctc,
      offered: a.offered_ctc,
      notice: a.notice_period_days,
      phone: a.phone,
      email: a.email,
      area: a.area,
      city: a.city,
      pincode: a.pincode,
      applied: a.created_at,
      form: a.stage2_submitted_at ? 'Yes' : 'No',
      offer_sent: a.offer_sent_at,
      headline: a.ai_summary?.headline || '',
    });
  }

  ['expected', 'offered'].forEach((k) => (cand.getColumn(k).numFmt = '#,##0'));
  ['applied', 'offer_sent'].forEach((k) => (cand.getColumn(k).numFmt = 'dd-mmm-yyyy'));
  styleHeader(cand);

  return wb.xlsx.writeBuffer().then((b) => Buffer.from(b));
}

/**
 * Rebuild the workbook and push it to OneDrive.
 * Fire-and-forget by design: a OneDrive hiccup must never fail the request that triggered it —
 * an HR admin marking someone joined should not see an error because Microsoft was slow.
 */
export async function syncWorkbook({ throwOnError = false } = {}) {
  if (!graph.graphConfigured()) {
    if (throwOnError) throw new Error('OneDrive is not configured. Set the GRAPH_* variables.');
    return null;
  }
  try {
    const buffer = await buildWorkbook();
    const url = await graph.upload(
      FILE,
      buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    console.log(`Employee master workbook synced to OneDrive (${buffer.length} bytes)`);
    return url;
  } catch (err) {
    console.error('Workbook sync failed:', err.message);
    if (throwOnError) throw err;
    return null;
  }
}
