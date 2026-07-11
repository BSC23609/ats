import { useEffect, useState } from 'react';
import { api, useAuth, date } from '../api.jsx';

export default function Jobs() {
  const { user } = useAuth();
  const companies = user.companies || [];
  const [rows, setRows] = useState([]);
  const [adding, setAdding] = useState(false);
  const [jd, setJd] = useState(null);          // the opening whose JD is being uploaded
  const [jdFile, setJdFile] = useState(null);
  const [jdText, setJdText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () => api.get('/jobs').then(setRows);
  useEffect(load, []);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    const body = Object.fromEntries(new FormData(e.target));
    try {
      await api.post('/jobs', body);
      setAdding(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const setStatus = async (job, status) => {
    await api.patch(`/jobs/${job.id}`, { status });
    load();
  };

  const saveJd = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setMsg('');
    try {
      const form = new FormData();
      if (jdFile) form.set('jd', jdFile);
      if (jdText.trim()) form.set('jd_text', jdText);
      const res = await api.upload(`/jobs/${jd.id}/jd`, form);
      setMsg(res.rescoring
        ? `Job description saved. Re-scoring ${res.rescoring} candidate${res.rescoring === 1 ? '' : 's'} already in the pipeline — refresh in a moment.`
        : 'Job description saved. Every resume for this role will now be scored against it.');
      setJd(null); setJdFile(null); setJdText('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Hiring</div>
          <h1>Openings</h1>
          <div className="sub">Open roles appear on the careers page immediately.</div>
        </div>
        <button onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : 'Post an opening'}</button>
      </div>

      {msg && <div className="success" style={{ marginBottom: 16 }}>{msg}</div>}
      {error && !adding && !jd && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

      {jd && (
        <form className="panel" onSubmit={saveJd} style={{ marginBottom: 16 }}>
          <div className="panel-head">
            <h2>Job description — {jd.title}</h2>
            <button type="button" className="ghost small" onClick={() => setJd(null)}>Cancel</button>
          </div>
          <div className="panel-body">
            {error && <div className="error" style={{ marginBottom: 14 }}>{error}</div>}
            <p style={{ marginTop: 0 }}>
              Every resume for this role is scored out of 10 against this description, and the candidate page shows
              which requirements the resume evidences and which it does not. Without a description, the score is
              based on the job title alone and means very little.
            </p>

            <div className="field">
              <label htmlFor="jd_file">Upload the job description — PDF, Word or text</label>
              <input id="jd_file" type="file" accept=".pdf,.doc,.docx,.txt"
                     onChange={(e) => setJdFile(e.target.files[0] || null)} />
            </div>

            <div className="field">
              <label htmlFor="jd_text">Or paste it in</label>
              <textarea id="jd_text" value={jdText} onChange={(e) => setJdText(e.target.value)}
                        style={{ minHeight: 160 }}
                        placeholder="Responsibilities, required qualifications, years of experience, software, codes…" />
            </div>

            {jd.has_jd && (
              <div className="note" style={{ marginBottom: 14 }}>
                A description is already on file ({jd.jd_filename || 'pasted text'}). Saving a new one replaces it and
                re-scores every candidate for this role, so the scores stay comparable.
              </div>
            )}

            <button type="submit" disabled={busy || (!jdFile && !jdText.trim())}>
              {busy ? 'Saving…' : 'Save and score candidates'}
            </button>
          </div>
        </form>
      )}

      {adding && (
        <form className="panel" onSubmit={create} style={{ marginBottom: 16 }}>
          <div className="panel-head"><h2>New opening</h2></div>
          <div className="panel-body">
            {error && <div className="error" style={{ marginBottom: 14 }}>{error}</div>}
            <div className="field-row">
              <div className="field">
                <label htmlFor="company_id">Company</label>
                <select id="company_id" name="company_id" required
                        defaultValue={companies.length === 1 ? companies[0].id : ''}>
                  <option value="" disabled>Select</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="title">Job title</label>
                <input id="title" name="title" required placeholder="Design Engineer — PEB" />
              </div>
              <div className="field">
                <label htmlFor="department">Department</label>
                <input id="department" name="department" />
              </div>
              <div className="field">
                <label htmlFor="location">Location</label>
                <input id="location" name="location" defaultValue="Chennai" />
              </div>
              <div className="field">
                <label htmlFor="min_experience">Minimum experience (years)</label>
                <input id="min_experience" name="min_experience" type="number" step="0.5" min="0" defaultValue="0" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="description">What the role involves</label>
              <textarea id="description" name="description" />
            </div>
            <button type="submit">Post opening</button>
          </div>
        </form>
      )}

      <div className="panel">
        {!rows.length ? (
          <div className="empty"><h3>No openings yet</h3><p>Post one and it goes live on the careers page.</p></div>
        ) : (
          <table>
            <thead>
              <tr><th>Role</th><th>Location</th><th>Min. experience</th><th>Job description</th><th>Applicants</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((j) => (
                <tr key={j.id} style={{ cursor: 'default' }}>
                  <td className="co" style={{ borderLeftColor: j.colour }}>
                    <div className="name">{j.title}</div>
                    <div className="ref">{j.company_code}{j.department ? ` · ${j.department}` : ''}</div>
                  </td>
                  <td>{j.location || '—'}</td>
                  <td>{j.min_experience > 0 ? `${j.min_experience} yrs` : '—'}</td>
                  <td>
                    {j.has_jd
                      ? <span className="chip JOINED">On file</span>
                      : <span className="chip ON_HOLD">Not uploaded</span>}
                  </td>
                  <td><strong>{j.applicant_count}</strong></td>
                  <td><span className={`chip ${j.status === 'OPEN' ? 'JOINED' : j.status === 'CLOSED' ? 'REJECTED' : 'ON_HOLD'}`}>{j.status}</span></td>
                  <td>
                    <div className="row">
                      <button className="ghost small" onClick={() => { setJd(j); setJdText(''); setJdFile(null); setMsg(''); }}>
                        {j.has_jd ? 'Replace JD' : 'Upload JD'}
                      </button>
                      {j.status === 'OPEN'
                        ? <button className="ghost small" onClick={() => setStatus(j, 'CLOSED')}>Close</button>
                        : <button className="ghost small" onClick={() => setStatus(j, 'OPEN')}>Reopen</button>}
                    </div>
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
