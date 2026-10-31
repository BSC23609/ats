import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, useAuth, PIPELINE, CLOSED, STATUS_LABEL, money, date, scoreBand } from '../api.jsx';
import ResumeViewer from '../components/ResumeViewer.jsx';

export default function Pipeline() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const jobFilter = sp.get('job') || ''; // set when arriving from an Openings applicant-count click

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
  const [resumeFor, setResumeFor] = useState(null);   // {id, name} of the resume open in the viewer

  const scope = company ? `company=${company}` : '';

  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (company) qs.set('company', company);
    if (status) qs.set('status', status);
    if (search) qs.set('q', search);
    if (jobFilter) qs.set('job', jobFilter);
    if (sort === 'score') qs.set('sort', 'score');

    return Promise.all([
      api.get(`/applications?${qs}`),
      api.get(`/applications/stats?${scope}`),
    ])
      .then(([list, s]) => { setRows(list); setStats(s.rows); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [company, status, search, sort, scope, jobFilter]);

  // When filtered to one role (from the Openings count), name it so the view is self-explanatory.
  const jobRole = jobFilter ? (rows[0]?.job_title || rows[0]?.position_applied || 'this role') : '';
  const clearJob = () => { const n = new URLSearchParams(sp); n.delete('job'); setSp(n); };

  // Re-read and re-score a resume whose extraction or scoring failed.
  const retryScore = async (id) => {
    try {
      await api.post(`/applications/${id}/reanalyse`);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  // Send (or re-send) the HR-notification email for one application.
  const [notifying, setNotifying] = useState(null);
  const resendNotify = async (id) => {
    setNotifying(id);
    try {
      await api.post(`/applications/${id}/notify`);
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setNotifying(null);
    }
  };

  const counts = useMemo(() => {
    const map = {};
    stats.forEach((r) => { map[r.status] = (map[r.status] || 0) + r.n; });
    return map;
  }, [stats]);

  return (
    <>
      {resumeFor && (
        <ResumeViewer applicationId={resumeFor.id} filename={resumeFor.name}
                      onClose={() => setResumeFor(null)} />
      )}
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

      {jobFilter && (
        <div className="note" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>Showing applicants for <strong>{jobRole}</strong>.</span>
          <button className="ghost small" onClick={clearJob}>Show all candidates</button>
        </div>
      )}

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
                <th>HR email</th>
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
                      <span className="sub" title={a.ai_error || ''}>
                        {a.ai_error || 'Could not read the resume'}
                      </span>
                    ) : a.resume_filename ? (
                      <span className="sub">Not scored yet</span>
                    ) : (
                      <span className="sub">No resume attached</span>
                    )}
                    {a.resume_filename && (
                      <div className="row" style={{ gap: 6, marginTop: 6 }}>
                        <button className="ghost small"
                                onClick={(e) => { e.stopPropagation(); setResumeFor({ id: a.id, name: a.resume_filename }); }}>
                          View resume
                        </button>
                        {(a.ai_status === 'FAILED' || a.ai_status === 'SKIPPED') && (
                          <button className="ghost small"
                                  onClick={(e) => { e.stopPropagation(); retryScore(a.id); }}>
                            Retry
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td>{a.total_experience} yrs{a.notice_period_days != null && <div className="sub">{a.notice_period_days}d notice</div>}</td>
                  <td>{money(a.expected_ctc)}</td>
                  <td>
                    <span className="chip">{a.stage2_submitted_at ? 'Complete' : 'Pending'}</span>
                  </td>
                  <td><span className={`chip ${a.status}`}>{STATUS_LABEL[a.status]}</span></td>
                  <td className="sub">{date(a.created_at)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {a.notify_status === 'SENT' ? (
                      <span className="chip JOINED" title={a.notify_at ? `Sent ${date(a.notify_at)}` : 'Sent'}>
                        Sent
                      </span>
                    ) : a.notify_status === 'FAILED' ? (
                      <div>
                        <span className="chip REJECTED" title={a.notify_error || 'Send failed'}>Failed</span>
                        <button className="ghost small" style={{ marginTop: 5 }}
                                disabled={notifying === a.id}
                                onClick={() => resendNotify(a.id)}>
                          {notifying === a.id ? 'Sending…' : 'Resend'}
                        </button>
                      </div>
                    ) : (
                      <div>
                        <span className="sub">Not sent</span>
                        <button className="ghost small" style={{ marginTop: 5, display: 'block' }}
                                disabled={notifying === a.id}
                                onClick={() => resendNotify(a.id)}>
                          {notifying === a.id ? 'Sending…' : 'Send'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
