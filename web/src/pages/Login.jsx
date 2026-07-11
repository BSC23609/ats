import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../api.jsx';

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
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center">
      <div className="login">
        <div className="public-head">
          <div className="mark">BHARAT STEEL GROUP</div>
          <div className="sub">Recruitment · HR sign-in</div>
        </div>

        <form onSubmit={submit} className="panel">
          <div className="panel-body">
            {error && <div className="error" style={{ marginBottom: 14 }}>{error}</div>}
            <div className="field">
              <label htmlFor="email">Work email</label>
              <input id="email" type="email" autoComplete="username" value={email}
                     onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" autoComplete="current-password" value={password}
                     onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button type="submit" disabled={busy} style={{ width: '100%' }}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>

        <p className="sub" style={{ marginTop: 16, textAlign: 'center' }}>
          Applying for a job? <Link to="/careers">See open roles</Link>
        </p>
      </div>
    </div>
  );
}
