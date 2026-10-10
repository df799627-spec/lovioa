import { useState, useCallback, useRef, useEffect } from 'react';
import { Activity, Loader2, RefreshCw } from 'lucide-react';
import { api } from '../../../services/api';
import { formatTimeAgo } from './AdminShared.jsx';

function StatusBadge({ status }) {
  const map = {
    succeeded: { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
    failed:    { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
    running:  { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
    queued:   { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
    completed: { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  };
  const cfg = map[status] || { bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb' };
  return (
    <span className="admin-job-badge" style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
      {status}
    </span>
  );
}

export default function AdminHeartbeatTab() {
  const [stats, setStats] = useState(null);
  const [runs, setRuns] = useState([]);
  const [hours, setHours] = useState('24');
  const [successWarn, setSuccessWarn] = useState('85');
  const [p90Warn, setP90Warn] = useState('90000');
  const [failedWarn, setFailedWarn] = useState('5');
  const [minSamples, setMinSamples] = useState('5');
  const [loading, setLoading] = useState(true);
  const [runLoading, setRunLoading] = useState(false);
  const hoursRef = useRef('24');
  const thresholdRef = useRef({
    successWarn: '85',
    p90Warn: '90000',
    failedWarn: '5',
    minSamples: '5',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([
        api.adminHeartbeatStats({
          sinceHours: Number(hoursRef.current),
          successRateWarn: Number(thresholdRef.current.successWarn),
          p90LatencyWarnMs: Number(thresholdRef.current.p90Warn),
          failedCountWarn: Number(thresholdRef.current.failedWarn),
          minSamplesForAlert: Number(thresholdRef.current.minSamples),
        }),
        api.adminHeartbeatRuns({ limit: 20, offset: 0 }),
      ]);
      setStats(s);
      setRuns(r.runs || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
  }, [load, hours]);

  const handleHoursChange = useCallback((h) => {
    hoursRef.current = h;
    setHours(h);
  }, []);

  const handleThresholdChange = useCallback((key, value) => {
    thresholdRef.current = { ...thresholdRef.current, [key]: value };
    if (key === 'successWarn') setSuccessWarn(value);
    if (key === 'p90Warn') setP90Warn(value);
    if (key === 'failedWarn') setFailedWarn(value);
    if (key === 'minSamples') setMinSamples(value);
  }, []);

  const handleRun = async () => {
    setRunLoading(true);
    try {
      await api.adminHeartbeatRun({ kind: 'manual' });
      await load();
    } finally { setRunLoading(false); }
  };

  return (
    <div className="admin-tab">
      <div className="admin-tab__header">
        <h2 className="admin-tab__title">Heartbeat 监控</h2>
        <div className="admin-tab__header-right">
          <select className="admin-select" value={hours} onChange={e => handleHoursChange(e.target.value)}>
            <option value="1">最近 1 小时</option>
            <option value="6">最近 6 小时</option>
            <option value="24">最近 24 小时</option>
            <option value="72">最近 72 小时</option>
          </select>
          <button className="admin-btn admin-btn--ghost" onClick={() => load()} disabled={loading}>
            {loading ? <Loader2 size={13} className="admin-spin" /> : <RefreshCw size={13} />}
          </button>
          <button className="admin-btn admin-btn--primary" onClick={handleRun} disabled={runLoading}>
            {runLoading ? <Loader2 size={13} className="admin-spin" /> : <Activity size={13} />}
            立即运行
          </button>
        </div>
      </div>

      <div className="admin-tab__toolbar" style={{ marginBottom: 12 }}>
        <div className="admin-tab__toolbar-left" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input className="admin-input" style={{ width: 132 }} value={successWarn} onChange={e => handleThresholdChange('successWarn', e.target.value)} placeholder="成功率阈值%" />
          <input className="admin-input" style={{ width: 146 }} value={p90Warn} onChange={e => handleThresholdChange('p90Warn', e.target.value)} placeholder="P90阈值(ms)" />
          <input className="admin-input" style={{ width: 132 }} value={failedWarn} onChange={e => handleThresholdChange('failedWarn', e.target.value)} placeholder="失败数阈值" />
          <input className="admin-input" style={{ width: 132 }} value={minSamples} onChange={e => handleThresholdChange('minSamples', e.target.value)} placeholder="最小样本数" />
          <button className="admin-btn admin-btn--ghost" onClick={() => load()} disabled={loading}>应用阈值</button>
        </div>
      </div>

      {loading ? (
        <div className="admin-tab-loader"><Loader2 size={24} className="admin-spin" /></div>
      ) : (
        <>
          <div className="admin-overview__sub-stats">
            <div className="admin-overview__sub-card">
              <span>总计: <strong>{stats?.overview?.total ?? 0}</strong></span>
            </div>
            <div className="admin-overview__sub-card admin-overview__sub-card--info">
              <span>成功: <strong>{stats?.overview?.succeeded ?? 0}</strong></span>
            </div>
            <div className="admin-overview__sub-card admin-overview__sub-card--warn">
              <span>失败: <strong>{stats?.overview?.failed ?? 0}</strong></span>
            </div>
            <div className="admin-overview__sub-card">
              <span>排队中: <strong>{(stats?.overview?.queued ?? 0) + (stats?.overview?.running ?? 0)}</strong></span>
            </div>
            <div className="admin-overview__sub-card">
              <span>渠道覆盖: <strong>{stats?.coverage?.active ?? 0}/{stats?.coverage?.expected ?? 0}</strong> ({stats?.coverage?.activeRate ?? 0}%)</span>
            </div>
            <div className="admin-overview__sub-card admin-overview__sub-card--warn">
              <span>告警: <strong>{stats?.alertSummary?.critical ?? 0}</strong> 严重 / <strong>{stats?.alertSummary?.warning ?? 0}</strong> 一般</span>
            </div>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Channel</th><th>告警</th><th>总计</th><th>成功</th><th>失败</th><th>成功率</th><th>平均延迟</th><th>P50</th><th>P90</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.channels || []).length === 0 ? (
                  <tr><td colSpan={9} className="admin-table__empty">暂无数据</td></tr>
                ) : stats?.channels.map((row) => (
                  <tr key={row.channel}>
                    <td><span className="admin-badge">{row.channel}</span></td>
                    <td>
                      <span className="admin-badge" style={{
                        background: row.alertLevel === 'critical' ? '#fef2f2' : row.alertLevel === 'warning' ? '#fffbeb' : '#f0fdf4',
                        color: row.alertLevel === 'critical' ? '#dc2626' : row.alertLevel === 'warning' ? '#b45309' : '#15803d',
                        borderColor: row.alertLevel === 'critical' ? '#fecaca' : row.alertLevel === 'warning' ? '#fde68a' : '#bbf7d0',
                      }}>
                        {row.alertLevel || 'ok'}
                      </span>
                    </td>
                    <td>{row.total}</td>
                    <td>{row.succeeded}</td>
                    <td>{row.failed}</td>
                    <td>{row.successRate}%</td>
                    <td>{row.avgLatencyMs ?? '—'}</td>
                    <td>{row.p50LatencyMs ?? '—'}</td>
                    <td>{row.p90LatencyMs ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-table-wrap" style={{ marginTop: 16 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>失败原因</th><th>次数</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.failureReasons || []).length === 0 ? (
                  <tr><td colSpan={2} className="admin-table__empty">暂无失败原因数据</td></tr>
                ) : (stats?.failureReasons || []).map((row) => (
                  <tr key={row.reason}>
                    <td><span className="admin-badge">{row.reason}</span></td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-table-wrap" style={{ marginTop: 16 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>失败任务</th><th>渠道</th><th>错误</th><th>时间</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.recentErrors || []).length === 0 ? (
                  <tr><td colSpan={4} className="admin-table__empty">暂无失败记录</td></tr>
                ) : (stats?.recentErrors || []).map((row) => (
                  <tr key={row.id}>
                    <td className="admin-table__cell--secondary">{row.id.slice(0, 12)}…</td>
                    <td><span className="admin-badge">{row.channel}</span></td>
                    <td title={row.lastError}>{String(row.lastError || '').slice(0, 120) || '—'}</td>
                    <td className="admin-table__cell--secondary">{formatTimeAgo(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 20 }}>
            <div className="admin-heartbeat__runs-title">最近运行记录</div>
            <div className="admin-table-wrap" style={{ marginTop: 10 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Run ID</th><th>类型</th><th>状态</th><th>计划</th><th>成功</th><th>失败</th><th>开始时间</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.length === 0 ? (
                    <tr><td colSpan={7} className="admin-table__empty">暂无运行记录</td></tr>
                  ) : runs.map(run => (
                    <tr key={run.id}>
                      <td className="admin-table__cell--secondary">{run.id.slice(0, 12)}…</td>
                      <td>{run.kind}</td>
                      <td><StatusBadge status={run.status} /></td>
                      <td>{run.plannedJobs}</td>
                      <td>{run.succeededJobs}</td>
                      <td>{run.failedJobs}</td>
                      <td className="admin-table__cell--secondary">{formatTimeAgo(run.startedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
