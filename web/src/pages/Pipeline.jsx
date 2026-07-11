import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, useAuth, PIPELINE, CLOSED, STATUS_LABEL, money, date, scoreBand } from '../api.jsx';

export default function Pipeline() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Whoever looks after more than one company gets a picker — super admin or HR admin alike.
  const companies = user.companies || [];
  const multi = companies.length > 1;
  const [company, setCompany] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);

  const scope = company ? `company=${company}` : '';

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (company) qs.set('company', company);
    if (status) qs.set('status', status);
    if (search) qs.set('q', search);
    if (sort === 'score') qs.set('sort', 'score');

    Promise.all([
      api.get(`/applications?${qs}`),
      api.get(`/applications/stats?${scope}`),
    ])
      .then(([list, s]) => { setRows(list); setStats(s.rows); })
      .finally(() => setLoading(false));
  }, [company, status, search, sort, scope]);

  const counts = useMemo(() => {
    const map = {};
    stats.forEach((r) => { map[r.status] = (map[r.status] || 0) + r.n; });
    return map;
  }, [stats]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Recruitment</div>
          <h1>Candidate pipeline</h1>
        </div>
        <div className="row">
          {multi && (
            <select value={company} onChange={(e) => setCompany(e.target.value)} style={{ width: 210 }}>
              <option value="">All {companies.length} companies</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          )}
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 165 }}>
            <option value="recent">Newest first</option>
            <option value="score">Best match first</option>
          </select>
          <input placeholder="Search name, ref, role…" value={search}
                 onChange={(e) => setSearch(e.target.value)} style={{ width: 220 }} />
        </div>
      </div>

      {/* Signature: the welded track. Each segment is a stage; click to filter. */}
      <div className="track" style={{ marginBottom: 8 }}>
        {PIPELINE.map((s) => (
          <button key={s}
                  className={`track-seg ${status === s ? 'on' : ''} ${counts[s] ? 'reached' : ''}`}
                  onClick={() => setStatus(status === s ? '' : s)}>
            <span className="n">{counts[s] || 0}</span>
            <span className="lbl">{STATUS_LABEL[s]}</span>
          </button>
        ))}
      </div>
      <div className="row" style={{ marginBottom: 20 }}>
        <button className={`ghost small ${!status ? '' : ''}`} onClick={() => setStatus('')}
                style={{ fontWeight: status ? 400 : 700 }}>
          All ({rows.length ? Object.values(counts).reduce((a, b) => a + b, 0) : 0})
        </button>
        {CLOSED.map((s) => (
          <button key={s} className="ghost small"
                  style={{ fontWeight: status === s ? 700 : 400 }}
                  onClick={() => setStatus(status === s ? '' : s)}>
            {STATUS_LABEL[s]} ({counts[s] || 0})
          </button>
        ))}
      </div>

      <div className="panel">
        {loading ? (
          <div className="empty">Loading candidates…</div>
        ) : !rows.length ? (
          <div className="empty">
            <h3>No candidates here yet</h3>
            <p>Share the careers page link, or clear the filters above.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Role</th>
                <th>Match</th>
                <th>Resume overview</th>
                <th>Experience</th>
                <th>Expected</th>
                <th>Form</th>
                <th>Status</th>
                <th>Applied</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} onClick={() => navigate(`/applications/${a.id}`)}>
                  <td className="co" style={{ borderLeftColor: a.colour }}>
                    <div className="name">{a.full_name}</div>
                    <div className="ref">{a.ref_code} · {a.company_code}</div>
                  </td>
                  <td>
                    <div>{a.position_applied}</div>
                    {a.job_title && a.job_title !== a.position_applied && <div className="sub">{a.job_title}</div>}
                  </td>
                  <td>
                    {a.ai_score != null ? (
                      <span className={`score ${scoreBand(a.ai_score)}`}>
                        {Number(a.ai_score).toFixed(1)}<small>/10</small>
                      </span>
                    ) : (
                      <span className="sub">—</span>
                    )}
                  </td>
                  <td style={{ maxWidth: 300 }}>
                    {a.ai_status === 'DONE' ? (
                      <div className="sub" style={{ color: 'var(--ink)' }}>{a.ai_headline}</div>
                    ) : a.ai_status === 'PENDING' ? (
                      <span className="sub">Reading resume…</span>
                    ) : a.ai_status === 'FAILED' ? (
                      <span className="sub">Could not read the resume</span>
                    ) : (
                      <span className="sub">No resume attached</span>
                    )}
                  </td>
                  <td>{a.total_experience} yrs{a.notice_period_days != null && <div className="sub">{a.notice_period_days}d notice</div>}</td>
                  <td>{money(a.expected_ctc)}</td>
                  <td>
                    <span className="chip">{a.stage2_submitted_at ? 'Complete' : 'Pending'}</span>
                  </td>
                  <td><span className={`chip ${a.status}`}>{STATUS_LABEL[a.status]}</span></td>
                  <td className="sub">{date(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
