import { createContext, useContext, useEffect, useState } from 'react';

// In development Vite proxies /api to the local server. In production the API lives on another
// host, named by VITE_API_URL at build time (e.g. https://bsg-ats-api.onrender.com).
const BASE = `${import.meta.env.VITE_API_URL || ''}/api`;
let token = localStorage.getItem('ats_token') || null;

export const setToken = (t) => {
  token = t;
  t ? localStorage.setItem('ats_token', t) : localStorage.removeItem('ats_token');
};

async function request(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: form ? form : body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && token) {
    setToken(null);
    window.location.href = '/login';
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'The server could not complete that request.');
  return data;
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body }),
  patch: (p, body) => request(p, { method: 'PATCH', body }),
  put: (p, body) => request(p, { method: 'PUT', body }),
  upload: (p, form) => request(p, { method: 'POST', form }),

  // Files sit behind the same JWT as everything else, so a plain <a href> would be turned away.
  download: async (p, filename) => {
    const res = await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('That file could not be downloaded.');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    a.click();
    URL.revokeObjectURL(url);
  },
};

/* ---------- auth context ---------- */
const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return setLoading(false);
    api.get('/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { token: t, user: u } = await api.post('/auth/login', { email, password });
    setToken(t);
    setUser(u);
    return u;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return <AuthCtx.Provider value={{ user, loading, login, logout }}>{children}</AuthCtx.Provider>;
}

/* ---------- shared formatting ---------- */
export const PIPELINE = ['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'SELECTED', 'OFFERED', 'JOINED'];
export const CLOSED = ['REJECTED', 'ON_HOLD', 'WITHDRAWN'];
export const STATUS_LABEL = {
  APPLIED: 'Applied', SHORTLISTED: 'Shortlisted', INTERVIEW: 'Interview', SELECTED: 'Selected',
  OFFERED: 'Offered', JOINED: 'Joined', REJECTED: 'Rejected', ON_HOLD: 'On hold', WITHDRAWN: 'Withdrawn',
};

/** Score bands. Deliberately coarse — the number is a sorting aid, not a verdict. */
export const scoreBand = (n) => (n == null ? '' : n >= 8 ? 'STRONG' : n >= 5 ? 'POSSIBLE' : 'WEAK');

export const money = (n) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export const date = (d) =>
  !d ? '—' : new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export const dateTime = (d) =>
  !d ? '—' : new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
