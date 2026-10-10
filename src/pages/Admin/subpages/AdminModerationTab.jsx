import { useState, useCallback, useRef, useEffect } from 'react';
import { Check, X, Trash2, ExternalLink, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../../services/api';
import { formatTimeAgo } from './AdminShared.jsx';

const PAGE_SIZE = 20;
const DECISIONS = [
  { value: '', label: '全部' },
  { value: 'pass', label: '通过' },
  { value: 'review', label: '复核' },
  { value: 'block', label: '拒绝' },
];
const TYPES = [
  { value: '', label: '全部类型' },
  { value: 'prompt', label: 'Prompt' },
  { value: 'generated_image', label: '图片' },
];

export default function AdminModerationTab() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [decision, setDecision] = useState('');
  const [requestType, setRequestType] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [toast, setToast] = useState(null);
  const [brokenImages, setBrokenImages] = useState(() => new Set());
  const pageRef = useRef(1);
  const decisionRef = useRef('');
  const requestTypeRef = useRef('');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (pageRef.current - 1) * PAGE_SIZE;
      const data = await api.adminListModerationChecks({
        limit: PAGE_SIZE,
        offset,
        decision: decisionRef.current,
        requestType: requestTypeRef.current,
      });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, page, decision, requestType]);

  const handleDecisionChange = useCallback((val) => {
    decisionRef.current = val;
    setDecision(val);
    pageRef.current = 1;
    setPage(1);
  }, []);

  const handleTypeChange = useCallback((val) => {
    requestTypeRef.current = val;
    setRequestType(val);
    pageRef.current = 1;
    setPage(1);
  }, []);

  const handlePageChange = useCallback((newPage) => {
    pageRef.current = newPage;
    setPage(newPage);
  }, []);

  const updateItem = (id, next) => {
    setItems(prev => prev.map(item => (item.id === id ? { ...item, ...next } : item)));
  };

  const markBroken = (id) => {
    setBrokenImages(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const handleApprove = async (item) => {
    setActionLoading(item.id);
    try {
      const next = await api.adminApproveModerationCheck(item.id);
      updateItem(item.id, next);
      showToast('已通过');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (item) => {
    const reason = window.prompt('拒绝原因', 'Rejected by admin');
    if (reason === null) return;
    setActionLoading(item.id);
    try {
      const next = await api.adminRejectModerationCheck(item.id, reason);
      updateItem(item.id, next);
      showToast('已拒绝');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const pageCount = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="admin-tab">
      <div className="admin-tab__header">
        <h2 className="admin-tab__title">内容审核</h2>
        <span className="admin-tab__count">{total} 条记录</span>
      </div>

      <div className="admin-tab__toolbar">
        <div className="admin-tab__toolbar-left">
          <select className="admin-select" value={requestType} onChange={e => handleTypeChange(e.target.value)}>
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select className="admin-select" value={decision} onChange={e => handleDecisionChange(e.target.value)}>
            {DECISIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>
      </div>

      {items.length === 0 && !loading ? (
        <div className="admin-empty-state">暂无审核记录</div>
      ) : (
        <div className="admin-moderation__grid">
          {items.map(item => (
            <div key={item.id} className="admin-mod-card">
              <div className="admin-mod-card__image-wrap">
                {!brokenImages.has(item.id) && item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="admin-mod-card__image"
                    loading="lazy"
                    onError={() => markBroken(item.id)}
                  />
                )}
                <div className={`admin-mod-card__badge admin-mod-card__badge--${item.decision}`}>
                  {item.decision}
                </div>
              </div>
              <div className="admin-mod-card__body">
                <p className="admin-mod-card__prompt">
                  {item.prompt?.slice(0, 100)}{item.prompt?.length > 100 ? '…' : ''}
                </p>
                <div className="admin-mod-card__meta">
                  <span className="admin-mod-card__cat">{item.requestType}</span>
                  <span className="admin-mod-card__cat">{item.subjectType}</span>
                  <span className="admin-mod-card__time">{formatTimeAgo(item.createdAt)}</span>
                </div>
                <div className="admin-mod-card__meta">
                  <span className="admin-mod-card__model">{item.providerName || 'n/a'}</span>
                  <span className="admin-mod-card__model">{item.reason || '—'}</span>
                </div>
                <div className="admin-mod-card__actions">
                  {item.imageUrl && (
                    <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" className="admin-mod-btn admin-mod-btn--view">
                      <ExternalLink size={12} /> 查看
                    </a>
                  )}
                  <button className="admin-mod-btn admin-mod-btn--approve" disabled={actionLoading === item.id} onClick={() => handleApprove(item)}>
                    {actionLoading === item.id ? <Loader2 size={12} className="admin-spin" /> : <Check size={12} />} 通过
                  </button>
                  <button className="admin-mod-btn admin-mod-btn--reject" disabled={actionLoading === item.id} onClick={() => handleReject(item)}>
                    <X size={12} /> 拒绝
                  </button>
                  {item.historyId && (
                    <button
                      className="admin-mod-btn admin-mod-btn--delete"
                      disabled={actionLoading === item.id}
                      onClick={async () => {
                        setActionLoading(item.id);
                        try {
                          await api.adminDeleteHistory(item.historyId);
                          setItems(prev => prev.filter(x => x.id !== item.id));
                          showToast('历史已删除');
                        } catch (e) {
                          showToast(e.message, 'error');
                        } finally {
                          setActionLoading(null);
                        }
                      }}
                    >
                      <Trash2 size={12} /> 删除历史
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <div className="admin-pagination">
          <button className="admin-pagination__btn" disabled={page <= 1} onClick={() => handlePageChange(page - 1)}><ChevronLeft size={15} /></button>
          <span className="admin-pagination__info">{page} / {pageCount}</span>
          <button className="admin-pagination__btn" disabled={page >= pageCount} onClick={() => handlePageChange(page + 1)}><ChevronRight size={15} /></button>
        </div>
      )}

      {toast && <div className={`admin-toast admin-toast--${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
