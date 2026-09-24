export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatTimeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return formatDate(iso);
}

export function LoadingRow({ cols }) {
  return (
    <tr className="admin-table__loading-row">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i}><div className="admin-skeleton" /></td>
      ))}
    </tr>
  );
}

export function AdminPageLoader({ text }) {
  return (
    <div className="admin-tab-loader">
      <span className="admin-spin-icon">⟳</span>
      {text && <span>{text}</span>}
    </div>
  );
}

export function AdminEmptyState({ message }) {
  return (
    <div className="admin-empty-state">
      <span>{message || '暂无数据'}</span>
    </div>
  );
}

export function AdminPagination({ page, pageCount, onPrev, onNext }) {
  if (pageCount <= 1) return null;
  return (
    <div className="admin-pagination">
      <button className="admin-pagination__btn" disabled={page <= 1} onClick={onPrev}>‹</button>
      <span className="admin-pagination__info">{page} / {pageCount}</span>
      <button className="admin-pagination__btn" disabled={page >= pageCount} onClick={onNext}>›</button>
    </div>
  );
}