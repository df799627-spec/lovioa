import { useState, useCallback, useRef, useEffect } from 'react';
import { BarChart2, TrendingUp, Users, Activity, RefreshCw, TrendingDown, Minus, Eye, MousePointer2, Wifi } from 'lucide-react';
import { api } from '../../../services/api';

const TIME_RANGES = [
  { label: '24h',  value: '24' },
  { label: '7d',   value: '168' },
  { label: '30d',  value: '720' },
  { label: '90d',  value: '2160' },
];

// ── Delta Badge ──────────────────────────────────────────────
function DeltaBadge({ delta }) {
  if (delta == null) return null;
  if (delta === 0) return (
    <span className="analytics-delta analytics-delta--neutral">
      <Minus size={10} /> 持平
    </span>
  );
  return (
    <span className={`analytics-delta ${delta > 0 ? 'analytics-delta--up' : 'analytics-delta--down'}`}>
      {delta > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {Math.abs(delta)}%
    </span>
  );
}

// ── KPI Card ─────────────────────────────────────────────────
function KpiCard({ icon, color, value, label, prev, delta }) {
  return (
    <div className="analytics-kpi">
      <div className="analytics-kpi__icon" style={{ '--icon-color': color }}>
        {icon}
      </div>
      <div className="analytics-kpi__body">
        <div className="analytics-kpi__value">{typeof value === 'number' ? value.toLocaleString() : value ?? '—'}</div>
        <div className="analytics-kpi__label">{label}</div>
        <div className="analytics-kpi__footer">
          <DeltaBadge delta={delta} />
          {delta != null && prev != null && (
            <span className="analytics-kpi__prev">vs {prev.toLocaleString()}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Bar Chart ─────────────────────────────────────────────────
function BarChart({ data, maxValue }) {
  if (!data || data.length === 0) return <div className="admin-empty-state">暂无数据</div>;
  const isDaily = data[0]?.bucket?.length === 10;
  return (
    <div className="analytics-barchart">
      {data.map((row, i) => {
        const pct = maxValue > 0 ? (row.views / maxValue) * 100 : 0;
        const label = isDaily ? row.bucket.slice(5) : row.bucket.slice(11, 16);
        return (
          <div key={i} className="analytics-barchart__bar-wrap">
            <div
              className="analytics-barchart__bar"
              style={{ height: `${Math.max(pct, 1.5)}%` }}
            />
            {label && <div className="analytics-barchart__label">{label}</div>}
            <div className="analytics-barchart__pop">
              <span className="analytics-barchart__pop-val">{row.views.toLocaleString()}</span>
              <span className="analytics-barchart__pop-date">{row.bucket}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Donut Chart ───────────────────────────────────────────────
function DonutChart({ data, colors }) {
  const total = data.reduce((s, r) => s + r.count, 0);
  if (total === 0) return <div className="admin-empty-state">暂无数据</div>;
  const segments = data.reduce((acc, row, i) => {
    const pct = (row.count / total) * 100;
    acc.cumulative += pct;
    acc.items.push({ ...row, pct, start: acc.cumulative - pct, color: colors[i % colors.length] });
    return acc;
  }, { cumulative: 0, items: [] }).items;
  return (
    <div className="analytics-donut">
      <div className="analytics-donut__chart">
        <svg viewBox="0 0 44 44" className="analytics-donut__svg">
          <circle cx="22" cy="22" r="17" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5" />
          {segments.map((seg, i) => (
            <circle
              key={i} cx="22" cy="22" r="17"
              fill="none" stroke={seg.color} strokeWidth="5"
              strokeDasharray={`${(seg.pct * 1.068).toFixed(2)} 100`}
              strokeDashoffset={`${-seg.start * 1.068}`}
              strokeLinecap="round"
            />
          ))}
          <text x="22" y="19" textAnchor="middle" fontSize="10" fontWeight="700" fill="#e6edf3">{total.toLocaleString()}</text>
          <text x="22" y="28" textAnchor="middle" fontSize="5.5" fill="#8b949e">总计</text>
        </svg>
      </div>
      <div className="analytics-donut__legend">
        {segments.map((seg, i) => (
          <div key={i} className="analytics-donut__legend-row">
            <span className="analytics-donut__dot" style={{ background: seg.color }} />
            <span className="analytics-donut__name">{seg.source || seg.device || seg.mode || seg.status || seg.category || 'Unknown'}</span>
            <span className="analytics-donut__pct">{seg.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Action Breakdown ─────────────────────────────────────────
function ActionBreakdown({ data }) {
  if (!data || data.length === 0) return <div className="admin-empty-state">暂无数据</div>;
  const max = data[0]?.count || 1;
  return (
    <div className="analytics-actions">
      {data.map((item, i) => (
        <div key={i} className="analytics-actions__row">
          <span className="analytics-actions__name">{item.label}</span>
          <div className="analytics-actions__bar-wrap">
            <div className="analytics-actions__bar" style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
          <span className="analytics-actions__count">{item.count.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

// ── Top Pages ─────────────────────────────────────────────────
function TopPages({ data }) {
  if (!data || data.length === 0) return <div className="admin-empty-state">暂无数据</div>;
  return (
    <div className="analytics-top-pages">
      {data.map((row, i) => (
        <div key={i} className="analytics-top-pages__row">
          <span className="analytics-top-pages__rank">#{i + 1}</span>
          <span className="analytics-top-pages__path">{row.path}</span>
          <span className="analytics-top-pages__views">{row.views.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function GeoList({ title, data, field = 'country' }) {
  if (!data || data.length === 0) return <div className="admin-empty-state">暂无数据</div>;
  const max = data[0]?.count || 1;
  return (
    <div className="analytics-geo">
      <div className="analytics-geo__title">{title}</div>
      {data.map((row, i) => {
        const label = row[field] || row.country || row.region || row.city || 'Unknown';
        return (
          <div key={i} className="analytics-geo__row">
            <span className="analytics-geo__name">{label}</span>
            <div className="analytics-geo__bar-wrap">
              <div className="analytics-geo__bar" style={{ width: `${(row.count / max) * 100}%` }} />
            </div>
            <span className="analytics-geo__count">{row.count.toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
}

function CountryTrend({ data }) {
  if (!data || data.length === 0) return <div className="admin-empty-state">暂无趋势数据</div>;
  const max = Math.max(...data.flatMap((r) => (r.series || []).map((x) => Number(x.count || 0))), 1);
  return (
    <div>
      {data.map((row) => (
        <div key={row.country} style={{ marginBottom: 10 }}>
          <div className="admin-table__cell--secondary" style={{ marginBottom: 4 }}>{row.country}</div>
          <div style={{ display: 'flex', gap: 2, alignItems: 'end', height: 44 }}>
            {(row.series || []).map((point) => {
              const h = Math.max(2, Math.round((Number(point.count || 0) / max) * 42));
              return (
                <div
                  key={`${row.country}-${point.bucket}`}
                  title={`${point.bucket}: ${point.count}`}
                  style={{ width: 8, height: h, background: 'rgba(181,98,42,0.85)', borderRadius: 2 }}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Tab ─────────────────────────────────────────────────
export default function AdminAnalyticsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sinceHours, setSinceHours] = useState('168');
  const hoursRef = useRef('168');
  const abortRef = useRef(null);

  const load = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    const hours = Number(hoursRef.current);
    const period = hours <= 24 ? 'day' : hours <= 168 ? 'week' : 'month';
    return api.adminAnalytics({ sinceHours: hours, period }, { signal: controller.signal })
      .then(setData)
      .catch(e => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => setLoading(false));
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleHoursChange = useCallback((h) => {
    hoursRef.current = h;
    setSinceHours(h);
    load();
  }, [load]);

  const maxViews = data?.viewsOverTime?.length > 0
    ? Math.max(...data.viewsOverTime.map(r => r.views))
    : 0;

  return (
    <div className="admin-tab">
      {/* Header */}
      <div className="admin-tab__header">
        <h2 className="admin-tab__title">数据分析</h2>
        <div className="admin-tab__header-right">
          <div className="admin-tab__time-range">
            {TIME_RANGES.map(r => (
              <button
                key={r.value}
                className={`admin-tab__range-btn ${sinceHours === r.value ? 'active' : ''}`}
                onClick={() => handleHoursChange(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            className="admin-btn admin-btn--ghost"
            onClick={load}
            disabled={loading}
            title="刷新"
          >
            <RefreshCw size={14} className={loading ? 'admin-spin-icon' : ''} />
          </button>
        </div>
      </div>

      {error && <div className="admin-error"><span>{error}</span></div>}

      {loading ? (
        <div className="admin-tab-loader">
          <svg className="admin-spin-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          加载中…
        </div>
      ) : data ? (
        <>
          {/* Bot warning */}
          {data.botEventsCount > 0 && (
            <div className="analytics-bot-alert">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              Bot 流量（已过滤）: {data.botEventsCount.toLocaleString()} 条
            </div>
          )}

          {/* Live visitors + today snapshot */}
          <div className="analytics-today">
            <div className="analytics-today__item">
              <span className="analytics-today__icon analytics-today__icon--live">
                <Wifi size={15} />
              </span>
              <div className="analytics-today__body">
                <div className="analytics-today__value">{data.activeVisitors ?? 0}</div>
                <div className="analytics-today__label">当前在线</div>
              </div>
            </div>
            <div className="analytics-today__sep" />
            <div className="analytics-today__item">
              <span className="analytics-today__icon analytics-today__icon--blue">
                <Eye size={15} />
              </span>
              <div className="analytics-today__body">
                <div className="analytics-today__value">{data.todayPageViews.toLocaleString()}</div>
                <div className="analytics-today__label">今日访问</div>
              </div>
            </div>
            <div className="analytics-today__sep" />
            <div className="analytics-today__item">
              <span className="analytics-today__icon analytics-today__icon--purple">
                <MousePointer2 size={15} />
              </span>
              <div className="analytics-today__body">
                <div className="analytics-today__value">{data.todayActions.toLocaleString()}</div>
                <div className="analytics-today__label">今日操作</div>
              </div>
            </div>
          </div>

          {/* KPI Grid */}
          <div className="analytics-kpi-grid">
            <KpiCard
              icon={<TrendingUp size={18} />}
              color="#B5622A"
              value={data.totalPageViews}
              label="页面访问"
              prev={data.prevPeriodPageViews}
              delta={data.deltaPageViews}
            />
            <KpiCard
              icon={<Activity size={18} />}
              color="#a855f7"
              value={data.totalActions}
              label="用户操作"
              prev={data.prevPeriodActions}
              delta={data.deltaActions}
            />
            <KpiCard
              icon={<Users size={18} />}
              color="#22c55e"
              value={data.activeUsers}
              label="活跃用户"
              prev={data.prevPeriodActiveUsers}
              delta={data.deltaActiveUsers}
            />
            <KpiCard
              icon={<BarChart2 size={18} />}
              color="#3b82f6"
              value={data.uniqueSessions}
              label="独立会话"
              prev={data.prevPeriodSessions}
              delta={data.deltaSessions}
            />
            <KpiCard
              icon={<Eye size={18} />}
              color="#f59e0b"
              value={data.uniqueIps}
              label="独立 IP"
            />
          </div>

          {/* Charts Grid */}
          <div className="analytics-grid">
            {/* Trend */}
            <div className="analytics-card">
              <div className="analytics-card__title">
                <TrendingUp size={13} /> 访问趋势
              </div>
              <BarChart data={data.viewsOverTime} maxValue={maxViews} />
            </div>

            {/* Action breakdown */}
            <div className="analytics-card">
              <div className="analytics-card__title">
                <Activity size={13} /> 操作分布
              </div>
              <ActionBreakdown data={data.actionBreakdown} />
            </div>

            {/* Top pages */}
            <div className="analytics-card">
              <div className="analytics-card__title">
                <BarChart2 size={13} /> 热门页面 Top 10
              </div>
              <TopPages data={data.topPages} />
            </div>

            {/* Device + Referrer */}
            <div className="analytics-card analytics-card--charts">
              <div className="analytics-card__title">
                <Users size={13} /> 设备 & 来源
              </div>
              <div className="analytics-card__charts-row">
                <DonutChart data={data.deviceBreakdown || []} colors={['#B5622A', '#a855f7', '#22c55e', '#3b82f6']} />
                <div className="analytics-card__charts-sep" />
                <DonutChart data={data.referrerBreakdown || []} colors={['#B5622A', '#a855f7', '#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#06b6d4', '#84cc16']} />
              </div>
            </div>

            <div className="analytics-card">
              <div className="analytics-card__title">
                <Wifi size={13} /> 地区分布
              </div>
              {data.geoQuality && (
                <div className="admin-table__cell--secondary" style={{ marginBottom: 10 }}>
                  地理识别覆盖: {data.geoQuality.knownRate}% · Unknown: {data.geoQuality.unknownRate}%
                </div>
              )}
              <div className="analytics-card__geo-grid">
                <GeoList title="国家" data={data.countryBreakdown || []} field="country" />
                <GeoList title="地区 / 省份" data={data.regionBreakdown || []} field="region" />
                <GeoList title="城市" data={data.cityBreakdown || []} field="city" />
              </div>
            </div>

            <div className="analytics-card">
              <div className="analytics-card__title">
                <Activity size={13} /> 生成分类分布
              </div>
              <ActionBreakdown data={(data.generationCategoryBreakdown || []).map(item => ({
                label: item.category,
                count: item.count,
              }))} />
            </div>

            <div className="analytics-card">
              <div className="analytics-card__title">
                <TrendingUp size={13} /> 国家访问趋势
              </div>
              <CountryTrend data={data.countryTrend || []} />
            </div>

            <div className="analytics-card analytics-card--charts">
              <div className="analytics-card__title">
                <Users size={13} /> 生成模式 & 状态
              </div>
              <div className="analytics-card__charts-row">
                <DonutChart data={data.generationModeBreakdown || []} colors={['#B5622A', '#a855f7', '#22c55e', '#3b82f6']} />
                <div className="analytics-card__charts-sep" />
                <DonutChart data={data.generationStatusBreakdown || []} colors={['#22c55e', '#f59e0b', '#ef4444', '#3b82f6']} />
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
