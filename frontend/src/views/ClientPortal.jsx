import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
  TrendingUp, BarChart2, Check, X, FileText, Send, Lock, Calendar, PlayCircle, ExternalLink,
  Share2, RefreshCw, MessageSquare, CheckCircle, Zap, Users, Bell, BellOff, UserPlus
} from 'lucide-react';

import { API_BASE } from '../api.js';

const PRESET_REASON_OPTIONS = [
  'Out of Budget',
  'Not Interested',
  'Wrong Number / Spam',
  'Location Issue',
  'Already Serviced'
];

const PORTAL_STYLES = `
/* Executive Slate & Glass Premium Design System for Client Portal */
.client-portal-wrapper {
  --bg-primary: #f8fafc;
  --bg-card: #ffffff;
  --text-primary: #0f172a;
  --text-secondary: #334155;
  --text-muted: #64748b;
  --border-color: #e2e8f0;
  --border-width: 1px;
  
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 20px -2px rgba(0, 0, 0, 0.05);
  --shadow-lg: 0 10px 30px -4px rgba(0, 0, 0, 0.08);
  
  --radius-md: 16px;
  --radius-sm: 8px;
  
  --accent-purple: #7c3aed;
  --accent-cyan: #0284c7;
  --accent-rose: #e11d48;
  --accent-blue: #2563eb;
  --accent-emerald: #059669;
  
  box-sizing: border-box;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  color: var(--text-primary);
  min-height: 100vh;
  padding: 32px 16px;
  background-color: var(--bg-primary);
  display: flex;
  flex-direction: column;
  align-items: center;
}

body.portal-active {
  background-color: #f8fafc !important;
  padding: 0 !important;
  margin: 0 !important;
}

.portal-container {
  width: 100%;
  max-width: 1240px;
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes spin {
  100% { transform: rotate(360deg); }
}

/* Bento Card styling */
.portal-bento-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color) !important;
  border-radius: var(--radius-md) !important;
  box-shadow: var(--shadow-md) !important;
  padding: 24px;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
  text-align: left;
  margin-bottom: 24px;
}

.portal-bento-card:hover {
  box-shadow: var(--shadow-lg) !important;
  transform: translateY(-2px);
}

/* Header Banner */
.portal-header-banner {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-md);
  box-shadow: 0 10px 30px -5px rgba(15, 23, 42, 0.2);
  padding: 32px;
  margin-bottom: 24px;
  text-align: left;
  color: #ffffff;
}

.portal-header-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: rgba(255, 255, 255, 0.12);
  color: #38bdf8;
  padding: 4px 12px;
  border-radius: 9999px;
  border: 1px solid rgba(56, 189, 248, 0.3);
  margin-bottom: 12px;
}

.portal-header-title {
  font-size: 2rem;
  font-weight: 800;
  text-transform: capitalize;
  margin: 0;
  letter-spacing: -0.02em;
  line-height: 1.25;
  color: #ffffff;
}

/* Tabs segment */
.portal-tabs-container {
  display: flex;
  background: #ffffff;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 5px;
  margin-bottom: 28px;
  width: 100%;
  gap: 6px;
  box-shadow: var(--shadow-sm);
  overflow-x: auto;
  scrollbar-width: none;
}

.portal-tabs-container::-webkit-scrollbar {
  display: none;
}

.portal-tab-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 18px;
  font-weight: 700;
  font-size: 0.83rem;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  background: transparent;
  color: var(--text-muted);
  transition: all 0.15s ease;
  white-space: nowrap;
}

.portal-tab-btn:hover {
  background: #f1f5f9;
  color: var(--text-primary);
}

.portal-tab-btn.active {
  background: #0f172a;
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.15);
}

/* Metrics Grid */
.portal-metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  width: 100%;
  margin-bottom: 24px;
}

.portal-metric-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 110px;
  background: #ffffff;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: 20px;
  transition: all 0.2s ease;
}

.portal-metric-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.portal-metric-value {
  font-size: 2.2rem;
  font-weight: 800;
  margin: 6px 0 0 0;
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.portal-metric-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Refined Badges */
.portal-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 0.72rem;
  font-weight: 700;
  border-radius: 9999px;
  letter-spacing: 0.02em;
  border: 1px solid transparent;
  background: #f1f5f9;
  color: #334155;
}

.portal-badge-success { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
.portal-badge-warning { background: #fffbeb; color: #b45309; border-color: #fde68a; }
.portal-badge-danger { background: #fff1f2; color: #be123c; border-color: #fecdd3; }
.portal-badge-info { background: #e0e7ff; color: #4338ca; border-color: #c7d2fe; }
.portal-badge-muted { background: #f8fafc; color: #64748b; border-color: #e2e8f0; }

/* Form Controls & Buttons */
.portal-control {
  background: #ffffff;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 12px 16px;
  color: var(--text-primary);
  font-family: inherit;
  font-weight: 600;
  font-size: 0.88rem;
  transition: all 0.15s ease;
  width: 100%;
}

.portal-control:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.portal-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  font-weight: 700;
  font-size: 0.85rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  cursor: pointer;
  background: #ffffff;
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
  transition: all 0.15s ease;
  text-decoration: none;
}

.portal-btn:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.portal-btn-primary {
  background: #0f172a;
  color: #ffffff;
  border-color: #0f172a;
}

.portal-btn-primary:hover {
  background: #1e293b;
  color: #ffffff;
}

/* Grid Layouts */
.portal-grid-half {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 20px;
}

/* Tables */
.portal-table-container {
  overflow-x: auto;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background: #ffffff;
  box-shadow: var(--shadow-sm);
  width: 100%;
  margin-bottom: 12px;
}

.portal-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.portal-table th {
  background: #f8fafc;
  padding: 14px 18px;
  font-weight: 700;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-color);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.portal-table td {
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
  font-weight: 600;
  font-size: 0.85rem;
}

.portal-table tr:last-child td {
  border-bottom: none;
}

.portal-table tr:hover td {
  background: #f8fafc;
}
/* Modal styling */
.portal-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

/* Month selector pills */
.portal-month-selector {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 12px;
  margin-bottom: 24px;
  scrollbar-width: none;
}

.portal-month-selector::-webkit-scrollbar {
  display: none;
}

.portal-month-tab {
  padding: 8px 16px;
  border-radius: 9999px;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: capitalize;
  background: #ffffff;
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: all 0.15s ease;
  white-space: nowrap;
}

.portal-month-tab:hover {
  background: #f1f5f9;
  color: var(--text-primary);
}

.portal-month-tab.active {
  background: #0f172a;
  color: #ffffff;
  border-color: #0f172a;
}

/* Script Box */
.portal-script-box {
  background: #f8fafc;
  border: 1px solid var(--border-color);
  padding: 16px 20px;
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 0.9rem;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
  position: relative;
  overflow: hidden;
  margin-bottom: 16px;
  font-weight: 500;
}

.portal-form-group {
  margin-bottom: 20px;
}

.portal-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* Select Dropdown & Input Reason */
.portal-select {
  background: #ffffff;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 8px 14px;
  color: var(--text-primary);
  font-family: inherit;
  font-weight: 600;
  transition: all 0.15s ease;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}

.portal-select:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.portal-code-block {
  background: #0f172a;
  color: #38bdf8;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-sm);
  padding: 16px;
  font-family: monospace;
  font-size: 0.85rem;
  white-space: pre-wrap;
  box-shadow: var(--shadow-sm);
  margin-top: 12px;
}

@media(max-width: 768px) {
  .portal-grid-half {
    grid-template-columns: 1fr;
  }
  .portal-tabs-container {
    display: grid !important;
    grid-template-columns: repeat(2, 1fr) !important;
    border-radius: var(--radius-sm) !important;
    padding: 6px !important;
    gap: 6px !important;
  }
  .portal-tab-btn {
    border: 1px solid var(--border-color) !important;
    border-radius: var(--radius-sm) !important;
    padding: 8px 10px !important;
    font-size: 0.78rem !important;
    background: #ffffff !important;
    color: var(--text-muted) !important;
    box-shadow: var(--shadow-sm) !important;
    width: 100% !important;
    justify-content: center !important;
  }
  .portal-tab-btn.active {
    background: #0f172a !important;
    color: #ffffff !important;
  }
  .portal-header-banner {
    padding: 20px;
  }
  .portal-header-title {
    font-size: 1.5rem;
  }
  .portal-metrics-grid {
    grid-template-columns: 1fr;
  }
  .portal-table th, .portal-table td {
    padding: 10px 12px;
    font-size: 0.75rem;
  }
}
`;

function PortalDonutChart({ title, data, totalLabel = 'Total' }) {
  if (!data || data.length === 0) {
    return (
      <div className="portal-bento-card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1.05rem', marginBottom: '12px', fontWeight: 800, color: 'var(--text-primary)' }}>{title}</h3>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No distribution data available yet.</div>
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + (d.value || 0), 0);
  let accumulatedPercent = 0;

  return (
    <div className="portal-bento-card" style={{ padding: '24px' }}>
      <h3 style={{ fontSize: '1.05rem', marginBottom: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>{title}</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: '130px', height: '130px' }}>
          <svg width="130" height="130" viewBox="0 0 42 42" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#f1f5f9" strokeWidth="4.5" />
            {total > 0 && data.map((item) => {
              const percent = (item.value / total) * 100;
              const strokeDashoffset = 100 - accumulatedPercent;
              accumulatedPercent += percent;
              return (
                <circle
                  key={item.label}
                  cx="21"
                  cy="21"
                  r="15.91549430918954"
                  fill="transparent"
                  stroke={item.color}
                  strokeWidth="4.8"
                  strokeDasharray={`${percent} ${100 - percent}`}
                  strokeDashoffset={strokeDashoffset}
                  style={{ transition: 'all 0.4s ease' }}
                />
              );
            })}
          </svg>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none'
          }}>
            <span style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-primary)', lineHeight: 1 }}>{total.toLocaleString()}</span>
            <span style={{ fontSize: '0.68rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '2px' }}>{totalLabel}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left', flexGrow: 1, minWidth: '140px' }}>
          {data.map((item) => {
            const percent = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
            return (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', fontSize: '0.82rem', fontWeight: '700' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: item.color, display: 'inline-block' }} />
                  <span style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>{item.label}</span>
                </div>
                <span style={{ color: 'var(--text-muted)', fontWeight: '600' }}>{item.value.toLocaleString()} <span style={{ opacity: 0.7, fontSize: '0.75rem' }}>({percent}%)</span></span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TopContentBarChart({ contentList }) {
  if (!contentList || contentList.length === 0) return null;

  const topPosts = [...contentList]
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 5);

  const maxViews = Math.max(...topPosts.map(p => p.views || 0), 1);

  return (
    <div className="portal-bento-card" style={{ padding: '24px' }}>
      <h3 style={{ fontSize: '1.05rem', marginBottom: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>Top Performing Content</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {topPosts.map((post, idx) => {
          const widthPct = ((post.views || 0) / maxViews) * 100;
          return (
            <div key={post.id || idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', fontWeight: '700' }}>
                <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                  {post.title || `${post.post_type} (${post.date || ''})`}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: '800' }}>{(post.views || 0).toLocaleString()} views</span>
                  {post.content_score > 0 && (
                    <span className="portal-badge portal-badge-info" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>Score {post.content_score}</span>
                  )}
                </div>
              </div>
              <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '9999px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.max(widthPct, 3)}%`,
                  background: 'linear-gradient(90deg, #6366f1 0%, #06b6d4 100%)',
                  borderRadius: '9999px',
                  transition: 'width 0.5s ease'
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PerformanceTrendChart({ data }) {
  const [metric, setMetric] = useState('views');
  
  if (!data || data.length === 0) {
    return (
      <div className="portal-bento-card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        No trend data available yet.
      </div>
    );
  }

  const width = 500;
  const height = 220;
  const paddingLeft = 50;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 35;
  
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const isViews = metric === 'views';
  
  const maxVal = Math.max(...data.map(d => isViews ? (d.views || 0) : (d.engagement_rate_pct || 0)), 1);
  const roundedMax = isViews ? Math.ceil(maxVal / 1000) * 1000 : Math.ceil(maxVal);

  const points = data.map((d, index) => {
    const x = paddingLeft + (data.length > 1 ? (index / (data.length - 1)) * chartWidth : chartWidth / 2);
    const currVal = isViews ? (d.views || 0) : (d.engagement_rate_pct || 0);
    const y = paddingTop + chartHeight - (currVal / roundedMax) * chartHeight;
    return { x, y, val: currVal, date: d.date, title: d.title };
  });

  let pathD = '';
  let areaD = '';
  if (points.length > 0) {
    pathD = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
    areaD = `${pathD} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`;
  }

  const gridTicks = [0, 0.33, 0.66, 1];

  const formatNumberAbbr = (num) => {
    if (num === null || num === undefined) return '0';
    if (isViews) {
      if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
      if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
      return num.toString();
    } else {
      return num.toFixed(1) + '%';
    }
  };

  const shortDate = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${parseInt(parts[2], 10)} ${months[parseInt(parts[1], 10) - 1]}`;
  };

  return (
    <div className="portal-bento-card" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 800, color: 'var(--text-primary)' }}>Content Performance Trend</h3>
        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '3px' }}>
          <button 
            onClick={() => setMetric('views')}
            style={{
              padding: '5px 12px',
              border: 'none',
              fontWeight: '700',
              fontSize: '0.78rem',
              borderRadius: '6px',
              cursor: 'pointer',
              background: isViews ? '#ffffff' : 'transparent',
              color: isViews ? '#0f172a' : '#64748b',
              boxShadow: isViews ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            Video Views
          </button>
          <button 
            onClick={() => setMetric('engagement')}
            style={{
              padding: '5px 12px',
              border: 'none',
              fontWeight: '700',
              fontSize: '0.78rem',
              borderRadius: '6px',
              cursor: 'pointer',
              background: !isViews ? '#ffffff' : 'transparent',
              color: !isViews ? '#0f172a' : '#64748b',
              boxShadow: !isViews ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            Engagement %
          </button>
        </div>
      </div>

      <div style={{ width: '100%' }}>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="auto" style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isViews ? "#7c3aed" : "#0284c7"} stopOpacity="0.25" />
              <stop offset="100%" stopColor={isViews ? "#7c3aed" : "#0284c7"} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {gridTicks.map((tick, idx) => {
            const y = paddingTop + chartHeight - tick * chartHeight;
            const gridVal = isViews ? Math.round(tick * roundedMax) : (tick * roundedMax);
            return (
              <g key={idx}>
                <line 
                  x1={paddingLeft} 
                  y1={y} 
                  x2={width - paddingRight} 
                  y2={y} 
                  stroke="#e2e8f0" 
                  strokeWidth="1"
                  strokeDasharray={idx === 0 ? "0" : "3 3"}
                />
                <text 
                  x={paddingLeft - 8} 
                  y={y + 3} 
                  textAnchor="end" 
                  fill="#64748b" 
                  style={{ fontSize: '10px', fontWeight: '600' }}
                >
                  {formatNumberAbbr(gridVal)}
                </text>
              </g>
            );
          })}
          
          {/* Fill Area */}
          {points.length > 0 && (
            <path d={areaD} fill="url(#trendGradient)" />
          )}
          
          {/* Stroke Line */}
          {points.length > 0 && (
            <path 
              d={pathD} 
              fill="none" 
              stroke={isViews ? "#7c3aed" : "#0284c7"} 
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          
          {/* Points circles */}
          {points.map((p, idx) => (
            <g key={idx}>
              <circle 
                cx={p.x} 
                cy={p.y} 
                r="4.5" 
                fill="#ffffff" 
                stroke={isViews ? "#7c3aed" : "#0284c7"} 
                strokeWidth="2.5"
                style={{ cursor: 'pointer' }}
              >
                <title>{`${p.title || 'Post'}\n${isViews ? 'Views' : 'Engagement'}: ${isViews ? p.val.toLocaleString() : p.val.toFixed(2) + '%'}\nDate: ${p.date}`}</title>
              </circle>
              <text 
                x={p.x} 
                y={paddingTop + chartHeight + 16} 
                textAnchor="middle" 
                fill="#64748b" 
                style={{ fontSize: '9px', fontWeight: '600' }}
              >
                {shortDate(p.date)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

export default function ClientPortal({ showToast }) {
  const { token } = useParams();
  
  // Auth state
  const [pinRequired, setPinRequired] = useState(false);
  const [pin, setPin] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientType, setClientType] = useState('marketing');
  
  // Dashboard data state
  const [activeTab, setActiveTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [contentList, setContentList] = useState([]);
  const [leads, setLeads] = useState([]);
  const [seoReports, setSeoReports] = useState([]);
  const [pendingPlan, setPendingPlan] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [scripts, setScripts] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState('');

  // Integrations & Social Comments state (4th Tab)
  const [integrations, setIntegrations] = useState({});
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [replyTextMap, setReplyTextMap] = useState({});
  const [replyingId, setReplyingId] = useState(null);
  const [connectingApp, setConnectingApp] = useState(null);
  const [syncingComments, setSyncingComments] = useState(false);

  // Leads & Alerts settings
  const [leadAlertsEnabled, setLeadAlertsEnabled] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const [rejectionReasons, setRejectionReasons] = useState({});
  const [leadsLoading, setLeadsLoading] = useState(false);

  // Add Lead Modal state
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [submittingLead, setSubmittingLead] = useState(false);
  const [newLeadData, setNewLeadData] = useState({
    name: '',
    phone: '',
    email: '',
    platform: 'Meta',
    source: 'form',
    campaign_name: 'Manual Entry',
    qualification_status: 'Pending',
    call_outcome: 'Pending',
    appointment_status: 'Follow Up',
    appointment_date: '',
    rejection_reason: ''
  });

  // Leads filters state
  const [appointmentFilter, setAppointmentFilter] = useState('all');
  const [qualificationFilter, setQualificationFilter] = useState('all');
  const [leadSearchQuery, setLeadSearchQuery] = useState('');

  // Pagination states
  const [contentPage, setContentPage] = useState(1);
  const [seoPage, setSeoPage] = useState(1);
  const [leadsPage, setLeadsPage] = useState(1);
  const [bookingsPage, setBookingsPage] = useState(1);

  // Content pagination inside Content option
  const [currentContentIndex, setCurrentContentIndex] = useState(0);
  const [contentCommentText, setContentCommentText] = useState('');

  const ITEMS_PER_PAGE_CONTENT = 10;
  const ITEMS_PER_PAGE_SEO = 5;
  const ITEMS_PER_PAGE_LEADS = 10;
  const ITEMS_PER_PAGE_BOOKINGS = 10;

  useEffect(() => { setContentPage(1); }, [contentList]);
  useEffect(() => { setSeoPage(1); }, [seoReports]);
  useEffect(() => { setLeadsPage(1); }, [leads]);
  useEffect(() => { setBookingsPage(1); }, [bookings]);

  // Adjust index when plan length changes
  useEffect(() => {
    if (pendingPlan && currentContentIndex >= pendingPlan.length) {
      setCurrentContentIndex(Math.max(0, pendingPlan.length - 1));
    }
  }, [pendingPlan]);
  
  // Feedback form
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  
  // Modal state for change request
  const [rejectingItem, setRejectingItem] = useState(null);
  const [rejectionComment, setRejectionComment] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);
  
  // Expanded card state
  const [expandedItems, setExpandedItems] = useState({});

  const toggleExpand = (id) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const formatDateStr = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [year, month, day] = parts;
    const monthName = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ][parseInt(month, 10) - 1];
    return `${parseInt(day, 10)} ${monthName} ${year}`;
  };

  const formatMonthName = (monthStr) => {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${monthNames[parseInt(month, 10) - 1]} ${year}`;
  };

  // Setup/Cleanup portal-active body class
  useEffect(() => {
    document.body.classList.add('portal-active');
    return () => {
      document.body.classList.remove('portal-active');
    };
  }, []);

  // Try fetching to see if authenticated/PIN required
  useEffect(() => {
    checkPortalAuth();
  }, [token]);

  // Leads Polling Side Effect (every 30 seconds, runs when verified)
  useEffect(() => {
    if (!isVerified || (clientType !== 'marketing' && clientType !== 'both')) return;

    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/portal/${token}/leads`, { credentials: 'include' });
        const data = await res.json();
        if (res.ok && data.leads) {
          // Compare lists to identify new leads
          const existingIds = new Set(leads.map(l => l.id));
          const newLeads = data.leads.filter(l => !existingIds.has(l.id));
          
          if (newLeads.length > 0) {
            // New leads detected!
            setLeads(data.leads);
            
            // Play notification chime and browser alert if notifications are enabled
            if (leadAlertsEnabled) {
              playNotificationSound();
              const latestLead = newLeads[0];
              triggerSystemNotification(
                `🔔 New Lead Captured!`,
                `${latestLead.name} (${latestLead.platform || 'Ads'})`
              );
              showToast(`New Lead captured: ${latestLead.name}!`, 'success');
            }
          }
        }
      } catch (err) {
        console.error('[POLLING] Error checking for new leads:', err);
      }
    }, 30000); // 30 seconds

    return () => clearInterval(intervalId);
  }, [isVerified, leads, leadAlertsEnabled, token, clientType]);

  const checkPortalAuth = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/portal/${token}/overview`, { credentials: 'include' });
      const data = await response.json();
      
      if (response.status === 401 && data.requires_pin) {
        setPinRequired(true);
        setIsVerified(false);
      } else if (response.ok) {
        setIsVerified(true);
        setPinRequired(false);
        setClientName(data.client_name);
        setClientType(data.client_type || 'marketing');
        
        if (data.client_type === 'artist_curation') {
          setActiveTab('bookings');
        } else if (activeTab !== 'reports' && activeTab !== 'content' && activeTab !== 'bookings' && activeTab !== 'leads') {
          setActiveTab('overview');
        }
        
        setOverview(data);
        if (data.lead_alerts_enabled !== undefined) {
          setLeadAlertsEnabled(!!data.lead_alerts_enabled);
        }
        fetchData(data.client_type || 'marketing');
      } else {
        throw new Error(data.error || 'Unable to access portal');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const verifyPin = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_BASE}/api/portal/${token}/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
        credentials: 'include'
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
      }
      setIsVerified(true);
      setPinRequired(false);
      setClientName(data.client_name);
      showToast('PIN verified successfully', 'success');
      checkPortalAuth(); // Reload dashboard data
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const fetchData = async (type = clientType) => {
    try {
      if (type === 'artist_curation' || type === 'both') {
        const resBookings = await fetch(`${API_BASE}/api/portal/${token}/bookings`, { credentials: 'include' });
        const dataBookings = await resBookings.json();
        if (resBookings.ok) setBookings(dataBookings.bookings || []);
      }
      if (type === 'marketing' || type === 'both') {
        // Content list
        const resContent = await fetch(`${API_BASE}/api/portal/${token}/content`, { credentials: 'include' });
        const dataContent = await resContent.json();
        if (resContent.ok) setContentList(dataContent.content || []);

        // Leads list
        setLeadsLoading(true);
        try {
          const resLeads = await fetch(`${API_BASE}/api/portal/${token}/leads`, { credentials: 'include' });
          const dataLeads = await resLeads.json();
          if (resLeads.ok) setLeads(dataLeads.leads || []);
        } catch (e) {
          console.error('Error fetching leads:', e);
        } finally {
          setLeadsLoading(false);
        }

        // SEO monthly reports
        const resSEO = await fetch(`${API_BASE}/api/portal/${token}/seo-reports`, { credentials: 'include' });
        const dataSEO = await resSEO.json();
        if (resSEO.ok) setSeoReports(dataSEO.reports || []);

        // Content plan pending approval
        const resPlan = await fetch(`${API_BASE}/api/portal/${token}/content-plan`, { credentials: 'include' });
        const dataPlan = await resPlan.json();
        if (resPlan.ok) setPendingPlan(dataPlan.content_plan || []);

        // Fetch monthly scripts (Content tab)
        const resScripts = await fetch(`${API_BASE}/api/portal/${token}/scripts`, { credentials: 'include' });
        const dataScripts = await resScripts.json();
        if (resScripts.ok) {
          const loadedScripts = dataScripts.scripts || [];
          setScripts(loadedScripts);
          if (loadedScripts.length > 0) {
            const months = [...new Set(loadedScripts.map(s => s.month))].sort((a, b) => b.localeCompare(a));
            setSelectedMonth(prev => prev || months[0] || '');
          }
        }

        // Fetch integrations and comments
        fetchIntegrations();
        fetchComments();
      }
    } catch (err) {
      console.error('Error fetching portal sub-data:', err);
    }
  };

  // Notification Chime Sound Synthesizer
  const playNotificationSound = (force = false) => {
    if (!leadAlertsEnabled && !force) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const playTone = (frequency, startTime, duration, type = 'sine', volume = 0.3) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, startTime);
        gainNode.gain.setValueAtTime(volume, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      
      const now = ctx.currentTime;
      // Play a beautiful, clear arpeggiated C-Major chime (C5 -> E5 -> G5 -> C6)
      playTone(523.25, now, 0.25, 'sine', 0.25);        // C5
      playTone(659.25, now + 0.12, 0.25, 'sine', 0.25); // E5
      playTone(783.99, now + 0.24, 0.25, 'sine', 0.25); // G5
      playTone(1046.50, now + 0.36, 0.5, 'sine', 0.35);  // C6
    } catch (e) {
      console.warn('AudioContext sound blocked or unsupported:', e);
    }
  };

  // Trigger system notification
  const triggerSystemNotification = (title, body) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, { body });
      } catch (err) {
        console.error('Failed to trigger system notification:', err);
      }
    }
  };

  // Handle request permission
  const handleRequestPermission = () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      Notification.requestPermission().then(permission => {
        setNotificationPermission(permission);
        if (permission === 'granted') {
          showToast('System notifications enabled!', 'success');
          playNotificationSound(true);
        } else {
          showToast('System notifications blocked. Please enable them in browser settings.', 'warning');
        }
      });
    }
  };

  // Toggle client leads alerts
  const toggleLeadAlerts = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/portal/${token}/lead-alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !leadAlertsEnabled }),
        credentials: 'include'
      });
      const data = await response.json();
      if (response.ok) {
        setLeadAlertsEnabled(data.lead_alerts_enabled);
        showToast(data.lead_alerts_enabled ? 'Lead alerts enabled' : 'Lead alerts muted', 'success');
      } else {
        throw new Error(data.error || 'Failed to toggle lead alerts');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Update lead fields (qualification status, call outcome, appointment status/date, rejection reason)
  const handleUpdateLead = async (leadId, updates) => {
    try {
      const response = await fetch(`${API_BASE}/api/portal/${token}/leads/${leadId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
        credentials: 'include'
      });
      const data = await response.json();
      if (response.ok) {
        setLeads(prev => prev.map(l => l.id === leadId ? { 
          ...l, 
          qualification_status: data.qualification_status,
          call_outcome: data.call_outcome,
          appointment_status: data.appointment_status,
          appointment_date: data.appointment_date,
          rejection_reason: data.rejection_reason,
          lead_status: data.lead_status
        } : l));
        showToast('Lead updated successfully', 'success');
      } else {
        throw new Error(data.error || 'Failed to update lead');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleAddManualLead = async (e) => {
    e.preventDefault();
    if (!newLeadData.name.trim() || !newLeadData.phone.trim()) {
      showToast('Name and Phone are required fields', 'error');
      return;
    }

    setSubmittingLead(true);
    try {
      const response = await fetch(`${API_BASE}/api/portal/${token}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLeadData),
        credentials: 'include'
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to add lead');
      }

      showToast('Lead added successfully!', 'success');
      setShowAddLeadModal(false);
      setNewLeadData({
        name: '',
        phone: '',
        email: '',
        platform: 'Meta',
        source: 'form',
        campaign_name: 'Manual Entry',
        qualification_status: 'Pending',
        call_outcome: 'Pending',
        appointment_status: 'Follow Up',
        appointment_date: '',
        rejection_reason: ''
      });

      if (data.lead) {
        setLeads(prev => [data.lead, ...prev]);
      } else {
        fetchData();
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmittingLead(false);
    }
  };

  const fetchIntegrations = async () => {
    try {
      setIntegrationsLoading(true);
      const res = await fetch(`${API_BASE}/api/portal/${token}/integrations/status`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.integrations) {
        setIntegrations(data.integrations);
      }
    } catch (err) {
      console.error('Error fetching integrations:', err);
    } finally {
      setIntegrationsLoading(false);
    }
  };

  const fetchComments = async () => {
    try {
      setCommentsLoading(true);
      const res = await fetch(`${API_BASE}/api/portal/${token}/comments`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.comments) {
        setComments(data.comments);
      }
    } catch (err) {
      console.error('Error fetching comments:', err);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleConnectApp = async (appName) => {
    try {
      setConnectingApp(appName);
      const res = await fetch(`${API_BASE}/api/portal/${token}/integrations/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appName, redirectUrl: window.location.href }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate connect link');
      if (data.connectUrl) {
        window.open(data.connectUrl, '_blank', 'width=600,height=700');
        showToast(`Opening ${appName} OAuth login window...`, 'info');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setConnectingApp(null);
    }
  };

  const handleSyncComments = async () => {
    try {
      setSyncingComments(true);
      showToast('Syncing comments from Instagram...', 'info');
      const res = await fetch(`${API_BASE}/api/portal/${token}/comments/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to sync comments');
      showToast(`Synced ${data.synced} comments from ${data.postsChecked} posts`, 'success');
      fetchComments();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSyncingComments(false);
    }
  };

  const handleSendCommentReply = async (commentId, platform) => {
    const text = replyTextMap[commentId];
    if (!text || !text.trim()) {
      showToast('Please type a reply message', 'error');
      return;
    }

    try {
      setReplyingId(commentId);
      const res = await fetch(`${API_BASE}/api/portal/${token}/comments/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId, replyText: text, platform }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send reply');

      showToast('✓ Reply posted live to social platform!', 'success');
      setReplyTextMap(prev => ({ ...prev, [commentId]: '' }));
      fetchComments();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setReplyingId(null);
    }
  };


  const handleApprove = async (id, contentId = null) => {
    if (!window.confirm('Are you sure you want to approve this?')) return;
    try {
      const url = contentId 
        ? `${API_BASE}/api/portal/${token}/content-plan/${contentId}/approve`
        : `${API_BASE}/api/portal/${token}/content-plan/script/${id}/approve`;
        
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to approve');
      
      showToast('Approved successfully', 'success');
      fetchData();
      checkPortalAuth();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleReject = async (id, comment, contentId = null) => {
    if (!comment.trim()) {
      showToast('Please enter your comments before submitting.', 'error');
      return;
    }
    setSubmittingDecision(true);
    try {
      const url = contentId
        ? `${API_BASE}/api/portal/${token}/content-plan/${contentId}/reject`
        : `${API_BASE}/api/portal/${token}/content-plan/script/${id}/reject`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment }),
        credentials: 'include'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to request changes');

      showToast('Comments and revisions submitted successfully', 'success');
      setContentCommentText('');
      fetchData();
      checkPortalAuth();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmittingDecision(false);
    }
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    if (!feedbackMsg.trim()) return;

    setSubmittingFeedback(true);
    try {
      const response = await fetch(`${API_BASE}/api/portal/${token}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: feedbackMsg }),
        credentials: 'include'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to submit feedback');

      showToast('Feedback submitted successfully', 'success');
      setFeedbackMsg('');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const uniqueMonths = [...new Set(scripts.map(s => s.month))].sort((a, b) => b.localeCompare(a));

  const renderPagination = (currentPage, totalItems, itemsPerPage, onPageChange) => {
    const totalPages = Math.max(Math.ceil(totalItems / itemsPerPage), 1);
    if (totalPages <= 1) return null;

    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap', gap: '12px' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          Page {currentPage} of {totalPages} ({totalItems} items)
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="portal-btn"
            style={{ padding: '6px 14px', fontSize: '0.75rem', fontWeight: '800' }}
          >
            Prev
          </button>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="portal-btn"
            style={{ padding: '6px 14px', fontSize: '0.75rem', fontWeight: '800' }}
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  if (pinRequired) {
    return (
      <div className="client-portal-wrapper">
        <style dangerouslySetInnerHTML={{ __html: PORTAL_STYLES }} />
        <div className="portal-bento-card" style={{ width: '100%', maxWidth: '420px', padding: '32px', textAlign: 'center', marginTop: '10vh' }}>
          <div style={{ display: 'inline-flex', padding: '12px', background: '#000000', color: '#ffffff', border: '3px solid #000000', borderRadius: '50%', marginBottom: '16px', boxShadow: '2px 2px 0px #000000' }}>
            <Lock size={32} />
          </div>
          <h2 style={{ marginBottom: '8px', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '-0.02em' }}>Security Verification</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px', fontWeight: 700 }}>
            Please enter your Client PIN to access the performance dashboard and approval portal.
          </p>
          <form onSubmit={verifyPin}>
            <div className="portal-form-group">
              <input
                type="password"
                className="portal-control"
                placeholder="Enter PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                style={{ textAlign: 'center', fontSize: '1.25rem', letterSpacing: '0.2em' }}
                required
              />
            </div>
            <button type="submit" className="portal-btn portal-btn-primary" style={{ width: '100%', padding: '12px', marginTop: '16px' }}>
              Verify Access
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!isVerified || !overview) {
    return (
      <div className="client-portal-wrapper" style={{ justifyContent: 'center' }}>
        <style dangerouslySetInnerHTML={{ __html: PORTAL_STYLES }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ border: '3px solid #000000', borderTop: '3px solid #a855f7', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }}></div>
          <p style={{ color: '#000000', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.9rem' }}>Verifying secure token access...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="client-portal-wrapper">
      <style dangerouslySetInnerHTML={{ __html: PORTAL_STYLES }} />
      
      <div className="portal-container">
        
        {/* Portal Header */}
        <header className="portal-header-banner">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            {/* Left side text block */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 300px' }}>
              <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="portal-header-tag" style={{ margin: 0 }}>
                  Client Portal
                </span>
                {overview.pending_approvals > 0 && (
                  <span className="portal-badge portal-badge-warning" style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', margin: 0 }}>
                    {overview.pending_approvals} Approval Pending
                  </span>
                )}
              </div>
              <h1 className="portal-header-title">{clientName}</h1>
              {overview.sister_companies && overview.sister_companies.length > 0 && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px', fontWeight: '800' }}>
                  Group Locations: <strong style={{ color: '#000000' }}>{clientName}</strong>, {overview.sister_companies.join(', ')}
                </div>
              )}
            </div>

            {/* Right side actions block */}
            {(clientType === 'marketing' || clientType === 'both') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button 
                  onClick={notificationPermission === 'default' ? handleRequestPermission : toggleLeadAlerts}
                  className={`portal-btn ${leadAlertsEnabled && notificationPermission === 'granted' ? 'portal-btn-primary' : ''}`}
                  style={{ 
                    padding: '10px 18px', 
                    fontSize: '0.85rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: 'auto'
                  }}
                  title={
                    notificationPermission === 'default' 
                      ? 'Enable Browser Notifications' 
                      : (leadAlertsEnabled ? 'Mute Lead Alerts' : 'Unmute Lead Alerts')
                  }
                >
                  {notificationPermission === 'default' ? (
                    <>
                      <Bell size={16} />
                      <span>Alert ON</span>
                    </>
                  ) : leadAlertsEnabled ? (
                    <>
                      <Bell size={16} style={{ color: '#ffffff' }} />
                      <span>Alert ON</span>
                    </>
                  ) : (
                    <>
                      <BellOff size={16} style={{ color: 'var(--text-muted)' }} />
                      <span>Alerts Muted</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Tabs Menu */}
        <div className="portal-tabs-container">
          {(clientType === 'marketing' || clientType === 'both') && (
            <>
              <button 
                onClick={() => setActiveTab('overview')} 
                className={`portal-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
              >
                <BarChart2 size={16} /> Overview
              </button>
              <button 
                onClick={() => setActiveTab('reports')} 
                className={`portal-tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
              >
                <TrendingUp size={16} /> Reports
              </button>
              <button 
                onClick={() => setActiveTab('content')} 
                className={`portal-tab-btn ${activeTab === 'content' ? 'active' : ''}`}
                style={{ position: 'relative' }}
              >
                <Calendar size={16} /> Content
                {overview?.pending_approvals > 0 && (
                  <span style={{ position: 'absolute', top: '8px', right: '12px', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--border-color)' }} />
                )}
              </button>
              <button 
                onClick={() => setActiveTab('leads')} 
                className={`portal-tab-btn ${activeTab === 'leads' ? 'active' : ''}`}
              >
                <Users size={16} /> Leads
              </button>
              <button 
                onClick={() => setActiveTab('integrations')} 
                className={`portal-tab-btn ${activeTab === 'integrations' ? 'active' : ''}`}
              >
                <Share2 size={16} /> Integrations
              </button>
            </>
          )}

          {(clientType === 'artist_curation' || clientType === 'both') && (
            <button 
              onClick={() => setActiveTab('bookings')} 
              className={`portal-tab-btn ${activeTab === 'bookings' ? 'active' : ''}`}
            >
              <TrendingUp size={16} /> Artist Bookings
            </button>
          )}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (clientType === 'marketing' || clientType === 'both') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h2 style={{ fontSize: '1.25rem', margin: '4px 0', textTransform: 'uppercase', fontWeight: 800 }}>Performance Summary</h2>
            
            <div className="portal-metrics-grid">
              {/* Content Stats */}
              {overview.content && (
                <>
                  <div className="portal-metric-card">
                    <span className="portal-metric-label">Total Video Views</span>
                    <span className="portal-metric-value" style={{ color: 'var(--accent-purple)' }}>{overview.content.total_views?.toLocaleString() || 0}</span>
                  </div>
                  <div className="portal-metric-card">
                    <span className="portal-metric-label">Avg Engagement Rate</span>
                    <span className="portal-metric-value" style={{ color: 'var(--accent-cyan)' }}>{overview.content.avg_engagement_rate || 0}%</span>
                  </div>
                  <div className="portal-metric-card">
                    <span className="portal-metric-label">Content Quality Score</span>
                    <span className="portal-metric-value" style={{ color: 'var(--accent-rose)' }}>{overview.content.avg_content_score || 0}</span>
                  </div>
                </>
              )}

              {/* Ads Stats */}
              {overview.ads && (
                <>
                  <div className="portal-metric-card">
                    <span className="portal-metric-label">Total Leads Captured</span>
                    <span className="portal-metric-value" style={{ color: 'var(--accent-blue)' }}>{overview.ads.total_leads || 0}</span>
                  </div>
                  <div className="portal-metric-card">
                    <span className="portal-metric-label">Qualified Leads</span>
                    <span className="portal-metric-value" style={{ color: 'var(--accent-cyan)' }}>{overview.ads.qualified_leads || 0}</span>
                  </div>
                  <div className="portal-metric-card">
                    <span className="portal-metric-label">Appointments Booked</span>
                    <span className="portal-metric-value" style={{ color: 'var(--accent-purple)' }}>{overview.ads.appointments_booked || 0}</span>
                  </div>
                </>
              )}
            </div>

            {/* Performance Trend Chart */}
            <PerformanceTrendChart data={overview.views_trend} />

            {/* Executive Donut Charts */}
            <div className="portal-grid-half">
              {/* Post Type Breakdown Donut Chart */}
              {(() => {
                const postTypeCounts = {};
                (contentList || []).forEach(item => {
                  const t = item.post_type || 'Other';
                  postTypeCounts[t] = (postTypeCounts[t] || 0) + 1;
                });
                const postTypeData = Object.keys(postTypeCounts).map((type, idx) => {
                  const colors = ['#7c3aed', '#0284c7', '#059669', '#f59e0b', '#e11d48'];
                  return { label: type, value: postTypeCounts[type], color: colors[idx % colors.length] };
                });
                return <PortalDonutChart title="Post Format Distribution" data={postTypeData} totalLabel="Posts" />;
              })()}

              {/* Engagement Breakdown Donut Chart */}
              {(() => {
                const totalLikes = (contentList || []).reduce((sum, item) => sum + (item.likes || 0), 0);
                const totalComments = (contentList || []).reduce((sum, item) => sum + (item.comments || 0), 0);
                const totalShares = (contentList || []).reduce((sum, item) => sum + (item.shares || 0), 0);
                const totalSaves = (contentList || []).reduce((sum, item) => sum + (item.saves || 0), 0);

                const engagementData = [
                  { label: 'Likes', value: totalLikes, color: '#059669' },
                  { label: 'Comments', value: totalComments, color: '#4f46e5' },
                  { label: 'Shares', value: totalShares, color: '#0284c7' },
                  { label: 'Saves', value: totalSaves, color: '#7c3aed' }
                ].filter(d => d.value > 0);

                return <PortalDonutChart title="Engagement Breakdown" data={engagementData} totalLabel="Actions" />;
              })()}
            </div>

            {/* Top Content Performance Bar Chart */}
            <TopContentBarChart contentList={contentList} />

            {/* Ad Campaign Performance Bar Charts */}
            {overview.ads_breakdown && overview.ads_breakdown.length > 0 && (
              <div className="portal-bento-card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '1.05rem', marginBottom: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>Ad Campaigns Performance</h3>
                {(() => {
                  const maxSpend = Math.max(...overview.ads_breakdown.map(item => item.spend || 0), 1);
                  const maxLeads = Math.max(...overview.ads_breakdown.map(item => item.leads || 0), 1);
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div>
                        <h4 style={{ fontSize: '0.78rem', marginBottom: '6px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ad Spend (₹)</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {overview.ads_breakdown.map((item, idx) => {
                            const widthPct = ((item.spend || 0) / maxSpend) * 100;
                            const colors = ['#2563eb', '#059669', '#d97706'];
                            const color = colors[idx % colors.length];
                            return (
                              <div key={item.platform} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: '700' }}>
                                  <span style={{ textTransform: 'capitalize' }}>{item.platform}</span>
                                  <span>₹{(item.spend || 0).toLocaleString()}</span>
                                </div>
                                <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '9999px', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${Math.max(widthPct, 2)}%`, background: color, borderRadius: '9999px' }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <h4 style={{ fontSize: '0.78rem', marginBottom: '6px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Leads Generated</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {overview.ads_breakdown.map((item, idx) => {
                            const widthPct = ((item.leads || 0) / maxLeads) * 100;
                            const colors = ['#7c3aed', '#0284c7', '#e11d48'];
                            const color = colors[idx % colors.length];
                            return (
                              <div key={item.platform} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: '700' }}>
                                  <span style={{ textTransform: 'capitalize' }}>{item.platform}</span>
                                  <span>{item.leads || 0} leads</span>
                                </div>
                                <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '9999px', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${Math.max(widthPct, 2)}%`, background: color, borderRadius: '9999px' }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Assist Feedback form */}
            <div className="portal-bento-card" style={{ padding: '24px', marginTop: '12px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '8px', textTransform: 'uppercase' }}>Need assistance or request changes?</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px', fontWeight: 600 }}>
                Drop a note directly to our operations team. We will be notified instantly.
              </p>
              <form onSubmit={handleFeedbackSubmit} style={{ display: 'flex', gap: '12px' }}>
                <input
                  type="text"
                  className="portal-control"
                  placeholder="Ask a question or request an update..."
                  value={feedbackMsg}
                  onChange={(e) => setFeedbackMsg(e.target.value)}
                  style={{ flexGrow: 1 }}
                  required
                />
                <button type="submit" className="portal-btn portal-btn-primary" disabled={submittingFeedback} style={{ padding: '12px 20px' }}>
                  <Send size={16} />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Reports Tab (Tab 2) */}
        {activeTab === 'reports' && (clientType === 'marketing' || clientType === 'both') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* SEO Reports Table */}
            <div>
              <h2 style={{ fontSize: '1.25rem', margin: '4px 0 12px 0', textTransform: 'uppercase', fontWeight: 800 }}>SEO Monthly Reports</h2>
              {seoReports.length === 0 ? (
                <div className="portal-bento-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 800 }}>
                  No SEO reports found yet.
                </div>
              ) : (
                <>
                  <div className="portal-table-container">
                    <table className="portal-table">
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th>Traffic</th>
                          <th>Clicks</th>
                          <th>Map Views</th>
                          <th>GMB Views</th>
                          <th>GMB Clicks</th>
                          <th>Calls</th>
                          <th>Directions</th>
                          <th>DA</th>
                          <th>Blogs</th>
                          <th>AI Overview</th>
                        </tr>
                      </thead>
                      <tbody>
                        {seoReports.slice((seoPage - 1) * ITEMS_PER_PAGE_SEO, seoPage * ITEMS_PER_PAGE_SEO).map(r => (
                          <tr key={r.id}>
                            <td style={{ fontWeight: '800', color: '#000000', whiteSpace: 'nowrap' }}>{formatMonthName(r.month)}</td>
                            <td>{r.website_traffic?.toLocaleString() || '-'}</td>
                            <td>{r.website_clicks || '-'}</td>
                            <td>{r.map_views?.toLocaleString() || '-'}</td>
                            <td>{r.gmb_views?.toLocaleString() || '-'}</td>
                            <td>{r.gmb_clicks?.toLocaleString() || '-'}</td>
                            <td>{r.calls?.toLocaleString() || '-'}</td>
                            <td>{r.directions?.toLocaleString() || '-'}</td>
                            <td>{r.da || '-'}</td>
                            <td>{r.blogs || '-'}</td>
                            <td>
                              <span className={`portal-badge ${r.ai_overview_visible === 'Yes' ? 'portal-badge-success' : 'portal-badge-muted'}`}>
                                {r.ai_overview_visible || 'No'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {renderPagination(seoPage, seoReports.length, ITEMS_PER_PAGE_SEO, setSeoPage)}
                </>
              )}
            </div>

            {/* Content Tracker Table */}
            <div>
              <h2 style={{ fontSize: '1.25rem', margin: '4px 0 12px 0', textTransform: 'uppercase', fontWeight: 800 }}>Tracked Content Performance</h2>
              {contentList.length === 0 ? (
                <div className="portal-bento-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 800 }}>
                  No tracked posts found yet.
                </div>
              ) : (
                <>
                  <div className="portal-table-container">
                    <table className="portal-table">
                      <thead>
                        <tr>
                          <th>Platform</th>
                          <th>Post Type</th>
                          <th>Title</th>
                          <th>Views</th>
                          <th>Likes</th>
                          <th>Comments</th>
                          <th>Shares</th>
                          <th>Saves</th>
                          <th>Avg Watch Time %</th>
                          <th>Skip Rate %</th>
                          <th>Engagement %</th>
                          <th>Score</th>
                          <th>Date</th>
                          <th>Link</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contentList.slice((contentPage - 1) * ITEMS_PER_PAGE_CONTENT, contentPage * ITEMS_PER_PAGE_CONTENT).map(item => (
                          <tr key={item.id}>
                            <td>
                              <span className={`portal-badge ${item.platform === 'instagram' ? 'portal-badge-info' : 'portal-badge-success'}`}>
                                {item.platform}
                              </span>
                            </td>
                            <td style={{ textTransform: 'capitalize' }}>{item.post_type}</td>
                            <td style={{ fontWeight: '800', color: '#000000' }}>{item.title || 'Untitled Post'}</td>
                            <td>
                              {item.platform === 'youtube' ? (item.youtube_views?.toLocaleString() || 0) : (item.views?.toLocaleString() || 0)}
                            </td>
                            <td>{item.likes?.toLocaleString() || 0}</td>
                            <td>{item.comments?.toLocaleString() || 0}</td>
                            <td>{item.shares?.toLocaleString() || 0}</td>
                            <td>{item.saves?.toLocaleString() || 0}</td>
                            <td>{item.avg_watch_time_pct ? `${item.avg_watch_time_pct}%` : '-'}</td>
                            <td>{item.skip_rate_pct ? `${item.skip_rate_pct}%` : '-'}</td>
                            <td>
                              {item.engagement_rate_pct ? `${item.engagement_rate_pct}%` : '0%'}
                            </td>
                            <td>{item.content_score || 0}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>{formatDateStr(item.date)}</td>
                            <td>
                              {item.link ? (
                                <a href={item.link} target="_blank" rel="noopener noreferrer" className="portal-badge" style={{ textDecoration: 'none', color: '#000000', fontWeight: '800' }}>
                                  <ExternalLink size={12} />
                                </a>
                              ) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {renderPagination(contentPage, contentList.length, ITEMS_PER_PAGE_CONTENT, setContentPage)}
                </>
              )}
            </div>

          </div>
        )}

        {/* Content Tab (3rd Tab) */}
        {activeTab === 'content' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 style={{ fontSize: '1.25rem', margin: '4px 0', textTransform: 'uppercase', fontWeight: 800 }}>Monthly Content Plans</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '8px', fontWeight: 600 }}>
              Read the finalized scripts and concepts prepared for your brand. Approve items or request changes with a comment.
            </p>

            {uniqueMonths.length === 0 ? (
              <div className="portal-bento-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 800 }}>
                No scripts uploaded yet.
              </div>
            ) : (
              <>
                {/* Month selector */}
                <div className="portal-month-selector" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
                  {uniqueMonths.map(m => (
                    <button 
                      key={m} 
                      onClick={() => {
                        setSelectedMonth(m);
                        setCurrentContentIndex(0);
                        setContentCommentText('');
                      }}
                      className={`portal-month-tab ${selectedMonth === m ? 'active' : ''}`}
                      style={{ padding: '8px 16px', borderRadius: '20px', border: '2px solid #000000', cursor: 'pointer', background: selectedMonth === m ? '#000000' : '#ffffff', color: selectedMonth === m ? '#ffffff' : '#000000', fontWeight: '800' }}
                    >
                      {formatMonthName(m)}
                    </button>
                  ))}
                </div>

                {(() => {
                  const filteredScripts = scripts.filter(s => s.month === selectedMonth);

                  if (filteredScripts.length === 0) {
                    return (
                      <div className="portal-bento-card" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 800 }}>
                        No scripts found for this month.
                      </div>
                    );
                  }

                  const index = currentContentIndex >= filteredScripts.length ? Math.max(0, filteredScripts.length - 1) : currentContentIndex;
                  const item = filteredScripts[index];
                  if (!item) return null;

                  const isApproved = ['Client Approved', 'Pending', 'Posted'].includes(item.content_status);

                  return (
                    <div className="portal-bento-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      {/* Pagination Controls */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000000', paddingBottom: '16px' }}>
                        <button 
                          className="portal-btn"
                          disabled={index === 0}
                          onClick={() => {
                            setCurrentContentIndex(index - 1);
                            setContentCommentText('');
                          }}
                          style={{ padding: '8px 16px' }}
                        >
                          &larr; Previous
                        </button>
                        <span style={{ fontWeight: 800, fontSize: '0.9rem', textTransform: 'uppercase' }}>
                          Script {index + 1} of {filteredScripts.length}
                        </span>
                        <button 
                          className="portal-btn"
                          disabled={index === filteredScripts.length - 1}
                          onClick={() => {
                            setCurrentContentIndex(index + 1);
                            setContentCommentText('');
                          }}
                          style={{ padding: '8px 16px' }}
                        >
                          Next &rarr;
                        </button>
                      </div>

                      {/* Content Item Details */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                          <div>
                            <span className="portal-badge portal-badge-info" style={{ marginRight: '6px', textTransform: 'uppercase' }}>
                              {item.format === 'long_format' ? 'Long Format' : 'Reel'}
                            </span>
                            {item.content_status ? (
                              <span className={`portal-badge ${
                                isApproved ? 'portal-badge-success' :
                                item.content_status === 'Pending Client Approval' ? 'portal-badge-warning' :
                                item.content_status === 'Client Rejected' ? 'portal-badge-danger' : 'portal-badge-muted'
                              }`} style={{ textTransform: 'uppercase' }}>
                                {item.content_status === 'Pending' ? 'Approved (Pending Posting)' : item.content_status}
                              </span>
                            ) : (
                              <span className="portal-badge portal-badge-warning" style={{ textTransform: 'uppercase' }}>
                                Pending Client Approval
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 800 }}>
                            Last updated: {formatDateStr(item.updated_at?.split('T')[0] || '')}
                          </span>
                        </div>

                        <h3 style={{ fontSize: '1.25rem', fontWeight: '800', marginBottom: '12px', textTransform: 'uppercase' }}>{item.title}</h3>

                        {/* Script details */}
                        <div className="portal-script-box" style={{ maxHeight: 'none', background: 'var(--bg-input)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', whiteSpace: 'pre-wrap' }}>
                          {item.script_text || 'No script text provided.'}
                        </div>

                        {/* Reference video links */}
                        {(item.reference_video_link || item.reaction_video_link) && (
                          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '16px' }}>
                            {item.reference_video_link && (
                              <a 
                                href={item.reference_video_link} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="portal-btn" 
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.8rem' }}
                              >
                                <PlayCircle size={14} /> Reference Video
                              </a>
                            )}
                            {item.reaction_video_link && (
                              <a 
                                href={item.reaction_video_link} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="portal-btn" 
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.8rem' }}
                              >
                                <PlayCircle size={14} /> Reaction Video
                              </a>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Comment & Actions Form or Status Message */}
                      <div style={{ borderTop: '2px solid #000000', paddingTop: '20px' }}>
                        {!isApproved ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {item.content_status === 'Client Rejected' && item.client_comments && (
                              <div style={{ background: '#fffbeb', border: '2px solid #fbbf24', borderRadius: '6px', padding: '10px 14px', color: '#92400e', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>
                                <strong>Previous Revision Request:</strong> "{item.client_comments}"
                              </div>
                            )}
                            <div className="portal-form-group" style={{ margin: 0 }}>
                              <label className="portal-label" style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', marginBottom: '6px', display: 'block' }}>
                                Comments / Feedback for Revisions
                              </label>
                              <textarea
                                className="portal-control"
                                rows={3}
                                placeholder="Type any comments or requested edits here. If you want changes, type them here and click 'Request Changes' below."
                                value={contentCommentText}
                                onChange={(e) => setContentCommentText(e.target.value)}
                                style={{ resize: 'vertical', width: '100%', background: '#ffffff', border: '2px solid #000000', borderRadius: '6px', padding: '10px' }}
                              />
                            </div>

                            <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                              <button 
                                onClick={() => handleReject(item.id, contentCommentText, item.content_id)}
                                className="portal-btn portal-btn-danger" 
                                style={{ flexGrow: 1, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '6px' }}
                                disabled={submittingDecision}
                              >
                                <X size={16} /> Request Changes with Comment
                              </button>
                              <button 
                                onClick={() => handleApprove(item.id, item.content_id)}
                                className="portal-btn portal-btn-success" 
                                style={{ flexGrow: 1, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '6px' }}
                                disabled={submittingDecision}
                              >
                                <Check size={16} /> Approve Script
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{
                            background: '#d1fae5',
                            border: '2px solid #059669',
                            borderRadius: '8px',
                            padding: '16px',
                            color: '#065f46',
                            fontSize: '0.9rem',
                            fontWeight: '600'
                          }}>
                            {item.content_status === 'Posted' ? (
                              <div>🎉 Approved and posted live!</div>
                            ) : (
                              <div>✓ You have approved this script! Status: {item.content_status === 'Pending' ? 'Approved (Pending Posting)' : item.content_status}</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* Bookings Tab */}
        {activeTab === 'bookings' && (clientType === 'artist_curation' || clientType === 'both') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 style={{ fontSize: '1.25rem', margin: '4px 0', textTransform: 'uppercase', fontWeight: 800 }}>Booked Artists & Performances</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '8px', fontWeight: 600 }}>
              List of artists scheduled for your venues and their payment status.
            </p>

            {bookings.length === 0 ? (
              <div className="portal-bento-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 800 }}>
                No bookings scheduled yet.
              </div>
            ) : (
              <>
                <div className="portal-table-container">
                  <table className="portal-table">
                    <thead>
                      <tr>
                        <th>Artist</th>
                        <th>Date</th>
                        <th>Company & Venue</th>
                        <th>Status</th>
                        <th>Links</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.slice((bookingsPage - 1) * ITEMS_PER_PAGE_BOOKINGS, bookingsPage * ITEMS_PER_PAGE_BOOKINGS).map(b => (
                        <tr key={b.id}>
                          <td style={{ fontWeight: 'bold', color: '#000000' }}>
                            {b.artist_name} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>({b.artist_code})</span>
                          </td>
                          <td>{formatDateStr(b.gig_date)}</td>
                          <td>
                            <div style={{ fontWeight: 'bold', color: '#000000' }}>{b.client_name}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{b.venue_name || '-'}</div>
                          </td>
                          <td>
                            <span className={`portal-badge ${
                              b.status === 'Paid' || b.status === 'Confirmed' ? 'portal-badge-success' :
                              b.status === 'Pending' ? 'portal-badge-warning' :
                              b.status === 'Cancelled' ? 'portal-badge-danger' : 'portal-badge-info'
                            }`}>
                              {b.status}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              {b.swiggy_link && (
                                <a 
                                  href={b.swiggy_link} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="portal-badge"
                                  style={{ 
                                    background: '#fc8019', 
                                    color: '#ffffff', 
                                    border: '2px solid #000000', 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '4px', 
                                    textDecoration: 'none',
                                    fontSize: '0.7rem',
                                    fontWeight: 800,
                                    boxShadow: '1px 1px 0px #000000'
                                  }}
                                >
                                  Swiggy <ExternalLink size={10} />
                                </a>
                              )}
                              {b.zomato_link && (
                                <a 
                                  href={b.zomato_link} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="portal-badge"
                                  style={{ 
                                    background: '#cb202d', 
                                    color: '#ffffff', 
                                    border: '2px solid #000000', 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '4px', 
                                    textDecoration: 'none',
                                    fontSize: '0.7rem',
                                    fontWeight: 800,
                                    boxShadow: '1px 1px 0px #000000'
                                  }}
                                >
                                  Zomato <ExternalLink size={10} />
                                </a>
                              )}
                              {!b.swiggy_link && !b.zomato_link && <span style={{ color: 'var(--text-muted)' }}>-</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {renderPagination(bookingsPage, bookings.length, ITEMS_PER_PAGE_BOOKINGS, setBookingsPage)}
              </>
            )}
          </div>
        )}

        {/* Integrations Tab (4th Tab) */}
        {activeTab === 'integrations' && (clientType === 'marketing' || clientType === 'both') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Header / Subtitle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', margin: '4px 0', textTransform: 'uppercase', fontWeight: 800 }}>
                  Social Integrations & Channel Connections
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0, fontWeight: 600 }}>
                  Connect your brand social accounts via Composio to enable 1080p uncompressed auto-publishing & live performance tracking.
                </p>
              </div>
              <button 
                onClick={() => { fetchIntegrations(); fetchComments(); showToast('Refreshing integrations status...', 'info'); }}
                className="portal-btn"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                disabled={integrationsLoading}
              >
                <RefreshCw size={14} className={integrationsLoading ? 'spin' : ''} /> Refresh All Statuses
              </button>
            </div>

            {/* Section A: Connected Accounts Bento Grid */}
            <div className="portal-metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
              {[
                { key: 'instagram', name: 'Instagram Business', desc: 'Reels, Posts & Video Stream', icon: '📸' },
                { key: 'youtube', name: 'YouTube Channel', desc: 'Shorts & retention graphs', icon: '▶️' },
                { key: 'linkedin', name: 'LinkedIn Company', desc: 'Professional Video Posts', icon: '💼' },
                { key: 'facebook', name: 'Facebook Page', desc: 'Page Reels & Engagement', icon: '📘' },
                { key: 'x', name: 'X (Twitter)', desc: 'Direct Video Posts', icon: '𝕏' }
              ].map(app => {
                const info = integrations[app.key] || {};
                const isConn = info.connected;

                if (isConn) {
                  return (
                    <div key={app.key} className="portal-bento-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '8px 12px', background: '#f0fdf4', borderColor: '#bbf7d0', position: 'relative' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.2rem' }}>{app.icon}</span>
                        <div>
                          <h3 style={{ fontSize: '0.8rem', margin: 0, fontWeight: 800, color: '#166534', lineHeight: 1.1 }}>
                            {app.name.split(' ')[0]} ✓
                          </h3>
                          {info.accountName && (
                            <span style={{ fontSize: '0.65rem', color: '#166534', fontWeight: 600, display: 'block', marginTop: '2px' }}>
                              @{info.accountName}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <button
                        onClick={() => handleConnectApp(app.key)}
                        disabled={connectingApp === app.key}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#166534',
                          fontSize: '0.65rem',
                          fontWeight: '800',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          padding: 0
                        }}
                      >
                        {connectingApp === app.key ? '...' : 'Switch'}
                      </button>
                    </div>
                  );
                }

                return (
                  <div key={app.key} className="portal-bento-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '8px', position: 'relative', overflow: 'hidden', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.2rem' }}>{app.icon}</span>
                        <div>
                          <h3 style={{ fontSize: '0.85rem', margin: 0, fontWeight: 800, color: '#000000', lineHeight: 1.2 }}>{app.name}</h3>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>{app.desc}</span>
                        </div>
                      </div>
                      <span className={`portal-badge ${isConn ? 'portal-badge-success' : 'portal-badge-warning'}`} style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
                        {isConn ? 'Connected' : 'Unlinked'}
                      </span>
                    </div>

                    {isConn && info.accountName && (
                      <div style={{ fontSize: '0.75rem', background: '#f4f4f5', padding: '4px 8px', borderRadius: '4px', border: '1px solid #e4e4e7', color: '#000000', fontWeight: 600 }}>
                        Account: <strong>@{info.accountName}</strong>
                      </div>
                    )}

                    <button
                      onClick={() => handleConnectApp(app.key)}
                      className={`portal-btn ${isConn ? 'portal-btn-success' : ''}`}
                      disabled={connectingApp === app.key}
                      style={{
                        width: '100%',
                        justify: 'center',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '0.75rem',
                        padding: '6px 12px',
                        marginTop: 'auto',
                        background: isConn ? '#dcfce7' : '#000000',
                        color: isConn ? '#166534' : '#ffffff',
                        border: '2px solid #000000'
                      }}
                    >
                      {connectingApp === app.key ? (
                        <>Connecting...</>
                      ) : isConn ? (
                        <><CheckCircle size={12} /> Reconnect / Switch</>
                      ) : (
                        <><Zap size={12} /> Connect {app.name.split(' ')[0]}</>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Section B: Community & Comment Reply Inbox */}
            <div className="portal-bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', margin: '0 0 4px 0', textTransform: 'uppercase', fontWeight: 800 }}>
                    💬 Community & Comment Reply Inbox
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0, fontWeight: 600 }}>
                    Incoming comments across Instagram Reels & YouTube Shorts. Reply live directly from your client portal!
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={handleSyncComments}
                    className="portal-btn portal-btn-primary"
                    style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                    disabled={syncingComments}
                  >
                    {syncingComments ? '⏳ Syncing...' : '🔄 Sync from Instagram'}
                  </button>
                  <button 
                    onClick={fetchComments}
                    className="portal-btn"
                    style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {commentsLoading ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Loading social comments...
                </div>
              ) : comments.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '2px dashed #cbd5e1', color: 'var(--text-muted)' }}>
                  <MessageSquare size={32} style={{ opacity: 0.5, marginBottom: '8px' }} />
                  <div style={{ fontWeight: 800, color: '#000000' }}>No Ingested Comments Yet</div>
                  <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                    Comments are automatically synced every night at 2:00 AM UTC once social accounts are connected.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {comments.map(comm => (
                    <div key={comm.id || comm.comment_id} style={{ background: '#f8fafc', border: '2px solid #000000', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="portal-badge portal-badge-info" style={{ textTransform: 'capitalize' }}>
                            {comm.platform || 'Instagram'}
                          </span>
                          <strong style={{ color: '#000000', fontSize: '0.9rem' }}>@{comm.commenter_name || 'Social User'}</strong>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {comm.post_title ? `Post: ${comm.post_title}` : `Post ID: #${comm.content_id}`}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: 500, paddingLeft: '4px' }}>
                        "{comm.comment_text}"
                      </div>

                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <input
                          type="text"
                          placeholder="Type live reply to post on social platform..."
                          value={replyTextMap[comm.comment_id] || ''}
                          onChange={(e) => setReplyTextMap({ ...replyTextMap, [comm.comment_id]: e.target.value })}
                          style={{
                            flexGrow: 1,
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '2px solid #000000',
                            fontSize: '0.85rem',
                            outline: 'none'
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSendCommentReply(comm.comment_id, comm.platform);
                          }}
                        />
                        <button
                          onClick={() => handleSendCommentReply(comm.comment_id, comm.platform)}
                          className="portal-btn"
                          disabled={replyingId === comm.comment_id}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                        >
                          <Send size={14} /> {replyingId === comm.comment_id ? 'Posting...' : 'Reply'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section C: Live Metrics Direct Refresh */}
            <div className="portal-bento-card" style={{ background: '#f0fdf4', border: '3px solid #000000', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', color: '#166534', fontWeight: 800 }}>
                  ⚡ High-Velocity Metric Sync
                </h4>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#15803d', fontWeight: 600 }}>
                  All portal numbers update automatically 7-days and 30-days post-publishing. Trigger a manual sync anytime.
                </p>
              </div>
              <button
                onClick={() => { fetchData(); showToast('✓ Live metrics synced from cache', 'success'); }}
                className="portal-btn"
                style={{ background: '#166534', color: '#ffffff', border: '2px solid #000000', fontSize: '0.85rem' }}
              >
                Sync Live Metrics Now
              </button>
            </div>

          </div>
        )}

        {/* Leads Tab */}
        {activeTab === 'leads' && (clientType === 'marketing' || clientType === 'both') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Header / Subtitle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', margin: '4px 0', textTransform: 'uppercase', fontWeight: 800 }}>
                  Campaign Leads & Conversions
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0, fontWeight: 600 }}>
                  Review leads captured from forms and calls. Confirm booking appointments or record rejection details.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button 
                  onClick={() => setShowAddLeadModal(true)}
                  className="portal-btn portal-btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                >
                  <UserPlus size={16} /> Add Lead Manually
                </button>
                <button 
                  onClick={() => { fetchData(); showToast('Refreshing leads list...', 'info'); }}
                  className="portal-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                  disabled={leadsLoading}
                >
                  <RefreshCw size={14} className={leadsLoading ? 'spin' : ''} /> Refresh Leads
                </button>
              </div>
            </div>

            {/* Leads Table Container */}
            {(() => {
              const filteredLeads = leads.filter(lead => {
                const apptStatus = lead.appointment_status || 'Follow Up';
                if (appointmentFilter !== 'all' && apptStatus !== appointmentFilter) return false;

                const qualStatus = lead.qualification_status || 'Pending';
                if (qualificationFilter !== 'all' && qualStatus !== qualificationFilter) return false;

                if (leadSearchQuery.trim()) {
                  const q = leadSearchQuery.toLowerCase().trim();
                  const nameMatch = lead.name && lead.name.toLowerCase().includes(q);
                  const phoneMatch = lead.phone && lead.phone.toLowerCase().includes(q);
                  const emailMatch = lead.email && lead.email.toLowerCase().includes(q);
                  const campaignMatch = lead.campaign_name && lead.campaign_name.toLowerCase().includes(q);
                  if (!nameMatch && !phoneMatch && !emailMatch && !campaignMatch) return false;
                }
                return true;
              });

              const apptCounts = {
                all: leads.length,
                Booked: leads.filter(l => l.appointment_status === 'Booked').length,
                'Follow Up': leads.filter(l => (l.appointment_status || 'Follow Up') === 'Follow Up').length,
                'Not Booked': leads.filter(l => l.appointment_status === 'Not Booked').length,
              };

              const qualCounts = {
                all: leads.length,
                Pending: leads.filter(l => (l.qualification_status || 'Pending') === 'Pending').length,
                Qualified: leads.filter(l => l.qualification_status === 'Qualified').length,
                Disqualified: leads.filter(l => l.qualification_status === 'Disqualified').length,
              };

              return (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '1.1rem', margin: 0, textTransform: 'uppercase', fontWeight: 800 }}>Captured Leads Log</h3>
                    {(appointmentFilter !== 'all' || qualificationFilter !== 'all' || leadSearchQuery !== '') && (
                      <button
                        onClick={() => {
                          setAppointmentFilter('all');
                          setQualificationFilter('all');
                          setLeadSearchQuery('');
                          setLeadsPage(1);
                        }}
                        className="portal-btn"
                        style={{ padding: '4px 10px', fontSize: '0.75rem', fontWeight: 800 }}
                      >
                        Reset Filters
                      </button>
                    )}
                  </div>

                  {leads.length === 0 ? (
                    <div className="portal-bento-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 800 }}>
                      No leads captured yet.
                    </div>
                  ) : filteredLeads.length === 0 ? (
                    <div className="portal-bento-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 800 }}>
                      No leads match the selected filter criteria.
                      <div style={{ marginTop: '12px' }}>
                        <button
                          onClick={() => { setAppointmentFilter('all'); setQualificationFilter('all'); setLeadSearchQuery(''); setLeadsPage(1); }}
                          className="portal-btn portal-btn-primary"
                          style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                        >
                          Clear Filters
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="portal-table-container">
                        <table className="portal-table">
                          <thead>
                            <tr>
                              <th style={{ verticalAlign: 'top', minWidth: '150px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <span>Lead Info</span>
                                  <input
                                    type="text"
                                    className="portal-control"
                                    placeholder="Filter info..."
                                    value={leadSearchQuery}
                                    onChange={(e) => { setLeadSearchQuery(e.target.value); setLeadsPage(1); }}
                                    style={{
                                      padding: '4px 8px',
                                      fontSize: '0.75rem',
                                      fontWeight: '700',
                                      background: leadSearchQuery ? '#fffbe6' : '#ffffff',
                                      border: '2px solid #000000',
                                      borderRadius: '4px',
                                      textTransform: 'none'
                                    }}
                                  />
                                </div>
                              </th>
                              <th style={{ verticalAlign: 'top' }}>Source / Campaign</th>
                              <th style={{ verticalAlign: 'top' }}>Captured Date</th>
                              <th style={{ verticalAlign: 'top' }}>Called?</th>
                              <th style={{ verticalAlign: 'top', minWidth: '150px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <span>Qualification</span>
                                  <select
                                    value={qualificationFilter}
                                    onChange={(e) => { setQualificationFilter(e.target.value); setLeadsPage(1); }}
                                    className="portal-select"
                                    style={{
                                      padding: '4px 8px',
                                      fontSize: '0.75rem',
                                      fontWeight: '800',
                                      background: qualificationFilter !== 'all' ? '#10b981' : '#ffffff',
                                      color: qualificationFilter !== 'all' ? '#ffffff' : '#000000',
                                      border: '2px solid #000000',
                                      borderRadius: '4px',
                                      textTransform: 'none',
                                      boxShadow: 'none'
                                    }}
                                  >
                                    <option value="all" style={{ background: '#ffffff', color: '#000000' }}>All Qualifications</option>
                                    <option value="Pending" style={{ background: '#ffffff', color: '#000000' }}>⌛ Pending ({qualCounts.Pending})</option>
                                    <option value="Qualified" style={{ background: '#ffffff', color: '#000000' }}>✅ Qualified ({qualCounts.Qualified})</option>
                                    <option value="Disqualified" style={{ background: '#ffffff', color: '#000000' }}>❌ Disqualified ({qualCounts.Disqualified})</option>
                                  </select>
                                </div>
                              </th>
                              <th style={{ verticalAlign: 'top', minWidth: '160px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <span>Appointment</span>
                                  <select
                                    value={appointmentFilter}
                                    onChange={(e) => { setAppointmentFilter(e.target.value); setLeadsPage(1); }}
                                    className="portal-select"
                                    style={{
                                      padding: '4px 8px',
                                      fontSize: '0.75rem',
                                      fontWeight: '800',
                                      background: appointmentFilter !== 'all' ? '#3b82f6' : '#ffffff',
                                      color: appointmentFilter !== 'all' ? '#ffffff' : '#000000',
                                      border: '2px solid #000000',
                                      borderRadius: '4px',
                                      textTransform: 'none',
                                      boxShadow: 'none'
                                    }}
                                  >
                                    <option value="all" style={{ background: '#ffffff', color: '#000000' }}>All Appointments</option>
                                    <option value="Booked" style={{ background: '#ffffff', color: '#000000' }}>📅 Booked ({apptCounts.Booked})</option>
                                    <option value="Follow Up" style={{ background: '#ffffff', color: '#000000' }}>📞 Follow Up ({apptCounts['Follow Up']})</option>
                                    <option value="Not Booked" style={{ background: '#ffffff', color: '#000000' }}>🚫 Not Booked ({apptCounts['Not Booked']})</option>
                                  </select>
                                </div>
                              </th>
                              <th style={{ verticalAlign: 'top' }}>Rejection Reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredLeads.slice((leadsPage - 1) * ITEMS_PER_PAGE_LEADS, leadsPage * ITEMS_PER_PAGE_LEADS).map(lead => {
                              const qualBorderColor = 
                                lead.qualification_status === 'Qualified' ? '#10b981' :
                                lead.qualification_status === 'Disqualified' ? '#ef4444' : '#6b7280';

                              const callBorderColor = 
                                lead.call_outcome === 'Picked Up' ? '#10b981' :
                                lead.call_outcome === 'No Answer' ? '#f59e0b' :
                                lead.call_outcome === 'Other' ? '#6b7280' : '#d1d5db';

                              const apptBorderColor = 
                                lead.appointment_status === 'Booked' ? '#3b82f6' :
                                lead.appointment_status === 'Not Booked' ? '#ef4444' : '#6b7280';
                                 
                              const platformBadge = 
                                lead.platform === 'Meta' ? 'portal-badge-info' :
                                lead.platform === 'Google' ? 'portal-badge-success' :
                                lead.platform === 'YouTube' ? 'portal-badge-danger' : 'portal-badge-muted';
                                 
                              return (
                                <tr key={lead.id}>
                                  <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <span style={{ fontWeight: '800', color: '#000000' }}>{lead.name}</span>
                                      {lead.email && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{lead.email}</span>}
                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '800' }}>{lead.phone}</span>
                                    </div>
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <div style={{ display: 'flex', gap: '6px' }}>
                                        <span className={`portal-badge ${platformBadge}`}>{lead.platform}</span>
                                        <span className="portal-badge" style={{ background: '#f3e8ff', color: '#6b21a8', border: '1px solid #c084fc' }}>
                                          {lead.source === 'call' ? `📞 Call (${lead.call_duration_seconds || 0}s)` : '📝 Form'}
                                        </span>
                                      </div>
                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '800' }}>
                                        🎯 {lead.campaign_name || 'Direct / Organic'}
                                      </span>
                                    </div>
                                  </td>
                                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                                    {new Date(lead.created_at.replace(' ', 'T')).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '130px' }}>
                                      <select 
                                        value={lead.call_outcome || 'Pending'}
                                        onChange={(e) => handleUpdateLead(lead.id, { call_outcome: e.target.value })}
                                        className="portal-select"
                                        style={{ 
                                          borderWidth: '2px', 
                                          borderColor: callBorderColor,
                                          padding: '4px 8px',
                                          fontSize: '0.8rem'
                                        }}
                                      >
                                        <option value="Pending">⌛ Pending</option>
                                        <option value="Picked Up">📞 Picked Up</option>
                                        <option value="No Answer">🔇 No Answer</option>
                                        <option value="Other">❓ Other</option>
                                      </select>
                                    </div>
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '130px' }}>
                                      <select 
                                        value={lead.qualification_status || 'Pending'}
                                        onChange={(e) => handleUpdateLead(lead.id, { qualification_status: e.target.value })}
                                        className="portal-select"
                                        style={{ 
                                          borderWidth: '2px', 
                                          borderColor: qualBorderColor,
                                          padding: '4px 8px',
                                          fontSize: '0.8rem'
                                        }}
                                      >
                                        <option value="Pending">⌛ Pending</option>
                                        <option value="Qualified">✅ Qualified</option>
                                        <option value="Disqualified">❌ Disqualified</option>
                                      </select>
                                    </div>
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '150px' }}>
                                      <select 
                                        value={lead.appointment_status || 'Follow Up'}
                                        onChange={(e) => handleUpdateLead(lead.id, { appointment_status: e.target.value })}
                                        className="portal-select"
                                        style={{ 
                                          borderWidth: '2px', 
                                          borderColor: apptBorderColor,
                                          padding: '4px 8px',
                                          fontSize: '0.8rem'
                                        }}
                                      >
                                        <option value="Follow Up">📞 Follow Up</option>
                                        <option value="Booked">📅 Booked</option>
                                        <option value="Not Booked">🚫 Not Booked</option>
                                      </select>
                                      {lead.appointment_status === 'Booked' && (
                                        <input 
                                          type="datetime-local" 
                                          value={lead.appointment_date ? lead.appointment_date.slice(0, 16) : ''}
                                          onChange={(e) => handleUpdateLead(lead.id, { appointment_date: e.target.value })}
                                          className="portal-select"
                                          style={{ 
                                            padding: '4px 6px',
                                            fontSize: '0.75rem',
                                            width: '100%',
                                            marginTop: '2px'
                                          }}
                                        />
                                      )}
                                    </div>
                                  </td>
                                  <td>
                                    {(lead.qualification_status === 'Disqualified' || lead.appointment_status === 'Not Booked') ? (
                                      (() => {
                                        const isPreset = PRESET_REASON_OPTIONS.includes(lead.rejection_reason);
                                        const selectVal = isPreset ? (lead.rejection_reason || 'Out of Budget') : 'Other';
                                        const showTextInput = !isPreset || lead.rejection_reason === 'Other';
                                        return (
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '150px' }}>
                                            <select 
                                              value={selectVal}
                                              onChange={(e) => handleUpdateLead(lead.id, { rejection_reason: e.target.value })}
                                              className="portal-select"
                                              style={{ 
                                                borderWidth: '2px', 
                                                borderColor: '#ef4444',
                                                padding: '4px 8px',
                                                fontSize: '0.8rem',
                                                width: '100%'
                                              }}
                                            >
                                              <option value="Out of Budget">💰 Out of Budget</option>
                                              <option value="Not Interested">🙅 Not Interested</option>
                                              <option value="Wrong Number / Spam">🚫 Spam / Wrong No.</option>
                                              <option value="Location Issue">📍 Location Issue</option>
                                              <option value="Already Serviced">✅ Already Serviced</option>
                                              <option value="Other">📝 Other</option>
                                            </select>
                                            {showTextInput && (
                                              <input 
                                                type="text"
                                                placeholder="Type reason..."
                                                defaultValue={lead.rejection_reason && lead.rejection_reason !== 'Other' ? lead.rejection_reason : ''}
                                                key={`rej-input-${lead.id}-${lead.rejection_reason}`}
                                                onBlur={(e) => {
                                                  const val = e.target.value.trim();
                                                  if (val && val !== lead.rejection_reason) {
                                                    handleUpdateLead(lead.id, { rejection_reason: val });
                                                  }
                                                }}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter') {
                                                    e.target.blur();
                                                  }
                                                }}
                                                className="portal-select"
                                                style={{ 
                                                  padding: '4px 6px',
                                                  fontSize: '0.75rem',
                                                  width: '100%',
                                                  borderColor: '#ef4444',
                                                  marginTop: '2px'
                                                }}
                                              />
                                            )}
                                          </div>
                                        );
                                      })()
                                    ) : (
                                      <span style={{ color: 'var(--text-muted)' }}>-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {renderPagination(leadsPage, filteredLeads.length, ITEMS_PER_PAGE_LEADS, setLeadsPage)}
                    </>
                  )}
                </div>
              );
            })()}

          </div>
        )}

        {/* Add Lead Modal */}
        {showAddLeadModal && (
          <div className="portal-modal-overlay">
            <div 
              className="portal-bento-card" 
              style={{ 
                width: '100%', 
                maxWidth: '560px', 
                maxHeight: '90vh', 
                overflowY: 'auto',
                padding: '28px', 
                margin: 0,
                boxShadow: 'var(--shadow-lg)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #000000', paddingBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ display: 'inline-flex', padding: '8px', background: '#000000', color: '#ffffff', borderRadius: '8px' }}>
                    <UserPlus size={20} />
                  </div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', textTransform: 'uppercase', fontWeight: 800 }}>
                    Add Lead Manually
                  </h3>
                </div>
                <button 
                  type="button"
                  onClick={() => setShowAddLeadModal(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleAddManualLead} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Name & Phone */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="portal-form-group" style={{ margin: 0 }}>
                    <label className="portal-label">Full Name *</label>
                    <input 
                      type="text" 
                      className="portal-control"
                      placeholder="e.g. John Doe"
                      value={newLeadData.name}
                      onChange={(e) => setNewLeadData(prev => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="portal-form-group" style={{ margin: 0 }}>
                    <label className="portal-label">Phone Number *</label>
                    <input 
                      type="tel" 
                      className="portal-control"
                      placeholder="e.g. +91 9876543210"
                      value={newLeadData.phone}
                      onChange={(e) => setNewLeadData(prev => ({ ...prev, phone: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                {/* Email & Campaign Name */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="portal-form-group" style={{ margin: 0 }}>
                    <label className="portal-label">Email Address</label>
                    <input 
                      type="email" 
                      className="portal-control"
                      placeholder="e.g. john@example.com"
                      value={newLeadData.email}
                      onChange={(e) => setNewLeadData(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                  <div className="portal-form-group" style={{ margin: 0 }}>
                    <label className="portal-label">Campaign / Source Tag</label>
                    <input 
                      type="text" 
                      className="portal-control"
                      placeholder="e.g. Walk-in, Referral, Offline"
                      value={newLeadData.campaign_name}
                      onChange={(e) => setNewLeadData(prev => ({ ...prev, campaign_name: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Platform & Source */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="portal-form-group" style={{ margin: 0 }}>
                    <label className="portal-label">Platform</label>
                    <select 
                      className="portal-select"
                      style={{ width: '100%', padding: '12px 14px' }}
                      value={newLeadData.platform}
                      onChange={(e) => setNewLeadData(prev => ({ ...prev, platform: e.target.value }))}
                    >
                      <option value="Meta">Meta (FB / IG)</option>
                      <option value="Google">Google</option>
                      <option value="YouTube">YouTube</option>
                      <option value="Other">Other / Direct</option>
                    </select>
                  </div>
                  <div className="portal-form-group" style={{ margin: 0 }}>
                    <label className="portal-label">Lead Type</label>
                    <select 
                      className="portal-select"
                      style={{ width: '100%', padding: '12px 14px' }}
                      value={newLeadData.source}
                      onChange={(e) => setNewLeadData(prev => ({ ...prev, source: e.target.value }))}
                    >
                      <option value="form">📝 Form Entry</option>
                      <option value="call">📞 Phone Call</option>
                    </select>
                  </div>
                </div>

                {/* Qualification & Call Outcome */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="portal-form-group" style={{ margin: 0 }}>
                    <label className="portal-label">Qualification Status</label>
                    <select 
                      className="portal-select"
                      style={{ width: '100%', padding: '12px 14px' }}
                      value={newLeadData.qualification_status}
                      onChange={(e) => setNewLeadData(prev => ({ ...prev, qualification_status: e.target.value }))}
                    >
                      <option value="Pending">⌛ Pending</option>
                      <option value="Qualified">✅ Qualified</option>
                      <option value="Disqualified">❌ Disqualified</option>
                    </select>
                  </div>
                  <div className="portal-form-group" style={{ margin: 0 }}>
                    <label className="portal-label">Call Outcome</label>
                    <select 
                      className="portal-select"
                      style={{ width: '100%', padding: '12px 14px' }}
                      value={newLeadData.call_outcome}
                      onChange={(e) => setNewLeadData(prev => ({ ...prev, call_outcome: e.target.value }))}
                    >
                      <option value="Pending">⌛ Pending</option>
                      <option value="Picked Up">📞 Picked Up</option>
                      <option value="No Answer">🔇 No Answer</option>
                      <option value="Other">❓ Other</option>
                    </select>
                  </div>
                </div>

                {/* Appointment Status */}
                <div className="portal-form-group" style={{ margin: 0 }}>
                  <label className="portal-label">Appointment Status</label>
                  <select 
                    className="portal-select"
                    style={{ width: '100%', padding: '12px 14px' }}
                    value={newLeadData.appointment_status}
                    onChange={(e) => setNewLeadData(prev => ({ ...prev, appointment_status: e.target.value }))}
                  >
                    <option value="Follow Up">📞 Follow Up</option>
                    <option value="Booked">📅 Booked</option>
                    <option value="Not Booked">🚫 Not Booked</option>
                  </select>
                </div>

                {/* Conditional Appointment Date */}
                {newLeadData.appointment_status === 'Booked' && (
                  <div className="portal-form-group" style={{ margin: 0 }}>
                    <label className="portal-label">Appointment Date & Time</label>
                    <input 
                      type="datetime-local" 
                      className="portal-control"
                      value={newLeadData.appointment_date}
                      onChange={(e) => setNewLeadData(prev => ({ ...prev, appointment_date: e.target.value }))}
                    />
                  </div>
                )}

                {/* Conditional Rejection Reason */}
                {(newLeadData.qualification_status === 'Disqualified' || newLeadData.appointment_status === 'Not Booked') && (
                  <div className="portal-form-group" style={{ margin: 0 }}>
                    <label className="portal-label">Rejection / Disqualification Reason</label>
                    <select 
                      className="portal-select"
                      style={{ width: '100%', padding: '12px 14px' }}
                      value={PRESET_REASON_OPTIONS.includes(newLeadData.rejection_reason) ? newLeadData.rejection_reason : 'Other'}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewLeadData(prev => ({ ...prev, rejection_reason: val }));
                      }}
                    >
                      <option value="Out of Budget">💰 Out of Budget</option>
                      <option value="Not Interested">🙅 Not Interested</option>
                      <option value="Wrong Number / Spam">🚫 Spam / Wrong No.</option>
                      <option value="Location Issue">📍 Location Issue</option>
                      <option value="Already Serviced">✅ Already Serviced</option>
                      <option value="Other">📝 Other</option>
                    </select>
                    {(!PRESET_REASON_OPTIONS.includes(newLeadData.rejection_reason) || newLeadData.rejection_reason === 'Other') && (
                      <input 
                        type="text"
                        className="portal-control"
                        style={{ marginTop: '8px' }}
                        placeholder="Type custom rejection reason..."
                        value={newLeadData.rejection_reason === 'Other' ? '' : (newLeadData.rejection_reason || '')}
                        onChange={(e) => {
                          const customVal = e.target.value;
                          setNewLeadData(prev => ({ ...prev, rejection_reason: customVal || 'Other' }));
                        }}
                      />
                    )}
                  </div>
                )}

                {/* Submit & Cancel Buttons */}
                <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                  <button 
                    type="button" 
                    className="portal-btn"
                    onClick={() => setShowAddLeadModal(false)}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="portal-btn portal-btn-primary"
                    disabled={submittingLead}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    {submittingLead ? 'Adding...' : 'Save Lead'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

