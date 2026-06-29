import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
  TrendingUp, BarChart2, Check, X, FileText, Send, Lock, Calendar, PlayCircle, ExternalLink
} from 'lucide-react';
import { API_BASE } from '../api.js';

const PORTAL_STYLES = `
/* Neo-Brutalist Bento Design System for Client Portal */
.client-portal-wrapper {
  --bg-primary: #f0f0f2;
  --bg-card: #ffffff;
  --text-primary: #000000;
  --text-secondary: #18181b;
  --text-muted: #52525b;
  --border-color: #000000;
  --border-width: 3px;
  
  --shadow-sm: 2px 2px 0px #000000;
  --shadow-md: 5px 5px 0px #000000;
  --shadow-lg: 8px 8px 0px #000000;
  
  --radius-md: 20px;
  --radius-sm: 8px;
  
  --accent-purple: #a855f7;
  --accent-cyan: #06b6d4;
  --accent-rose: #f43f5e;
  --accent-blue: #3b82f6;
  
  box-sizing: border-box;
  font-family: 'Outfit', 'Inter', system-ui, -apple-system, sans-serif;
  color: var(--text-primary);
  min-height: 100vh;
  padding: 32px 16px;
  background-color: var(--bg-primary);
  display: flex;
  flex-direction: column;
  align-items: center;
}

body.portal-active {
  background-color: #f0f0f2 !important;
  padding: 0 !important;
  margin: 0 !important;
}

.portal-container {
  width: 100%;
  max-width: 850px;
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes spin {
  100% { transform: rotate(360deg); }
}

/* Bento Card styling */
.portal-bento-card {
  background: var(--bg-card);
  border: var(--border-width) solid var(--border-color) !important;
  border-radius: var(--radius-md) !important;
  box-shadow: var(--shadow-md) !important;
  padding: 24px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  position: relative;
  overflow: hidden;
  text-align: left;
  margin-bottom: 24px;
}

.portal-bento-card:hover {
  transform: translate(-2px, -2px);
  box-shadow: var(--shadow-lg) !important;
}

/* Header Banner */
.portal-header-banner {
  background: #ffffff;
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  padding: 28px;
  margin-bottom: 24px;
  text-align: left;
}

.portal-header-tag {
  display: inline-block;
  font-size: 0.8rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: #000000;
  color: #ffffff;
  padding: 4px 10px;
  border-radius: 4px;
  margin-bottom: 12px;
}

.portal-header-title {
  font-size: 2.2rem;
  font-weight: 900;
  text-transform: uppercase;
  margin: 0;
  letter-spacing: -0.03em;
  line-height: 1.1;
}

/* Tabs segment - clean pill outline */
.portal-tabs-container {
  display: flex;
  background: #ffffff;
  border: var(--border-width) solid var(--border-color);
  border-radius: 9999px;
  padding: 6px;
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
  padding: 12px 20px;
  font-weight: 800;
  font-size: 0.85rem;
  text-transform: uppercase;
  border-radius: 9999px;
  border: none;
  cursor: pointer;
  background: transparent;
  color: #000000;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.portal-tab-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.portal-tab-btn.active {
  background: #000000;
  color: #ffffff;
}

/* Metrics Bento Grid */
.portal-metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
  width: 100%;
  margin-bottom: 24px;
}

.portal-metric-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 120px;
  background: #ffffff;
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  padding: 20px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.portal-metric-card:hover {
  transform: translate(-2px, -2px);
  box-shadow: var(--shadow-lg);
}

.portal-metric-value {
  font-size: 2.5rem;
  font-weight: 900;
  margin: 8px 0 0 0;
  line-height: 1;
  font-family: 'Outfit', sans-serif;
  letter-spacing: -0.02em;
}

.portal-metric-label {
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Badges */
.portal-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  font-size: 0.7rem;
  font-weight: 800;
  border-radius: 9999px;
  text-transform: uppercase;
  border: 2px solid #000000;
  background: #ffffff;
  color: #000000;
  letter-spacing: 0.03em;
  box-shadow: var(--shadow-sm);
}

.portal-badge-success { background: #d1fae5; color: #065f46; }
.portal-badge-warning { background: #fef3c7; color: #92400e; }
.portal-badge-danger { background: #fee2e2; color: #991b1b; }
.portal-badge-info { background: #dbeafe; color: #1e40af; }
.portal-badge-muted { background: #f4f4f5; color: #52525b; }

/* Form Controls & Buttons */
.portal-control {
  background: #ffffff;
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 14px 18px;
  color: #000000;
  font-family: inherit;
  font-weight: 700;
  transition: box-shadow 0.15s ease;
  width: 100%;
}

.portal-control:focus {
  outline: none;
  box-shadow: var(--shadow-sm);
}

.portal-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  font-weight: 800;
  font-size: 0.85rem;
  text-transform: uppercase;
  border-radius: 9999px;
  border: var(--border-width) solid var(--border-color);
  cursor: pointer;
  background: #ffffff;
  color: #000000;
  box-shadow: var(--shadow-sm);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  text-decoration: none;
}

.portal-btn:hover {
  transform: translate(-2px, -2px);
  box-shadow: var(--shadow-md);
}

.portal-btn:active {
  transform: translate(1px, 1px);
  box-shadow: none;
}

.portal-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
}

.portal-btn-primary {
  background: #000000;
  color: #ffffff;
}

.portal-btn-primary:hover {
  background: #ffffff;
  color: #000000;
}

.portal-btn-success { background: #ffffff; color: #000000; }
.portal-btn-success:hover { background: #10b981; color: #ffffff; }

.portal-btn-danger { background: #ffffff; color: #000000; }
.portal-btn-danger:hover { background: #ef4444; color: #ffffff; }

/* Grid Layouts */
.portal-grid-half {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 20px;
}

/* Tables */
.portal-table-container {
  overflow-x: auto;
  border-radius: var(--radius-md);
  border: var(--border-width) solid var(--border-color);
  background: #ffffff;
  box-shadow: var(--shadow-md);
  width: 100%;
  margin-bottom: 8px;
}

.portal-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.portal-table th {
  background: #f4f4f5;
  padding: 14px 18px;
  font-weight: 800;
  color: #000000;
  border-bottom: var(--border-width) solid var(--border-color);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.portal-table td {
  padding: 14px 18px;
  border-bottom: 2px solid var(--border-color);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 0.85rem;
}

.portal-table tr:last-child td {
  border-bottom: none;
}

.portal-table tr:hover td {
  background: rgba(0, 0, 0, 0.02);
}

/* Modal styling */
.portal-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
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
  padding: 10px 20px;
  border-radius: 9999px;
  font-size: 0.85rem;
  font-weight: 800;
  text-transform: uppercase;
  background: #ffffff;
  border: var(--border-width) solid var(--border-color);
  color: #000000;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  white-space: nowrap;
}

.portal-month-tab:hover {
  transform: translate(-1px, -1px);
  box-shadow: var(--shadow-md);
}

.portal-month-tab.active {
  background: #000000;
  color: #ffffff;
}

/* Script Box */
.portal-script-box {
  background: #f4f4f5;
  border: var(--border-width) solid var(--border-color);
  padding: 16px 20px;
  border-radius: var(--radius-sm);
  font-family: var(--font-sans);
  font-size: 0.92rem;
  line-height: 1.5;
  color: #000000;
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
  font-size: 0.8rem;
  font-weight: 800;
  margin-bottom: 8px;
  color: #000000;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

@media(max-width: 768px) {
  .portal-grid-half {
    grid-template-columns: 1fr;
  }
}
`;

function PerformanceTrendChart({ data }) {
  const [metric, setMetric] = useState('views'); // 'views' or 'engagement'
  
  if (!data || data.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '20px', textAlign: 'center', fontWeight: '700' }}>
        No trend data available yet.
      </div>
    );
  }

  const width = 500;
  const height = 220;
  const paddingLeft = 55;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;
  
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const isViews = metric === 'views';
  
  // Calculate max val
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

  const gridTicks = [0, 0.25, 0.5, 0.75, 1];

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
    const [year, month, day] = parts;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${parseInt(day, 10)} ${months[parseInt(month, 10) - 1]}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <h3 style={{ fontSize: '1.1rem', margin: 0, textTransform: 'uppercase', fontWeight: 800 }}>Content Performance Trend</h3>
        <div style={{ display: 'flex', border: '3px solid #000000', borderRadius: '9999px', overflow: 'hidden', boxShadow: '2px 2px 0px #000000' }}>
          <button 
            onClick={() => setMetric('views')}
            style={{
              padding: '6px 14px',
              border: 'none',
              fontWeight: '800',
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              cursor: 'pointer',
              background: isViews ? '#000000' : '#ffffff',
              color: isViews ? '#ffffff' : '#000000',
              transition: 'all 0.15s ease'
            }}
          >
            Video Views
          </button>
          <button 
            onClick={() => setMetric('engagement')}
            style={{
              padding: '6px 14px',
              border: 'none',
              fontWeight: '800',
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              cursor: 'pointer',
              background: !isViews ? '#000000' : '#ffffff',
              color: !isViews ? '#ffffff' : '#000000',
              transition: 'all 0.15s ease'
            }}
          >
            Engagement %
          </button>
        </div>
      </div>

      <div style={{ width: '100%', background: '#ffffff', border: '3px solid #000000', borderRadius: '14px', padding: '16px', boxShadow: '4px 4px 0px #000000', boxSizing: 'border-box' }}>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="auto" style={{ overflow: 'visible' }}>
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
                  stroke="#e4e4e7" 
                  strokeWidth="2"
                  strokeDasharray={idx === 0 ? "0" : "4 4"}
                />
                <text 
                  x={paddingLeft - 8} 
                  y={y + 4} 
                  textAnchor="end" 
                  fill="#000000" 
                  style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: '800' }}
                >
                  {formatNumberAbbr(gridVal)}
                </text>
              </g>
            );
          })}
          
          {/* Fill Area */}
          {points.length > 0 && (
            <path 
              d={areaD} 
              fill={isViews ? "rgba(168, 85, 247, 0.15)" : "rgba(6, 182, 212, 0.15)"}
            />
          )}
          
          {/* Stroke Line */}
          {points.length > 0 && (
            <path 
              d={pathD} 
              fill="none" 
              stroke="#000000" 
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          
          {/* Points circles and native titles */}
          {points.map((p, idx) => (
            <g key={idx}>
              <circle 
                cx={p.x} 
                cy={p.y} 
                r="6" 
                fill={isViews ? "#a855f7" : "#06b6d4"} 
                stroke="#000000" 
                strokeWidth="2.5"
                style={{ cursor: 'pointer' }}
              >
                <title>{`${p.title || 'Post'}\n${isViews ? 'Views' : 'Engagement'}: ${isViews ? p.val.toLocaleString() : p.val.toFixed(2) + '%'}\nDate: ${p.date}`}</title>
              </circle>
              {/* Date labels */}
              <text 
                x={p.x} 
                y={paddingTop + chartHeight + 18} 
                textAnchor="middle" 
                fill="#000000" 
                style={{ fontSize: '9px', fontFamily: 'var(--font-sans)', fontWeight: '800' }}
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
  const [adCampaigns, setAdCampaigns] = useState([]);
  const [seoReports, setSeoReports] = useState([]);
  const [pendingPlan, setPendingPlan] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [scripts, setScripts] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState('');

  // Pagination states
  const [contentPage, setContentPage] = useState(1);
  const [seoPage, setSeoPage] = useState(1);
  const [adsPage, setAdsPage] = useState(1);

  const ITEMS_PER_PAGE_CONTENT = 10;
  const ITEMS_PER_PAGE_SEO = 5;
  const ITEMS_PER_PAGE_ADS = 5;

  useEffect(() => { setContentPage(1); }, [contentList]);
  useEffect(() => { setSeoPage(1); }, [seoReports]);
  useEffect(() => { setAdsPage(1); }, [adCampaigns]);
  
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
        } else if (activeTab !== 'reports' && activeTab !== 'approval' && activeTab !== 'content' && activeTab !== 'bookings') {
          setActiveTab('overview');
        }
        
        setOverview(data);
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

        // Ad campaigns
        const resAds = await fetch(`${API_BASE}/api/portal/${token}/ads`, { credentials: 'include' });
        const dataAds = await resAds.json();
        if (resAds.ok) setAdCampaigns(dataAds.ads || []);

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
      }
    } catch (err) {
      console.error('Error fetching portal sub-data:', err);
    }
  };

  const handleApprove = async (id) => {
    if (!window.confirm('Are you sure you want to approve this content?')) return;
    try {
      const response = await fetch(`${API_BASE}/api/portal/${token}/content-plan/${id}/approve`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to approve');
      
      showToast('Content approved successfully', 'success');
      fetchData();
      checkPortalAuth();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const openRejectModal = (item) => {
    setRejectingItem(item);
    setRejectionComment('');
  };

  const handleReject = async (e) => {
    e.preventDefault();
    if (!rejectionComment.trim()) {
      showToast('Please provide a comment outlining the changes required', 'error');
      return;
    }
    
    setSubmittingDecision(true);
    try {
      const response = await fetch(`${API_BASE}/api/portal/${token}/content-plan/${rejectingItem.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: rejectionComment }),
        credentials: 'include'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to request changes');

      showToast('Revisions submitted successfully', 'success');
      setRejectingItem(null);
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="portal-header-tag">
              Client Portal
            </span>
            {overview.pending_approvals > 0 && (
              <span className="portal-badge portal-badge-warning">
                {overview.pending_approvals} Approval Pending
              </span>
            )}
          </div>
          <h1 className="portal-header-title">{clientName}</h1>
          {overview.sister_companies && overview.sister_companies.length > 0 && (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px', fontWeight: '800' }}>
              Group Locations: <strong style={{ color: '#000000' }}>{clientName}</strong>, {overview.sister_companies.join(', ')}
            </div>
          )}
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
                onClick={() => setActiveTab('approval')} 
                className={`portal-tab-btn ${activeTab === 'approval' ? 'active' : ''}`}
                style={{ position: 'relative' }}
              >
                <FileText size={16} /> Approvals
                {overview.pending_approvals > 0 && (
                  <span style={{ position: 'absolute', top: '8px', right: '12px', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--border-color)' }} />
                )}
              </button>
              <button 
                onClick={() => setActiveTab('content')} 
                className={`portal-tab-btn ${activeTab === 'content' ? 'active' : ''}`}
              >
                <Calendar size={16} /> Content
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
                    <span className="portal-metric-label">Total Leads</span>
                    <span className="portal-metric-value" style={{ color: 'var(--accent-blue)' }}>{overview.ads.total_leads || 0}</span>
                  </div>
                  <div className="portal-metric-card">
                    <span className="portal-metric-label">Return on Ad Spend</span>
                    <span className="portal-metric-value" style={{ color: 'var(--accent-purple)' }}>{overview.ads.avg_roas ? `${overview.ads.avg_roas}x` : 'N/A'}</span>
                  </div>
                  <div className="portal-metric-card">
                    <span className="portal-metric-label">Total Spend</span>
                    <span className="portal-metric-value" style={{ color: 'var(--text-primary)' }}>₹{overview.ads.total_spend?.toLocaleString() || 0}</span>
                  </div>
                </>
              )}
            </div>

            {/* Performance Trend Chart */}
            <PerformanceTrendChart data={overview.views_trend} />

            {/* SVG Performance Charts & Graphs */}
            <div className="portal-grid-half">
              {/* Platform Distribution Donut Chart */}
              <div className="portal-bento-card" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', textTransform: 'uppercase', fontWeight: 800 }}>Platform Distribution</h3>
                {(!overview.platform_breakdown || overview.platform_breakdown.length === 0) ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No distribution data available yet.</div>
                ) : (() => {
                  const total = overview.platform_breakdown.reduce((sum, item) => sum + item.count, 0);
                  let accumulatedPercent = 0;
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {total > 0 ? (
                        <svg width="120" height="120" viewBox="0 0 42 42" style={{ transform: 'rotate(-90deg)', borderRadius: '50%', border: '3px solid #000000', boxShadow: '2px 2px 0px #000000' }}>
                          <circle cx="21" cy="21" r="15.91549430918954" fill="#ffffff"></circle>
                          {overview.platform_breakdown.map((item, idx) => {
                            const percent = (item.count / total) * 100;
                            const strokeDashoffset = 100 - accumulatedPercent;
                            accumulatedPercent += percent;
                            const colors = ['#a855f7', '#06b6d4', '#f43f5e', '#3b82f6'];
                            const color = colors[idx % colors.length];
                            return (
                              <circle
                                key={item.platform}
                                cx="21"
                                cy="21"
                                r="15.91549430918954"
                                fill="transparent"
                                stroke={color}
                                strokeWidth="4.5"
                                strokeDasharray={`${percent} ${100 - percent}`}
                                strokeDashoffset={strokeDashoffset}
                                style={{ transition: 'stroke-dashoffset 0.3s ease' }}
                              />
                            );
                          })}
                        </svg>
                      ) : (
                        <div style={{ width: '120px', height: '120px', borderRadius: '50%', border: '3px solid #000000' }} />
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left', flexGrow: 1 }}>
                        {overview.platform_breakdown.map((item, idx) => {
                          const percent = total > 0 ? ((item.count / total) * 100).toFixed(0) : 0;
                          const colors = ['#a855f7', '#06b6d4', '#f43f5e', '#3b82f6'];
                          const color = colors[idx % colors.length];
                          return (
                            <div key={item.platform} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: '800' }}>
                              <span style={{ width: '10px', height: '10px', border: '1px solid #000000', borderRadius: '50%', background: color, display: 'inline-block' }} />
                              <span style={{ textTransform: 'capitalize' }}>{item.platform}:</span>
                              <span style={{ color: 'var(--text-muted)' }}>{item.count} ({percent}%)</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Ad Campaign Performance Bar Charts */}
              <div className="portal-bento-card" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', textTransform: 'uppercase', fontWeight: 800 }}>Ad Campaigns Performance</h3>
                {(!overview.ads_breakdown || overview.ads_breakdown.length === 0) ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No active campaigns to analyze.</div>
                ) : (() => {
                  const maxSpend = Math.max(...overview.ads_breakdown.map(item => item.spend || 0), 1);
                  const maxLeads = Math.max(...overview.ads_breakdown.map(item => item.leads || 0), 1);
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div>
                        <h4 style={{ fontSize: '0.8rem', marginBottom: '6px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ad Spend (₹)</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {overview.ads_breakdown.map((item, idx) => {
                            const widthPct = ((item.spend || 0) / maxSpend) * 100;
                            const colors = ['#3b82f6', '#10b981', '#f59e0b'];
                            const color = colors[idx % colors.length];
                            return (
                              <div key={item.platform} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: '800' }}>
                                  <span style={{ textTransform: 'capitalize' }}>{item.platform}</span>
                                  <span>₹{(item.spend || 0).toLocaleString()}</span>
                                </div>
                                <div style={{ height: '10px', background: '#ffffff', border: '2px solid #000000', borderRadius: '9999px', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${Math.max(widthPct, 2)}%`, background: color, borderRight: widthPct < 100 ? '2px solid #000000' : 'none' }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <h4 style={{ fontSize: '0.8rem', marginBottom: '6px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Leads Generated</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {overview.ads_breakdown.map((item, idx) => {
                            const widthPct = ((item.leads || 0) / maxLeads) * 100;
                            const colors = ['#a855f7', '#06b6d4', '#f43f5e'];
                            const color = colors[idx % colors.length];
                            return (
                              <div key={item.platform} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: '800' }}>
                                  <span style={{ textTransform: 'capitalize' }}>{item.platform}</span>
                                  <span>{item.leads || 0} leads</span>
                                </div>
                                <div style={{ height: '10px', background: '#ffffff', border: '2px solid #000000', borderRadius: '9999px', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${Math.max(widthPct, 2)}%`, background: color, borderRight: widthPct < 100 ? '2px solid #000000' : 'none' }} />
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
            </div>

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
                          <th>Engagement %</th>
                          <th>Quality Score</th>
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

            {/* Ads Campaigns Table */}
            <div>
              <h2 style={{ fontSize: '1.25rem', margin: '4px 0 12px 0', textTransform: 'uppercase', fontWeight: 800 }}>Ads Campaigns</h2>
              {adCampaigns.length === 0 ? (
                <div className="portal-bento-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 800 }}>
                  No active campaigns to analyze.
                </div>
              ) : (
                <>
                  <div className="portal-table-container">
                    <table className="portal-table">
                      <thead>
                        <tr>
                          <th>Campaign Name</th>
                          <th>Platform</th>
                          <th>Total Spend</th>
                          <th>Leads</th>
                          <th>Clicks</th>
                          <th>CPL</th>
                          <th>ROAS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adCampaigns.slice((adsPage - 1) * ITEMS_PER_PAGE_ADS, adsPage * ITEMS_PER_PAGE_ADS).map((ad, idx) => (
                          <tr key={idx}>
                            <td style={{ fontWeight: '800', color: '#000000' }}>{ad.ad_campaign_name}</td>
                            <td>
                              <span className="portal-badge portal-badge-success">{ad.platform}</span>
                            </td>
                            <td>₹{ad.total_ad_spend_inr?.toLocaleString() || 0}</td>
                            <td>{ad.leads}</td>
                            <td>{ad.clicks}</td>
                            <td>₹{ad.cpl_inr || 0}</td>
                            <td>{ad.roas ? `${ad.roas}x` : 'Leads Focused'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {renderPagination(adsPage, adCampaigns.length, ITEMS_PER_PAGE_ADS, setAdsPage)}
                </>
              )}
            </div>

          </div>
        )}

        {/* Approval Tab */}
        {activeTab === 'approval' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 style={{ fontSize: '1.25rem', margin: '4px 0', textTransform: 'uppercase', fontWeight: 800 }}>Review Pending Content</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '8px', fontWeight: 600 }}>
              Please review the scripts, concepts, or captions prepared by our managers. Click approve, or request revisions.
            </p>

            {pendingPlan.length === 0 ? (
              <div className="portal-bento-card" style={{ padding: '50px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ display: 'inline-flex', padding: '14px', background: '#d1fae5', borderRadius: '50%', color: '#065f46', border: '3px solid #000000', marginBottom: '16px', boxShadow: '2px 2px 0px #000000' }}>
                  <Check size={32} />
                </div>
                <h4 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#000000', textTransform: 'uppercase' }}>All Content Approved!</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '6px', fontWeight: 600 }}>
                  No pending content awaits your action. Good job!
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {pendingPlan.map(item => {
                  const isExpanded = expandedItems[item.id];
                  return (
                    <div key={item.id} className="portal-bento-card" style={{ padding: '24px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div>
                          <span className="portal-badge portal-badge-info" style={{ marginRight: '6px' }}>{item.platform}</span>
                          <span className="portal-badge portal-badge-muted">{item.post_type}</span>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 800 }}>Target: {formatDateStr(item.date)}</span>
                      </div>

                      <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '10px', textTransform: 'uppercase' }}>{item.title}</h3>

                      {/* Script details */}
                      <div className="portal-script-box" style={{ maxHeight: isExpanded ? 'none' : '100px' }}>
                        {item.script || 'No script text provided.'}
                        {!isExpanded && item.script && item.script.length > 120 && (
                          <div style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            height: '40px',
                            background: 'linear-gradient(to top, #f4f4f5 90%, transparent)'
                          }} />
                        )}
                      </div>

                      {item.script && item.script.length > 120 && (
                        <button 
                          onClick={() => toggleExpand(item.id)}
                          className="portal-btn" 
                          style={{ padding: '6px 12px', fontSize: '0.75rem', marginBottom: '16px' }}
                        >
                          {isExpanded ? 'Show Less' : 'Read Full Script'}
                        </button>
                      )}

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                        <button 
                          onClick={() => handleApprove(item.id)}
                          className="portal-btn portal-btn-success" 
                          style={{ flexGrow: 1 }}
                        >
                          <Check size={16} /> Approve
                        </button>
                        <button 
                          onClick={() => openRejectModal(item)}
                          className="portal-btn portal-btn-danger" 
                          style={{ flexGrow: 1 }}
                        >
                          <X size={16} /> Request Changes
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Content Tab (4th Tab) */}
        {activeTab === 'content' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 style={{ fontSize: '1.25rem', margin: '4px 0', textTransform: 'uppercase', fontWeight: 800 }}>Monthly Content Plans</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '8px', fontWeight: 600 }}>
              Read the finalized scripts and concepts prepared for your brand this month.
            </p>

            {scripts.length === 0 ? (
              <div className="portal-bento-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 800 }}>
                No monthly scripts uploaded yet.
              </div>
            ) : (
              <>
                {/* Month selector */}
                <div className="portal-month-selector">
                  {uniqueMonths.map(m => (
                    <button 
                      key={m} 
                      onClick={() => setSelectedMonth(m)}
                      className={`portal-month-tab ${selectedMonth === m ? 'active' : ''}`}
                    >
                      {formatMonthName(m)}
                    </button>
                  ))}
                </div>

                {/* Filtered scripts list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {scripts.filter(s => s.month === selectedMonth).length === 0 ? (
                    <div className="portal-bento-card" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 800 }}>
                      No scripts found for this month.
                    </div>
                  ) : (
                    scripts.filter(s => s.month === selectedMonth).map(s => {
                      const isExpanded = expandedItems[s.id];
                      const scriptStatus = s.content_status || 'Script Made';
                      return (
                        <div key={s.id} className="portal-bento-card" style={{ padding: '24px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                            <div>
                              <span className="portal-badge portal-badge-info" style={{ marginRight: '6px' }}>
                                {s.format === 'long_format' ? 'Long Format' : 'Reel'}
                              </span>
                              <span className={`portal-badge ${
                                scriptStatus === 'Posted' || scriptStatus === 'Client Approved' ? 'portal-badge-success' :
                                scriptStatus === 'Pending Client Approval' ? 'portal-badge-warning' :
                                scriptStatus === 'Client Rejected' ? 'portal-badge-danger' : 'portal-badge-muted'
                              }`}>
                                {scriptStatus}
                              </span>
                            </div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 800 }}>
                              Last updated: {formatDateStr(s.updated_at?.split('T')[0] || '')}
                            </span>
                          </div>

                          <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '12px', textTransform: 'uppercase' }}>{s.title}</h3>

                          {/* Script Text Box */}
                          <div className="portal-script-box" style={{ maxHeight: isExpanded ? 'none' : '150px' }}>
                            {s.script_text}
                            {!isExpanded && s.script_text && s.script_text.length > 200 && (
                              <div style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                right: 0,
                                height: '40px',
                                background: 'linear-gradient(to top, #f4f4f5 90%, transparent)'
                              }} />
                            )}
                          </div>

                          {s.script_text && s.script_text.length > 200 && (
                            <button 
                              onClick={() => toggleExpand(s.id)}
                              className="portal-btn" 
                              style={{ padding: '6px 12px', fontSize: '0.75rem', marginBottom: '16px' }}
                            >
                              {isExpanded ? 'Collapse Script' : 'Read Full Script'}
                            </button>
                          )}

                          {/* Action Links */}
                          {(s.reference_video_link || s.reaction_video_link) && (
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px' }}>
                              {s.reference_video_link && (
                                <a 
                                  href={s.reference_video_link} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="portal-btn" 
                                  style={{ padding: '8px 14px', fontSize: '0.8rem' }}
                                >
                                  <PlayCircle size={14} style={{ marginRight: '2px' }} /> Reference Video
                                </a>
                              )}
                              {s.reaction_video_link && (
                                <a 
                                  href={s.reaction_video_link} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="portal-btn" 
                                  style={{ padding: '8px 14px', fontSize: '0.8rem' }}
                                >
                                  <PlayCircle size={14} style={{ marginRight: '2px' }} /> Reaction Video
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
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
              <div className="portal-table-container">
                <table className="portal-table">
                  <thead>
                    <tr>
                      <th>Artist</th>
                      <th>Date</th>
                      <th>Company & Venue</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map(b => (
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Change Request Modal */}
      {rejectingItem && (
        <div className="portal-modal-overlay" onClick={() => setRejectingItem(null)}>
          <div className="portal-bento-card" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '550px', border: '3px solid #000000' }}>
            <h2 style={{ fontSize: '1.25rem', color: '#000000', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 800 }}>Request Changes</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px', fontWeight: 600 }}>
              Detail the changes required for: <strong>{rejectingItem.title}</strong>. This content will be sent back to our social media management team for instant revision.
            </p>
            
            <form onSubmit={handleReject}>
              <div className="portal-form-group">
                <label className="portal-label">Revision Instructions</label>
                <textarea
                  className="portal-control"
                  rows={4}
                  placeholder="Tell us what to change (e.g. edit the intro hook, change the call to action, adjust caption details)..."
                  value={rejectionComment}
                  onChange={(e) => setRejectionComment(e.target.value)}
                  style={{ resize: 'vertical' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button 
                  type="button" 
                  className="portal-btn" 
                  onClick={() => setRejectingItem(null)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="portal-btn portal-btn-danger" 
                  disabled={submittingDecision}
                >
                  {submittingDecision ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
