import { useState } from 'react';
import { api, useAuth } from '../api.jsx';

export default function Settings() {
  const { user } = useAuth();
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const savePassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setError('');
    try {
      const body = Object.fromEntries(new FormData(e.target));
      await api.post('/auth/change-password', body);
      setMsg('Password changed.');
      e.target.reset();
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
          <div className="eyebrow">Your account</div>
          <h1>Settings</h1>
          <div className="sub">
            {user.role === 'SUPER_ADMIN'
              ? 'Super admin — every group company'
              : `HR admin — ${(user.companies || []).map((c) => c.code).join(', ')}`}
          </div>
        </div>
      </div>

      {msg && <div className="success" style={{ marginBottom: 16 }}>{msg}</div>}
      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <form className="panel" onSubmit={savePassword}>
          <div className="panel-head"><h2>Password</h2></div>
          <div className="panel-body">
            <div className="field">
              <label htmlFor="current_password">Current password</label>
              <input id="current_password" name="current_password" type="password"
                     autoComplete="current-password" required />
            </div>
            <div className="field">
              <label htmlFor="new_password">New password</label>
              <input id="new_password" name="new_password" type="password"
                     autoComplete="new-password" minLength={8} required />
            </div>
            <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
          </div>
        </form>

        <div className="panel">
          <div className="panel-head"><h2>Your account</h2></div>
          <div className="panel-body">
            <dl className="kv">
              <dt>Name</dt><dd>{user.name}</dd>
              <dt>Sign-in email</dt><dd>{user.email}</dd>
              <dt>Role</dt><dd>{user.role === 'SUPER_ADMIN' ? 'Super admin' : 'HR admin'}</dd>
              <dt>Companies</dt>
              <dd>
                {user.role === 'SUPER_ADMIN'
                  ? 'All group companies'
                  : (user.companies || []).map((c) => c.name).join(', ') || '—'}
              </dd>
            </dl>
            <p className="sub" style={{ marginTop: 14, marginBottom: 0 }}>
              Only the super admin can change your role or the companies you look after.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
