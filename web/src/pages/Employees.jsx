import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useAuth, money, date } from '../api.jsx';

export default function Employees() {
  const { user } = useAuth();
  const companies = user.companies || [];
  const multi = companies.length > 1;
  const [company, setCompany] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (company) qs.set('company', company);
    if (status) qs.set('status', status);
    if (search) qs.set('q', search);
    api.get(`/employees?${qs}`).then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, [company, status, search]);

  const exit = async (emp) => {
    const exit_date = prompt('Last working day (YYYY-MM-DD)');
    if (!exit_date) return;
    const exit_reason = prompt('Reason for leaving') || '';
    await api.patch(`/employees/${emp.id}`, { status: 'EXITED', exit_date, exit_reason });
    setOpen(null);
    load();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">People</div>
          <h1>Employees</h1>
          <div className="sub">Built automatically when a candidate is marked joined.</div>
        </div>
        <div className="row">
          {multi && (
            <select value={company} onChange={(e) => setCompany(e.target.value)} style={{ width: 190 }}>
              <option value="">All {companies.length} companies</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
            </select>
          )}
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 140 }}>
            <option value="">All</option>
            <option value="ACTIVE">Active</option>
            <option value="NOTICE">On notice</option>
            <option value="EXITED">Exited</option>
          </select>
          <input placeholder="Search name, code, role…" value={search}
                 onChange={(e) => setSearch(e.target.value)} style={{ width: 220 }} />
        </div>
      </div>

      <div className="panel">
        {loading ? <div className="empty">Loading…</div>
          : !rows.length ? (
            <div className="empty">
              <h3>No employees on file</h3>
              <p>Move a candidate to <strong>Joined</strong> in the pipeline and their record appears here.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Employee</th><th>Designation</th><th>Department</th>
                  <th>Joined</th><th>Annual salary</th><th>Blood group</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} onClick={() => api.get(`/employees/${e.id}`).then(setOpen)}>
                    <td className="co" style={{ borderLeftColor: e.colour }}>
                      <div className="name">{e.full_name}</div>
                      <div className="ref">{e.emp_code} · {e.company_code}</div>
                    </td>
                    <td>{e.designation || '—'}</td>
                    <td>{e.department || '—'}</td>
                    <td>{date(e.date_of_joining)}</td>
                    <td>{money(e.annual_ctc)}</td>
                    <td className="ref">{e.blood_group || '—'}</td>
                    <td><span className={`chip ${e.status === 'ACTIVE' ? 'JOINED' : e.status === 'EXITED' ? 'REJECTED' : 'ON_HOLD'}`}>
                      {e.status}
                    </span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {open && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head">
            <h2>{open.full_name} — {open.emp_code}</h2>
            <div className="row">
              {open.application_id && <Link to={`/applications/${open.application_id}`}>Original application</Link>}
              {open.status === 'ACTIVE' && <button className="danger small" onClick={() => exit(open)}>Record exit</button>}
              <button className="ghost small" onClick={() => setOpen(null)}>Close</button>
            </div>
          </div>
          <div className="panel-body grid cols-2">
            <dl className="kv">
              <dt>Company</dt><dd>{open.company_name}</dd>
              <dt>Designation</dt><dd>{open.designation || '—'}</dd>
              <dt>Department</dt><dd>{open.department || '—'}</dd>
              <dt>Date of joining</dt><dd>{date(open.date_of_joining)}</dd>
              <dt>Annual salary</dt><dd>{money(open.annual_ctc)}</dd>
              <dt>Email</dt><dd>{open.email || '—'}</dd>
              <dt>Mobile</dt><dd>{open.phone || '—'}</dd>
            </dl>
            <dl className="kv">
              <dt>Date of birth</dt><dd>{open.date_of_birth ? date(open.date_of_birth) : '—'}</dd>
              <dt>Blood group</dt><dd>{open.blood_group || '—'}</dd>
              <dt>PAN</dt><dd>{open.pan || '—'}</dd>
              <dt>Aadhaar</dt><dd>{open.aadhaar || '—'}</dd>
              <dt>Emergency contact</dt><dd>{open.emergency_contact || '—'}</dd>
              <dt>Permanent address</dt><dd>{open.details?.permanent_address || '—'}</dd>
              {open.status === 'EXITED' && (
                <><dt>Exited</dt><dd>{date(open.exit_date)} — {open.exit_reason || '—'}</dd></>
              )}
            </dl>
          </div>
        </div>
      )}
    </>
  );
}
