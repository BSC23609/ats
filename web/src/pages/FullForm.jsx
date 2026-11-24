import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.jsx';
import { CompanyLogo } from '../components/Logo.jsx';

// Relationship options for an emergency contact (family members).
const RELATIONSHIPS = [
  'Father', 'Mother', 'Husband', 'Wife', 'Son', 'Daughter', 'Brother', 'Sister',
  'Grandfather', 'Grandmother', 'Father-in-law', 'Mother-in-law', 'Brother-in-law',
  'Sister-in-law', 'Uncle', 'Aunt', 'Guardian', 'Other',
];

// Nationalities (demonyms). Indian is the default selection.
const NATIONALITIES = [
  'Afghan', 'Albanian', 'Algerian', 'American', 'Andorran', 'Angolan', 'Antiguan', 'Argentine',
  'Armenian', 'Australian', 'Austrian', 'Azerbaijani', 'Bahamian', 'Bahraini', 'Bangladeshi',
  'Barbadian', 'Belarusian', 'Belgian', 'Belizean', 'Beninese', 'Bhutanese', 'Bolivian', 'Bosnian',
  'Botswanan', 'Brazilian', 'British', 'Bruneian', 'Bulgarian', 'Burkinabe', 'Burmese', 'Burundian',
  'Cambodian', 'Cameroonian', 'Canadian', 'Cape Verdean', 'Central African', 'Chadian', 'Chilean',
  'Chinese', 'Colombian', 'Comoran', 'Congolese', 'Costa Rican', 'Croatian', 'Cuban', 'Cypriot',
  'Czech', 'Danish', 'Djiboutian', 'Dominican', 'Dutch', 'East Timorese', 'Ecuadorean', 'Egyptian',
  'Emirati', 'Equatorial Guinean', 'Eritrean', 'Estonian', 'Ethiopian', 'Fijian', 'Filipino',
  'Finnish', 'French', 'Gabonese', 'Gambian', 'Georgian', 'German', 'Ghanaian', 'Greek', 'Grenadian',
  'Guatemalan', 'Guinean', 'Guinea-Bissauan', 'Guyanese', 'Haitian', 'Honduran', 'Hungarian',
  'Icelandic', 'Indian', 'Indonesian', 'Iranian', 'Iraqi', 'Irish', 'Israeli', 'Italian', 'Ivorian',
  'Jamaican', 'Japanese', 'Jordanian', 'Kazakh', 'Kenyan', 'Kiribati', 'Kosovar', 'Kuwaiti', 'Kyrgyz',
  'Laotian', 'Latvian', 'Lebanese', 'Liberian', 'Libyan', 'Liechtensteiner', 'Lithuanian',
  'Luxembourger', 'Macedonian', 'Malagasy', 'Malawian', 'Malaysian', 'Maldivian', 'Malian', 'Maltese',
  'Marshallese', 'Mauritanian', 'Mauritian', 'Mexican', 'Micronesian', 'Moldovan', 'Monégasque',
  'Mongolian', 'Montenegrin', 'Moroccan', 'Mozambican', 'Namibian', 'Nauruan', 'Nepali',
  'New Zealander', 'Nicaraguan', 'Nigerien', 'Nigerian', 'North Korean', 'Norwegian', 'Omani',
  'Pakistani', 'Palauan', 'Palestinian', 'Panamanian', 'Papua New Guinean', 'Paraguayan', 'Peruvian',
  'Polish', 'Portuguese', 'Qatari', 'Romanian', 'Russian', 'Rwandan', 'Saint Lucian', 'Salvadoran',
  'Samoan', 'San Marinese', 'Saudi', 'Senegalese', 'Serbian', 'Seychellois', 'Sierra Leonean',
  'Singaporean', 'Slovak', 'Slovenian', 'Solomon Islander', 'Somali', 'South African', 'South Korean',
  'South Sudanese', 'Spanish', 'Sri Lankan', 'Sudanese', 'Surinamese', 'Swazi', 'Swedish', 'Swiss',
  'Syrian', 'Taiwanese', 'Tajik', 'Tanzanian', 'Thai', 'Togolese', 'Tongan', 'Trinidadian', 'Tunisian',
  'Turkish', 'Turkmen', 'Tuvaluan', 'Ugandan', 'Ukrainian', 'Uruguayan', 'Uzbek', 'Vanuatuan',
  'Venezuelan', 'Vietnamese', 'Yemeni', 'Zambian', 'Zimbabwean', 'Other',
];

// Years for the education From/To dropdowns — this year down to 1970.
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR - 1970 + 1 }, (_, i) => String(THIS_YEAR - i));

// Degree options for undergraduate / post-graduate.
const UG_DEGREES = [
  'B.E', 'B.Tech', 'B.Sc', 'B.Com', 'B.A', 'BBA', 'BCA', 'B.Arch', 'B.Pharm', 'LLB', 'B.Ed',
  'Diploma', 'Other',
];
const PG_DEGREES = [
  'M.E', 'M.Tech', 'M.Sc', 'M.Com', 'M.A', 'MBA', 'MCA', 'M.Pharm', 'LLM', 'M.Ed', 'Ph.D', 'Other',
];

// Specialisation / branch options for undergraduate & post-graduate degrees.
const SPECIALISATIONS = [
  'Mechanical Engineering', 'Civil Engineering', 'Electrical Engineering',
  'Electrical & Electronics Engineering (EEE)', 'Electronics & Communication Engineering (ECE)',
  'Computer Science Engineering (CSE)', 'Information Technology (IT)', 'Production Engineering',
  'Industrial Engineering', 'Automobile Engineering', 'Metallurgical Engineering',
  'Chemical Engineering', 'Instrumentation Engineering', 'Mechatronics Engineering',
  'Aeronautical Engineering', 'Structural Engineering', 'Construction Engineering & Management',
  'Commerce', 'Accounting & Finance', 'Business Administration', 'Marketing', 'Finance',
  'Human Resources (HR)', 'Operations Management', 'Supply Chain & Logistics', 'Economics',
  'Mathematics', 'Physics', 'Chemistry', 'Statistics', 'Computer Applications', 'Other',
];

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
              {c.type === 'select' ? (
                <select
                  aria-label={`${label} ${i + 1} — ${c.label}`}
                  value={row[c.key] || ''}
                  onChange={(e) => update(i, c.key, e.target.value)}
                >
                  <option value="">{c.label}</option>
                  {c.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  placeholder={c.label}
                  aria-label={`${label} ${i + 1} — ${c.label}`}
                  type={c.type || 'text'}
                  value={row[c.key] || ''}
                  onChange={(e) => update(i, c.key, e.target.value)}
                />
              )}
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

// A dropdown that posts with the rest of the form (its `name` lands in FormData like any input).
const SelectField = ({ id, label, req, options, defaultValue = '' }) => (
  <div className="field">
    <label htmlFor={id}>{label} {req && <span className="req">*</span>}</label>
    <select id={id} name={id} required={req} defaultValue={defaultValue}>
      <option value="" disabled>Select</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

export default function FullForm() {
  const { token } = useParams();
  const [app, setApp] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [marital, setMarital] = useState('');     // controls whether spouse/children fields show

  // Addresses are controlled so "same as permanent" can mirror one into the other.
  const [permanentAddr, setPermanentAddr] = useState('');
  const [presentAddr, setPresentAddr] = useState('');
  const [sameAddr, setSameAddr] = useState(false);

  const [children, setChildren] = useState([{ name: '', dob: '' }]);
  const [siblings, setSiblings] = useState([{ relation: '', age: '', gender: '', occupation: '', marital: '' }]);
  const [emergency, setEmergency] = useState([{ name: '', relationship: '', contact: '' }]);
  // Four fixed education levels, each with its own fields.
  const [edu, setEdu] = useState({
    sslc: { grade: '', school: '', from: '', to: '' },
    hsc:  { type: '', grade: '', school: '', specialisation: '', from: '', to: '' },
    ug:   { degree: '', grade: '', college: '', specialisation: '', from: '', to: '' },
    pg:   { degree: '', grade: '', college: '', specialisation: '', from: '', to: '' },
  });
  const eduSet = (level, key, val) => setEdu((e) => ({ ...e, [level]: { ...e[level], [key]: val } }));
  const yearSelect = (level, key, ph) => (
    <select value={edu[level][key]} onChange={(e) => eduSet(level, key, e.target.value)}>
      <option value="">{ph}</option>
      {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
    </select>
  );
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
      siblings: siblings.filter((s) => s.relation),
      emergency_contacts: emergency.filter((c) => c.name),
      education: edu,
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
          <CompanyLogo code={app.company_code} name={app.company_name} className="public-logo" />
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
        <CompanyLogo code={app.company_code} name={app.company_name} className="public-logo" />
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
            <SelectField id="gender" label="Gender" req options={['Female', 'Male']} />
            <SelectField id="blood_group" label="Blood group" req
                         options={['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']} />
          </div>
          <div className="field-row">
            <SelectField id="nationality" label="Nationality" req options={NATIONALITIES} defaultValue="Indian" />
            <Field id="native_place" label="Native place" req />
            <SelectField id="physically_handicapped" label="Physically handicapped" req
                         options={['No', 'Yes']} defaultValue="No" />
          </div>
          <div className="field-row">
            <Field id="pan" label="PAN number" placeholder="ABCDE1234F" req />
            <Field id="aadhaar" label="Aadhaar number" inputMode="numeric" req />
          </div>
          <div className="field-row">
            <Field id="pf_number" label="PF number" placeholder="NA if none" />
            <Field id="uan_number" label="UAN number" placeholder="NA if none" />
          </div>
          <div className="field-row">
            <Field id="phone" label="Contact number" req defaultValue={app.phone} />
            <Field id="email" label="Email" type="email" req defaultValue={app.email} />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="permanent_address">Permanent address with PIN code and phone <span className="req">*</span></label>
              <textarea id="permanent_address" name="permanent_address" required
                        value={permanentAddr}
                        onChange={(e) => { setPermanentAddr(e.target.value); if (sameAddr) setPresentAddr(e.target.value); }} />
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, fontWeight: 400 }}>
                <input type="checkbox" checked={sameAddr} style={{ width: 'auto' }}
                       onChange={(e) => { setSameAddr(e.target.checked); if (e.target.checked) setPresentAddr(permanentAddr); }} />
                Present address is the same as permanent
              </label>
            </div>
            <div className="field">
              <label htmlFor="present_address">Present address with PIN code and phone <span className="req">*</span></label>
              <textarea id="present_address" name="present_address" required
                        value={sameAddr ? permanentAddr : presentAddr} readOnly={sameAddr}
                        onChange={(e) => setPresentAddr(e.target.value)} />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Marital status</legend>
          <div className="field-row">
            <div className="field">
              <label htmlFor="marital_status">Status <span className="req">*</span></label>
              <select id="marital_status" name="marital_status" required
                      value={marital} onChange={(e) => setMarital(e.target.value)}>
                <option value="" disabled>Select</option>
                <option>Single</option><option>Married</option><option>Widower</option><option>Divorced</option>
              </select>
            </div>
            {marital && marital !== 'Single' && (
              <>
                <Field id="spouse_name" label="Husband / wife's name" />
                <Field id="spouse_occupation" label="Occupation of spouse" />
              </>
            )}
          </div>
          {marital && marital !== 'Single' && (
            <Rows label="Children" min={0}
                  cols={[{ key: 'name', label: 'Name of child' }, { key: 'dob', label: 'Date of birth', type: 'date' }]}
                  rows={children} setRows={setChildren} blank={{ name: '', dob: '' }} />
          )}
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
          <Rows label="Siblings" min={0}
                cols={[
                  { key: 'relation', label: 'Relationship (e.g. Elder brother)' },
                  { key: 'age', label: 'Age', type: 'number' },
                  { key: 'gender', label: 'Gender' },
                  { key: 'occupation', label: 'Occupation / place' },
                  { key: 'marital', label: 'Marital status' },
                ]}
                rows={siblings} setRows={setSiblings}
                blank={{ relation: '', age: '', gender: '', occupation: '', marital: '' }} />
        </fieldset>

        <fieldset>
          <legend>Emergency contacts — family members only</legend>
          <Rows label="Emergency contacts"
                cols={[
                  { key: 'name', label: 'Name of the person' },
                  { key: 'relationship', label: 'Relationship', type: 'select', options: RELATIONSHIPS },
                  { key: 'contact', label: 'Contact number' },
                ]}
                rows={emergency} setRows={setEmergency} blank={{ name: '', relationship: '', contact: '' }} />
        </fieldset>

        <fieldset>
          <legend>Education — academic and technical, starting with SSLC</legend>

          <div style={{ marginBottom: 14 }}>
            <label>SSLC</label>
            <div className="field-row">
              <input placeholder="Grade / % / CGP" value={edu.sslc.grade}
                     onChange={(e) => eduSet('sslc', 'grade', e.target.value)} />
              <input placeholder="School name" value={edu.sslc.school}
                     onChange={(e) => eduSet('sslc', 'school', e.target.value)} />
              {yearSelect('sslc', 'from', 'From year')}
              {yearSelect('sslc', 'to', 'To year')}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label>HSC</label>
            <div className="field-row">
              <select value={edu.hsc.type} onChange={(e) => eduSet('hsc', 'type', e.target.value)}>
                <option value="" disabled>Select</option>
                <option>12th</option>
                <option>ITI</option>
                <option>Polytechnic</option>
              </select>
              <input placeholder="Grade / % / CGP" value={edu.hsc.grade}
                     onChange={(e) => eduSet('hsc', 'grade', e.target.value)} />
              <input placeholder="School name" value={edu.hsc.school}
                     onChange={(e) => eduSet('hsc', 'school', e.target.value)} />
              <input placeholder="Specialisation / stream" value={edu.hsc.specialisation}
                     onChange={(e) => eduSet('hsc', 'specialisation', e.target.value)} />
              {yearSelect('hsc', 'from', 'From year')}
              {yearSelect('hsc', 'to', 'To year')}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label>Undergraduate</label>
            <div className="field-row">
              <select value={edu.ug.degree} onChange={(e) => eduSet('ug', 'degree', e.target.value)}>
                <option value="" disabled>Degree</option>
                {UG_DEGREES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <select value={edu.ug.specialisation} onChange={(e) => eduSet('ug', 'specialisation', e.target.value)}>
                <option value="" disabled>Specialisation</option>
                {SPECIALISATIONS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <input placeholder="Grade / % / CGP" value={edu.ug.grade}
                     onChange={(e) => eduSet('ug', 'grade', e.target.value)} />
              <input placeholder="College name" value={edu.ug.college}
                     onChange={(e) => eduSet('ug', 'college', e.target.value)} />
              {yearSelect('ug', 'from', 'From year')}
              {yearSelect('ug', 'to', 'To year')}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label>Post Graduate</label>
            <div className="field-row">
              <select value={edu.pg.degree} onChange={(e) => eduSet('pg', 'degree', e.target.value)}>
                <option value="" disabled>Degree</option>
                {PG_DEGREES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <select value={edu.pg.specialisation} onChange={(e) => eduSet('pg', 'specialisation', e.target.value)}>
                <option value="" disabled>Specialisation</option>
                {SPECIALISATIONS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <input placeholder="Grade / % / CGP" value={edu.pg.grade}
                     onChange={(e) => eduSet('pg', 'grade', e.target.value)} />
              <input placeholder="College name" value={edu.pg.college}
                     onChange={(e) => eduSet('pg', 'college', e.target.value)} />
              {yearSelect('pg', 'from', 'From year')}
              {yearSelect('pg', 'to', 'To year')}
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Previous employment</legend>
          <Rows label="Employers — most recent first" min={0}
                cols={[
                  { key: 'employer', label: 'Company name and full address with PIN' },
                  { key: 'designation_joining', label: 'Designation on joining' },
                  { key: 'designation_leaving', label: 'Designation while leaving' },
                  { key: 'from', label: 'Joining date', type: 'date' },
                  { key: 'to', label: 'Leaving date', type: 'date' },
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
