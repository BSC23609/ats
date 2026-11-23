import { safeName } from './graph.js';

/**
 * Renders a submitted full application form as a standalone, print-ready HTML document.
 * Used to (a) attach the form to the HR email and (b) file it in OneDrive under
 * "Employee Master Data Report". Kept self-contained so HR can open it in any browser.
 */

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const val = (s) => (esc(s) || '—');

/** OneDrive key (relative to the ATS root folder) for a candidate's filed form. */
export function applicationFormKey(app) {
  return `Employee Master Data Report/${applicationFormFilename(app)}`;
}

export function applicationFormFilename(app) {
  return `${safeName(app.full_name || 'candidate')}_${safeName(app.ref_code || app.id)}.html`;
}

function kvRows(pairs) {
  return pairs.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${val(v)}</td></tr>`).join('');
}

function table(title, cols, rows) {
  if (!rows || !rows.length) return '';
  const head = cols.map((c) => `<th>${esc(c.label)}</th>`).join('');
  const body = rows
    .map((r) => `<tr>${cols.map((c) => `<td>${val(r[c.key])}</td>`).join('')}</tr>`)
    .join('');
  return `<h3>${esc(title)}</h3><table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** Normalise the education object (or legacy array) into display rows. */
function educationRows(education) {
  if (Array.isArray(education)) {
    return education.map((r) => ({
      level: r.exam, degree: '', grade: r.class_marks, institution: r.institution, from: r.from, to: r.to,
    }));
  }
  if (!education) return [];
  const e = education;
  return [
    { level: 'SSLC', grade: e.sslc?.grade, institution: e.sslc?.school, from: e.sslc?.from, to: e.sslc?.to },
    { level: e.hsc?.type ? `HSC (${e.hsc.type})` : 'HSC', grade: e.hsc?.grade, institution: e.hsc?.school, from: e.hsc?.from, to: e.hsc?.to },
    { level: e.ug?.degree ? `Undergraduate — ${e.ug.degree}` : 'Undergraduate', grade: e.ug?.grade, institution: e.ug?.college, from: e.ug?.from, to: e.ug?.to },
    { level: e.pg?.degree ? `Post Graduate — ${e.pg.degree}` : 'Post Graduate', grade: e.pg?.grade, institution: e.pg?.college, from: e.pg?.from, to: e.pg?.to },
  ].filter((r) => r.grade || r.institution || r.from || r.to);
}

export function renderApplicationFormHtml(app, details = {}) {
  const d = details || {};
  const money = (n) => (n == null || n === '' ? '—' : '₹' + Number(n).toLocaleString('en-IN'));

  return `<!doctype html><html><head><meta charset="utf-8">
  <title>Application form — ${esc(app.full_name)} (${esc(app.ref_code)})</title>
  <style>
    *{box-sizing:border-box} body{font:12px/1.5 Arial,Helvetica,sans-serif;color:#111;margin:28px;max-width:900px}
    h1{font-size:16px;text-align:center;margin:0;color:#0a2b66}
    .dept{text-align:center;margin:0 0 4px}
    .rule{border-top:2px solid #0a2b66;margin:6px 0 10px}
    .meta{text-align:center;font-size:11px;color:#555;margin:0 0 16px}
    h2{font-size:12px;color:#0a2b66;border-bottom:1px solid #d7deea;padding-bottom:3px;margin:20px 0 8px}
    h3{font-size:11px;color:#333;margin:12px 0 5px}
    table{width:100%;border-collapse:collapse;margin-bottom:8px;font-size:11px}
    table.kv th{width:200px;text-align:left;color:#555;font-weight:normal;vertical-align:top;padding:4px 10px 4px 0}
    table.kv td{padding:4px 0;vertical-align:top}
    table.grid th,table.grid td{border:1px solid #9aa4b2;padding:5px 7px;text-align:left;vertical-align:top}
    table.grid th{background:#eef2f8;color:#0a2b66}
    .decl{margin:14px 0;font-size:11px}
    @media print{body{margin:14px}}
  </style></head><body>
  <h1>BHARAT STEEL (CHENNAI) PVT. LTD.</h1>
  <p class="dept">Human Resources Department — Employee Master Data</p>
  <div class="rule"></div>
  <p class="meta">Application form · ${esc(app.ref_code)} · ${esc(app.company_name)} · submitted ${esc((d.submitted_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10))}</p>

  <h2>Personal</h2>
  <table class="kv">${kvRows([
    ['Position applied for', d.position_applied || app.position_applied],
    ['Name in full', d.full_name || app.full_name],
    ['Date of birth', `${val(d.date_of_birth)} (${val(d.age)} yrs)`],
    ['Gender', d.gender],
    ['Blood group', d.blood_group],
    ['Nationality', d.nationality],
    ['Native place', d.native_place],
    ['Physically handicapped', d.physically_handicapped],
    ['PAN number', d.pan],
    ['Aadhaar number', d.aadhaar],
    ['PF number', d.pf_number],
    ['UAN number', d.uan_number],
    ['Contact number', d.phone || app.phone],
    ['Email', d.email || app.email],
    ['Permanent address', d.permanent_address],
    ['Present address', d.present_address],
  ])}</table>

  <h2>Marital status &amp; family</h2>
  <table class="kv">${kvRows([
    ['Marital status', d.marital_status],
    ['Husband / wife', [d.spouse_name, d.spouse_occupation].filter(Boolean).join(' · ')],
    ['Father', [d.father_name, d.father_age, d.father_occupation].filter(Boolean).join(' · ')],
    ['Mother', [d.mother_name, d.mother_age, d.mother_occupation].filter(Boolean).join(' · ')],
  ])}</table>
  ${table('Children', [{ key: 'name', label: 'Name' }, { key: 'dob', label: 'Date of birth' }], d.children)}
  ${table('Siblings', [
    { key: 'relation', label: 'Sibling' }, { key: 'age', label: 'Age' }, { key: 'gender', label: 'Gender' },
    { key: 'occupation', label: 'Occupation / place' }, { key: 'marital', label: 'Marital status' },
  ], d.siblings)}
  ${table('Emergency contacts', [
    { key: 'name', label: 'Name' }, { key: 'relationship', label: 'Relationship' }, { key: 'contact', label: 'Contact' },
  ], d.emergency_contacts)}

  <h2>Education</h2>
  ${table('Qualifications', [
    { key: 'level', label: 'Level' }, { key: 'grade', label: 'Grade / %' },
    { key: 'institution', label: 'School / College' }, { key: 'from', label: 'From' }, { key: 'to', label: 'To' },
  ], educationRows(d.education)) || '<p>—</p>'}

  <h2>Previous employment</h2>
  ${table('Employers', [
    { key: 'employer', label: 'Employer' }, { key: 'designation_joining', label: 'Designation (joining)' },
    { key: 'designation_leaving', label: 'Designation (leaving)' }, { key: 'from', label: 'Joining date' },
    { key: 'to', label: 'Leaving date' }, { key: 'salary_leaving', label: 'Salary (leaving)' },
    { key: 'reason_for_leaving', label: 'Reason for leaving' },
  ], d.employment) || '<p>—</p>'}
  ${table('Reference check — previous company HR', [
    { key: 'name', label: 'Name' }, { key: 'designation', label: 'Designation' }, { key: 'contact', label: 'Contact' },
  ], d.previous_hr_contacts)}

  <h2>Joining</h2>
  <table class="kv">${kvRows([
    ['Expected salary (₹ p.a.)', d.expected_salary != null ? money(d.expected_salary) : '—'],
    ['Can join by', d.earliest_joining_date],
    ['State of health', d.state_of_health],
  ])}</table>

  <p class="decl"><b>Declaration:</b> I declare that the particulars furnished above are true to the best of my
  knowledge and belief.</p>
  <table class="kv">${kvRows([
    ['Place', d.declaration_place],
    ['Date', d.declaration_date],
    ['Signature', d.declaration_signature],
  ])}</table>
  </body></html>`;
}
