import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, date, dateTime } from '../api.jsx';

// The ten checklist items, in the order of the paper form (HR/JC/01).
const ITEMS = [
  ['Aadhaar Card submitted', 'Copy'],
  ['PAN Card submitted', 'Copy'],
  ['Bank Passbook submitted', 'Copy of first page'],
  ['Passport-size photographs', '2 Nos.'],
  ['Offer Letter issued', 'Signed copy retained'],
  ['Keka registration completed', ''],
  ['Bharat Steel App registered', ''],
  ['Added to WhatsApp group', ''],
  ['Handed over to Reporting Manager', ''],
  ['Induction completed', ''],
  ['Uniform issued', ''],
];

const today = () => new Date().toISOString().slice(0, 10);

const blankItems = () => ITEMS.map(() => ({ status: '', date: '', remarks: '', verified_by: '' }));

function blankForm(prefill = {}) {
  return {
    form_date: today(),
    employee_name: prefill.employee_name || '',
    employee_id: prefill.employee_id || '',
    designation: prefill.designation || '',
    department: prefill.department || '',
    date_of_joining: prefill.date_of_joining || '',
    work_location: prefill.work_location || '',
    reporting_manager: prefill.reporting_manager || '',
    contact_no: prefill.contact_no || '',
    items: blankItems(),
    remarks: '',
    declaration: false,
    sign: {
      employee: '', employee_date: '',
      hr_exec: '', hr_exec_date: '',
      manager: '', manager_date: '',
      hr_head: '', hr_head_date: '',
    },
  };
}

// Make sure a saved form has every field and exactly ten items, whatever was stored.
function normalise(data, prefill) {
  const base = blankForm(prefill);
  if (!data) return base;
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    ...base,
    ...data,
    items: ITEMS.map((_, i) => ({ ...base.items[i], ...(items[i] || {}) })),
    sign: { ...base.sign, ...(data.sign || {}) },
  };
}

function printChecklist(form, candidate) {
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const cell = (s) => esc(s) || '&nbsp;';
  const rows = ITEMS.map(([label, note], i) => {
    const it = form.items[i] || {};
    return `<tr>
      <td class="c">${i + 1}</td>
      <td><b>${esc(label)}</b>${note ? `<div class="n">${esc(note)}</div>` : ''}</td>
      <td class="c">${it.status === 'Yes' ? '☑ Yes&nbsp;&nbsp;☐ No' : it.status === 'No' ? '☐ Yes&nbsp;&nbsp;☑ No' : '☐ Yes&nbsp;&nbsp;☐ No'}</td>
      <td class="c">${cell(it.date)}</td>
      <td>${cell(it.remarks)}</td>
      <td>${cell(it.verified_by)}</td>
    </tr>`;
  }).join('');
  const sig = (name, who, d) => `<td><div class="sl">${cell(name)}</div><div class="sw">${who}</div><div class="n">Date: ${cell(d)}</div></td>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Joining Checklist — ${esc(form.employee_name || candidate.full_name)}</title>
  <style>
    *{box-sizing:border-box} body{font:12px/1.5 Arial,Helvetica,sans-serif;color:#111;margin:28px}
    h1{font-size:15px;text-align:center;margin:0;color:#0a2b66}
    .dept{text-align:center;margin:0 0 4px}
    .rule{border-top:2px solid #0a2b66;margin:6px 0 14px}
    .title{text-align:center;font-weight:bold;font-size:13px;margin:0 0 2px}
    .meta{text-align:right;font-size:11px;margin:0 0 12px}
    h2{font-size:12px;color:#0a2b66;margin:16px 0 6px}
    table{width:100%;border-collapse:collapse;margin-bottom:6px}
    td,th{border:1px solid #9aa4b2;padding:5px 7px;vertical-align:top;font-size:11px}
    th{background:#0a2b66;color:#fff;text-align:left}
    .d td{border:1px solid #9aa4b2}
    .c{text-align:center}
    .n{font-style:italic;color:#555;font-size:10px}
    .sl{min-height:28px;border-bottom:1px solid #111}
    .sw{font-weight:bold;text-align:center;margin-top:3px}
    .decl{margin:10px 0;font-size:11px}
    @media print{body{margin:14px}}
  </style></head><body>
  <h1>BHARAT STEEL (CHENNAI) PVT. LTD.</h1>
  <p class="dept">Human Resources Department</p>
  <div class="rule"></div>
  <p class="title">NEW EMPLOYEE JOINING CHECKLIST</p>
  <p class="meta">Form No.: HR/JC/01&nbsp;&nbsp;&nbsp;&nbsp;Date: ${cell(form.form_date)}</p>
  <h2>A. Employee Details</h2>
  <table class="d"><tbody>
    <tr><td><b>Employee Name</b></td><td>${cell(form.employee_name)}</td><td><b>Employee ID</b></td><td>${cell(form.employee_id)}</td></tr>
    <tr><td><b>Designation</b></td><td>${cell(form.designation)}</td><td><b>Department</b></td><td>${cell(form.department)}</td></tr>
    <tr><td><b>Date of Joining</b></td><td>${cell(form.date_of_joining)}</td><td><b>Work Location</b></td><td>${cell(form.work_location)}</td></tr>
    <tr><td><b>Reporting Manager</b></td><td>${cell(form.reporting_manager)}</td><td><b>Contact No.</b></td><td>${cell(form.contact_no)}</td></tr>
  </tbody></table>
  <h2>B. Joining Formalities</h2>
  <table><thead><tr><th>S.No.</th><th>Checklist Item</th><th>Status</th><th>Date</th><th>Remarks</th><th>Verified By</th></tr></thead><tbody>${rows}</tbody></table>
  <p><b>Remarks (if any):</b> ${cell(form.remarks)}</p>
  <p class="decl"><b>Declaration:</b> I confirm that the documents listed above have been submitted by me and the information provided is true and correct.${form.declaration ? ' &nbsp;[✓ Confirmed]' : ''}</p>
  <table style="margin-top:36px"><tbody><tr>
    ${sig(form.sign.employee, 'Employee', form.sign.employee_date)}
    ${sig(form.sign.hr_exec, 'HR Executive', form.sign.hr_exec_date)}
    ${sig(form.sign.manager, 'Reporting Manager', form.sign.manager_date)}
    ${sig(form.sign.hr_head, 'HR Head', form.sign.hr_head_date)}
  </tr></tbody></table>
  <script>window.onload=function(){window.print();}</script>
  </body></html>`;
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

export default function JoiningChecklist() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');            // 'draft' | 'submit'
  const [form, setForm] = useState(blankForm());
  const [meta, setMeta] = useState({ status: 'NONE', submitted_at: null, updated_at: null, updated_by_name: null });
  const [candidate, setCandidate] = useState(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await api.get(`/applications/${id}/joining-checklist`);
        if (!live) return;
        setForm(normalise(r.data, r.prefill));
        setMeta({ status: r.status, submitted_at: r.submitted_at, updated_at: r.updated_at, updated_by_name: r.updated_by_name });
        setCandidate(r.candidate);
      } catch (err) {
        if (live) setError(err.message);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setItem = (i, k, v) =>
    setForm((f) => ({ ...f, items: f.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));
  const setSign = (k, v) => setForm((f) => ({ ...f, sign: { ...f.sign, [k]: v } }));

  const saveDraft = async () => {
    setBusy('draft'); setMsg(''); setError('');
    try {
      const r = await api.put(`/applications/${id}/joining-checklist`, { data: form });
      setMeta((m) => ({ ...m, status: r.status, submitted_at: null }));
      setMsg('Draft saved. You can come back and finish this any time.');
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  };

  const submit = async () => {
    setMsg(''); setError('');
    if (!form.employee_name.trim()) { setError('Please enter the employee name before submitting.'); return; }
    if (!form.declaration) { setError('Please tick the declaration before submitting.'); return; }
    setBusy('submit');
    try {
      const r = await api.post(`/applications/${id}/joining-checklist/submit`, { data: form });
      setMeta((m) => ({ ...m, status: r.status, submitted_at: new Date().toISOString() }));
      setMsg('Checklist submitted and saved to the candidate’s record.');
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  };

  if (loading) return <div className="center">Loading…</div>;

  const statusChip =
    meta.status === 'SUBMITTED'
      ? <span className="chip JOINED">Submitted{meta.submitted_at ? ` · ${date(meta.submitted_at)}` : ''}</span>
      : meta.status === 'DRAFT'
        ? <span className="chip ON_HOLD">Draft</span>
        : <span className="chip">Not started</span>;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {candidate ? `${candidate.ref_code} · ${candidate.company_name}` : 'Onboarding'} · Form HR/JC/01
          </div>
          <h1>Employee Joining Checklist</h1>
          <div className="sub">
            {statusChip}
            {meta.updated_at && (
              <span style={{ marginLeft: 10 }}>
                Last saved {dateTime(meta.updated_at)}{meta.updated_by_name ? ` by ${meta.updated_by_name}` : ''}
              </span>
            )}
          </div>
        </div>
        <button className="ghost" onClick={() => navigate(`/applications/${id}`)}>← Back to candidate</button>
      </div>

      {msg && <div className="success" style={{ marginBottom: 16 }}>{msg}</div>}
      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

      {meta.status === 'SUBMITTED' && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-body sub" style={{ margin: 0 }}>
            This checklist is submitted. You can still edit it and press <b>Save draft</b> to reopen it, or
            <b> Submit</b> again to re-finalise.
          </div>
        </div>
      )}

      {/* A. Employee details */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h2>A. Employee details</h2></div>
        <div className="panel-body">
          <div className="grid cols-2">
            <div className="field">
              <label htmlFor="jc_name">Employee name</label>
              <input id="jc_name" value={form.employee_name} onChange={(e) => set('employee_name', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="jc_empid">Employee ID</label>
              <input id="jc_empid" value={form.employee_id} onChange={(e) => set('employee_id', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="jc_desig">Designation</label>
              <input id="jc_desig" value={form.designation} onChange={(e) => set('designation', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="jc_dept">Department</label>
              <input id="jc_dept" value={form.department} onChange={(e) => set('department', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="jc_doj">Date of joining</label>
              <input id="jc_doj" type="date" value={form.date_of_joining} onChange={(e) => set('date_of_joining', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="jc_loc">Work location</label>
              <input id="jc_loc" value={form.work_location} onChange={(e) => set('work_location', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="jc_mgr">Reporting manager</label>
              <input id="jc_mgr" value={form.reporting_manager} onChange={(e) => set('reporting_manager', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="jc_contact">Contact no.</label>
              <input id="jc_contact" value={form.contact_no} onChange={(e) => set('contact_no', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="jc_fdate">Form date</label>
              <input id="jc_fdate" type="date" value={form.form_date} onChange={(e) => set('form_date', e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* B. Joining formalities */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h2>B. Joining formalities</h2></div>
        <div className="panel-body">
          <div style={{ overflowX: 'auto' }}>
            <table className="jc-table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>#</th>
                  <th style={{ minWidth: 220 }}>Checklist item</th>
                  <th style={{ width: 110 }}>Status</th>
                  <th style={{ width: 150 }}>Date</th>
                  <th style={{ minWidth: 160 }}>Remarks</th>
                  <th style={{ minWidth: 140 }}>Verified by</th>
                </tr>
              </thead>
              <tbody>
                {ITEMS.map(([label, note], i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>
                      <b>{label}</b>
                      {note && <div className="sub">{note}</div>}
                    </td>
                    <td>
                      <select value={form.items[i].status} onChange={(e) => setItem(i, 'status', e.target.value)}>
                        <option value="">—</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    </td>
                    <td><input type="date" value={form.items[i].date} onChange={(e) => setItem(i, 'date', e.target.value)} /></td>
                    <td><input value={form.items[i].remarks} onChange={(e) => setItem(i, 'remarks', e.target.value)} /></td>
                    <td><input value={form.items[i].verified_by} onChange={(e) => setItem(i, 'verified_by', e.target.value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Remarks + declaration */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-body">
          <div className="field">
            <label htmlFor="jc_remarks">Remarks (if any)</label>
            <textarea id="jc_remarks" rows={2} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
          </div>
          <label className="check" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 6 }}>
            <input type="checkbox" checked={form.declaration} onChange={(e) => set('declaration', e.target.checked)} />
            <span>I confirm that the documents listed above have been submitted and the information provided is true and correct.</span>
          </label>
        </div>
      </div>

      {/* Signatures */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h2>Sign-off</h2></div>
        <div className="panel-body">
          <div className="grid cols-2">
            {[
              ['employee', 'Employee'],
              ['hr_exec', 'HR Executive'],
              ['manager', 'Reporting Manager'],
              ['hr_head', 'HR Head'],
            ].map(([key, who]) => (
              <div className="field" key={key}>
                <label>{who}</label>
                <input placeholder="Name" value={form.sign[key]} onChange={(e) => setSign(key, e.target.value)} />
                <input type="date" style={{ marginTop: 6 }} value={form.sign[`${key}_date`]} onChange={(e) => setSign(`${key}_date`, e.target.value)} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 32 }}>
        <button className="ghost" onClick={saveDraft} disabled={busy !== ''}>
          {busy === 'draft' ? 'Saving…' : 'Save draft'}
        </button>
        <button className="signal" onClick={submit} disabled={busy !== ''}>
          {busy === 'submit' ? 'Submitting…' : 'Final submit'}
        </button>
        <button className="ghost" onClick={() => printChecklist(form, candidate || {})} disabled={busy !== ''}>
          Print / Save as PDF
        </button>
      </div>
    </>
  );
}
