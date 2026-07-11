import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.jsx';

/* Repeatable table blocks — children, siblings, emergency contacts, education, employment */
function Rows({ label, cols, rows, setRows, blank, min = 1 }) {
  const update = (i, key, value) => setRows(rows.map((r, n) => (n === i ? { ...r, [key]: value } : r)));
  return (
    <div style={{ marginBottom: 14 }}>
      <label>{label}</label>
      {rows.map((row, i) => (
        <div key={i} className="field-row" style={{ marginBottom: 8, alignItems: 'end' }}>
          {cols.map((c) => (
            <div key={c.key}>
              <input
                placeholder={c.label}
                aria-label={`${label} ${i + 1} — ${c.label}`}
                type={c.type || 'text'}
                value={row[c.key] || ''}
                onChange={(e) => update(i, c.key, e.target.value)}
              />
            </div>
          ))}
          <div style={{ maxWidth: 90 }}>
            <button type="button" className="ghost small"
                    disabled={rows.length <= min}
                    onClick={() => setRows(rows.filter((_, n) => n !== i))}>
              Remove
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="ghost small" onClick={() => setRows([...rows, { ...blank }])}>
        + Add row
      </button>
    </div>
  );
}

const Field = ({ id, label, req, ...rest }) => (
  <div className="field">
    <label htmlFor={id}>{label} {req && <span className="req">*</span>}</label>
    <input id={id} name={id} required={req} {...rest} />
  </div>
);

export default function FullForm() {
  const { token } = useParams();
  const [app, setApp] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const [children, setChildren] = useState([{ name: '', dob: '' }]);
  const [siblings, setSiblings] = useState([{ name: '', age: '', gender: '', marital: '', occupation: '' }]);
  const [emergency, setEmergency] = useState([{ name: '', relationship: '', contact: '' }]);
  const [education, setEducation] = useState([
    { exam: 'SSLC', class_marks: '', institution: '', from: '', to: '', year: '', specialisation: '' },
  ]);
  const [employment, setEmployment] = useState([
    { employer: '', designation_joining: '', designation_leaving: '', from: '', to: '',
      salary_joining: '', salary_leaving: '', reason_for_leaving: '' },
  ]);
  const [referees, setReferees] = useState([{ name: '', designation: '', contact: '' }]);

  useEffect(() => {
    api.get(`/public/form/${token}`).then(setApp).catch((e) => setError(e.message));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const fd = Object.fromEntries(new FormData(e.target));

    const details = {
      ...fd,
      children: children.filter((c) => c.name),
      siblings: siblings.filter((s) => s.name),
      emergency_contacts: emergency.filter((c) => c.name),
      education: education.filter((c) => c.exam),
      employment: employment.filter((c) => c.employer),
      previous_hr_contacts: referees.filter((c) => c.name),
      submitted_at: new Date().toISOString(),
    };

    try {
      await api.post(`/public/form/${token}`, { details });
      setDone(true);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !app) return <div className="public"><div className="error">{error}</div></div>;
  if (!app) return <div className="center">Loading…</div>;

  if (done || app.stage2_submitted_at)
    return (
      <div className="public">
        <div className="public-head">
          <div className="mark">{app.company_name}</div>
          <div className="sub">Application form · {app.ref_code}</div>
        </div>
        <div className="success" style={{ padding: 20 }}>
          <h2 style={{ marginBottom: 8 }}>Form submitted</h2>
          <p style={{ margin: 0 }}>
            Thank you, {app.full_name}. Your completed application form has reached HR. If you need to change anything,
            ask the HR team to reopen the form for you.
          </p>
        </div>
      </div>
    );

  return (
    <div className="public">
      <div className="public-head" style={{ borderBottomColor: app.colour }}>
        <div className="mark">{app.company_name}</div>
        <div className="sub">Application form · {app.ref_code} · {app.full_name}</div>
      </div>

      <div className="note" style={{ marginBottom: 22 }}>
        Fill in every item. Where something does not apply, write <strong>NA</strong>. You can only submit this form
        once — check your entries before you send it.
      </div>

      <form onSubmit={submit}>
        {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

        <fieldset>
          <legend>Personal</legend>
          <div className="field-row">
            <Field id="position_applied" label="Position applied for" req defaultValue={app.position_applied} />
            <Field id="full_name" label="Name in full (block letters)" req defaultValue={app.full_name}
                   style={{ textTransform: 'uppercase' }} />
          </div>
          <div className="field-row">
            <Field id="date_of_birth" label="Date of birth" type="date" req />
            <Field id="age" label="Age" type="number" min="15" max="80" req />
            <Field id="blood_group" label="Blood group" placeholder="O+" req />
            <Field id="native_place" label="Native place" req />
          </div>
          <div className="field-row">
            <Field id="pan" label="PAN number" placeholder="ABCDE1234F" req />
            <Field id="aadhaar" label="Aadhaar number" inputMode="numeric" req />
          </div>
          <div className="field-row">
            <Field id="phone" label="Contact number" req defaultValue={app.phone} />
            <Field id="email" label="Email" type="email" req defaultValue={app.email} />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="permanent_address">Permanent address with PIN code and phone <span className="req">*</span></label>
              <textarea id="permanent_address" name="permanent_address" required />
            </div>
            <div className="field">
              <label htmlFor="present_address">Present address with PIN code and phone <span className="req">*</span></label>
              <textarea id="present_address" name="present_address" required />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Marital status</legend>
          <div className="field-row">
            <div className="field">
              <label htmlFor="marital_status">Status <span className="req">*</span></label>
              <select id="marital_status" name="marital_status" required defaultValue="">
                <option value="" disabled>Select</option>
                <option>Single</option><option>Married</option><option>Widower</option><option>Divorced</option>
              </select>
            </div>
            <Field id="spouse_name" label="Husband / wife's name" placeholder="NA if single" />
            <Field id="spouse_occupation" label="Occupation of spouse" placeholder="NA if single" />
          </div>
          <Rows label="Children" min={0}
                cols={[{ key: 'name', label: 'Name of child' }, { key: 'dob', label: 'Date of birth', type: 'date' }]}
                rows={children} setRows={setChildren} blank={{ name: '', dob: '' }} />
        </fieldset>

        <fieldset>
          <legend>Family background</legend>
          <div className="field-row">
            <Field id="father_name" label="Father's name" req />
            <Field id="father_age" label="Age" type="number" min="0" />
            <Field id="father_occupation" label="Occupation / place" />
          </div>
          <div className="field-row">
            <Field id="mother_name" label="Mother's name" req />
            <Field id="mother_age" label="Age" type="number" min="0" />
            <Field id="mother_occupation" label="Occupation / place" />
          </div>
          <Rows label="Brothers and sisters" min={0}
                cols={[
                  { key: 'name', label: 'Name' },
                  { key: 'age', label: 'Age', type: 'number' },
                  { key: 'gender', label: 'M / F' },
                  { key: 'marital', label: 'Single / Married' },
                  { key: 'occupation', label: 'Occupation / place' },
                ]}
                rows={siblings} setRows={setSiblings}
                blank={{ name: '', age: '', gender: '', marital: '', occupation: '' }} />
        </fieldset>

        <fieldset>
          <legend>Emergency contacts — family members only</legend>
          <Rows label="Emergency contacts"
                cols={[
                  { key: 'name', label: 'Name of the person' },
                  { key: 'relationship', label: 'Relationship' },
                  { key: 'contact', label: 'Contact number' },
                ]}
                rows={emergency} setRows={setEmergency} blank={{ name: '', relationship: '', contact: '' }} />
        </fieldset>

        <fieldset>
          <legend>Education — academic and technical, starting with SSLC</legend>
          <Rows label="Qualifications"
                cols={[
                  { key: 'exam', label: 'Exam passed' },
                  { key: 'class_marks', label: 'Class / marks' },
                  { key: 'institution', label: 'School / college and place' },
                  { key: 'from', label: 'From (year)' },
                  { key: 'to', label: 'To (year)' },
                  { key: 'specialisation', label: 'Electives / specialisation' },
                ]}
                rows={education} setRows={setEducation}
                blank={{ exam: '', class_marks: '', institution: '', from: '', to: '', specialisation: '' }} />
        </fieldset>

        <fieldset>
          <legend>Previous employment</legend>
          <Rows label="Employers — most recent first" min={0}
                cols={[
                  { key: 'employer', label: 'Company name and full address with PIN' },
                  { key: 'designation_joining', label: 'Designation on joining' },
                  { key: 'designation_leaving', label: 'Designation while leaving' },
                  { key: 'from', label: 'From', type: 'month' },
                  { key: 'to', label: 'To', type: 'month' },
                  { key: 'salary_joining', label: 'Salary on joining (₹ PA)', type: 'number' },
                  { key: 'salary_leaving', label: 'Salary while leaving (₹ PA)', type: 'number' },
                  { key: 'reason_for_leaving', label: 'Reason for leaving' },
                ]}
                rows={employment} setRows={setEmployment}
                blank={{ employer: '', designation_joining: '', designation_leaving: '', from: '', to: '',
                         salary_joining: '', salary_leaving: '', reason_for_leaving: '' }} />

          <Rows label="Previous company HR contact — for reference check" min={0}
                cols={[
                  { key: 'name', label: 'HR contact name' },
                  { key: 'designation', label: 'Designation' },
                  { key: 'contact', label: 'Phone or email' },
                ]}
                rows={referees} setRows={setReferees} blank={{ name: '', designation: '', contact: '' }} />
        </fieldset>

        <fieldset>
          <legend>Joining</legend>
          <div className="field-row">
            <Field id="expected_salary" label="Expected salary (₹ per annum)" type="number" min="0" req
                   defaultValue={app.expected_ctc || ''} />
            <Field id="earliest_joining_date" label="Date you can join if selected" type="date" req />
            <Field id="state_of_health" label="State of health" placeholder="Good" req />
          </div>
        </fieldset>

        <fieldset>
          <legend>Declaration</legend>
          <p style={{ marginTop: 0 }}>
            I declare that the particulars furnished above are true to the best of my knowledge and belief.
          </p>
          <div className="field-row">
            <Field id="declaration_place" label="Place" req defaultValue="Chennai" />
            <Field id="declaration_date" label="Date" type="date" req
                   defaultValue={new Date().toISOString().slice(0, 10)} />
            <Field id="declaration_signature" label="Type your full name as signature" req />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>
              <input type="checkbox" name="declaration_accepted" required style={{ width: 'auto', marginRight: 8 }} />
              I accept the declaration above.
            </label>
          </div>
        </fieldset>

        <button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit application form'}</button>
      </form>
    </div>
  );
}
