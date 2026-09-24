import { useState, useCallback, useRef, useEffect } from 'react';
import {
  RotateCcw, XSquare, ExternalLink, Loader2,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { api } from '../../../services/api';
import { formatTimeAgo, LoadingRow } from './AdminShared.jsx';

const PAGE_SIZE = 20;
const JOB_STATUSES = ['', 'queued', 'running', 'succeeded', 'failed', 'cancelled'];

function StatusBadge({ status }) {
  const map = {
    succeeded: { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
    failed:    { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
    queued:    { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
    running:   { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
    cancelled: { bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb' },
  };
  const cfg = map[status] || map.cancelled;
  return (
    <span className="admin-job-badge" style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
      {status}
    </span>
  );
}

export default function AdminJobsTab() {
  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [toast, setToast] = useState(null);
  const pageRef = useRef(1);
  const statusFilterRef = useRef('');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (pageRef.current - 1) * PAGE_SIZE;
      const data = await api.adminListJobs({ limit: PAGE_SIZE, offset, status: statusFilterRef.current });
      setJobs(data.jobs || []);
      setTotal(data.total);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
  }, [load, page, statusFilter]);

  const handlePageChange = useCallback((newPage) => {
    pageRef.current = newPage;
    setPage(newPage);
  }, []);

  const handleStatusFilterChange = useCallback((val) => {
    statusFilterRef.current = val;
    setStatusFilter(val);
    pageRef.current = 1;
    setPage(1);
  }, []);

  const handleRequeue = async (job) => {
    setActionLoading(job.id);
    try {
      await api.adminRequeueJob(job.id);
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'queued', lastError: '' } : j));
      showToast('任务已重新入队');
    } catch (e) { showToast(e.message, 'error'); }
    finally { setActionLoading(null); }
  };

  const handleCancel = async (job) => {
    setActionLoading(job.id);
    try {
      await api.adminCancelJob(job.id);
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'cancelled' } : j));
      showToast('任务已取消');
    } catch (e) { showToast(e.message, 'error'); }
    finally { setActionLoading(null); }
  };

  const pageCount = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="admin-tab">
      <div className="admin-tab__header">
        <h2 className="admin-tab__title">任务队列</h2>
        <span className="admin-tab__count">{total} 个任务</span>
      </div>

      <div className="admin-tab__toolbar">
        <select className="admin-select" value={statusFilter} onChange={e => handleStatusFilterChange(e.target.value)}>
          <option value="">全部状态</option>
          {JOB_STATUSES.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Prompt</th><th>用户</th><th>模型</th><th>规格</th><th>状态</th><th>重试</th><th>排队时间</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? <LoadingRow cols={8} /> :
             jobs.length === 0 ? (
              <tr><td colSpan={8} className="admin-table__empty">暂无任务</td></tr>
            ) : jobs.map(job => (
              <tr key={job.id}>
                <td className="admin-table__prompt-cell">
                  <span className="admin-table__prompt-snippet">
                    {job.prompt?.slice(0, 60)}{job.prompt?.length > 60 ? '…' : ''}
                  </span>
                </td>
                <td className="admin-table__cell--secondary">{job.userUsername || '—'}</td>
                <td><span className="admin-badge">{job.model}</span></td>
                <td className="admin-table__cell--secondary">{job.size}</td>
                <td>
                  <StatusBadge status={job.status} />
                  {job.lastError && job.status === 'failed' && (
                    <div className="admin-job-error" title={job.lastError}>{job.lastError?.slice(0, 40)}…</div>
                  )}
                </td>
                <td className="admin-table__cell--secondary">{job.attemptCount}/{job.maxAttempts}</td>
                <td className="admin-table__cell--secondary">{formatTimeAgo(job.queuedAt)}</td>
                <td>
                  <div className="admin-table__actions">
                    {(job.status === 'failed' || job.status === 'cancelled') && (
                      <button className="admin-icon-btn admin-icon-btn--accent" disabled={actionLoading === job.id} onClick={() => handleRequeue(job)} title="重新入队">
                        {actionLoading === job.id ? <Loader2 size={13} className="admin-spin" /> : <RotateCcw size={13} />}
                      </button>
                    )}
                    {(job.status === 'queued' || job.status === 'running') && (
                      <button className="admin-icon-btn admin-icon-btn--warn" disabled={actionLoading === job.id} onClick={() => handleCancel(job)} title="取消">
                        {actionLoading === job.id ? <Loader2 size={13} className="admin-spin" /> : <XSquare size={13} />}
                      </button>
                    )}
                    {job.status === 'succeeded' && job.resultImageUrl && (
                      <a href={job.resultImageUrl} target="_blank" rel="noopener noreferrer" className="admin-icon-btn admin-icon-btn--info" title="查看结果">
                        <ExternalLink size={13} />
                      </a>
                    )}
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
    </div>
  );
}
