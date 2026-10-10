import { useState, useCallback, useEffect } from 'react';
import {
  Users, Image, Grid3X3, TrendingUp,
  Clock, Activity, AlertTriangle, Loader2, RefreshCw,
} from 'lucide-react';
import { api } from '../../../services/api';

function StatCard({ icon: Icon, label, value, sub, color, loading }) {
  if (loading) {
    return (
      <div className="admin-stat-card">
        <div className="admin-stat-card__icon admin-skeleton" style={{ width: 44, height: 44 }} />
        <div className="admin-stat-card__body">
          <div className="admin-stat-card__value admin-skeleton" style={{ width: 60, height: 32 }} />
          <div className="admin-stat-card__label admin-skeleton" style={{ width: 80, height: 12, marginTop: 6 }} />
        </div>
      </div>
    );
  }
  return (
    <div className="admin-stat-card">
      <div className="admin-stat-card__icon" style={{ '--icon-color': color }}>
        <Icon size={20} />
      </div>
      <div className="admin-stat-card__body">
        <div className="admin-stat-card__value">{value ?? '—'}</div>
        <div className="admin-stat-card__label">{label}</div>
        {sub && <div className="admin-stat-card__sub">{sub}</div>}
      </div>
    </div>
  );
}

export default function AdminOverviewTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.adminStats();
      setStats(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return (
    <div className="admin-tab">
      <div className="admin-tab__header">
        <h2 className="admin-tab__title">总览</h2>
        <button className="admin-btn admin-btn--ghost" onClick={() => loadStats(true)} disabled={loading}>
          {loading ? <Loader2 size={14} className="admin-spin" /> : <RefreshCw size={14} />}
          刷新
        </button>
      </div>

      {error && (
        <div className="admin-error">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      <div className="admin-overview__stats">
        <StatCard icon={Users}      label="总用户数"      value={stats?.totalUsers}    loading={loading} color="#B5622A" />
        <StatCard icon={Image}      label="总 Prompts"   value={stats?.totalPrompts} loading={loading} color="#78716C" />
        <StatCard icon={TrendingUp} label="总生成图片"  value={stats?.totalImages}  loading={loading} color="#22c55e" />
        <StatCard icon={Grid3X3}    label="社区成员"     value={stats?.communitySize} loading={loading} color="#3b82f6" />
      </div>

      <div className="admin-overview__sub-stats">
        <div className="admin-overview__sub-card">
          <Clock size={14} />
          <span>待处理任务: <strong>{stats?.pendingJobs ?? '—'}</strong></span>
        </div>
        {stats?.runningJobs > 0 && (
          <div className="admin-overview__sub-card admin-overview__sub-card--info">
            <Activity size={14} />
            <span>运行中: <strong>{stats.runningJobs}</strong></span>
          </div>
        )}
        {stats?.failedJobs > 0 && (
          <div className="admin-overview__sub-card admin-overview__sub-card--warn">
            <AlertTriangle size={14} />
            <span>失败任务: <strong>{stats.failedJobs}</strong></span>
          </div>
        )}
      </div>
    </div>
  );
}
