import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, PIPELINE, CLOSED, STATUS_LABEL, money, date, dateTime, scoreBand } from '../api.jsx';

const Section = ({ title, children }) => (
  <div className="panel">
    <div className="panel-head"><h2>{title}</h2></div>
    <div className="panel-body">{children}</div>
  </div>
);

function AiOverview({ app, onReanalyse }) {
  const s = app.ai_summary;

  if (app.ai_status === 'PENDING')
    return <Section title="Resume overview"><div className="sub">Reading the resume — refresh in a moment.</div></Section>;

  if (app.ai_status !== 'DONE' || !s)
    return (
      <Section title="Resume overview">
        <div className="sub" style={{ marginBottom: 10 }}>
          {app.ai_status === 'FAILED'
            ? 'The resume could not be read automatically.'
            : app.resume_filename
              ? 'This resume has not been analysed yet.'
              : 'No resume was attached to this application.'}
        </div>
        {app.resume_filename && <button className="ghost small" onClick={onReanalyse}>Read the resume</button>}
      </Section>
    );

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Resume against the job description</h2>
        <button className="ghost small" onClick={onReanalyse}>Score again</button>
      </div>
      <div className="panel-body stack">
        {s.score != null && (
          <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
            <span className={`score big ${scoreBand(s.score)}`}>
              {Number(s.score).toFixed(1)}<small>/10</small>
            </span>
            <p style={{ margin: 0, flex: 1, minWidth: 220 }}>{s.score_reasoning}</p>
          </div>
        )}

        {(s.requirements_met?.length || s.requirements_missing?.length) && (
          <div className="grid cols-2">
            <div>
              <label>Requirements the resume evidences</label>
              <ul className="bullets">
                {s.requirements_met?.length
                  ? s.requirements_met.map((x, i) => <li key={i}>{x}</li>)
                  : <li className="sub">None found.</li>}
              </ul>
            </div>
            <div>
              <label>Requirements it does not</label>
              <ul className="bullets">
                {s.requirements_missing?.length
                  ? s.requirements_missing.map((x, i) => <li key={i}>{x}</li>)
                  : <li className="sub">None — the resume covers the job description.</li>}
              </ul>
            </div>
          </div>
        )}

        <div className="ai-head">{s.headline}</div>

        <dl className="kv">
          <dt>Experience</dt><dd>{s.total_experience_years ?? '—'} years</dd>
          <dt>Currently</dt><dd>{[s.current_designation, s.current_employer].filter(Boolean).join(' · ') || '—'}</dd>
          <dt>Qualification</dt><dd>{s.highest_qualification || '—'}</dd>
          <dt>Location</dt><dd>{s.location || '—'}</dd>
        </dl>

        {!!s.key_skills?.length && (
          <div>
            <label>Key skills</label>
            <div className="taglist">{s.key_skills.map((k) => <span key={k} className="chip">{k}</span>)}</div>
          </div>
        )}

        <div className="grid cols-2">
          {!!s.strengths?.length && (
            <div>
              <label>Strengths</label>
              <ul className="bullets">{s.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          {!!s.gaps_or_concerns?.length && (
            <div>
              <label>Worth checking</label>
              <ul className="bullets">{s.gaps_or_concerns.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
        </div>

        {!!s.questions_to_ask?.length && (
          <div>
            <label>Questions this resume raises</label>
            <ul className="bullets">{s.questions_to_ask.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        )}

        {!!s.employment_history?.length && (
          <div>
            <label>Employment on the resume</label>
            <table>
              <tbody>
                {s.employment_history.map((e, i) => (
                  <tr key={i} style={{ cursor: 'default' }}>
                    <td><strong>{e.employer}</strong><div className="sub">{e.designation}</div></td>
                    <td className="sub" style={{ textAlign: 'right' }}>{e.period}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="sub" style={{ margin: 0 }}>
          Scored by Claude from the resume text against the uploaded job description. It reads what the resume
          claims, not what the candidate can do — treat the score as a reading order, not a decision.
        </p>
      </div>
    </div>
  );
}

function FormDetails({ d }) {
  if (!d) return null;
  const Table = ({ title, rows, cols }) =>
    !rows?.length ? null : (
      <div style={{ marginTop: 14 }}>
        <label>{title}</label>
        <table>
          <thead><tr>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ cursor: 'default' }}>
                {cols.map((c) => <td key={c.key}>{r[c.key] || '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <Section title="Full application form">
      <div className="grid cols-2">
        <dl className="kv">
          <dt>Date of birth</dt><dd>{d.date_of_birth || '—'} ({d.age || '—'} yrs)</dd>
          <dt>Blood group</dt><dd>{d.blood_group || '—'}</dd>
          <dt>Native place</dt><dd>{d.native_place || '—'}</dd>
          <dt>PAN</dt><dd>{d.pan || '—'}</dd>
          <dt>Aadhaar</dt><dd>{d.aadhaar || '—'}</dd>
          <dt>Marital status</dt><dd>{d.marital_status || '—'}</dd>
          <dt>Spouse</dt><dd>{[d.spouse_name, d.spouse_occupation].filter(Boolean).join(' · ') || '—'}</dd>
        </dl>
        <dl className="kv">
          <dt>Father</dt><dd>{[d.father_name, d.father_age, d.father_occupation].filter(Boolean).join(' · ') || '—'}</dd>
          <dt>Mother</dt><dd>{[d.mother_name, d.mother_age, d.mother_occupation].filter(Boolean).join(' · ') || '—'}</dd>
          <dt>Permanent address</dt><dd>{d.permanent_address || '—'}</dd>
          <dt>Present address</dt><dd>{d.present_address || '—'}</dd>
          <dt>State of health</dt><dd>{d.state_of_health || '—'}</dd>
          <dt>Can join by</dt><dd>{d.earliest_joining_date || '—'}</dd>
          <dt>Expected salary</dt><dd>{money(d.expected_salary)}</dd>
        </dl>
      </div>

      <Table title="Emergency contacts" rows={d.emergency_contacts}
             cols={[{ key: 'name', label: 'Name' }, { key: 'relationship', label: 'Relationship' }, { key: 'contact', label: 'Contact' }]} />
      <Table title="Education" rows={d.education}
             cols={[{ key: 'exam', label: 'Exam' }, { key: 'class_marks', label: 'Class / marks' },
                    { key: 'institution', label: 'Institution' }, { key: 'from', label: 'From' },
                    { key: 'to', label: 'To' }, { key: 'specialisation', label: 'Specialisation' }]} />
      <Table title="Previous employment" rows={d.employment}
             cols={[{ key: 'employer', label: 'Employer' }, { key: 'designation_leaving', label: 'Designation (leaving)' },
                    { key: 'from', label: 'From' }, { key: 'to', label: 'To' },
                    { key: 'salary_leaving', label: 'Salary (leaving)' }, { key: 'reason_for_leaving', label: 'Reason for leaving' }]} />
      <Table title="Previous company HR contacts" rows={d.previous_hr_contacts}
             cols={[{ key: 'name', label: 'Name' }, { key: 'designation', label: 'Designation' }, { key: 'contact', label: 'Contact' }]} />
      <Table title="Children" rows={d.children} cols={[{ key: 'name', label: 'Name' }, { key: 'dob', label: 'Date of birth' }]} />
      <Table title="Brothers and sisters" rows={d.siblings}
             cols={[{ key: 'name', label: 'Name' }, { key: 'age', label: 'Age' }, { key: 'gender', label: 'M/F' },
                    { key: 'marital', label: 'Marital' }, { key: 'occupation', label: 'Occupation / place' }]} />

      <p className="sub" style={{ marginTop: 16 }}>
        Declared by {d.declaration_signature} at {d.declaration_place} on {d.declaration_date}.
      </p>
    </Section>
  );
}

export default function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [move, setMove] = useState({ status: '', note: '', interview_at: '', offered_ctc: '', date_of_joining: '', designation: '', department: '' });
  const [offer, setOffer] = useState({ offer_designation: '', offered_ctc: '', offer_joining_date: '' });
  const [offerFile, setOfferFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/applications/${id}`).then(setApp).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  if (error) return <div className="error">{error}</div>;
  if (!app) return <div className="empty">Loading…</div>;

  const stageIndex = PIPELINE.indexOf(app.status);

  const submitMove = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const res = await api.post(`/applications/${id}/status`, {
        ...move,
        offered_ctc: move.offered_ctc || null,
        interview_at: move.interview_at || null,
        date_of_joining: move.date_of_joining || null,
      });
      setMsg(res.employee
        ? `Moved to Joined. Employee record ${res.employee.emp_code} created.`
        : `Moved to ${STATUS_LABEL[move.status]}.`);
      setMove({ status: '', note: '', interview_at: '', offered_ctc: '', date_of_joining: '', designation: '', department: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveOffer = async (e) => {
    e.preventDefault();
    if (!offerFile && !app.offer_letter_path)
      return setError('Attach the signed offer letter PDF.');

    setBusy(true);
    setError('');
    setMsg('');
    try {
      const form = new FormData();
      if (offerFile) form.set('offer_letter', offerFile);
      if (offer.offer_designation) form.set('offer_designation', offer.offer_designation);
      if (offer.offer_joining_date) form.set('offer_joining_date', offer.offer_joining_date);
      if (offer.offered_ctc) form.set('offered_ctc', offer.offered_ctc);

      await api.upload(`/applications/${id}/offer-letter`, form);
      setMsg('Offer letter saved. The candidate is now marked Offered.');
      setOfferFile(null);
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
          <div className="eyebrow">{app.ref_code} · {app.company_name}</div>
          <h1>{app.full_name}</h1>
          <div className="sub">{app.position_applied}{app.job_title ? ` · ${app.job_title}` : ''}</div>
        </div>
        <button className="ghost" onClick={() => navigate('/pipeline')}>← Back to pipeline</button>
      </div>

      {/* the candidate's own position on the track */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-body">
          <div className="progress-track">
            {PIPELINE.map((s, i) => (
              <div key={s} className={`step ${stageIndex > i ? 'done' : ''} ${stageIndex === i ? 'now' : ''}`} />
            ))}
          </div>
          <div className="progress-labels">{PIPELINE.map((s) => <span key={s}>{STATUS_LABEL[s]}</span>)}</div>
          {CLOSED.includes(app.status) && (
            <div style={{ marginTop: 10 }}>
              <span className={`chip ${app.status}`}>{STATUS_LABEL[app.status]}</span>
              {app.status_note && <span className="sub" style={{ marginLeft: 8 }}>{app.status_note}</span>}
            </div>
          )}
        </div>
      </div>

      {msg && <div className="success" style={{ marginBottom: 16 }}>{msg}</div>}
      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Section title="Contact and expectations">
            <dl className="kv">
              <dt>Email</dt><dd>{app.email}</dd>
              <dt>Mobile</dt><dd>{app.phone}</dd>
              <dt>Location</dt>
              <dd>
                {app.area || app.city || app.pincode ? (
                  <>
                    {[app.area, app.city].filter(Boolean).join(', ')}
                    {app.pincode && <div className="ref">PIN {app.pincode}</div>}
                  </>
                ) : (app.current_location || '—')}
              </dd>
              <dt>Experience</dt><dd>{app.total_experience} years</dd>
              <dt>Current salary</dt><dd>{money(app.current_ctc)}</dd>
              <dt>Expected salary</dt><dd>{money(app.expected_ctc)}</dd>
              <dt>Notice period</dt><dd>{app.notice_period_days != null ? `${app.notice_period_days} days` : '—'}</dd>
              <dt>Applied on</dt><dd>{date(app.created_at)} · {app.source}</dd>
              {app.interview_at && <><dt>Interview</dt><dd>{dateTime(app.interview_at)}</dd></>}
              {app.offered_ctc && <><dt>Offered</dt><dd>{money(app.offered_ctc)}</dd></>}
            </dl>
            {app.resume_filename && (
              <p style={{ marginBottom: 0, marginTop: 14 }}>
                <button className="ghost small"
                        onClick={() => api.download(`/applications/${app.id}/resume`, app.resume_filename)}>
                  Download resume — {app.resume_filename}
                </button>
              </p>
            )}
          </Section>

          <AiOverview app={app} onReanalyse={async () => {
            await api.post(`/applications/${id}/reanalyse`);
            setMsg('Reading the resume — refresh in a few seconds.');
          }} />
        </div>

        <div className="stack">
          <Section title="Full application form">
            {app.stage2_submitted_at ? (
              <div className="row">
                <span className="chip JOINED">Submitted {date(app.stage2_submitted_at)}</span>
                <button className="ghost small"
                        onClick={async () => { await api.post(`/applications/${id}/reopen-form`); load(); }}>
                  Reopen for editing
                </button>
              </div>
            ) : (
              <>
                <p style={{ marginTop: 0 }}>
                  Send this link to the candidate on interview day. It opens the full application form, already tagged
                  to {app.full_name}.
                </p>
                <div className="linkbox">
                  <span style={{ flex: 1 }}>{app.form_link}</span>
                  <button className="small ghost" onClick={() => navigator.clipboard.writeText(app.form_link)}>Copy</button>
                </div>
              </>
            )}
          </Section>

          <Section title="Move this candidate">
            <form onSubmit={submitMove}>
              <div className="field">
                <label htmlFor="status">New status</label>
                <select id="status" required value={move.status}
                        onChange={(e) => setMove({ ...move, status: e.target.value })}>
                  <option value="" disabled>Select a status</option>
                  <optgroup label="Pipeline">
                    {PIPELINE.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </optgroup>
                  <optgroup label="Close out">
                    {CLOSED.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </optgroup>
                </select>
              </div>

              {move.status === 'INTERVIEW' && (
                <div className="field">
                  <label htmlFor="interview_at">Interview date and time</label>
                  <input id="interview_at" type="datetime-local" value={move.interview_at}
                         onChange={(e) => setMove({ ...move, interview_at: e.target.value })} />
                </div>
              )}

              {(move.status === 'OFFERED' || move.status === 'JOINED') && (
                <div className="field">
                  <label htmlFor="offered_ctc">Annual salary fixed (₹)</label>
                  <input id="offered_ctc" type="number" min="0" value={move.offered_ctc}
                         onChange={(e) => setMove({ ...move, offered_ctc: e.target.value })} />
                </div>
              )}

              {move.status === 'JOINED' && (
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="date_of_joining">Date of joining</label>
                    <input id="date_of_joining" type="date" value={move.date_of_joining}
                           onChange={(e) => setMove({ ...move, date_of_joining: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="designation">Designation</label>
                    <input id="designation" value={move.designation}
                           placeholder={app.position_applied}
                           onChange={(e) => setMove({ ...move, designation: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="department">Department</label>
                    <input id="department" value={move.department}
                           onChange={(e) => setMove({ ...move, department: e.target.value })} />
                  </div>
                </div>
              )}

              <div className="field">
                <label htmlFor="note">Note for the record</label>
                <textarea id="note" value={move.note} onChange={(e) => setMove({ ...move, note: e.target.value })}
                          placeholder="Panel feedback, reason for rejection, offer terms…" />
              </div>

              {move.status === 'JOINED' && !app.stage2_submitted_at && (
                <div className="note" style={{ marginBottom: 12 }}>
                  The candidate has not submitted the full application form. Send them the form link before marking
                  them joined — the employee record is built from that form.
                </div>
              )}

              <button type="submit" className="signal" disabled={busy || !move.status}>
                {busy ? 'Saving…' : 'Save status'}
              </button>
            </form>
          </Section>

          <Section title="Offer letter">
            <form onSubmit={saveOffer}>
              <p style={{ marginTop: 0 }}>
                Send the letter to the candidate however you normally would. Keep the signed copy here: it files
                itself into OneDrive, and its terms build the employee record when they join.
              </p>

              <div className="field">
                <label htmlFor="offer_letter">Signed offer letter — PDF, up to 8 MB</label>
                <input id="offer_letter" type="file" accept="application/pdf"
                       onChange={(e) => setOfferFile(e.target.files[0] || null)} />
                {app.offer_letter_path && !offerFile && (
                  <p className="sub" style={{ marginTop: 6 }}>
                    A letter is on file.{' '}
                    <button type="button" className="ghost small"
                            onClick={() => api.download(`/applications/${id}/offer-letter`, `Offer — ${app.full_name}.pdf`)}>
                      Download it
                    </button>{' '}
                    Choosing a new file replaces it.
                  </p>
                )}
              </div>

              <div className="field-row">
                <div className="field">
                  <label htmlFor="o_designation">Designation offered</label>
                  <input id="o_designation" value={offer.offer_designation}
                         placeholder={app.offer_designation || app.position_applied}
                         onChange={(e) => setOffer({ ...offer, offer_designation: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="o_ctc">Annual salary fixed (₹)</label>
                  <input id="o_ctc" type="number" min="0" value={offer.offered_ctc}
                         placeholder={app.offered_ctc || ''}
                         onChange={(e) => setOffer({ ...offer, offered_ctc: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="o_doj">Date of joining</label>
                  <input id="o_doj" type="date" value={offer.offer_joining_date}
                         onChange={(e) => setOffer({ ...offer, offer_joining_date: e.target.value })} />
                </div>
              </div>

              <button type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save offer letter'}
              </button>
            </form>
          </Section>

          <Section title="History">
            <ul className="timeline">
              {app.history.map((h) => (
                <li key={h.id}>
                  <span className={`chip ${h.to_status}`}>{STATUS_LABEL[h.to_status]}</span>
                  <div className="sub" style={{ marginTop: 4 }}>
                    {dateTime(h.created_at)} · {h.changed_by_name || 'Candidate'}
                  </div>
                  {h.note && <div style={{ marginTop: 4 }}>{h.note}</div>}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <FormDetails d={app.details} />
      </div>
    </>
  );
}
