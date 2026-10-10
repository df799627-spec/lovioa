import { useState, useCallback, useRef, useEffect } from 'react';
import { Trash2, ExternalLink, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../../services/api';
import { formatDate, LoadingRow } from './AdminShared.jsx';
import { CATEGORIES as ALL_CATEGORIES } from '../../../data/prompts';

const PAGE_SIZE = 20;
const CATEGORIES = ['', ...ALL_CATEGORIES];
const PROMPT_SORTS = [
  { value: 'newest',    label: '最新' },
  { value: 'oldest',    label: '最早' },
  { value: 'likes_desc', label: '最多点赞' },
];

export default function AdminPromptsTab() {
  const [prompts, setPrompts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('newest');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState(null);
  const pageRef = useRef(1);
  const sortRef = useRef('newest');
  const categoryRef = useRef('');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (pageRef.current - 1) * PAGE_SIZE;
      const data = await api.adminListPrompts({ limit: PAGE_SIZE, offset, sort: sortRef.current, category: categoryRef.current });
      setPrompts(data.prompts || []);
      setTotal(data.total);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
  }, [load, page, sort, category]);

  const handleSortChange = useCallback((val) => {
    sortRef.current = val;
    setSort(val);
  }, []);

  const handleCategoryChange = useCallback((val) => {
    categoryRef.current = val;
    setCategory(val);
  }, []);

  const handlePageChange = useCallback((newPage) => {
    pageRef.current = newPage;
    setPage(newPage);
  }, []);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setActionLoading(confirmDelete);
    try {
      await api.adminDeletePrompt(confirmDelete);
      setPrompts(prev => prev.filter(p => p.id !== confirmDelete));
      setConfirmDelete(null);
      showToast('Prompt 已删除');
    } catch (e) { showToast(e.message, 'error'); }
    finally { setActionLoading(null); }
  };

  const pageCount = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="admin-tab">
      <div className="admin-tab__header">
        <h2 className="admin-tab__title">内容管理</h2>
        <span className="admin-tab__count">{total} 条 Prompts</span>
      </div>

      <div className="admin-tab__toolbar">
        <div className="admin-tab__toolbar-left">
          <select className="admin-select" value={sort} onChange={e => handleSortChange(e.target.value)}>
            {PROMPT_SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select className="admin-select" value={category} onChange={e => handleCategoryChange(e.target.value)}>
            <option value="">全部分类</option>
            {CATEGORIES.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th></th><th>Prompt</th><th>作者</th><th>分类</th><th>点赞</th><th>时间</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? <LoadingRow cols={7} /> :
             prompts.length === 0 ? (
              <tr><td colSpan={7} className="admin-table__empty">暂无数据</td></tr>
            ) : prompts.map(p => (
              <tr key={p.id}>
                <td className="admin-table__thumb-cell">
                  {p.imageUrl
                    ? <img src={p.imageUrl} alt="" className="admin-table__thumb" />
                    : <div className="admin-table__thumb admin-table__thumb--placeholder" />}
                </td>
                <td className="admin-table__prompt-cell">
                  <span className="admin-table__prompt-snippet">{p.prompt?.slice(0, 80)}{p.prompt?.length > 80 ? '…' : ''}</span>
                </td>
                <td>
                  <div className="admin-user-cell">
                    {p.author?.avatar && <img src={p.author.avatar} alt="" className="admin-user-cell__avatar admin-user-cell__avatar--sm" />}
                    <span>{p.author?.name || '—'}</span>
                  </div>
                </td>
                <td><span className="admin-badge">{p.category}</span></td>
                <td>{p.likes}</td>
                <td className="admin-table__cell--secondary">{formatDate(p.createdAt)}</td>
                <td>
                  <div className="admin-table__actions">
                    <a href={`/prompt/${p.id}`} target="_blank" rel="noopener noreferrer" className="admin-icon-btn admin-icon-btn--info" title="查看">
                      <ExternalLink size={13} />
                    </a>
                    <button
                      className="admin-icon-btn admin-icon-btn--danger"
                      disabled={actionLoading === p.id}
                      onClick={() => setConfirmDelete(p.id)}
                    >
                      {actionLoading === p.id ? <Loader2 size={13} className="admin-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {pageCount > 1 && (
          <div className="admin-pagination">
            <button className="admin-pagination__btn" disabled={page <= 1} onClick={() => handlePageChange(page - 1)}><ChevronLeft size={15} /></button>
            <span className="admin-pagination__info">{page} / {pageCount}</span>
            <button className="admin-pagination__btn" disabled={page >= pageCount} onClick={() => handlePageChange(page + 1)}><ChevronRight size={15} /></button>
          </div>
        )}
      </div>

      {toast && <div className={`admin-toast admin-toast--${toast.type}`}>{toast.msg}</div>}

      {confirmDelete && (
        <div className="admin-confirm-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="admin-confirm" onClick={e => e.stopPropagation()}>
            <div className="admin-confirm__icon"><Trash2 size={24} /></div>
            <h3 className="admin-confirm__title">确认删除</h3>
            <p className="admin-confirm__body">此操作不可恢复。</p>
            <div className="admin-confirm__actions">
              <button className="admin-btn admin-btn--ghost" onClick={() => setConfirmDelete(null)}>取消</button>
              <button className="admin-btn admin-btn--danger" onClick={handleDelete}>确认</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
