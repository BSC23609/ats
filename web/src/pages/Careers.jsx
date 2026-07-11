import { useEffect, useState } from 'react';
import { api } from '../api.jsx';

export default function Careers() {
  const [openings, setOpenings] = useState([]);
  const [job, setJob] = useState(null);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    api.get('/public/openings').then(setOpenings).catch((e) => setError(e.message));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!job) return setError('Choose the role you are applying for.');
    setBusy(true);
    setError('');

    const form = new FormData(e.target);
    form.set('company_id', job.company_id);
    form.set('job_id', job.id);
    form.set('position_applied', job.title);
    if (file) form.set('resume', file);

    try {
      const res = await api.upload('/public/apply', form);
      setDone(res.ref_code);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <div className="public">
        <div className="public-head">
          <div className="mark">BHARAT STEEL GROUP</div>
          <div className="sub">Careers</div>
        </div>
        <div className="success" style={{ padding: 20 }}>
          <h2 style={{ marginBottom: 8 }}>Application received</h2>
          <p style={{ margin: 0 }}>
            Your reference number is <strong style={{ fontFamily: 'var(--f-mono)' }}>{done}</strong>. Keep it — quote it
            in any follow-up. Our HR team reviews every application and will contact you if your profile matches.
          </p>
        </div>
        <p style={{ marginTop: 20 }}>
          <button className="ghost" onClick={() => { setDone(null); setJob(null); setFile(null); }}>
            Apply for another role
          </button>
        </p>
      </div>
    );

  const byCompany = openings.reduce((acc, o) => {
    (acc[o.company_name] ||= []).push(o);
    return acc;
  }, {});

  return (
    <div className="public">
      <div className="public-head">
        <div className="mark">BHARAT STEEL GROUP</div>
        <div className="sub">Careers · Chennai</div>
      </div>

      <p style={{ maxWidth: 620, marginBottom: 28 }}>
        Steel trading and processing, pre-engineered buildings, roofing systems and software — four companies, one
        group. Pick a role, tell us how to reach you, and attach your resume.
      </p>

      <h2 style={{ marginBottom: 12 }}>Open roles</h2>
      {!openings.length && <div className="empty">No roles are open right now. Check back soon.</div>}

      {Object.entries(byCompany).map(([company, list]) => (
        <div key={company} style={{ marginBottom: 22 }}>
          <div className="sub" style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.14em',
                                        textTransform: 'uppercase', marginBottom: 8 }}>
            {company}
          </div>
          {list.map((o) => (
            <div key={o.id}
                 className={`opening ${job?.id === o.id ? 'on' : ''}`}
                 style={{ borderLeftColor: o.colour }}
                 onClick={() => setJob(o)}
                 role="button" tabIndex={0}
                 onKeyDown={(e) => e.key === 'Enter' && setJob(o)}>
              <div>
                <div className="name">{o.title}</div>
                <div className="sub">
                  {[o.department, o.location, o.min_experience > 0 && `${o.min_experience}+ yrs`]
                    .filter(Boolean).join(' · ')}
                </div>
              </div>
              <span className="chip">{job?.id === o.id ? 'Selected' : 'Apply'}</span>
            </div>
          ))}
        </div>
      ))}

      {job && (
        <form className="panel" onSubmit={submit} style={{ marginTop: 26 }}>
          <div className="panel-head">
            <h2>Apply — {job.title}</h2>
            <span className="chip">{job.company_code}</span>
          </div>
          <div className="panel-body">
            {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

            <div className="field-row">
              <div className="field">
                <label htmlFor="full_name">Full name <span className="req">*</span></label>
                <input id="full_name" name="full_name" required />
              </div>
              <div className="field">
                <label htmlFor="email">Email <span className="req">*</span></label>
                <input id="email" name="email" type="email" required />
              </div>
              <div className="field">
                <label htmlFor="phone">Mobile number <span className="req">*</span></label>
                <input id="phone" name="phone" required />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="current_location">Current location</label>
                <input id="current_location" name="current_location" placeholder="Chennai" />
              </div>
              <div className="field">
                <label htmlFor="total_experience">Total experience (years)</label>
                <input id="total_experience" name="total_experience" type="number" step="0.5" min="0" defaultValue="0" />
              </div>
              <div className="field">
                <label htmlFor="notice_period_days">Notice period (days)</label>
                <input id="notice_period_days" name="notice_period_days" type="number" min="0" />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="current_ctc">Current annual salary (₹)</label>
                <input id="current_ctc" name="current_ctc" type="number" min="0" />
              </div>
              <div className="field">
                <label htmlFor="expected_ctc">Expected annual salary (₹)</label>
                <input id="expected_ctc" name="expected_ctc" type="number" min="0" />
              </div>
            </div>

            <div className="field">
              <label htmlFor="resume">Resume — PDF or Word, up to 8 MB</label>
              <input id="resume" type="file" accept=".pdf,.doc,.docx,.txt"
                     onChange={(e) => setFile(e.target.files[0] || null)} />
              <p className="sub" style={{ marginTop: 6 }}>
                Attach a resume and our team sees a structured overview of your background straight away.
              </p>
            </div>

            <div className="note" style={{ marginBottom: 16 }}>
              This is the short form. If you are called for an interview, you will get a link to the full application
              form to complete on the day.
            </div>

            <button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send application'}</button>
          </div>
        </form>
      )}
    </div>
  );
}
