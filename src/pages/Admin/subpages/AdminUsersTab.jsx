import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Shield, ShieldOff, Trash2, Loader2,
  Search, ChevronLeft, ChevronRight, XCircle,
} from 'lucide-react';
import { api } from '../../../services/api';
import { formatDate, LoadingRow } from './AdminShared.jsx';

const PAGE_SIZE = 20;
const USER_SORTS = [
  { value: 'newest',     label: '最新注册' },
  { value: 'oldest',     label: '最早注册' },
  { value: 'prompts_desc', label: '最多 Prompts' },
  { value: 'name_asc',   label: '按名称 A-Z' },
];

function UserDetailPanel({ user, stats, onClose, onToggleAdmin, onDelete, actionLoadingId }) {
  if (!user) return null;
  return (
    <div className="admin-user-panel">
      <div className="admin-user-panel__header">
        <img src={user.avatar} alt="" className="admin-user-panel__avatar" />
        <div>
          <div className="admin-user-panel__name">{user.username}</div>
          <div className="admin-user-panel__email">{user.email}</div>
        </div>
        <button className="admin-user-panel__close" onClick={onClose}><XCircle size={16} /></button>
      </div>
      {stats ? (
        <div className="admin-user-panel__stats">
          {[
            { val: stats.promptsCount ?? 0, label: 'Prompts' },
            { val: stats.likesCount ?? 0,   label: 'Likes' },
            { val: stats.savedCount ?? 0,   label: 'Saved' },
            { val: stats.historyCount ?? 0, label: 'Generated' },
          ].map(s => (
            <div key={s.label} className="admin-user-panel__stat">
              <span className="admin-user-panel__stat-val">{s.val}</span>
              <span className="admin-user-panel__stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      ) : <div className="admin-user-panel__loading"><Loader2 size={16} className="admin-spin" /></div>}
      <div className="admin-user-panel__joined">注册于 {formatDate(user.createdAt)}</div>
      <div className="admin-user-panel__actions">
        <button
          className={`admin-btn ${user.isAdmin ? 'admin-btn--ghost' : 'admin-btn--primary'} admin-btn--full`}
          onClick={() => onToggleAdmin(user)}
          disabled={actionLoadingId === user.id}
        >
          {user.isAdmin ? <><ShieldOff size={13} /> 撤销 Admin</> : <><Shield size={13} /> 授予 Admin</>}
        </button>
        <button
          className="admin-btn admin-btn--danger admin-btn--full"
          onClick={() => onDelete(user)}
        >
          <Trash2 size={13} /> 删除用户
        </button>
      </div>
    </div>
  );
}

export default function AdminUsersTab() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [selected, setSelected] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const pageRef = useRef(1);
  const sortRef = useRef('newest');
  const searchRef = useRef('');
  const selectedRef = useRef(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (pageRef.current - 1) * PAGE_SIZE;
      const data = await api.adminListUsers({ limit: PAGE_SIZE, offset, sort: sortRef.current });
      let list = data.users;
      const q = searchRef.current.toLowerCase();
      if (q) {
        list = list.filter(u =>
          u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
        );
      }
      setUsers(list);
      setTotal(data.total);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
  }, [load, page, sort, search]);

  const loadUserStats = useCallback(() => {
    const id = selectedRef.current;
    if (!id) { setUserStats(null); return; }
    setStatsLoading(true);
    api.adminGetUser(id)
      .then(d => setUserStats(d.stats))
      .catch(() => setUserStats(null))
      .finally(() => setStatsLoading(false));
  }, []);

  useEffect(() => { loadUserStats(); }, [loadUserStats]);

  const handlePageChange = useCallback((newPage) => {
    pageRef.current = newPage;
    setPage(newPage);
  }, []);

  const handleSortChange = useCallback((val) => {
    sortRef.current = val;
    setSort(val);
  }, []);

  const handleSearchChange = useCallback((val) => {
    searchRef.current = val;
    setSearch(val);
  }, []);

  const handleToggleAdmin = async (user) => {
    setActionLoading(user.id);
    try {
      const updated = await api.adminUpdateUser(user.id, { isAdmin: !user.isAdmin });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isAdmin: updated.isAdmin } : u));
      if (selectedRef.current?.id === user.id) {
        selectedRef.current = updated;
        setSelected(updated);
      }
      showToast(`${updated.isAdmin ? '已授予' : '已撤销'} ${user.username} 的 Admin 权限`);
    } catch (e) { showToast(e.message, 'error'); }
    finally { setActionLoading(null); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setActionLoading(confirmDelete.id);
    try {
      await api.adminDeleteUser(confirmDelete.id);
      setUsers(prev => prev.filter(u => u.id !== confirmDelete.id));
      if (selectedRef.current?.id === confirmDelete.id) {
        selectedRef.current = null;
        setSelected(null);
      }
      setConfirmDelete(null);
      showToast('用户已删除');
    } catch (e) { showToast(e.message, 'error'); }
    finally { setActionLoading(null); }
  };

  const pageCount = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="admin-tab">
      <div className="admin-tab__header">
        <h2 className="admin-tab__title">用户管理</h2>
        <span className="admin-tab__count">{total} 位用户</span>
      </div>

      <div className="admin-tab__toolbar">
        <div className="admin-tab__toolbar-left">
          <div className="admin-search">
            <Search size={14} />
            <input
              className="admin-search__input"
              placeholder="搜索用户名或邮箱..."
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
            />
          </div>
          <select className="admin-select" value={sort} onChange={e => handleSortChange(e.target.value)}>
            {USER_SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="admin-tab__layout">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>用户</th><th>邮箱</th><th>Prompts</th><th>注册时间</th><th>角色</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? <LoadingRow cols={6} /> :
               users.length === 0 ? (
                <tr><td colSpan={6} className="admin-table__empty">暂无用户</td></tr>
              ) : users.map(u => (
                <tr
                  key={u.id}
                  className={selected?.id === u.id ? 'admin-table__row--selected' : ''}
                  onClick={() => {
                    const next = u.id === selected?.id ? null : u;
                    selectedRef.current = next;
                    setSelected(next);
                  }}
                >
                  <td>
                    <div className="admin-user-cell">
                      <img src={u.avatar} alt="" className="admin-user-cell__avatar" />
                      <span className="admin-user-cell__name">{u.username}</span>
                    </div>
                  </td>
                  <td className="admin-table__cell--secondary">{u.email}</td>
                  <td>{u.promptCount ?? 0}</td>
                  <td className="admin-table__cell--secondary">{formatDate(u.createdAt)}</td>
                  <td>
                    <span className={`admin-badge ${u.isAdmin ? 'admin-badge--admin' : 'admin-badge--member'}`}>
                      {u.isAdmin ? 'Admin' : 'Member'}
                    </span>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="admin-table__actions">
                      <button
                        className={`admin-icon-btn ${u.isAdmin ? 'admin-icon-btn--warn' : 'admin-icon-btn--accent'}`}
                        disabled={actionLoading === u.id}
                        onClick={() => handleToggleAdmin(u)}
                        title={u.isAdmin ? '撤销 Admin' : '授予 Admin'}
                      >
                        {actionLoading === u.id ? <Loader2 size={13} className="admin-spin" /> :
                         u.isAdmin ? <ShieldOff size={13} /> : <Shield size={13} />}
                      </button>
                      <button
                        className="admin-icon-btn admin-icon-btn--danger"
                        disabled={actionLoading === u.id}
                        onClick={() => setConfirmDelete(u)}
                        title="删除用户"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="admin-pagination">
            <button className="admin-pagination__btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft size={15} />
            </button>
            <span className="admin-pagination__info">{page} / {pageCount}</span>
            <button className="admin-pagination__btn" disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        {selected && (
          <UserDetailPanel
            user={users.find(u => u.id === selected?.id) || selected}
            stats={statsLoading ? null : userStats}
            onClose={() => setSelected(null)}
            onToggleAdmin={handleToggleAdmin}
            onDelete={u => setConfirmDelete(u)}
            actionLoadingId={actionLoading}
          />
        )}
      </div>

      {toast && (
        <div className={`admin-toast admin-toast--${toast.type}`}>
          {toast.type === 'success' ? '✓' : '✗'} {toast.msg}
        </div>
      )}

      {confirmDelete && (
        <div className="admin-confirm-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="admin-confirm" onClick={e => e.stopPropagation()}>
            <div className="admin-confirm__icon"><Trash2 size={24} /></div>
            <h3 className="admin-confirm__title">确认删除用户</h3>
            <p className="admin-confirm__body">确定要删除用户 <strong>{confirmDelete.username}</strong> 吗？此操作不可恢复。</p>
            <div className="admin-confirm__actions">
              <button className="admin-btn admin-btn--ghost" onClick={() => setConfirmDelete(null)}>取消</button>
              <button className="admin-btn admin-btn--danger" onClick={handleDelete}>确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
