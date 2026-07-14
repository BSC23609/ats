import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../api.jsx';

const COMPANIES = [
  ['Bharat Steel (Chennai)', '#0064a0'],
  ['Metfraa Steel Buildings', '#005a96'],
  ['Crayon Roofings & Structures', '#466e8c'],
  ['G2 Steel Services', '#0a6eb4'],
];

export default function Login() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="center">Loading…</div>;
  if (user) return <Navigate to="/pipeline" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate('/pipeline');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="signin">
      {/* The mark at full size, against ink — not shrunk into the corner of a form. */}
      <div className="signin-brand">
        <div>
          <span className="plate">
            <img src="/brand/group.png" alt="The Bharat Steel Group" />
          </span>
          <div className="signin-lede">Hiring across four companies, in one place.</div>
        </div>

        <div className="signin-cos">
          {COMPANIES.map(([name, colour]) => (
            <span key={name}>
              <i style={{ background: colour }} />
              {name}
            </span>
          ))}
        </div>
      </div>

      <div className="signin-form">
        <form className="inner" onSubmit={submit}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Recruitment</div>
          <h1>Sign in</h1>
          <p className="lead">For HR admins. Candidates apply through the careers page.</p>

          {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

          <div className="field">
            <label htmlFor="email">Work email</label>
            <input id="email" type="email" autoComplete="username" autoFocus
                   value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password"
                   value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>

          <div className="signin-foot">
            Applying for a job? <Link to="/careers">See the open roles</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
