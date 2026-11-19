import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, useAuth, PIPELINE, CLOSED, STATUS_LABEL, money, date, scoreBand } from '../api.jsx';
import ResumeViewer from '../components/ResumeViewer.jsx';

// Turn a long AI/resume error into a short label (full text stays in the tooltip).
function shortAiError(msg) {
  const m = (msg || '').toLowerCase();
  if (!m) return 'Could not read the resume';
  if (m.includes('quota') || m.includes('rate') || m.includes('billing')) return 'AI quota reached — retry later';
  if (m.includes('high demand') || m.includes('overload') || m.includes('503') || m.includes('unavailable')) return 'AI busy — retry';
  if (m.includes('no readable text') || m.includes('scanned') || m.includes('image-only')) return 'Scanned/image PDF — no text';
  if (m.includes('utf8') || m.includes('byte sequence') || m.includes('encoding')) return 'Resume text could not be read';
  if (m.includes('api key') || m.includes('permission') || m.includes('denied')) return 'AI not configured';
  return 'Could not score — retry';
}

// Common reasons offered when closing a candidate out — recorded on the application and its history.
const REJECT_REASONS = [
  'Salary expectation too high',
  'Location not suitable',
  'Insufficient experience',
  'Skills / qualification mismatch',
  'Did not clear the interview',
  'Notice period too long',
  'Position already filled',
  'No-show / unresponsive',
  'Other',
];
const WITHDRAW_REASONS = [
  'Accepted another offer',
  'Salary expectation not met',
  'Location not suitable',
  'Personal reasons',
  'No longer interested',
  'Unreachable',
  'Other',
];

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

  // "Add candidate" — HR enters someone who applied off-portal.
  const emptyAdd = {
    company_id: '', job_id: '', position_applied: '', full_name: '', email: '', phone: '',
    total_experience: '', current_ctc: '', expected_ctc: '', notice_period_days: '',
    area: '', city: '', pincode: '', status: 'APPLIED',
  };
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyAdd);
  const [addJobs, setAddJobs] = useState([]);
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState('');
  const resumeRef = useRef(null);

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

  // AI recruiter — send the candidate their 5-minute AI first-round interview link.
  const [recOpen, setRecOpen] = useState(false);     // AI Recruiter panel (top button)
  const [interviewing, setInterviewing] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const sendInterview = async (a) => {
    if (a.interview_status && !window.confirm(
      `Re-send the AI interview link to ${a.full_name}?`
    )) return;
    setInterviewing(a.id);
    try {
      await api.post(`/applications/${a.id}/send-interview`);
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setInterviewing(null);
    }
  };

  // Send the AI interview to everyone in view who hasn't been invited yet.
  const sendAllInterviews = async () => {
    const targets = rows.filter(
      (a) => a.email && !['INVITED', 'IN_PROGRESS', 'DONE'].includes(a.interview_status)
    );
    if (!targets.length) { alert('Everyone in view has already been invited.'); return; }
    if (!window.confirm(`Send the AI interview link to ${targets.length} candidate(s) who haven't been invited yet?`)) return;
    setBulkBusy(true);
    let ok = 0, fail = 0;
    for (const a of targets) {
      try { await api.post(`/applications/${a.id}/send-interview`); ok += 1; } catch { fail += 1; }
    }
    setBulkBusy(false);
    await load();
    alert(`Sent ${ok} interview${ok === 1 ? '' : 's'}${fail ? `, ${fail} failed` : ''}.`);
  };

  // One-click advance to the next pipeline stage, straight from the list.
  const [proceeding, setProceeding] = useState(null);
  const nextStage = (status) => {
    const i = PIPELINE.indexOf(status);
    return i >= 0 && i < PIPELINE.length - 1 ? PIPELINE[i + 1] : null;
  };
  const proceed = async (a) => {
    const next = nextStage(a.status);
    if (!next) return;
    setProceeding(a.id);
    try {
      await api.post(`/applications/${a.id}/status`, { status: next });
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setProceeding(null);
    }
  };

  // Close a candidate out of the pipeline — Reject or Withdraw — with a recorded reason.
  const [closeFor, setCloseFor] = useState(null);   // { a, status } while the reason dialog is open
  const [closeReason, setCloseReason] = useState('');
  const [closeNote, setCloseNote] = useState('');

  const openClose = (a, status) => {
    setCloseFor({ a, status });
    setCloseReason('');
    setCloseNote('');
  };

  const confirmClose = async () => {
    if (!closeFor) return;
    const { a, status } = closeFor;
    // Build the note: the chosen reason, plus any free-text detail. "Other" uses the detail alone.
    const detail = closeNote.trim();
    const note = closeReason && closeReason !== 'Other'
      ? (detail ? `${closeReason} — ${detail}` : closeReason)
      : detail;
    setProceeding(a.id);
    try {
      await api.post(`/applications/${a.id}/status`, { status, note: note || null });
      setCloseFor(null);
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setProceeding(null);
    }
  };

  // Open the "Add candidate" dialog: reset the form, preselect the one company if there's only one,
  // and load the open roles so HR can attach the application to a posting.
  const openAdd = async () => {
    setAddErr('');
    setAddForm({ ...emptyAdd, company_id: company || (companies.length === 1 ? String(companies[0].id) : '') });
    setAddOpen(true);
    if (resumeRef.current) resumeRef.current.value = '';
    try {
      const js = await api.get('/jobs?status=OPEN');
      setAddJobs(Array.isArray(js) ? js : (js.rows || []));
    } catch {
      setAddJobs([]);
    }
  };

  // Picking an open role fills the role title, job link and company in one step.
  const pickJob = (jobId) => {
    const j = addJobs.find((x) => String(x.id) === String(jobId));
    setAddForm((f) => ({
      ...f,
      job_id: jobId || '',
      position_applied: j ? j.title : f.position_applied,
      company_id: j ? String(j.company_id) : f.company_id,
    }));
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    if (addBusy) return;
    setAddBusy(true); setAddErr('');
    try {
      const fd = new FormData();
      Object.entries(addForm).forEach(([k, v]) => { if (v !== '' && v != null) fd.append(k, v); });
      const file = resumeRef.current?.files?.[0];
      if (file) fd.append('resume', file);
      const res = await api.upload('/applications', fd);
      setAddOpen(false);
      await load();
      navigate(`/applications/${res.id}`);
    } catch (err) {
      setAddErr(err.message);
    } finally {
      setAddBusy(false);
    }
  };

  // Permanently delete the whole candidate row from the pipeline.
  const deleteRow = async (a) => {
    if (!window.confirm(
      `Delete ${a.full_name} (${a.ref_code}) permanently?\n\n` +
      `This removes the application and its history. This cannot be undone.`
    )) return;
    setNotifying(a.id);
    try {
      await api.del(`/applications/${a.id}`);
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
          <button onClick={() => setRecOpen(true)}
                  title="Send the AI first-round interview to candidates and see their scores">
            ✨ AI recruiter
          </button>
          <button className="primary" onClick={openAdd}
                  title="Add a candidate who applied off-portal (walk-in, referral, email)">
            + Add candidate
          </button>
        </div>
      </div>

      {recOpen && (() => {
        const done = rows.filter((a) => a.interview_status === 'DONE');
        const invited = rows.filter((a) => ['INVITED', 'IN_PROGRESS'].includes(a.interview_status));
        const notYet = rows.filter((a) => a.email && !['INVITED', 'IN_PROGRESS', 'DONE'].includes(a.interview_status));
        return (
          <div className="overlay" onClick={(e) => e.target === e.currentTarget && setRecOpen(false)}>
            <div className="dialog" style={{ maxWidth: 640 }} role="dialog" aria-modal="true">
              <div className="dialog-head">
                <div>
                  <div className="eyebrow">AI recruiter</div>
                  <h2>AI first-round interviews</h2>
                  <div className="sub">
                    Sends each candidate a private 5-minute AI video interview. The AI asks them to
                    introduce themselves, then questions them on their resume and the role, and scores the result.
                  </div>
                </div>
                <button type="button" className="dialog-close" onClick={() => setRecOpen(false)} aria-label="Close">×</button>
              </div>

              <div className="dialog-body">
                <div className="row" style={{ gap: 18, marginBottom: 14 }}>
                  <span className="sub"><strong style={{ color: 'var(--ink)' }}>{notYet.length}</strong> not invited</span>
                  <span className="sub"><strong style={{ color: 'var(--ink)' }}>{invited.length}</strong> invited / in progress</span>
                  <span className="sub"><strong style={{ color: 'var(--ink)' }}>{done.length}</strong> completed</span>
                </div>

                <button className="primary" disabled={bulkBusy || !notYet.length} onClick={sendAllInterviews}>
                  {bulkBusy ? 'Sending…' : `Send interview to all ${notYet.length} not invited`}
                </button>

                <div style={{ maxHeight: 320, overflowY: 'auto', marginTop: 16 }}>
                  <table>
                    <tbody>
                      {rows.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <div className="name">{a.full_name}</div>
                            <div className="ref">{a.position_applied}</div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {a.interview_status === 'DONE' ? (
                              a.interview_score != null
                                ? <span className={`score ${scoreBand(a.interview_score)}`}>{Number(a.interview_score).toFixed(1)}<small>/10</small></span>
                                : <span className="chip JOINED">Done</span>
                            ) : a.interview_status === 'IN_PROGRESS' ? (
                              <span className="chip INTERVIEW_SCORE">In progress</span>
                            ) : a.interview_status === 'INVITED' ? (
                              <button className="ghost small" disabled={interviewing === a.id} onClick={() => sendInterview(a)}>
                                {interviewing === a.id ? 'Sending…' : 'Invited · Resend'}
                              </button>
                            ) : (
                              <button className="ghost small" disabled={interviewing === a.id || !a.email} onClick={() => sendInterview(a)}>
                                {interviewing === a.id ? 'Sending…' : 'Send interview'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="dialog-foot">
                <button type="button" className="ghost" onClick={() => setRecOpen(false)}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {addOpen && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setAddOpen(false)}>
          <form className="dialog" style={{ maxWidth: 680 }} role="dialog" aria-modal="true" onSubmit={submitAdd}>
            <div className="dialog-head">
              <div>
                <div className="eyebrow">Pipeline</div>
                <h2>Add a candidate</h2>
                <div className="sub">
                  For someone who applied off-portal — a walk-in, referral or emailed CV. No email is sent;
                  the resume (if attached) is scored automatically.
                </div>
              </div>
              <button type="button" className="dialog-close" onClick={() => setAddOpen(false)} aria-label="Close">×</button>
            </div>

            <div className="dialog-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {addJobs.length > 0 && (
                <label style={{ gridColumn: '1 / -1' }}>
                  <span>Open role (optional — links the application to a posting)</span>
                  <select value={addForm.job_id} onChange={(e) => pickJob(e.target.value)}>
                    <option value="">Not linked to a posting</option>
                    {addJobs.map((j) => (
                      <option key={j.id} value={j.id}>{j.company_code ? `${j.company_code} — ` : ''}{j.title}</option>
                    ))}
                  </select>
                </label>
              )}

              <label>
                <span>Company *</span>
                <select required value={addForm.company_id}
                        onChange={(e) => setAddForm((f) => ({ ...f, company_id: e.target.value }))}>
                  <option value="">Select company…</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </select>
              </label>
              <label>
                <span>Role / position *</span>
                <input required value={addForm.position_applied}
                       onChange={(e) => setAddForm((f) => ({ ...f, position_applied: e.target.value }))}
                       placeholder="e.g. Site Engineer" />
              </label>

              <label>
                <span>Full name *</span>
                <input required value={addForm.full_name}
                       onChange={(e) => setAddForm((f) => ({ ...f, full_name: e.target.value }))} />
              </label>
              <label>
                <span>Phone *</span>
                <input required value={addForm.phone}
                       onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))} />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                <span>Email *</span>
                <input required type="email" value={addForm.email}
                       onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} />
              </label>

              <label>
                <span>Experience (years)</span>
                <input type="number" min="0" step="0.5" value={addForm.total_experience}
                       onChange={(e) => setAddForm((f) => ({ ...f, total_experience: e.target.value }))} />
              </label>
              <label>
                <span>Notice period (days)</span>
                <input type="number" min="0" value={addForm.notice_period_days}
                       onChange={(e) => setAddForm((f) => ({ ...f, notice_period_days: e.target.value }))} />
              </label>
              <label>
                <span>Current CTC (₹/yr)</span>
                <input type="number" min="0" value={addForm.current_ctc}
                       onChange={(e) => setAddForm((f) => ({ ...f, current_ctc: e.target.value }))} />
              </label>
              <label>
                <span>Expected CTC (₹/yr)</span>
                <input type="number" min="0" value={addForm.expected_ctc}
                       onChange={(e) => setAddForm((f) => ({ ...f, expected_ctc: e.target.value }))} />
              </label>

              <label>
                <span>City</span>
                <input value={addForm.city}
                       onChange={(e) => setAddForm((f) => ({ ...f, city: e.target.value }))} />
              </label>
              <label>
                <span>Pincode</span>
                <input value={addForm.pincode}
                       onChange={(e) => setAddForm((f) => ({ ...f, pincode: e.target.value }))} />
              </label>

              <label style={{ gridColumn: '1 / -1' }}>
                <span>Resume (optional — PDF or Word)</span>
                <input type="file" ref={resumeRef} accept=".pdf,.doc,.docx,.txt" />
              </label>

              <label style={{ gridColumn: '1 / -1' }}>
                <span>Starting stage</span>
                <select value={addForm.status}
                        onChange={(e) => setAddForm((f) => ({ ...f, status: e.target.value }))}>
                  {PIPELINE.filter((s) => s !== 'JOINED').map((s) => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                  {CLOSED.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </label>

              {addErr && <div className="error" style={{ gridColumn: '1 / -1' }}>{addErr}</div>}
            </div>

            <div className="dialog-foot">
              <button type="button" className="ghost" onClick={() => setAddOpen(false)}>Cancel</button>
              <button type="submit" className="primary" disabled={addBusy}>
                {addBusy ? 'Adding…' : 'Add candidate'}
              </button>
            </div>
          </form>
        </div>
      )}

      {closeFor && (() => {
        const isReject = closeFor.status === 'REJECTED';
        const reasons = isReject ? REJECT_REASONS : WITHDRAW_REASONS;
        const needDetail = closeReason === 'Other';
        return (
          <div className="overlay" onClick={(e) => e.target === e.currentTarget && setCloseFor(null)}>
            <div className="dialog" style={{ maxWidth: 480 }} role="dialog" aria-modal="true">
              <div className="dialog-head">
                <div>
                  <div className="eyebrow">{isReject ? 'Reject candidate' : 'Withdraw candidate'}</div>
                  <h2>{closeFor.a.full_name}</h2>
                  <div className="sub">
                    {isReject
                      ? 'Why is this candidate being rejected? The reason is saved to their history.'
                      : 'Why is this candidate withdrawing? The reason is saved to their history.'}
                  </div>
                </div>
                <button type="button" className="dialog-close" onClick={() => setCloseFor(null)} aria-label="Close">×</button>
              </div>

              <div className="dialog-body">
                <label>
                  <span>Reason</span>
                  <select value={closeReason} onChange={(e) => setCloseReason(e.target.value)}
                          style={{ width: '100%' }}>
                    <option value="">Select a reason…</option>
                    {reasons.map((rsn) => <option key={rsn} value={rsn}>{rsn}</option>)}
                  </select>
                </label>
                <textarea
                  value={closeNote}
                  onChange={(e) => setCloseNote(e.target.value)}
                  placeholder={needDetail ? 'Type the reason…' : 'Add a note (optional)'}
                  style={{ minHeight: 70, width: '100%', marginTop: 12 }}
                />
              </div>

              <div className="dialog-foot">
                <button type="button" className="ghost" onClick={() => setCloseFor(null)}>Cancel</button>
                <button type="button"
                        className="primary"
                        style={isReject ? { background: '#c0392b', borderColor: '#c0392b' } : undefined}
                        disabled={proceeding === closeFor.a.id || (!closeReason && !closeNote.trim()) || (needDetail && !closeNote.trim())}
                        onClick={confirmClose}>
                  {proceeding === closeFor.a.id ? 'Saving…' : (isReject ? 'Reject' : 'Withdraw')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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

      <div className="panel scroll-xy">
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
                <th>AI interview</th>
                <th>Applied</th>
                <th>HR email</th>
                <th>Actions</th>
                <th>Interview score</th>
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
                        {shortAiError(a.ai_error)}
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
                  <td onClick={(e) => e.stopPropagation()}>
                    {a.interview_status === 'DONE' ? (
                      <span className="chip JOINED" title="AI interview completed">Done</span>
                    ) : a.interview_status === 'IN_PROGRESS' ? (
                      <span className="chip INTERVIEW_SCORE">In progress</span>
                    ) : a.interview_status === 'INVITED' ? (
                      <div>
                        <span className="chip" title="Interview link sent">Invited</span>
                        <button className="ghost small" style={{ marginTop: 5, display: 'block' }}
                                disabled={interviewing === a.id}
                                onClick={() => sendInterview(a)}>
                          {interviewing === a.id ? 'Sending…' : 'Resend'}
                        </button>
                      </div>
                    ) : (
                      <button className="ghost small"
                              disabled={interviewing === a.id}
                              title={`Send the 5-minute AI interview link to ${a.full_name}`}
                              onClick={() => sendInterview(a)}>
                        {interviewing === a.id ? 'Sending…' : '✨ Send interview'}
                      </button>
                    )}
                  </td>
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
                    <button className="ghost small" style={{ marginTop: 5, display: 'block', color: '#c0392b' }}
                            disabled={notifying === a.id}
                            onClick={() => deleteRow(a)}>
                      Delete log
                    </button>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {CLOSED.includes(a.status) ? (
                      <span className="sub">{STATUS_LABEL[a.status]}</span>
                    ) : (
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        {nextStage(a.status) && (
                          <button className="ghost small"
                                  disabled={proceeding === a.id}
                                  title={`Move ${a.full_name} to ${STATUS_LABEL[nextStage(a.status)]}`}
                                  onClick={() => proceed(a)}>
                            {proceeding === a.id ? 'Moving…' : `→ ${STATUS_LABEL[nextStage(a.status)]}`}
                          </button>
                        )}
                        <button className="ghost small" style={{ color: '#c0392b' }}
                                disabled={proceeding === a.id}
                                title={`Reject ${a.full_name}`}
                                onClick={() => openClose(a, 'REJECTED')}>
                          Reject
                        </button>
                        <button className="ghost small"
                                disabled={proceeding === a.id}
                                title={`Mark ${a.full_name} as withdrawn`}
                                onClick={() => openClose(a, 'WITHDRAWN')}>
                          Withdraw
                        </button>
                      </div>
                    )}
                  </td>
                  <td>
                    {a.interview_score != null ? (
                      <span className={`score ${scoreBand(a.interview_score)}`}
                            title="Performance score from the AI first-round interview">
                        {Number(a.interview_score).toFixed(1)}<small>/10</small>
                      </span>
                    ) : a.interview_status === 'DONE' ? (
                      <span className="sub" title="Interview finished but could not be scored">Not scored</span>
                    ) : a.interview_status === 'IN_PROGRESS' ? (
                      <span className="sub">In progress…</span>
                    ) : a.interview_status === 'INVITED' ? (
                      <span className="sub">Awaiting</span>
                    ) : (
                      <span className="sub">—</span>
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
