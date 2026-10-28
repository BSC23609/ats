import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../api.jsx';

/** Landing page for the group portal's one-click sign-in: /auth/sso?token=…&next=/pipeline */
export default function GroupSso() {
  const { ssoLogin } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // React dev mode runs effects twice; the token is single-use in spirit
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || '';
    const next = params.get('next') || '';
    window.history.replaceState(null, '', '/auth/sso'); // keep the token out of history
    ssoLogin(token)
      .then(() => navigate(next.startsWith('/') && !next.startsWith('//') ? next : '/pipeline', { replace: true }))
      .catch((e) => setError(e.message || 'Group sign-in could not be completed.'));
  }, [ssoLogin, navigate]);

  if (!error) return <div className="center">Signing you in…</div>;
  return (
    <div className="center" style={{ flexDirection: 'column', gap: 12, textAlign: 'center' }}>
      <h2>Could not sign you in</h2>
      <p>{error}</p>
      <Link to="/login">Sign in with your email and password</Link>
    </div>
  );
}
