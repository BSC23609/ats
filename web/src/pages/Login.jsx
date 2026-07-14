import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../api.jsx';

/**
 * The backdrop is a portal frame — the structure Metfraa actually erects — drawn in the
 * brand blue and fading out toward the middle so it never fights the form. Steel, not decoration.
 */
function Frame() {
  return (
    <svg className="signin-art" viewBox="0 0 1400 900" preserveAspectRatio="xMidYMid slice"
         aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0064a0" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#0064a0" stopOpacity="0.06" />
        </linearGradient>
        <linearGradient id="fadeR" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0064a0" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#0064a0" stopOpacity="0.05" />
        </linearGradient>
      </defs>

      <g stroke="url(#fade)" fill="none" strokeWidth="2">
        {/* left portal: columns, rafters, and the diagonal bracing between bays */}
        <path d="M-20 860 V300 L240 180 L500 300 V860" />
        <path d="M50 860 V335 M170 860 V275 M310 860 V275 M430 860 V335" />
        <path d="M-20 300 L500 300 M-20 420 L500 420 M-20 560 L500 560" strokeWidth="1" />
        <path d="M-20 300 L240 560 M500 300 L240 560" strokeWidth="1" strokeDasharray="7 7" />
      </g>

      <g stroke="url(#fadeR)" fill="none" strokeWidth="2">
        {/* right portal, mirrored, quieter */}
        <path d="M900 860 V300 L1160 180 L1420 300 V860" />
        <path d="M970 860 V335 M1090 860 V275 M1230 860 V275 M1350 860 V335" />
        <path d="M900 300 L1420 300 M900 420 L1420 420 M900 560 L1420 560" strokeWidth="1" />
        <path d="M900 300 L1160 560 M1420 300 L1160 560" strokeWidth="1" strokeDasharray="7 7" />
      </g>

      {/* the ground line the whole thing stands on */}
      <path d="M0 860 H1400" stroke="#0064a0" strokeOpacity="0.3" strokeWidth="2" />
    </svg>
  );
}

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
      <Frame />

      <div className="signin-card">
        <img src="/brand/group.png" alt="The Bharat Steel Group" className="signin-logo" />

        <div className="signin-rule">
          <i style={{ background: '#0064a0' }} />
          <i style={{ background: '#005a96' }} />
          <i style={{ background: '#466e8c' }} />
          <i style={{ background: '#0a6eb4' }} />
        </div>

        <div className="eyebrow" style={{ marginBottom: 8 }}>Recruitment</div>
        <h1>Sign in</h1>
        <p className="lead">For HR admins. Candidates apply through the careers page.</p>

        <form onSubmit={submit}>
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
        </form>

        <div className="signin-foot">
          Applying for a job? <Link to="/careers">See the open roles</Link>
        </div>
      </div>
    </div>
  );
}
