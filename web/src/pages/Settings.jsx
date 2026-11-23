import { useState } from 'react';
import { api, useAuth } from '../api.jsx';

export default function Settings() {
  const { user } = useAuth();
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [wati, setWati] = useState(null);     // {loading} | result JSON
  const [reorg, setReorg] = useState(null);   // OneDrive resume tidy-up result

  const testWati = async () => {
    setWati({ loading: true });
    try {
      const res = await api.get('/auth/wati-test');   // uses my number on file
      setWati(res);
    } catch (err) {
      setWati({ error: err.message });
    }
  };

  const previewReorg = async () => {
    setReorg({ loading: true });
    try { setReorg(await api.get('/jobs/onedrive/reorganize')); }
    catch (err) { setReorg({ error: err.message }); }
  };
  const applyReorg = async () => {
    if (!window.confirm('Re-file every resume under its Company/Role folder and merge the duplicate folders in OneDrive? This moves files.')) return;
    setReorg({ loading: true });
    try { setReorg(await api.get('/jobs/onedrive/reorganize?apply=1')); }
    catch (err) { setReorg({ error: err.message }); }
  };

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
              <dt>WhatsApp mobile</dt>
              <dd>{user.phone || <span className="sub">Not set — you can’t reset by WhatsApp until a super admin adds it</span>}</dd>
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

      {user.role === 'SUPER_ADMIN' && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head"><h2>WhatsApp (WATI) check</h2></div>
          <div className="panel-body">
            <p className="sub" style={{ marginTop: 0 }}>
              Sends a test code to your own number on file and reports exactly what WATI said.
              Use this to diagnose password-reset delivery.
            </p>
            <button className="ghost" onClick={testWati} disabled={wati?.loading}>
              {wati?.loading ? 'Testing…' : 'Send a test code to me'}
            </button>

            {wati && !wati.loading && (
              <div style={{ marginTop: 14 }}>
                {wati.error ? (
                  <div className="error">{wati.error}</div>
                ) : wati.result?.sent ? (
                  <div className="success">
                    WATI accepted the message for {wati.normalised_number}. If nothing arrives, the number
                    has no WhatsApp or the template isn’t live.
                  </div>
                ) : (
                  <div className="error">
                    WATI rejected it: {wati.result?.reason || 'unknown reason'}
                  </div>
                )}
                <pre style={{
                  marginTop: 12, background: '#f5f6f5', border: '1px solid var(--line)',
                  borderRadius: 3, padding: 12, fontSize: 12, overflowX: 'auto',
                  fontFamily: 'var(--f-mono)'
                }}>{JSON.stringify(wati, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      )}

      {user.role === 'SUPER_ADMIN' && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head"><h2>Resume folders (OneDrive)</h2></div>
          <div className="panel-body">
            <p className="sub" style={{ marginTop: 0 }}>
              Re-files every resume under <strong>Company / Role / Name</strong> and merges the old
              duplicate folders (including the stray “Resume” folder). Preview first, then apply.
            </p>
            <div className="row" style={{ gap: 8 }}>
              <button className="ghost" onClick={previewReorg} disabled={reorg?.loading}>
                {reorg?.loading ? 'Working…' : 'Preview'}
              </button>
              <button className="primary" onClick={applyReorg} disabled={reorg?.loading}>
                Tidy up now
              </button>
            </div>

            {reorg && !reorg.loading && (
              <div style={{ marginTop: 14 }}>
                {reorg.error ? (
                  <div className="error">{reorg.error}</div>
                ) : (
                  <div className="success">
                    {reorg.dry_run
                      ? `Preview: ${reorg.to_move} resume(s) will be moved, ${reorg.already_correct} already correct.`
                      : `Done: moved ${reorg.moved} resume(s), ${reorg.already_correct} already correct${reorg.removed_resume_folder ? ', removed the old “Resume” folder' : ''}.${reorg.errors?.length ? ` ${reorg.errors.length} error(s).` : ''}`}
                  </div>
                )}
                <pre style={{
                  marginTop: 12, background: '#f5f6f5', border: '1px solid var(--line)',
                  borderRadius: 3, padding: 12, fontSize: 12, overflowX: 'auto',
                  maxHeight: 320, overflowY: 'auto', fontFamily: 'var(--f-mono)',
                }}>{JSON.stringify(reorg, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
