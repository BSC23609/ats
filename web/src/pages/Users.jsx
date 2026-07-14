import { useEffect, useState } from 'react';
import { api, date } from '../api.jsx';

const BLANK = { name: '', email: '', role: 'HR_ADMIN', company_ids: [], active: true, password: '' };

export default function Users() {
  const [rows, setRows] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(null);   // the admin being added or edited; null = dialog closed
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/users').then(setRows).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    api.get('/users/companies').then(setCompanies).catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setForm(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openNew = () => { setForm({ ...BLANK }); setError(''); setMsg(''); };

  const openEdit = (u) => {
    setError(''); setMsg('');
    setForm({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      company_ids: (u.companies || []).map((c) => c.id),
      password: '',                          // blank means "leave the password alone"
    });
  };

  const close = () => { setForm(null); setError(''); };

  const toggleCompany = (id) =>
    setForm((f) => ({
      ...f,
      company_ids: f.company_ids.includes(id)
        ? f.company_ids.filter((x) => x !== id)
        : [...f.company_ids, id],
    }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (form.role === 'HR_ADMIN' && !form.company_ids.length)
        throw new Error('An HR admin must look after at least one company.');

      const body = {
        name: form.name,
        email: form.email,
        role: form.role,
        active: form.active,
        company_ids: form.role === 'HR_ADMIN' ? form.company_ids : [],
      };
      if (form.password) body.password = form.password;

      if (form.id) {
        await api.patch(`/users/${form.id}`, body);
        setMsg(
          `${form.name} updated.${form.password ? ' Password changed.' : ''} ` +
          `A change of companies takes effect the next time they sign in.`
        );
      } else {
        if (!form.password) throw new Error('Give the new admin a starting password.');
        await api.post('/users', body);
        setMsg(`${form.name} can now sign in with ${form.email}.`);
      }
      close();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (u) => {
    try {
      await api.patch(`/users/${u.id}`, { active: !u.active });
      setMsg(`${u.name} ${u.active ? 'can no longer sign in.' : 'can sign in again.'}`);
      load();
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
          <div className="sub">An HR admin sees only the companies you give them. One person can hold several.</div>
        </div>
        <button onClick={openNew}>Add an admin</button>
      </div>

      {msg && <div className="success" style={{ marginBottom: 16 }}>{msg}</div>}
      {error && !form && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Role</th><th>Companies</th>
              <th>Added</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} style={{ cursor: 'default' }}>
                <td className="co" style={{ borderLeftColor: (u.companies || [])[0]?.colour || 'var(--ink)' }}>
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
                      {(u.companies || []).length
                        ? (u.companies || []).map((c) => (
                            <span key={c.id} className="chip"
                                  style={{ borderLeftColor: c.colour, borderLeftWidth: 3 }}>
                              {c.code}
                            </span>
                          ))
                        : <span className="chip REJECTED">None assigned</span>}
                    </div>
                  )}
                </td>
                <td className="sub">{date(u.created_at)}</td>
                <td>
                  <span className={`chip ${u.active ? 'JOINED' : 'REJECTED'}`}>
                    {u.active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td>
                  <div className="row">
                    <button className="ghost small" onClick={() => openEdit(u)}>Edit</button>
                    <button className="ghost small" onClick={() => toggleActive(u)}>
                      {u.active ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && close()}>
          <form className="dialog" onSubmit={save} role="dialog" aria-modal="true">
            <div className="dialog-head">
              <div>
                <div className="eyebrow">{form.id ? 'Edit admin' : 'New admin'}</div>
                <h2>{form.id ? form.name : 'Add an HR admin'}</h2>
              </div>
              <button type="button" className="dialog-close" onClick={close} aria-label="Close">&times;</button>
            </div>

            <div className="dialog-body">
              {error && <div className="error" style={{ marginBottom: 14 }}>{error}</div>}

              <div className="field-row">
                <div className="field">
                  <label htmlFor="u_name">Name</label>
                  <input id="u_name" required value={form.name}
                         onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="u_email">Work email — this is their sign-in</label>
                  <input id="u_email" type="email" required value={form.email}
                         onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
              </div>

              <div className="field">
                <label htmlFor="u_role">Role</label>
                <select id="u_role" value={form.role}
                        onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="HR_ADMIN">HR admin — only the companies ticked below</option>
                  <option value="SUPER_ADMIN">Super admin — every company, and manages these accounts</option>
                </select>
              </div>

              {form.role === 'HR_ADMIN' && (
                <div className="field">
                  <label>Companies — tick as many as apply</label>
                  <div className="row">
                    {companies.map((c) => (
                      <label key={c.id} className="pick" style={{ borderLeftColor: c.colour }}>
                        <input type="checkbox" checked={form.company_ids.includes(c.id)}
                               onChange={() => toggleCompany(c.id)} />
                        {c.code} — {c.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="field">
                <label htmlFor="u_pass">
                  {form.id ? 'New password' : 'Starting password'}
                  {form.id && <span style={{ fontWeight: 400 }}> — leave blank to keep the current one</span>}
                </label>
                <input id="u_pass" type="text" minLength={8} value={form.password}
                       required={!form.id}
                       placeholder={form.id ? 'Unchanged' : 'At least 8 characters'}
                       onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>

              <div className="field" style={{ marginBottom: 0 }}>
                <label className="pick" style={{ borderLeftColor: form.active ? 'var(--ok)' : 'var(--warn)' }}>
                  <input type="checkbox" checked={form.active}
                         onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                  Can sign in
                </label>
              </div>
            </div>

            <div className="dialog-foot">
              <button type="button" className="ghost" onClick={close}>Cancel</button>
              <button type="submit" disabled={busy}>
                {busy ? 'Saving…' : form.id ? 'Save changes' : 'Create admin'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
