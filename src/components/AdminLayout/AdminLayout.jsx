import { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  BarChart2, Users, Image, List, Eye, Activity,
  TrendingUp, Shield, LogOut, ChevronLeft, ChevronRight,
  Menu, LayoutDashboard,
} from 'lucide-react';
import './AdminLayout.css';

const NAV_ITEMS = [
  { key: 'analytics',  label: '数据分析',  icon: BarChart2,      path: '/admin/analytics' },
  { key: 'overview',  label: '总览',       icon: LayoutDashboard, path: '/admin' },
  { key: 'users',    label: '用户',        icon: Users,         path: '/admin/users' },
  { key: 'prompts',  label: '内容',        icon: Image,         path: '/admin/prompts' },
  { key: 'jobs',     label: '任务队列',   icon: List,          path: '/admin/jobs' },
  { key: 'heartbeat',label: 'Heartbeat',  icon: Activity,       path: '/admin/heartbeat' },
  { key: 'moderation',label: '审核',       icon: Eye,           path: '/admin/moderation' },
  { key: 'activity', label: '操作日志',  icon: Activity,       path: '/admin/activity' },
];

export default function AdminLayout({ token, admin, onLogout, children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) => {
    if (path === '/admin') return location.pathname === '/admin';
    return location.pathname.startsWith(path);
  };

  const handleLogout = () => {
    onLogout();
  };

  const avatarSrc = admin?.avatar ||
    `https://api.dicebear.com/7.x/miniavs/svg?seed=${encodeURIComponent(admin?.username || 'admin')}`;

  return (
    <div className={`admin-shell ${collapsed ? 'admin-shell--collapsed' : ''} ${mobileOpen ? 'admin-shell--mobile-open' : ''}`}>
      {mobileOpen && (
        <div className="admin-shell__mobile-overlay" onClick={() => setMobileOpen(false)} />
      )}

      <aside className="admin-sidebar">
        <div className="admin-sidebar__logo">
          <div className="admin-sidebar__logo-icon">
            <Shield size={18} />
          </div>
          {!collapsed && (
            <div className="admin-sidebar__logo-text">
              <span className="admin-sidebar__logo-brand">Lovioa</span>
              <span className="admin-sidebar__logo-sub">Admin</span>
            </div>
          )}
        </div>

        <button
          className="admin-sidebar__collapse-btn"
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? '展开' : '收起'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <nav className="admin-sidebar__nav">
          {NAV_ITEMS.map(({ key, label, icon: Icon, path }) => (
            <NavLink
              key={key}
              to={path}
              className={`admin-sidebar__nav-item ${isActive(path) ? 'admin-sidebar__nav-item--active' : ''}`}
              title={collapsed ? label : undefined}
              onClick={() => setMobileOpen(false)}
            >
              <Icon size={17} />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar__footer">
          <div className="admin-sidebar__user">
            <img src={avatarSrc} alt="" className="admin-sidebar__user-avatar" />
            {!collapsed && (
              <div className="admin-sidebar__user-info">
                <span className="admin-sidebar__user-name">{admin?.displayName || admin?.username || 'Admin'}</span>
                <span className="admin-sidebar__user-role">管理员</span>
              </div>
            )}
          </div>
          <button className="admin-sidebar__logout" onClick={handleLogout} title="退出登录">
            <LogOut size={15} />
            {!collapsed && <span>退出</span>}
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button className="admin-topbar__menu-btn" onClick={() => setMobileOpen(true)}>
            <Menu size={18} />
          </button>
          <div className="admin-topbar__breadcrumb">
            {NAV_ITEMS.find(i => isActive(i.path))?.label || '管理后台'}
          </div>
          <a href="/" target="_blank" rel="noopener noreferrer" className="admin-topbar__site-link">
            <TrendingUp size={14} />
            <span>查看网站</span>
          </a>
        </header>

        <main className="admin-content">
          {children}
        </main>
      </div>
    </div>
  );
}