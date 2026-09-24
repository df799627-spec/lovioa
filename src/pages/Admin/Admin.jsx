import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout/AdminLayout';
import AdminOverviewTab from './subpages/AdminOverviewTab';
import AdminAnalyticsTab from './subpages/AdminAnalyticsTab';
import AdminUsersTab from './subpages/AdminUsersTab';
import AdminPromptsTab from './subpages/AdminPromptsTab';
import AdminJobsTab from './subpages/AdminJobsTab';
import AdminHeartbeatTab from './subpages/AdminHeartbeatTab';
import AdminModerationTab from './subpages/AdminModerationTab';
import AdminActivityTab from './subpages/AdminActivityTab';
import './Admin.css';

const ADMIN_SESSION_KEY = 'pf_admin_session';

function AdminLogin({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '登录失败');
      } else {
        localStorage.setItem(ADMIN_SESSION_KEY, data.token);
        onLogin(data.token, data.admin);
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-page admin-page--standalone">
      <div className="admin-access admin-access--dark">
        <h1 className="admin-access__title">管理后台</h1>
        <p className="admin-access__desc">请登录管理员账号</p>
        <form className="admin-access__form" onSubmit={handleSubmit}>
          {error && <div className="admin-access__error">{error}</div>}
          <div className="admin-access__field">
            <input
              type="text"
              className="admin-login__input"
              placeholder="用户名"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="admin-access__field">
            <input
              type="password"
              className="admin-login__input"
              placeholder="密码"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button type="submit" className="admin-btn admin-btn--primary" disabled={loading}>
            {loading ? '登录中…' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const [token, setToken] = useState(() => localStorage.getItem(ADMIN_SESSION_KEY) || '');
  const [admin, setAdmin] = useState(null);
  const [checking, setChecking] = useState(true);

  // Verify existing token on mount
  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    fetch('/api/admin/auth/me', {
      headers: { 'X-Admin-Session': token },
    })
      .then(r => r.json())
      .then(data => {
        if (data.authenticated && data.admin) {
          setAdmin(data.admin);
        } else {
          setToken('');
          localStorage.removeItem(ADMIN_SESSION_KEY);
        }
        setChecking(false);
      })
      .catch(() => {
        setToken('');
        localStorage.removeItem(ADMIN_SESSION_KEY);
        setChecking(false);
      });
  }, []);

  const handleLogin = (newToken, adminData) => {
    setToken(newToken);
    setAdmin(adminData);
  };

  const handleLogout = async () => {
    if (token) {
      await fetch('/api/admin/auth/logout', {
        method: 'POST',
        headers: { 'X-Admin-Session': token },
      }).catch(() => {});
    }
    setToken('');
    setAdmin(null);
    localStorage.removeItem(ADMIN_SESSION_KEY);
    navigate('/');
  };

  if (checking) {
    return (
      <div className="admin-page admin-page--standalone">
        <div className="admin-access admin-access--dark">
          <p className="admin-access__desc">加载中…</p>
        </div>
      </div>
    );
  }

  if (!token || !admin) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  return (
    <AdminLayout token={token} admin={admin} onLogout={handleLogout}>
      <Routes>
        <Route index element={<AdminOverviewTab token={token} />} />
        <Route path="analytics" element={<AdminAnalyticsTab token={token} />} />
        <Route path="users" element={<AdminUsersTab token={token} />} />
        <Route path="prompts" element={<AdminPromptsTab token={token} />} />
        <Route path="jobs" element={<AdminJobsTab token={token} />} />
        <Route path="heartbeat" element={<AdminHeartbeatTab token={token} />} />
        <Route path="moderation" element={<AdminModerationTab token={token} />} />
        <Route path="activity" element={<AdminActivityTab token={token} />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </AdminLayout>
  );
}