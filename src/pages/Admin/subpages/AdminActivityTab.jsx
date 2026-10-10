import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../../../services/api';
import { formatDateTime, LoadingRow } from './AdminShared.jsx';

const ACTION_CONFIG = {
  grant_admin:   { label: '授予 Admin',      color: '#16a34a' },
  revoke_admin:  { label: '撤销 Admin',     color: '#d97706' },
  delete_user:   { label: '删除用户',        color: '#dc2626' },
  delete_prompt: { label: '删除 Prompt',      color: '#dc2626' },
  requeue_job:   { label: '重新入队',        color: '#2563eb' },
  cancel_job:    { label: '取消任务',        color: '#7c3aed' },
};

const PAGE_SIZE = 30;

export default function AdminActivityTab() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageRef = useRef(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (pageRef.current - 1) * PAGE_SIZE;
      const data = await api.adminListLogs({ limit: PAGE_SIZE, offset });
      setLogs(data.logs || []);
      setTotal(data.total);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
  }, [load, page]);

  const handlePageChange = useCallback((newPage) => {
    pageRef.current = newPage;
    setPage(newPage);
  }, []);

  const pageCount = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="admin-tab">
      <div className="admin-tab__header">
        <h2 className="admin-tab__title">操作日志</h2>
        <span className="admin-tab__count">{total} 条记录</span>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>时间</th><th>管理员</th><th>操作</th><th>对象</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <LoadingRow cols={4} /> :
             logs.length === 0 ? (
              <tr><td colSpan={4} className="admin-table__empty">暂无日志</td></tr>
            ) : logs.map(log => {
              const cfg = ACTION_CONFIG[log.action] || { label: log.action, color: '#6b7280' };
              return (
                <tr key={log.id}>
                  <td className="admin-table__cell--secondary">{formatDateTime(log.createdAt)}</td>
                  <td>
                    <div className="admin-user-cell">
                      <span className="admin-user-cell__name">{log.adminUsername}</span>
                    </div>
                  </td>
                  <td>
                    <span className="admin-activity-badge" style={{ color: cfg.color }}>{cfg.label}</span>
                  </td>
                  <td className="admin-table__cell--secondary">
                    {log.targetUsername
                      ? `用户: ${log.targetUsername}`
                      : log.targetPromptId
                        ? `Prompt: ${log.targetPromptId.slice(0, 12)}…`
                        : log.details?.jobId
                          ? `Job: ${log.details.jobId.slice(0, 12)}…`
                          : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {pageCount > 1 && (
          <div className="admin-pagination">
            <button className="admin-pagination__btn" disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>‹</button>
            <span className="admin-pagination__info">{page} / {pageCount}</span>
            <button className="admin-pagination__btn" disabled={page >= pageCount} onClick={() => handlePageChange(page + 1)}>›</button>
          </div>
        )}
      </div>
    </div>
  );
}
