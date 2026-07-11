import { useEffect, useState } from 'react';
import { api, date } from '../api.jsx';

export default function Users() {
  const [rows, setRows] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [adding, setAdding] = useState(false);
  const [role, setRole] = useState('HR_ADMIN');
  const [picked, setPicked] = useState([]);          // companies for the admin being created
  const [editing, setEditing] = useState(null);      // admin whose companies are being changed
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const togglePick = (id, list, set) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const load = () => api.get('/users').then(setRows);
  useEffect(() => {
    load();
    api.get('/users/companies').then(setCompanies);
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    const body = Object.fromEntries(new FormData(e.target));
    try {
      await api.post('/users', { ...body, company_ids: role === 'HR_ADMIN' ? picked : [] });
      setMsg(`${body.name} can now sign in with ${body.email}.`);
      setAdding(false);
      setPicked([]);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const saveCompanies = async () => {
    try {
      await api.patch(`/users/${editing.id}`, { company_ids: editing.company_ids });
      setMsg(`Companies updated for ${editing.name}. They will see the change next time they sign in.`);
      setEditing(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggle = async (u) => {
    await api.patch(`/users/${u.id}`, { active: !u.active });
    load();
  };

  const resetPassword = async (u) => {
    const password = prompt(`New password for ${u.name} (at least 8 characters)`);
    if (!password) return;
    try {
      await api.patch(`/users/${u.id}`, { password });
      setMsg(`Password reset for ${u.name}.`);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Access</div>
          <h1>HR admins</h1>
          <div className="sub">An HR admin only ever sees their own company. You see all four.</div>
        </div>
        <button onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : 'Add an admin'}</button>
      </div>

      {msg && <div className="success" style={{ marginBottom: 16 }}>{msg}</div>}
      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

      {adding && (
        <form className="panel" onSubmit={create} style={{ marginBottom: 16 }}>
          <div className="panel-head"><h2>New admin</h2></div>
          <div className="panel-body">
            <div className="field-row">
              <div className="field">
                <label htmlFor="name">Name</label>
                <input id="name" name="name" required />
              </div>
              <div className="field">
                <label htmlFor="email">Work email</label>
                <input id="email" name="email" type="email" required />
              </div>
              <div className="field">
                <label htmlFor="password">Starting password</label>
                <input id="password" name="password" minLength={8} required />
              </div>
              <div className="field">
                <label htmlFor="role">Role</label>
                <select id="role" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="HR_ADMIN">HR admin — one company</option>
                  <option value="SUPER_ADMIN">Super admin — all companies</option>
                </select>
              </div>
            </div>

            {role === 'HR_ADMIN' && (
              <div className="field">
                <label>Companies this admin looks after — tick as many as apply</label>
                <div className="row">
                  {companies.map((c) => (
                    <label key={c.id} className="pick" style={{ borderLeftColor: c.colour }}>
                      <input type="checkbox" checked={picked.includes(c.id)}
                             onChange={() => togglePick(c.id, picked, setPicked)} />
                      {c.code} — {c.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button type="submit" disabled={role === 'HR_ADMIN' && !picked.length}>Create admin</button>
          </div>
        </form>
      )}

      {editing && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-head">
            <h2>Companies for {editing.name}</h2>
            <button className="ghost small" onClick={() => setEditing(null)}>Cancel</button>
          </div>
          <div className="panel-body">
            <div className="row" style={{ marginBottom: 14 }}>
              {companies.map((c) => (
                <label key={c.id} className="pick" style={{ borderLeftColor: c.colour }}>
                  <input type="checkbox" checked={editing.company_ids.includes(c.id)}
                         onChange={() => setEditing({
                           ...editing,
                           company_ids: editing.company_ids.includes(c.id)
                             ? editing.company_ids.filter((x) => x !== c.id)
                             : [...editing.company_ids, c.id],
                         })} />
                  {c.code} — {c.name}
                </label>
              ))}
            </div>
            <button onClick={saveCompanies} disabled={!editing.company_ids.length}>Save companies</button>
          </div>
        </div>
      )}

      <div className="panel">
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Scope</th><th>Added</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} style={{ cursor: 'default' }}>
                <td className="co" style={{ borderLeftColor: u.companies?.[0]?.colour || 'var(--ink)' }}>
                  <div className="name">{u.name}</div>
                  {u.from_email && <div className="ref">sends offers from {u.from_email}</div>}
                </td>
                <td className="ref">{u.email}</td>
                <td>{u.role === 'SUPER_ADMIN' ? 'Super admin' : 'HR admin'}</td>
                <td>
                  {u.role === 'SUPER_ADMIN' ? (
                    <span className="chip">All companies</span>
                  ) : (
                    <div className="taglist">
                      {u.companies.length
                        ? u.companies.map((c) => (
                            <span key={c.id} className="chip" style={{ borderLeftColor: c.colour, borderLeftWidth: 3 }}>
                              {c.code}
                            </span>
                          ))
                        : <span className="chip REJECTED">None assigned</span>}
                    </div>
                  )}
                </td>
                <td className="sub">{date(u.created_at)}</td>
                <td><span className={`chip ${u.active ? 'JOINED' : 'REJECTED'}`}>{u.active ? 'Active' : 'Disabled'}</span></td>
                <td>
                  <div className="row">
                    {u.role === 'HR_ADMIN' && (
                      <button className="ghost small"
                              onClick={() => setEditing({ ...u, company_ids: u.companies.map((c) => c.id) })}>
                        Companies
                      </button>
                    )}
                    <button className="ghost small" onClick={() => resetPassword(u)}>Reset password</button>
                    <button className="ghost small" onClick={() => toggle(u)}>{u.active ? 'Disable' : 'Enable'}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
