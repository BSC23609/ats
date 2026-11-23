import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { safeName } from './graph.js';

/**
 * Renders a submitted full application form as a professional, branded PDF (Bharat Steel Group
 * logo + name). Used to attach the form to the HR email and file it in OneDrive under
 * "Employee Master Data Report".
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let LOGO = null;
try { LOGO = fs.readFileSync(path.join(__dirname, '../assets/bsc-logo.png')); }
catch { /* logo optional — the PDF still renders without it */ }

const NAVY = '#0A2B66';
const INK = '#1f2430';
const MUTED = '#6b7280';
const LINE = '#cbd5e1';
const HEAD_BG = '#eef2f8';

export function applicationFormFilename(app) {
  return `${safeName(app.full_name || 'candidate')}_${safeName(app.ref_code || app.id)}.pdf`;
}

/** OneDrive key (relative to the ATS root folder) for a candidate's filed form. */
export function applicationFormKey(app) {
  return `Employee Master Data Report/${applicationFormFilename(app)}`;
}

const txt = (s) => (s == null || s === '' ? '—' : String(s));

function educationRows(education) {
  if (Array.isArray(education)) {
    return education.map((r) => ({ level: r.exam, grade: r.class_marks, institution: r.institution, from: r.from, to: r.to }));
  }
  if (!education) return [];
  const e = education;
  return [
    { level: 'SSLC', grade: e.sslc?.grade, institution: e.sslc?.school, from: e.sslc?.from, to: e.sslc?.to },
    { level: e.hsc?.type ? `HSC (${e.hsc.type})` : 'HSC', grade: e.hsc?.grade, institution: e.hsc?.school, from: e.hsc?.from, to: e.hsc?.to },
    { level: e.ug?.degree ? `UG — ${e.ug.degree}` : 'Undergraduate', grade: e.ug?.grade, institution: e.ug?.college, from: e.ug?.from, to: e.ug?.to },
    { level: e.pg?.degree ? `PG — ${e.pg.degree}` : 'Post Graduate', grade: e.pg?.grade, institution: e.pg?.college, from: e.pg?.from, to: e.pg?.to },
  ].filter((r) => r.grade || r.institution || r.from || r.to);
}

/** @returns {Promise<Buffer>} */
export function renderApplicationFormPdf(app, d = {}) {
  return new Promise((resolve, reject) => {
    const M = { left: 48, right: 48, top: 46, bottom: 54 };
    const doc = new PDFDocument({ size: 'A4', margins: M, bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;
    const contentW = W - M.left - M.right;
    const money = (n) => (n == null || n === '' ? '—' : 'Rs. ' + Number(n).toLocaleString('en-IN'));

    const ensure = (h) => { if (doc.y + h > doc.page.height - M.bottom) doc.addPage(); };

    const heading = (t) => {
      ensure(30);
      doc.moveDown(0.5);
      const y = doc.y;
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10.5).text(t.toUpperCase(), M.left, y);
      const ry = doc.y + 2;
      doc.moveTo(M.left, ry).lineTo(W - M.right, ry).lineWidth(0.8).strokeColor('#d7deea').stroke();
      doc.moveDown(0.45);
    };

    const kv = (pairs) => {
      const labelW = 150;
      doc.fontSize(9.5);
      for (const [label, value] of pairs) {
        const v = txt(value);
        const vH = doc.font('Helvetica').heightOfString(v, { width: contentW - labelW - 10 });
        const rowH = Math.max(13, vH);
        ensure(rowH + 3);
        const y = doc.y;
        doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(label, M.left, y, { width: labelW });
        doc.fillColor(INK).font('Helvetica').fontSize(9.5).text(v, M.left + labelW + 10, y, { width: contentW - labelW - 10 });
        doc.y = y + rowH + 3;
      }
    };

    const table = (cols, rows) => {
      if (!rows || !rows.length) {
        ensure(16);
        doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text('None provided.', M.left, doc.y);
        doc.moveDown(0.3);
        return;
      }
      const totalW = cols.reduce((s, c) => s + c.w, 0);
      const scale = contentW / totalW;
      cols.forEach((c) => (c.cw = c.w * scale));
      const pad = 5;

      const drawHeader = () => {
        const y = doc.y;
        const hH = 17;
        doc.rect(M.left, y, contentW, hH).fill(HEAD_BG);
        doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8.5);
        let x = M.left;
        cols.forEach((c) => { doc.text(c.label, x + pad, y + 5, { width: c.cw - 2 * pad }); x += c.cw; });
        doc.rect(M.left, y, contentW, hH).lineWidth(0.5).strokeColor(LINE).stroke();
        doc.y = y + hH;
      };

      ensure(40);
      drawHeader();
      for (const r of rows) {
        doc.font('Helvetica').fontSize(8.5);
        let maxH = 11;
        cols.forEach((c) => { const h = doc.heightOfString(txt(r[c.key]), { width: c.cw - 2 * pad }); if (h > maxH) maxH = h; });
        const rowH = maxH + 8;
        if (doc.y + rowH > doc.page.height - M.bottom) { doc.addPage(); drawHeader(); }
        const y = doc.y;
        let x = M.left;
        cols.forEach((c) => {
          doc.fillColor(INK).font('Helvetica').fontSize(8.5).text(txt(r[c.key]), x + pad, y + 4, { width: c.cw - 2 * pad });
          doc.rect(x, y, c.cw, rowH).lineWidth(0.5).strokeColor(LINE).stroke();
          x += c.cw;
        });
        doc.y = y + rowH;
      }
      doc.moveDown(0.4);
    };

    // ---- Header band: company logo (centred) + title ----
    const logoW = 86;
    if (LOGO) {
      try { doc.image(LOGO, (W - logoW) / 2, M.top, { width: logoW }); } catch { /* ignore */ }
      doc.y = M.top + logoW + 4;
    } else {
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(14).text('BHARAT STEEL (CHENNAI) PVT. LTD.', M.left, M.top + 12, { width: contentW, align: 'center' });
      doc.y = M.top + 40;
    }
    doc.x = M.left;
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('HUMAN RESOURCES  ·  EMPLOYEE MASTER DATA', M.left, doc.y, { width: contentW, align: 'center' });
    doc.moveDown(0.4);
    doc.moveTo(M.left, doc.y).lineTo(W - M.right, doc.y).lineWidth(1.4).strokeColor(NAVY).stroke();
    doc.moveDown(0.7);

    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(15).text('Employee Joining Application Form', { align: 'center' });
    doc.moveDown(0.15);
    const submitted = (d.submitted_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    doc.fillColor(MUTED).font('Helvetica').fontSize(9)
      .text(`${txt(app.full_name)}  ·  ${txt(app.ref_code)}  ·  ${txt(app.company_name)}  ·  Submitted ${submitted}`, { align: 'center' });

    // ---- Sections ----
    heading('Personal');
    kv([
      ['Position applied for', d.position_applied || app.position_applied],
      ['Name in full', d.full_name || app.full_name],
      ['Date of birth', `${txt(d.date_of_birth)}  (${txt(d.age)} yrs)`],
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
    ]);

    heading('Marital status & family');
    kv([
      ['Marital status', d.marital_status],
      ['Husband / wife', [d.spouse_name, d.spouse_occupation].filter(Boolean).join('  ·  ')],
      ['Father', [d.father_name, d.father_age, d.father_occupation].filter(Boolean).join('  ·  ')],
      ['Mother', [d.mother_name, d.mother_age, d.mother_occupation].filter(Boolean).join('  ·  ')],
    ]);
    if (d.children?.length) {
      heading('Children');
      table([{ key: 'name', label: 'Name', w: 3 }, { key: 'dob', label: 'Date of birth', w: 2 }], d.children);
    }
    heading('Siblings');
    table(
      [{ key: 'relation', label: 'Sibling', w: 3 }, { key: 'age', label: 'Age', w: 1 }, { key: 'gender', label: 'Gender', w: 2 },
       { key: 'occupation', label: 'Occupation / place', w: 4 }, { key: 'marital', label: 'Marital status', w: 2 }],
      d.siblings
    );
    heading('Emergency contacts');
    table(
      [{ key: 'name', label: 'Name', w: 4 }, { key: 'relationship', label: 'Relationship', w: 3 }, { key: 'contact', label: 'Contact', w: 3 }],
      d.emergency_contacts
    );

    heading('Education');
    table(
      [{ key: 'level', label: 'Level', w: 3 }, { key: 'grade', label: 'Grade / %', w: 2 },
       { key: 'institution', label: 'School / College', w: 4 }, { key: 'from', label: 'From', w: 1.5 }, { key: 'to', label: 'To', w: 1.5 }],
      educationRows(d.education)
    );

    heading('Previous employment');
    table(
      [{ key: 'employer', label: 'Employer', w: 4 }, { key: 'designation_leaving', label: 'Designation (leaving)', w: 3 },
       { key: 'from', label: 'Joining', w: 2 }, { key: 'to', label: 'Leaving', w: 2 }, { key: 'reason_for_leaving', label: 'Reason', w: 3 }],
      d.employment
    );
    if (d.previous_hr_contacts?.length) {
      heading('Reference check — previous company HR');
      table(
        [{ key: 'name', label: 'Name', w: 4 }, { key: 'designation', label: 'Designation', w: 3 }, { key: 'contact', label: 'Contact', w: 3 }],
        d.previous_hr_contacts
      );
    }

    heading('Joining');
    kv([
      ['Expected salary (p.a.)', d.expected_salary != null ? money(d.expected_salary) : '—'],
      ['Can join by', d.earliest_joining_date],
      ['State of health', d.state_of_health],
    ]);

    heading('Declaration');
    ensure(24);
    doc.fillColor(INK).font('Helvetica').fontSize(9.5)
      .text('I declare that the particulars furnished above are true to the best of my knowledge and belief.', M.left, doc.y, { width: contentW });
    doc.moveDown(0.3);
    kv([
      ['Place', d.declaration_place],
      ['Date', d.declaration_date],
      ['Signature', d.declaration_signature],
    ]);

    // ---- Footer on every page ----
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const fy = doc.page.height - 38;
      doc.fillColor(MUTED).font('Helvetica').fontSize(7.5)
        .text('The Bharat Steel Group — Confidential', M.left, fy, { width: contentW, align: 'left' });
      doc.fillColor(MUTED).font('Helvetica').fontSize(7.5)
        .text(`Page ${i - range.start + 1} of ${range.count}`, M.left, fy, { width: contentW, align: 'right' });
    }

    doc.end();
  });
}
