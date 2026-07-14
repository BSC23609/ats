import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './api.jsx';
import Login from './pages/Login.jsx';
import Careers from './pages/Careers.jsx';
import FullForm from './pages/FullForm.jsx';
import Pipeline from './pages/Pipeline.jsx';
import ApplicationDetail from './pages/ApplicationDetail.jsx';
import Employees from './pages/Employees.jsx';
import Jobs from './pages/Jobs.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { GroupLogo } from './components/Logo.jsx';
import './styles.css';

function Shell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isSuper = user.role === 'SUPER_ADMIN';

  return (
    <div className="shell">
      <aside className="rail">
        <div className="rail-brand">
          <GroupLogo className="rail-logo" plate />
          <div className="sub">Recruitment</div>
        </div>
        <nav>
          <NavLink to="/pipeline" className={({ isActive }) => (isActive ? 'on' : '')}>Pipeline</NavLink>
          <NavLink to="/employees" className={({ isActive }) => (isActive ? 'on' : '')}>Employees</NavLink>
          <NavLink to="/jobs" className={({ isActive }) => (isActive ? 'on' : '')}>Openings</NavLink>
          {isSuper && <NavLink to="/users" className={({ isActive }) => (isActive ? 'on' : '')}>HR admins</NavLink>}
          <NavLink to="/settings" className={({ isActive }) => (isActive ? 'on' : '')}>Settings</NavLink>
          <NavLink to="/careers" className={({ isActive }) => (isActive ? 'on' : '')}>Careers page ↗</NavLink>
        </nav>
        <div className="rail-foot">
          <div className="who">{user.name}</div>
          <div className="scope">
            {isSuper ? 'All companies' : (user.companies || []).map((c) => c.code).join(' · ') || 'No company'}
          </div>
          <button onClick={() => { logout(); navigate('/login'); }}>Sign out</button>
        </div>
      </aside>
      <main>{children}</main>
    </div>
  );
}

function Private({ children, superOnly }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (superOnly && user.role !== 'SUPER_ADMIN') return <Navigate to="/pipeline" replace />;
  return (
    <Shell>
      <ErrorBoundary>{children}</ErrorBoundary>
    </Shell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/careers" element={<Careers />} />
          <Route path="/form/:token" element={<FullForm />} />

          <Route path="/pipeline" element={<Private><Pipeline /></Private>} />
          <Route path="/applications/:id" element={<Private><ApplicationDetail /></Private>} />
          <Route path="/employees" element={<Private><Employees /></Private>} />
          <Route path="/jobs" element={<Private><Jobs /></Private>} />
          <Route path="/users" element={<Private superOnly><Users /></Private>} />
          <Route path="/settings" element={<Private><Settings /></Private>} />

          <Route path="*" element={<Navigate to="/pipeline" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
