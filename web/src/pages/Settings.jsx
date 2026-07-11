import { useEffect, useState } from 'react';
import { api, useAuth } from '../api.jsx';

export default function Settings() {
  const { user } = useAuth();
  const [me, setMe] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get('/auth/me').then(setMe); }, []);
  if (!me) return <div className="empty">Loading…</div>;

  const saveMail = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(''); setError('');
    try {
      const body = Object.fromEntries(new FormData(e.target));
      await api.put('/auth/email-settings', body);
      setMsg('Outgoing email saved. Offer letters will go out from this mailbox.');
      api.get('/auth/me').then(setMe);
      e.target.smtp_pass.value = '';
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(''); setError('');
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
              ? 'Super admin — all group companies'
              : `HR admin — ${(user.companies || []).map((c) => c.code).join(', ')}`}
          </div>
        </div>
      </div>

      {msg && <div className="success" style={{ marginBottom: 16 }}>{msg}</div>}
      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <form className="panel" onSubmit={saveMail}>
          <div className="panel-head">
            <h2>Outgoing email</h2>
            <span className="chip">{me.smtp_password_set ? 'Ready' : 'Not set up'}</span>
          </div>
          <div className="panel-body">
            <p style={{ marginTop: 0 }}>
              Offer letters are sent from <strong>your</strong> mailbox, so the candidate replies to you and the thread
              stays in your inbox. For Microsoft 365 use <code>smtp.office365.com</code> on port 587 with an app
              password — not your normal sign-in password.
            </p>

            <div className="field-row">
              <div className="field">
                <label htmlFor="smtp_host">Mail server</label>
                <input id="smtp_host" name="smtp_host" required defaultValue={me.smtp_host || 'smtp.office365.com'} />
              </div>
              <div className="field">
                <label htmlFor="smtp_port">Port</label>
                <input id="smtp_port" name="smtp_port" type="number" defaultValue={me.smtp_port || 587} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="from_email">Send from</label>
              <input id="from_email" name="from_email" type="email" required
                     defaultValue={me.from_email || me.email} />
            </div>
            <div className="field">
              <label htmlFor="smtp_user">Mailbox username</label>
              <input id="smtp_user" name="smtp_user" required defaultValue={me.smtp_user || me.email} />
            </div>
            <div className="field">
              <label htmlFor="smtp_pass">App password</label>
              <input id="smtp_pass" name="smtp_pass" type="password"
                     placeholder={me.smtp_password_set ? 'Stored — leave blank to keep it' : ''} />
            </div>
            <div className="field">
              <label htmlFor="signature">Signature under the letter</label>
              <input id="signature" name="signature" defaultValue={me.signature || ''}
                     placeholder="Manager — Human Resources" />
            </div>

            <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save email settings'}</button>
          </div>
        </form>

        <form className="panel" onSubmit={savePassword}>
          <div className="panel-head"><h2>Password</h2></div>
          <div className="panel-body">
            <div className="field">
              <label htmlFor="current_password">Current password</label>
              <input id="current_password" name="current_password" type="password" autoComplete="current-password" required />
            </div>
            <div className="field">
              <label htmlFor="new_password">New password</label>
              <input id="new_password" name="new_password" type="password" autoComplete="new-password"
                     minLength={8} required />
            </div>
            <button type="submit" disabled={busy}>Change password</button>
          </div>
        </form>
      </div>
    </>
  );
}
