import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { 
  TrendingUp, BarChart2, Check, X, FileText, Send, Lock, Calendar, PlayCircle, ExternalLink,
  Share2, RefreshCw, MessageSquare, CheckCircle, Zap, Users, Bell, BellOff, UserPlus, ArrowLeft
} from 'lucide-react';

import { API_BASE } from '../api.js';
import logoImg from '../assets/logo.png';
import SEOHead from '../components/SEOHead.jsx';

const PRESET_REASON_OPTIONS = [
  'Out of Budget',
  'Not Interested',
  'Wrong Number / Spam',
  'Location Issue',
  'Already Serviced'
];

const PORTAL_STYLES = `
/* =========================================================
   Kyoto Dark Luxury Aesthetic for Client Intelligence Portal
   ========================================================= */

.client-portal-wrapper {
  --bg-primary: #05070a;
  --bg-card: rgba(10, 14, 18, 0.86);
  --text-primary: #dfe7e0;
  --text-secondary: #aab4ad;
  --text-muted: #8b9b90;
  --border-color: rgba(223, 231, 224, 0.12);
  --border-width: 1px;

  --shadow-sm: 0 4px 14px rgba(0, 0, 0, 0.5);
  --shadow-md: 0 16px 40px rgba(0, 0, 0, 0.7);
  --shadow-lg: 0 24px 60px rgba(0, 0, 0, 0.88);

  --radius-md: 20px;
  --radius-sm: 10px;

  box-sizing: border-box;
  font-family: 'Onest', 'Inter', system-ui, -apple-system, sans-serif;
  color: #dfe7e0;
  min-height: 100vh;
  padding: 36px 20px 80px;
  background-color: #05070a;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  overflow-x: clip;
}

body.portal-active {
  background-color: #05070a !important;
  color: #dfe7e0 !important;
  padding: 0 !important;
  margin: 0 !important;
}

/* Atmospheric background elements */
.portal-ambient-glow {
  position: fixed;
  top: -120px;
  left: 50%;
  transform: translateX(-50%);
  width: 90vw;
  max-width: 1400px;
  height: 520px;
  background: radial-gradient(ellipse at 50% 0%, rgba(224, 35, 28, 0.14) 0%, rgba(201, 162, 74, 0.04) 40%, transparent 70%);
  pointer-events: none;
  z-index: 0;
  filter: blur(55px);
}

.portal-vignette {
  position: fixed;
  inset: 0;
  background: radial-gradient(130% 100% at 50% 50%, transparent 40%, rgba(2, 4, 6, 0.88) 100%);
  pointer-events: none;
  z-index: 0;
}

.portal-container {
  width: 100%;
  max-width: 1240px;
  position: relative;
  z-index: 10;
  animation: portalFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes portalFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes spin {
  100% { transform: rotate(360deg); }
}

/* Bento Card styling */
.portal-bento-card {
  background: rgba(10, 14, 18, 0.86) !important;
  backdrop-filter: blur(28px) !important;
  -webkit-backdrop-filter: blur(28px) !important;
  border: 1px solid rgba(223, 231, 224, 0.12) !important;
  border-top: 1px solid rgba(223, 231, 224, 0.22) !important;
  border-radius: 20px !important;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.75), 0 0 35px rgba(224, 35, 28, 0.03) !important;
  padding: 24px;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.25s ease;
  position: relative;
  overflow: hidden;
  text-align: left;
  margin-bottom: 24px;
  color: #dfe7e0;
}

.portal-bento-card:hover {
  transform: translateY(-2px);
  border-color: rgba(224, 35, 28, 0.3) !important;
  box-shadow: 0 26px 65px rgba(0, 0, 0, 0.9), 0 0 40px rgba(224, 35, 28, 0.1) !important;
}

/* Header Banner */
.portal-header-banner {
  background: rgba(10, 14, 18, 0.88);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border: 1px solid rgba(223, 231, 224, 0.13);
  border-top: 1px solid rgba(223, 231, 224, 0.25);
  border-radius: 24px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.85), 0 0 45px rgba(224, 35, 28, 0.05);
  padding: 30px 36px;
  margin-bottom: 28px;
  text-align: left;
  position: relative;
  transition: border-color 0.25s ease;
}

.portal-header-banner:hover {
  border-color: rgba(224, 35, 28, 0.25);
}

.portal-header-brand-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(223, 231, 224, 0.08);
  flex-wrap: wrap;
  gap: 12px;
}

.portal-header-tag {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  background: rgba(224, 35, 28, 0.1);
  border: 1px solid rgba(224, 35, 28, 0.3);
  color: #aab4ad;
  padding: 5px 14px;
  border-radius: 9999px;
}

.portal-header-tag-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #e0231c;
  box-shadow: 0 0 8px #e0231c, 0 0 4px #ff5a3c;
}

.portal-header-title {
  font-family: 'Onest', sans-serif;
  font-size: 2.35rem;
  font-weight: 600;
  text-transform: uppercase;
  color: #dfe7e0;
  margin: 6px 0;
  letter-spacing: -0.015em;
  line-height: 1.15;
}

/* Tabs segment - frosted pill outline */
.portal-tabs-container {
  display: flex;
  background: rgba(10, 14, 18, 0.85);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(223, 231, 224, 0.12);
  border-radius: 9999px;
  padding: 6px;
  margin-bottom: 28px;
  width: 100%;
  gap: 6px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6);
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
  padding: 12px 22px;
  font-weight: 600;
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border-radius: 9999px;
  border: 1px solid transparent;
  cursor: pointer;
  background: transparent;
  color: #aab4ad;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  white-space: nowrap;
}

.portal-tab-btn:hover {
  background: rgba(255, 255, 255, 0.04);
  color: #dfe7e0;
}

.portal-tab-btn.active {
  background: rgba(224, 35, 28, 0.15) !important;
  border-color: #e0231c !important;
  color: #ffffff !important;
  box-shadow: 0 0 18px rgba(224, 35, 28, 0.25) !important;
}

/* Metrics Bento Grid */
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
  min-height: 120px;
  background: rgba(12, 17, 22, 0.82) !important;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(223, 231, 224, 0.12) !important;
  border-top: 1px solid rgba(223, 231, 224, 0.22) !important;
  border-radius: 16px !important;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.55) !important;
  padding: 20px;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.portal-metric-card:hover {
  transform: translateY(-2px);
  border-color: rgba(224, 35, 28, 0.35) !important;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.75), 0 0 24px rgba(224, 35, 28, 0.1) !important;
}

.portal-metric-value {
  font-size: 2.2rem;
  font-weight: 700;
  margin: 8px 0 0 0;
  line-height: 1.05;
  font-family: 'Outfit', 'Onest', sans-serif;
  letter-spacing: -0.02em;
  color: #dfe7e0;
}

.portal-metric-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: #8b9b90;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* Badges */
.portal-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  font-size: 0.7rem;
  font-weight: 600;
  border-radius: 9999px;
  text-transform: uppercase;
  border: 1px solid rgba(223, 231, 224, 0.14);
  background: rgba(255, 255, 255, 0.04);
  color: #aab4ad;
  letter-spacing: 0.05em;
}

.portal-badge-success { background: rgba(16, 185, 129, 0.12); border-color: rgba(16, 185, 129, 0.35); color: #34d399; }
.portal-badge-warning { background: rgba(245, 158, 11, 0.12); border-color: rgba(245, 158, 11, 0.35); color: #fbbf24; }
.portal-badge-danger { background: rgba(224, 35, 28, 0.14); border-color: rgba(224, 35, 28, 0.4); color: #f87171; }
.portal-badge-info { background: rgba(59, 130, 246, 0.12); border-color: rgba(59, 130, 246, 0.35); color: #60a5fa; }
.portal-badge-muted { background: rgba(255, 255, 255, 0.04); border-color: rgba(223, 231, 224, 0.1); color: #8b9b90; }

/* Form Controls & Buttons */
.portal-control {
  background: rgba(5, 7, 10, 0.85);
  border: 1px solid rgba(223, 231, 224, 0.14);
  border-radius: 10px;
  padding: 12px 16px;
  color: #dfe7e0;
  font-family: inherit;
  font-weight: 500;
  font-size: 0.88rem;
  transition: all 0.2s ease;
  width: 100%;
  box-sizing: border-box;
}

.portal-control:focus {
  outline: none;
  border-color: #e0231c;
  box-shadow: 0 0 16px rgba(224, 35, 28, 0.35);
}

.portal-control::placeholder {
  color: #525d57;
}

.portal-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 22px;
  font-weight: 600;
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border-radius: 9999px;
  border: 1px solid rgba(223, 231, 224, 0.14);
  cursor: pointer;
  background: rgba(14, 19, 25, 0.85);
  color: #dfe7e0;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  text-decoration: none;
}

.portal-btn:hover {
  transform: translateY(-1px);
  border-color: rgba(224, 35, 28, 0.45);
  color: #ffffff;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.7), 0 0 16px rgba(224, 35, 28, 0.15);
}

.portal-btn:active {
  transform: translateY(0);
}

.portal-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
}

.portal-btn-primary {
  background: #e0231c !important;
  border-color: #e0231c !important;
  color: #ffffff !important;
  box-shadow: 0 8px 24px rgba(224, 35, 28, 0.35) !important;
}

.portal-btn-primary:hover {
  background: #f12c24 !important;
  border-color: #f12c24 !important;
  box-shadow: 0 12px 30px rgba(224, 35, 28, 0.5) !important;
}

.portal-btn-success {
  background: rgba(16, 185, 129, 0.14) !important;
  border-color: rgba(16, 185, 129, 0.4) !important;
  color: #34d399 !important;
}
.portal-btn-success:hover {
  background: #10b981 !important;
  color: #ffffff !important;
  box-shadow: 0 0 20px rgba(16, 185, 129, 0.4) !important;
}

.portal-btn-danger {
  background: rgba(224, 35, 28, 0.14) !important;
  border-color: rgba(224, 35, 28, 0.4) !important;
  color: #f87171 !important;
}
.portal-btn-danger:hover {
  background: #e0231c !important;
  color: #ffffff !important;
  box-shadow: 0 0 20px rgba(224, 35, 28, 0.4) !important;
}

/* Grid Layouts */
.portal-grid-half {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 20px;
}

/* Tables */
.portal-table-container {
  overflow-x: auto;
  border-radius: 20px;
  border: 1px solid rgba(223, 231, 224, 0.12);
  border-top: 1px solid rgba(223, 231, 224, 0.22);
  background: rgba(10, 14, 18, 0.88);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
  width: 100%;
  max-width: 100%;
  padding: 0 !important;
  box-sizing: border-box;
  margin-bottom: 16px;
  -webkit-overflow-scrolling: touch;
}

.portal-table {
  width: 100%;
  min-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  text-align: left;
}

.portal-table th {
  background: rgba(14, 19, 25, 0.96);
  padding: 14px 18px;
  font-weight: 600;
  color: #aab4ad;
  border-bottom: 1px solid rgba(223, 231, 224, 0.12);
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 10;
}

.portal-table td {
  padding: 14px 18px;
  border-bottom: 1px solid rgba(223, 231, 224, 0.06);
  color: #dfe7e0;
  font-weight: 400;
  font-size: 0.85rem;
  white-space: nowrap;
}

.portal-table tr:last-child td {
  border-bottom: none;
}

.portal-table tr:hover td {
  background: rgba(224, 35, 28, 0.03);
}

/* Modal styling */
.portal-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(2, 4, 6, 0.82);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
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
  padding: 9px 18px;
  border-radius: 9999px;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: rgba(14, 19, 25, 0.8);
  border: 1px solid rgba(223, 231, 224, 0.14);
  color: #aab4ad;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  white-space: nowrap;
}

.portal-month-tab:hover {
  transform: translateY(-1px);
  color: #dfe7e0;
  border-color: rgba(224, 35, 28, 0.35);
}

.portal-month-tab.active {
  background: rgba(224, 35, 28, 0.15) !important;
  border-color: #e0231c !important;
  color: #ffffff !important;
  box-shadow: 0 0 16px rgba(224, 35, 28, 0.25) !important;
}

/* Script Box */
.portal-script-box {
  background: rgba(6, 9, 13, 0.9);
  border: 1px solid rgba(223, 231, 224, 0.12);
  padding: 20px 24px;
  border-radius: 12px;
  font-family: var(--font-sans);
  font-size: 0.92rem;
  line-height: 1.65;
  color: #dfe7e0;
  white-space: pre-wrap;
  position: relative;
  overflow: hidden;
  margin-bottom: 16px;
  font-weight: 400;
}

.portal-form-group {
  margin-bottom: 20px;
}

.portal-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  margin-bottom: 8px;
  color: #aab4ad;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* Select Dropdown */
.portal-select {
  background: rgba(10, 14, 18, 0.9);
  border: 1px solid rgba(223, 231, 224, 0.16);
  border-radius: 10px;
  padding: 8px 14px;
  color: #dfe7e0;
  font-family: inherit;
  font-weight: 600;
  font-size: 0.82rem;
  transition: all 0.2s ease;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.portal-select:focus {
  outline: none;
  border-color: #e0231c;
  box-shadow: 0 0 16px rgba(224, 35, 28, 0.35);
}

.portal-select option {
  background: #0a0e12;
  color: #dfe7e0;
}

.portal-code-block {
  background: #020305;
  color: #dfe7e0;
  border: 1px solid rgba(223, 231, 224, 0.12);
  border-radius: 10px;
  padding: 16px;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 0.85rem;
  white-space: pre-wrap;
  margin-top: 12px;
}

@media(max-width: 768px) {
  .portal-grid-half {
    grid-template-columns: 1fr;
  }
  .portal-tabs-container {
    display: grid !important;
    grid-template-columns: repeat(2, 1fr) !important;
    border-radius: 16px !important;
    padding: 8px !important;
    gap: 8px !important;
  }
  .portal-tab-btn {
    border-radius: 10px !important;
    padding: 10px 12px !important;
    font-size: 0.78rem !important;
    width: 100% !important;
    justify-content: center !important;
  }
  .portal-tabs-container button:last-child:nth-child(odd) {
    grid-column: span 2 !important;
  }
  .portal-header-banner {
    padding: 22px 18px;
    border-radius: 18px;
  }
  .portal-header-title {
    font-size: 1.65rem;
  }
  .portal-metrics-grid {
    grid-template-columns: 1fr;
  }
  .portal-table th, .portal-table td {
    padding: 10px 12px;
    font-size: 0.78rem;
  }
  .portal-code-block {
    font-size: 0.75rem;
    padding: 12px;
  }
  .portal-action-btns-row {
    flex-direction: column !important;
    gap: 10px !important;
  }
  .portal-action-btns-row .portal-btn {
    width: 100% !important;
    justify-content: center !important;
  }
  .portal-content-pagination-bar {
    padding-bottom: 12px !important;
    gap: 6px !important;
  }
  .portal-content-pagination-bar .portal-btn {
    padding: 6px 10px !important;
    font-size: 0.75rem !important;
  }
  .portal-content-pagination-bar span {
    font-size: 0.78rem !important;
  }
  .portal-content-item-header {
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 8px !important;
  }
  .portal-content-desktop-table {
    display: none !important;
  }
  .portal-content-mobile-list {
    display: flex !important;
    flex-direction: column;
    gap: 12px;
  }
}

.portal-content-mobile-list {
  display: none;
}
`;

function PlatformDistributionDonut({ breakdown }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [isChartHovered, setIsChartHovered] = useState(false);

  if (!breakdown || breakdown.length === 0) {
    return (
      <div className="portal-bento-card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '0.95rem', marginBottom: '16px', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.08em', color: '#dfe7e0' }}>Platform Share</h3>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>No distribution data available yet.</div>
      </div>
    );
  }

  const total = breakdown.reduce((sum, item) => sum + item.count, 0);
  let accumulatedPercent = 0;
  const platformColors = {
    instagram: '#e0231c',
    youtube: '#ff5a3c',
    facebook: '#3b82f6',
    linkedin: '#0284c7'
  };

  const C = 2 * Math.PI * 38; // 238.76

  return (
    <div className="portal-bento-card" style={{ padding: '24px' }}>
      <h3 style={{ fontSize: '0.95rem', marginBottom: '20px', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.08em', color: '#dfe7e0' }}>Platform Share</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <div 
          onMouseEnter={() => setIsChartHovered(true)}
          onMouseLeave={() => { setIsChartHovered(false); setHoveredIndex(null); }}
          style={{
            position: 'relative',
            width: '160px',
            height: '160px',
            transform: isChartHovered ? 'scale(1.05)' : 'scale(1)',
            transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            cursor: 'pointer'
          }}
        >
          <svg width="160" height="160" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
            <circle cx="50" cy="50" r="38" fill="#0a0e12" stroke="rgba(223, 231, 224, 0.16)" strokeWidth="1.5"></circle>
            {breakdown.map((item, idx) => {
              const percent = (item.count / total) * 100;
              const sliceLength = (percent / 100) * C;
              const strokeDashoffset = C * (1 - accumulatedPercent / 100);
              accumulatedPercent += percent;
              const color = platformColors[item.platform?.toLowerCase()] || '#64748b';
              const isHovered = hoveredIndex === idx;

              return (
                <circle
                  key={item.platform}
                  cx="50"
                  cy="50"
                  r="38"
                  fill="transparent"
                  stroke={color}
                  strokeWidth={isHovered ? 11 : 8.5}
                  strokeDasharray={`${sliceLength} ${C - sliceLength}`}
                  strokeDashoffset={strokeDashoffset}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  style={{ transition: 'all 0.25s ease', cursor: 'pointer' }}
                >
                  <title>{`${item.platform}: ${item.count} (${percent.toFixed(0)}%)`}</title>
                </circle>
              );
            })}
          </svg>

          {/* Center Text Container */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            width: '100px',
            textAlign: 'center'
          }}>
            <span style={{ fontSize: '1.6rem', fontWeight: '700', color: '#dfe7e0', lineHeight: 1, fontFamily: "'Outfit', sans-serif" }}>{total}</span>
            <span style={{ fontSize: '0.62rem', fontWeight: '600', color: '#8b9b90', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '4px' }}>POSTS</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left', flexGrow: 1, minWidth: '150px' }}>
          {breakdown.map((item, idx) => {
            const percent = total > 0 ? ((item.count / total) * 100).toFixed(0) : 0;
            const color = platformColors[item.platform?.toLowerCase()] || '#64748b';
            const isHighlighted = hoveredIndex === idx;
            return (
              <div 
                key={item.platform} 
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  fontSize: '0.85rem', 
                  fontWeight: '600',
                  padding: '5px 10px',
                  borderRadius: '8px',
                  background: isHighlighted ? 'rgba(224, 35, 28, 0.12)' : 'transparent',
                  transition: 'background 0.2s ease',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, display: 'inline-block', border: '1px solid rgba(223, 231, 224, 0.25)' }} />
                  <span style={{ textTransform: 'capitalize', color: '#dfe7e0' }}>{item.platform}:</span>
                </div>
                <span style={{ color: '#8b9b90' }}>{item.count} ({percent}%)</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EngagementBreakdownDonut({ stats }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [isChartHovered, setIsChartHovered] = useState(false);

  if (!stats) return null;
  const likes = stats.total_likes || 0;
  const comments = stats.total_comments || 0;
  const shares = stats.total_shares || 0;
  const saves = stats.total_saves || 0;
  const total = likes + comments + shares + saves;

  const items = [
    { label: 'Likes', count: likes, color: '#e0231c' },
    { label: 'Comments', count: comments, color: '#ff5a3c' },
    { label: 'Shares', count: shares, color: '#10b981' },
    { label: 'Saves', count: saves, color: '#c9a24a' }
  ];

  let accumulatedPercent = 0;
  const C = 2 * Math.PI * 38; // 238.76

  return (
    <div className="portal-bento-card" style={{ padding: '24px' }}>
      <h3 style={{ fontSize: '0.95rem', marginBottom: '20px', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.08em', color: '#dfe7e0' }}>Engagement Mix</h3>
      {total === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>No engagement data available yet.</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <div 
            onMouseEnter={() => setIsChartHovered(true)}
            onMouseLeave={() => { setIsChartHovered(false); setHoveredIndex(null); }}
            style={{
              position: 'relative',
              width: '160px',
              height: '160px',
              transform: isChartHovered ? 'scale(1.05)' : 'scale(1)',
              transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
              cursor: 'pointer'
            }}
          >
            <svg width="160" height="160" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
              <circle cx="50" cy="50" r="38" fill="#0a0e12" stroke="rgba(223, 231, 224, 0.16)" strokeWidth="1.5"></circle>
              {items.map((item, idx) => {
                if (item.count === 0) return null;
                const percent = (item.count / total) * 100;
                const sliceLength = (percent / 100) * C;
                const strokeDashoffset = C * (1 - accumulatedPercent / 100);
                accumulatedPercent += percent;
                const isHovered = hoveredIndex === idx;

                return (
                  <circle
                    key={item.label}
                    cx="50"
                    cy="50"
                    r="38"
                    fill="transparent"
                    stroke={item.color}
                    strokeWidth={isHovered ? 11 : 8.5}
                    strokeDasharray={`${sliceLength} ${C - sliceLength}`}
                    strokeDashoffset={strokeDashoffset}
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    style={{ transition: 'all 0.25s ease', cursor: 'pointer' }}
                  >
                    <title>{`${item.label}: ${item.count} (${percent.toFixed(1)}%)`}</title>
                  </circle>
                );
              })}
            </svg>

            {/* Center Text Container */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              width: '100px',
              textAlign: 'center'
            }}>
              <span style={{ fontSize: '1.4rem', fontWeight: '700', color: '#dfe7e0', lineHeight: 1, fontFamily: "'Outfit', sans-serif" }}>{total.toLocaleString()}</span>
              <span style={{ fontSize: '0.62rem', fontWeight: '600', color: '#8b9b90', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '4px' }}>INTERACTIONS</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left', flexGrow: 1, minWidth: '150px' }}>
            {items.map((item, idx) => {
              const percent = total > 0 ? ((item.count / total) * 100).toFixed(1) : 0;
              const isHighlighted = hoveredIndex === idx;
              return (
                <div 
                  key={item.label} 
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    fontSize: '0.85rem', 
                    fontWeight: '600',
                    padding: '5px 10px',
                    borderRadius: '8px',
                    background: isHighlighted ? 'rgba(224, 35, 28, 0.12)' : 'transparent',
                    transition: 'background 0.2s ease',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: item.color, display: 'inline-block', border: '1px solid rgba(223, 231, 224, 0.25)' }} />
                    <span style={{ color: '#dfe7e0' }}>{item.label}:</span>
                  </div>
                  <span style={{ color: '#8b9b90' }}>{item.count.toLocaleString()} ({percent}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PerformanceTrendChart({ data }) {
  const [metric, setMetric] = useState('views'); // 'views' or 'engagement'
  
  if (!data || data.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '20px', textAlign: 'center', fontWeight: '500' }}>
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
        <h3 style={{ fontSize: '0.95rem', margin: 0, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.08em', color: '#dfe7e0' }}>Content Performance Trend</h3>
        <div style={{ display: 'flex', border: '1px solid rgba(223, 231, 224, 0.14)', borderRadius: '9999px', overflow: 'hidden', background: 'rgba(5, 7, 10, 0.85)', padding: '2px' }}>
          <button 
            onClick={() => setMetric('views')}
            style={{
              padding: '6px 16px',
              border: 'none',
              fontWeight: '600',
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              borderRadius: '9999px',
              cursor: 'pointer',
              background: isViews ? '#e0231c' : 'transparent',
              color: isViews ? '#ffffff' : '#aab4ad',
              boxShadow: isViews ? '0 0 14px rgba(224, 35, 28, 0.35)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            Video Views
          </button>
          <button 
            onClick={() => setMetric('engagement')}
            style={{
              padding: '6px 16px',
              border: 'none',
              fontWeight: '600',
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              borderRadius: '9999px',
              cursor: 'pointer',
              background: !isViews ? '#e0231c' : 'transparent',
              color: !isViews ? '#ffffff' : '#aab4ad',
              boxShadow: !isViews ? '0 0 14px rgba(224, 35, 28, 0.35)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            Engagement %
          </button>
        </div>
      </div>

      <div style={{ width: '100%', background: 'rgba(10, 14, 18, 0.88)', border: '1px solid rgba(223, 231, 224, 0.12)', borderTop: '1px solid rgba(223, 231, 224, 0.22)', borderRadius: '18px', padding: '20px', boxShadow: '0 20px 50px rgba(0, 0, 0, 0.75)', boxSizing: 'border-box' }}>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="auto" style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id="sakuraTrendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e0231c" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#e0231c" stopOpacity="0.0" />
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
                  stroke="rgba(223, 231, 224, 0.08)" 
                  strokeWidth="1"
                  strokeDasharray={idx === 0 ? "0" : "4 4"}
                />
                <text 
                  x={paddingLeft - 8} 
                  y={y + 4} 
                  textAnchor="end" 
                  fill="#8b9b90" 
                  style={{ fontSize: '10px', fontFamily: "'JetBrains Mono', monospace", fontWeight: '500' }}
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
              fill="url(#sakuraTrendGrad)"
            />
          )}
          
          {/* Stroke Line */}
          {points.length > 0 && (
            <path 
              d={pathD} 
              fill="none" 
              stroke="#e0231c" 
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
                fill="#e0231c" 
                stroke="#0a0e12" 
                strokeWidth="2"
                style={{ cursor: 'pointer', filter: 'drop-shadow(0 0 6px rgba(224, 35, 28, 0.6))' }}
              >
                <title>{`${p.title || 'Post'}\n${isViews ? 'Views' : 'Engagement'}: ${isViews ? p.val.toLocaleString() : p.val.toFixed(2) + '%'}\nDate: ${p.date}`}</title>
              </circle>
              {/* Date labels */}
              <text 
                x={p.x} 
                y={paddingTop + chartHeight + 18} 
                textAnchor="middle" 
                fill="#aab4ad" 
                style={{ fontSize: '9px', fontFamily: "'Onest', sans-serif", fontWeight: '500' }}
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
  // Which capture month the leads tab is showing; 'all' for every month.
  const [leadsMonth, setLeadsMonth] = useState('all');
  // Landing-page Call/WhatsApp taps, one bucket per month.
  const [landingClicks, setLandingClicks] = useState([]);
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
    treatment_type: '',
    created_at: new Date().toISOString().split('T')[0],
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
  const [selectedPortalMonth, setSelectedPortalMonth] = useState('all');
  const [availablePortalMonths, setAvailablePortalMonths] = useState([]);

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
          setLandingClicks(data.landing_clicks || []);
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

  // Real-time SSE Connection Hook for Client Portal
  useEffect(() => {
    if (!isVerified) return;

    const es = new EventSource(`${API_BASE}/api/events`, { withCredentials: true });
    
    es.addEventListener('task_updated', () => {
      fetchData();
    });

    es.addEventListener('content_approved', () => {
      checkPortalAuth();
      fetchData();
    });

    es.addEventListener('client_feedback', () => {
      checkPortalAuth();
      fetchData();
    });

    return () => {
      es.close();
    };
  }, [isVerified, token]);

  const checkPortalAuth = async (overrideMonth = selectedPortalMonth) => {
    try {
      const url = `${API_BASE}/api/portal/${token}/overview${overrideMonth ? `?month=${overrideMonth}` : ''}`;
      const response = await fetch(url, { credentials: 'include' });
      const data = await response.json();
      
      if (response.status === 401 && data.requires_pin) {
        setPinRequired(true);
        setIsVerified(false);
      } else if (response.ok) {
        setIsVerified(true);
        setPinRequired(false);
        setClientName(data.client_name);
        setClientType(data.client_type || 'marketing');
        
        if (data.available_months && data.available_months.length > 0) {
          setAvailablePortalMonths(data.available_months);
        }
        // Always mirror the month the server actually applied, so the selector label
        // can never claim a month the numbers below it don't belong to.
        if (data.selected_month) {
          setSelectedPortalMonth(data.selected_month);
        }

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
          if (resLeads.ok) {
            setLeads(dataLeads.leads || []);
            setLandingClicks(dataLeads.landing_clicks || []);
          }
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
  // Follow-up reminders. Compared as plain YYYY-MM-DD against the viewer's local
  // today, because the date was chosen in their calendar, not in UTC.
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  /** 'overdue' | 'due' | null — only meaningful while the lead awaits follow-up. */
  const followUpState = (lead) => {
    if (!lead?.follow_up_date) return null;
    if ((lead.appointment_status || 'Follow Up') !== 'Follow Up') return null;
    const today = todayStr();
    if (lead.follow_up_date < today) return 'overdue';
    if (lead.follow_up_date === today) return 'due';
    return null;
  };

  const daysBetween = (dateStr) => {
    const diff = (new Date(todayStr()) - new Date(dateStr)) / 86400000;
    return Math.max(0, Math.round(diff));
  };

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
          treatment_type: data.treatment_type !== undefined ? data.treatment_type : l.treatment_type,
          created_at: data.created_at !== undefined ? data.created_at : l.created_at,
          lead_status: data.lead_status,
          is_test: data.is_test,
          follow_up_date: data.follow_up_date
        } : l));
        showToast('Lead updated successfully', 'success');
        // Marking a lead as a test changes the counts in the cards above this
        // table, so they have to be re-read rather than left showing the old ones.
        if (updates.is_test !== undefined) checkPortalAuth();
      } else {
        throw new Error(data.error || 'Failed to update lead');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  /**
   * wa.me needs a country code and nothing but digits. Indian numbers are
   * routinely stored as 10 digits with no prefix, so those get 91; anything
   * already carrying a country code is left alone.
   */
  const whatsappNumber = (phone) => {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
    return digits;
  };

  /**
   * Open the dialler or the WhatsApp thread for a lead and record the click, so
   * the box above the table shows how much the leads are actually being worked.
   * The link is opened first — a failed log should never cost the client the call.
   */
  const handleContactClick = async (lead, channel) => {
    if (!lead.phone) {
      showToast('This lead has no phone number', 'error');
      return;
    }

    if (channel === 'call') {
      window.location.href = `tel:${String(lead.phone).replace(/\s/g, '')}`;
    } else {
      const number = whatsappNumber(lead.phone);
      if (!number) {
        showToast('This lead has no usable phone number', 'error');
        return;
      }
      window.open(`https://wa.me/${number}`, '_blank', 'noopener,noreferrer');
    }

    // Optimistic, so the cards above the table move the instant the button is
    // pressed. They are summed from these per-lead counts, so this is the only
    // place the numbers have to be kept up to date.
    setLeads(prev => prev.map(l => l.id === lead.id
      ? { ...l, call_clicks: (l.call_clicks || 0) + (channel === 'call' ? 1 : 0),
              whatsapp_clicks: (l.whatsapp_clicks || 0) + (channel === 'whatsapp' ? 1 : 0) }
      : l));

    try {
      const response = await fetch(`${API_BASE}/api/portal/${token}/leads/${lead.id}/contact-click`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
        credentials: 'include'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to record contact');

      // Replace the optimistic guess with what was actually stored.
      setLeads(prev => prev.map(l => l.id === lead.id
        ? { ...l, call_clicks: data.call_clicks, whatsapp_clicks: data.whatsapp_clicks }
        : l));
    } catch (err) {
      console.error('[PORTAL] Contact click not recorded:', err);
    }
  };

  /**
   * Delete a lead after confirming. Used by the Test button, whose job is to
   * clear out entries that were fired to check the pipeline rather than to
   * record them as not counting.
   */
  const handleDeleteLead = async (lead) => {
    const label = lead.name || lead.phone || `lead #${lead.id}`;
    if (!window.confirm(
      `Delete ${label} permanently?\n\nThis removes the lead from your portal for good — it cannot be undone.`
    )) return;

    try {
      const response = await fetch(`${API_BASE}/api/portal/${token}/leads/${lead.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to delete lead');

      setLeads(prev => prev.filter(l => l.id !== lead.id));
      showToast('Lead deleted', 'success');
      // A deleted lead drops out of the counts in the cards above this table,
      // the same way marking one as a test does.
      checkPortalAuth();
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
        treatment_type: '',
        created_at: new Date().toISOString().split('T')[0],
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
      <div className="client-portal-wrapper" style={{ justifyContent: 'center' }}>
        <style dangerouslySetInnerHTML={{ __html: PORTAL_STYLES }} />
        <SEOHead 
          title="Security Verification — Hyphening Media Client Portal" 
          description="Enter your Client PIN to access the secure performance intelligence dashboard."
        />
        <div className="portal-ambient-glow" />
        <div className="portal-vignette" />

        <div className="portal-bento-card" style={{ width: '100%', maxWidth: '440px', padding: '40px 36px', textAlign: 'center', margin: 'auto 0', zIndex: 10 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '5px 14px', background: 'rgba(224, 35, 28, 0.1)', border: '1px solid rgba(224, 35, 28, 0.3)', borderRadius: '9999px', marginBottom: '24px' }}>
            <span className="portal-header-tag-dot" />
            <span style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#aab4ad' }}>SECURITY VERIFICATION</span>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <Link to="/" style={{ display: 'inline-block', marginBottom: '16px' }} title="Return Home">
              <img src={logoImg} alt="Hyphening Media" style={{ height: '64px', width: 'auto', margin: '0 auto' }} />
            </Link>
            <div style={{ display: 'inline-flex', padding: '14px', background: 'rgba(224, 35, 28, 0.12)', color: '#e0231c', border: '1px solid rgba(224, 35, 28, 0.3)', borderRadius: '50%', marginBottom: '16px', boxShadow: '0 0 24px rgba(224, 35, 28, 0.25)' }}>
              <Lock size={28} />
            </div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#dfe7e0', margin: '0 0 8px', letterSpacing: '-0.015em' }}>Client Portal Access</h2>
            <p style={{ color: '#8b9b90', fontSize: '0.88rem', margin: 0, lineHeight: 1.5, fontWeight: 300 }}>
              Please enter your Client PIN to access the performance dashboard and approval portal.
            </p>
          </div>

          <form onSubmit={verifyPin} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div className="portal-form-group" style={{ margin: 0 }}>
              <input
                type="password"
                className="portal-control"
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                style={{ textAlign: 'center', fontSize: '1.4rem', letterSpacing: '0.3em', padding: '14px' }}
                required
                autoFocus
              />
            </div>
            <button type="submit" className="portal-btn portal-btn-primary" style={{ width: '100%', padding: '14px', fontSize: '0.85rem' }}>
              Verify Access
            </button>
          </form>
          <div style={{ marginTop: '20px', fontSize: '0.72rem', color: '#6b7770', letterSpacing: '0.04em' }}>
            🔒 256-Bit Encrypted Client Portal · Hyphening Media
          </div>
        </div>
      </div>
    );
  }

  if (!isVerified || !overview) {
    return (
      <div className="client-portal-wrapper" style={{ justifyContent: 'center' }}>
        <style dangerouslySetInnerHTML={{ __html: PORTAL_STYLES }} />
        <div className="portal-ambient-glow" />
        <div className="portal-vignette" />
        <div style={{ textAlign: 'center', position: 'relative', zIndex: 10 }}>
          <div style={{ border: '3px solid rgba(224, 35, 28, 0.15)', borderTop: '3px solid #e0231c', borderRadius: '50%', width: '44px', height: '44px', animation: 'spin 0.9s linear infinite', margin: '0 auto 20px', boxShadow: '0 0 20px rgba(224, 35, 28, 0.3)' }}></div>
          <p style={{ color: '#dfe7e0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: '0.82rem' }}>Verifying secure token access...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="client-portal-wrapper">
      <style dangerouslySetInnerHTML={{ __html: PORTAL_STYLES }} />
      <SEOHead 
        title={`${clientName ? `${clientName} — Client Portal` : 'Client Intelligence Portal'} | Hyphening Media`}
        description="Secure real-time marketing performance analytics, monthly reports, and content approval pipeline."
      />
      <div className="portal-ambient-glow" />
      <div className="portal-vignette" />
      
      <div className="portal-container">
        
        {/* Portal Header */}
        <header className="portal-header-banner">
          <div className="portal-header-brand-row">
            <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} title="Hyphening Media">
              <img src={logoImg} alt="Hyphening Media" style={{ height: '64px', maxHeight: '72px', width: 'auto', objectFit: 'contain' }} />
            </Link>
            <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="portal-header-tag">
                <span className="portal-header-tag-dot" />
                <span>CLIENT INTELLIGENCE PORTAL</span>
              </span>
              {overview.pending_approvals > 0 && (
                <span className="portal-badge portal-badge-warning" style={{ fontSize: '0.72rem', padding: '4px 10px' }}>
                  {overview.pending_approvals} Approval Pending
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            {/* Left side text block */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 300px' }}>
              <h1 className="portal-header-title">{clientName}</h1>
              {overview.sister_companies && overview.sister_companies.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#8b9b90', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Group Locations:</span>
                  <span className="portal-badge portal-badge-info" style={{ textTransform: 'none', fontWeight: 600 }}>{clientName}</span>
                  {overview.sister_companies.map((s, idx) => (
                    <span key={idx} className="portal-badge portal-badge-muted" style={{ textTransform: 'none', fontWeight: 500 }}>{s}</span>
                  ))}
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
                    padding: '10px 20px', 
                    fontSize: '0.82rem',
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
                      <Bell size={15} />
                      <span>Alert ON</span>
                    </>
                  ) : leadAlertsEnabled ? (
                    <>
                      <Bell size={15} style={{ color: '#ffffff' }} />
                      <span>Alert ON</span>
                    </>
                  ) : (
                    <>
                      <BellOff size={15} style={{ color: 'var(--text-muted)' }} />
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
                <BarChart2 size={15} /> Overview
              </button>
              <button 
                onClick={() => setActiveTab('reports')} 
                className={`portal-tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
              >
                <TrendingUp size={15} /> Reports
              </button>
              <button 
                onClick={() => setActiveTab('content')} 
                className={`portal-tab-btn ${activeTab === 'content' ? 'active' : ''}`}
                style={{ position: 'relative' }}
              >
                <Calendar size={15} /> Content
                {activeTab !== 'content' && overview?.pending_approvals > 0 && (
                  <span style={{ position: 'absolute', top: '10px', right: '14px', width: '7px', height: '7px', borderRadius: '50%', background: '#e0231c', boxShadow: '0 0 8px #e0231c' }} />
                )}
              </button>
              <button 
                onClick={() => setActiveTab('leads')} 
                className={`portal-tab-btn ${activeTab === 'leads' ? 'active' : ''}`}
              >
                <Users size={15} /> Leads
              </button>
              <button 
                onClick={() => setActiveTab('integrations')} 
                className={`portal-tab-btn ${activeTab === 'integrations' ? 'active' : ''}`}
              >
                <Share2 size={15} /> Integrations
              </button>
            </>
          )}

          {(clientType === 'artist_curation' || clientType === 'both') && (
            <button 
              onClick={() => setActiveTab('bookings')} 
              className={`portal-tab-btn ${activeTab === 'bookings' ? 'active' : ''}`}
            >
              <TrendingUp size={15} /> Artist Bookings
            </button>
          )}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (clientType === 'marketing' || clientType === 'both') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', margin: 0, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.06em', color: '#dfe7e0' }}>Performance Summary</h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#8b9b90', fontWeight: 400 }}>Real-time marketing metrics and social performance overview</p>
              </div>

              {availablePortalMonths.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#8b9b90', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Month:</span>
                  <select
                    className="portal-select"
                    style={{ width: 'auto', padding: '7px 14px', fontSize: '0.82rem' }}
                    value={selectedPortalMonth || 'all'}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedPortalMonth(val);
                      checkPortalAuth(val);
                    }}
                  >
                    <option value="all">All Months (Total)</option>
                    {availablePortalMonths.map(m => (
                      <option key={m} value={m}>{formatMonthName(m)}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            
            {/* Top Bento Metric Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
              {overview.content && (
                <>
                  <div className="portal-metric-card">
                    <span className="portal-metric-label">Total Video Views</span>
                    <span className="portal-metric-value">
                      {overview.content.total_views?.toLocaleString() || 0}
                    </span>
                  </div>

                  <div className="portal-metric-card">
                    <span className="portal-metric-label">Avg Engagement</span>
                    <span className="portal-metric-value" style={{ color: '#e0231c' }}>
                      {overview.content.avg_engagement_rate || 0}%
                    </span>
                  </div>

                  <div className="portal-metric-card">
                    <span className="portal-metric-label">Avg Watch Time</span>
                    <span className="portal-metric-value" style={{ color: '#10b981' }}>
                      {overview.content.avg_watch_time ? `${overview.content.avg_watch_time}s` : '-'}
                    </span>
                  </div>

                  <div className="portal-metric-card">
                    <span className="portal-metric-label">Avg Skip Rate</span>
                    <span className="portal-metric-value" style={{ color: overview.content.avg_skip_rate <= 30 ? '#10b981' : '#e0231c' }}>
                      {overview.content.avg_skip_rate ? `${overview.content.avg_skip_rate}%` : '-'}
                    </span>
                  </div>

                  <div className="portal-metric-card">
                    <span className="portal-metric-label">Quality Score</span>
                    <span className="portal-metric-value">
                      {overview.content.avg_content_score || 0}
                    </span>
                  </div>
                </>
              )}

              {overview.ads && (
                <>
                  <div className="portal-metric-card">
                    <span className="portal-metric-label">Leads Captured</span>
                    <span className="portal-metric-value" style={{ color: '#38bdf8' }}>
                      {overview.ads.total_leads || 0}
                    </span>
                  </div>

                  <div className="portal-metric-card">
                    <span className="portal-metric-label">Qualified Leads</span>
                    <span className="portal-metric-value" style={{ color: '#34d399' }}>
                      {overview.ads.qualified_leads || 0}
                    </span>
                  </div>

                  <div className="portal-metric-card">
                    <span className="portal-metric-label">Confirmed Bookings</span>
                    <span className="portal-metric-value" style={{ color: '#60a5fa' }}>
                      {overview.ads.appointments_booked || 0}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Performance Trend Chart */}
            <PerformanceTrendChart data={overview.views_trend} />

            {/* 2-Column Bento Grid for Pie/Donut Charts & Ad Funnel */}
            <div className="portal-grid-half">
              {/* Platform Share Donut Chart */}
              <PlatformDistributionDonut breakdown={overview.platform_breakdown} />

              {/* Engagement Mix Donut Chart */}
              <EngagementBreakdownDonut stats={overview.content} />
            </div>

            {/* Ad Campaigns & Conversion Performance */}
            {overview.ads_breakdown && overview.ads_breakdown.length > 0 && (
              <div className="portal-bento-card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '0.95rem', marginBottom: '16px', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.08em', color: '#dfe7e0' }}>Ad Campaign Breakdown</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <h4 style={{ fontSize: '0.76rem', marginBottom: '12px', color: '#8b9b90', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Leads & Conversion Performance By Campaign</h4>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(223, 231, 224, 0.12)', textAlign: 'left' }}>
                            <th style={{ padding: '10px 12px', color: '#aab4ad', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Platform</th>
                            <th style={{ padding: '10px 12px', color: '#aab4ad', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Campaign Name</th>
                            <th style={{ padding: '10px 12px', color: '#aab4ad', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Captured Leads</th>
                            <th style={{ padding: '10px 12px', color: '#34d399', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Qualified Leads</th>
                            <th style={{ padding: '10px 12px', color: '#60a5fa', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Confirmed Bookings</th>
                          </tr>
                        </thead>
                        <tbody>
                          {overview.ads_breakdown.map((item, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid rgba(223, 231, 224, 0.06)' }}>
                              <td style={{ padding: '12px', fontWeight: 600, color: '#dfe7e0' }}>{item.platform}</td>
                              <td style={{ padding: '12px', fontWeight: 400, color: '#dfe7e0' }}>{item.campaign_name}</td>
                              <td style={{ padding: '12px', fontWeight: 600, color: '#dfe7e0' }}>{item.leads || 0}</td>
                              <td style={{ padding: '12px', fontWeight: 600, color: '#34d399' }}>{item.qualified_leads || 0}</td>
                              <td style={{ padding: '12px', fontWeight: 600, color: '#60a5fa' }}>{item.confirmed_bookings || 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Assist Feedback form */}
            <div className="portal-bento-card" style={{ padding: '28px', marginTop: '12px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#dfe7e0' }}>Need assistance or request changes?</h3>
              <p style={{ color: '#8b9b90', fontSize: '0.85rem', marginBottom: '16px', fontWeight: 400 }}>
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
                <button type="submit" className="portal-btn portal-btn-primary" disabled={submittingFeedback} style={{ padding: '10px 22px' }}>
                  <Send size={15} />
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
              <h2 style={{ fontSize: '1.05rem', margin: '4px 0 14px 0', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.08em', color: '#dfe7e0' }}>SEO Monthly Reports</h2>
              {seoReports.length === 0 ? (
                <div className="portal-bento-card" style={{ padding: '40px', textAlign: 'center', color: '#8b9b90', fontWeight: 500 }}>
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
                            <td style={{ fontWeight: 600, color: '#dfe7e0', whiteSpace: 'nowrap' }}>{formatMonthName(r.month)}</td>
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
              <h2 style={{ fontSize: '1.05rem', margin: '4px 0 14px 0', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.08em', color: '#dfe7e0' }}>Tracked Content Performance</h2>
              {contentList.length === 0 ? (
                <div className="portal-bento-card" style={{ padding: '40px', textAlign: 'center', color: '#8b9b90', fontWeight: 500 }}>
                  No tracked posts found yet.
                </div>
              ) : (
                <>
                  {/* Desktop Table View */}
                  <div className="portal-table-container portal-content-desktop-table">
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
                            <td style={{ fontWeight: 600, color: '#dfe7e0' }}>{item.title || 'Untitled Post'}</td>
                            <td>
                              {item.platform === 'youtube' ? (item.youtube_views?.toLocaleString() || 0) : (item.views?.toLocaleString() || 0)}
                            </td>
                            <td>{item.likes?.toLocaleString() || 0}</td>
                            <td>{item.comments?.toLocaleString() || 0}</td>
                            <td>{item.shares?.toLocaleString() || 0}</td>
                            <td>{item.saves?.toLocaleString() || 0}</td>
                            <td>{item.avg_watch_time_pct ? `${item.avg_watch_time_pct}%` : '-'}</td>
                            <td>{item.skip_rate_pct ? `${item.skip_rate_pct}%` : '-'}</td>
                            <td style={{ fontWeight: 600, color: item.engagement_rate_pct >= 5 ? '#34d399' : '#dfe7e0' }}>
                              {item.engagement_rate_pct ? `${item.engagement_rate_pct}%` : '0%'}
                            </td>
                            <td style={{ fontWeight: 600, color: '#dfe7e0' }}>{item.content_score || 0}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>{formatDateStr(item.date)}</td>
                            <td>
                              {item.link ? (
                                <a href={item.link} target="_blank" rel="noopener noreferrer" className="portal-badge" style={{ textDecoration: 'none', color: '#dfe7e0', fontWeight: 600, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(223,231,224,0.16)' }}>
                                  <ExternalLink size={12} />
                                </a>
                              ) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card List View */}
                  <div className="portal-content-mobile-list">
                    {contentList.slice((contentPage - 1) * ITEMS_PER_PAGE_CONTENT, contentPage * ITEMS_PER_PAGE_CONTENT).map(item => (
                      <div key={item.id} className="portal-bento-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <div>
                            <div style={{ display: 'inline-flex', gap: '6px', marginBottom: '6px' }}>
                              <span className={`portal-badge ${item.platform === 'instagram' ? 'portal-badge-info' : 'portal-badge-success'}`}>
                                {item.platform}
                              </span>
                              <span className="portal-badge portal-badge-muted" style={{ textTransform: 'capitalize' }}>
                                {item.post_type}
                              </span>
                            </div>
                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#dfe7e0', wordBreak: 'break-word' }}>
                              {item.title || 'Untitled Post'}
                            </h4>
                          </div>
                          {item.link && (
                            <a href={item.link} target="_blank" rel="noopener noreferrer" className="portal-badge" style={{ textDecoration: 'none', color: '#dfe7e0', fontWeight: 600, flexShrink: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(223,231,224,0.16)' }}>
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(223, 231, 224, 0.1)' }}>
                          <div>
                            <div style={{ fontSize: '0.68rem', color: '#8b9b90', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>Views</div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#dfe7e0', marginTop: '2px' }}>
                              {item.platform === 'youtube' ? (item.youtube_views?.toLocaleString() || 0) : (item.views?.toLocaleString() || 0)}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.68rem', color: '#8b9b90', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>Likes</div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#dfe7e0', marginTop: '2px' }}>{item.likes?.toLocaleString() || 0}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.68rem', color: '#8b9b90', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>Engagement</div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginTop: '2px', color: item.engagement_rate_pct >= 5 ? '#34d399' : '#dfe7e0' }}>
                              {item.engagement_rate_pct ? `${item.engagement_rate_pct}%` : '0%'}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#8b9b90', fontWeight: 500 }}>
                          <span>Score: <strong style={{ color: '#dfe7e0' }}>{item.content_score || 0}</strong></span>
                          <span>Date: {formatDateStr(item.date)}</span>
                        </div>
                      </div>
                    ))}
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
            <h2 style={{ fontSize: '1.05rem', margin: '4px 0', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.08em', color: '#dfe7e0' }}>Monthly Content Plans</h2>
            <p style={{ color: '#8b9b90', fontSize: '0.85rem', marginBottom: '8px', fontWeight: 400 }}>
              Read the finalized scripts and concepts prepared for your brand. Approve items or request changes with a comment.
            </p>

            {uniqueMonths.length === 0 ? (
              <div className="portal-bento-card" style={{ padding: '40px', textAlign: 'center', color: '#8b9b90', fontWeight: 500 }}>
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
                    >
                      {formatMonthName(m)}
                    </button>
                  ))}
                </div>

                {(() => {
                  const filteredScripts = scripts.filter(s => s.month === selectedMonth);

                  if (filteredScripts.length === 0) {
                    return (
                      <div className="portal-bento-card" style={{ padding: '30px', textAlign: 'center', color: '#8b9b90', fontWeight: 500 }}>
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
                      <div className="portal-content-pagination-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(223, 231, 224, 0.12)', paddingBottom: '16px' }}>
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
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#dfe7e0' }}>
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
                        <div className="portal-content-item-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span className="portal-badge portal-badge-info" style={{ textTransform: 'uppercase' }}>
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
                          <span style={{ fontSize: '0.78rem', color: '#8b9b90', fontWeight: 500 }}>
                            Last updated: {formatDateStr(item.updated_at?.split('T')[0] || '')}
                          </span>
                        </div>

                        <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#dfe7e0' }}>{item.title}</h3>

                        {/* Script details */}
                        <div className="portal-script-box" style={{ maxHeight: 'none', background: 'rgba(5, 7, 10, 0.65)', padding: '18px', borderRadius: '12px', border: '1px solid rgba(223, 231, 224, 0.12)', color: '#dfe7e0', lineHeight: 1.65, whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>
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
                      <div style={{ borderTop: '1px solid rgba(223, 231, 224, 0.12)', paddingTop: '20px' }}>
                        {!isApproved ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {item.content_status === 'Client Rejected' && item.client_comments && (
                              <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', padding: '10px 14px', color: '#fbbf24', fontSize: '0.85rem', fontWeight: 500 }}>
                                <strong>Previous Revision Request:</strong> "{item.client_comments}"
                              </div>
                            )}
                            <div className="portal-form-group" style={{ margin: 0 }}>
                              <label className="portal-label" style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: '0.74rem', letterSpacing: '0.06em', color: '#aab4ad', marginBottom: '8px', display: 'block' }}>
                                Comments / Feedback for Revisions
                              </label>
                              <textarea
                                className="portal-control"
                                rows={3}
                                value={contentCommentText}
                                onChange={(e) => setContentCommentText(e.target.value)}
                                placeholder="Describe changes needed on hook, tone, CTA, or visual assets..."
                                style={{ resize: 'vertical', width: '100%' }}
                              />
                            </div>

                            <div className="portal-action-btns-row" style={{ display: 'flex', gap: '14px', marginTop: '4px' }}>
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
                            background: 'rgba(16, 185, 129, 0.12)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            borderRadius: '10px',
                            padding: '16px',
                            color: '#34d399',
                            fontSize: '0.9rem',
                            fontWeight: 500
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
            <h2 style={{ fontSize: '1.05rem', margin: '4px 0', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.08em', color: '#dfe7e0' }}>Booked Artists & Performances</h2>
            <p style={{ color: '#8b9b90', fontSize: '0.85rem', marginBottom: '8px', fontWeight: 400 }}>
              List of artists scheduled for your venues and their payment status.
            </p>

            {bookings.length === 0 ? (
              <div className="portal-bento-card" style={{ padding: '40px', textAlign: 'center', color: '#8b9b90', fontWeight: 500 }}>
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
                          <td style={{ fontWeight: 600, color: '#dfe7e0' }}>
                            {b.artist_name} <span style={{ fontSize: '0.75rem', color: '#8b9b90', fontFamily: 'monospace' }}>({b.artist_code})</span>
                          </td>
                          <td style={{ color: '#dfe7e0' }}>{formatDateStr(b.gig_date)}</td>
                          <td>
                            <div style={{ fontWeight: 600, color: '#dfe7e0' }}>{b.client_name}</div>
                            <div style={{ fontSize: '0.8rem', color: '#8b9b90' }}>{b.venue_name || '-'}</div>
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
                                    background: 'rgba(252, 128, 25, 0.15)', 
                                    color: '#ff9d42', 
                                    border: '1px solid rgba(252, 128, 25, 0.35)', 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '4px', 
                                    textDecoration: 'none',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    borderRadius: '9999px',
                                    padding: '3px 9px'
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
                                    background: 'rgba(224, 35, 28, 0.15)', 
                                    color: '#ff6259', 
                                    border: '1px solid rgba(224, 35, 28, 0.35)', 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '4px', 
                                    textDecoration: 'none',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    borderRadius: '9999px',
                                    padding: '3px 9px'
                                  }}
                                >
                                  Zomato <ExternalLink size={10} />
                                </a>
                              )}
                              {!b.swiggy_link && !b.zomato_link && <span style={{ color: '#8b9b90' }}>-</span>}
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
                <h2 style={{ fontSize: '1.05rem', margin: 0, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.08em', color: '#dfe7e0' }}>
                  Social Integrations & Connections
                </h2>
                <p style={{ color: '#8b9b90', fontSize: '0.85rem', margin: '4px 0 0', fontWeight: 400 }}>
                  Connect brand social channels to enable automated 1080p publishing, live metric sync, and comment replies.
                </p>
              </div>
              <button 
                onClick={() => { fetchIntegrations(); fetchComments(); showToast('Refreshing integrations status...', 'info'); }}
                className="portal-btn"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600 }}
                disabled={integrationsLoading}
              >
                <RefreshCw size={14} className={integrationsLoading ? 'spin' : ''} /> Refresh Statuses
              </button>
            </div>

            {/* Section A: Connected Accounts Bento Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
              {[
                { key: 'instagram', name: 'Instagram Business', desc: 'Reels & Media Insights', icon: '📸' },
                { key: 'facebook', name: 'Facebook Page', desc: 'Page Reels & Insights', icon: '📘' },
                { key: 'youtube', name: 'YouTube Channel', desc: 'Shorts & Video Analytics', icon: '▶️' },
                { key: 'linkedin', name: 'LinkedIn Company', desc: 'Professional Video Posts', icon: '💼' },
                { key: 'x', name: 'X (Twitter)', desc: 'Direct Social Video Posts', icon: '𝕏' }
              ].map(app => {
                const info = integrations[app.key] || {};
                const isConn = info.connected;

                return (
                  <div 
                    key={app.key} 
                    className="portal-bento-card"
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      justifyContent: 'space-between', 
                      gap: '14px', 
                      padding: '18px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1.4rem' }}>{app.icon}</span>
                        <div>
                          <h3 style={{ fontSize: '0.9rem', margin: 0, fontWeight: 600, color: '#dfe7e0', lineHeight: 1.2 }}>{app.name}</h3>
                          <span style={{ fontSize: '0.72rem', color: '#8b9b90', display: 'block', marginTop: '3px', fontWeight: 400 }}>{app.desc}</span>
                        </div>
                      </div>
                      <span 
                        style={{ 
                          fontSize: '0.65rem', 
                          padding: '3px 8px', 
                          borderRadius: '9999px', 
                          fontWeight: 600,
                          backgroundColor: isConn ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                          color: isConn ? '#34d399' : '#8b9b90',
                          border: isConn ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(223, 231, 224, 0.12)'
                        }}
                      >
                        {isConn ? 'Connected' : 'Unlinked'}
                      </span>
                    </div>

                    {isConn && info.accountName && (
                      <div style={{
                        fontSize: '0.74rem',
                        background: 'rgba(5, 7, 10, 0.65)',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid rgba(223, 231, 224, 0.12)',
                        color: '#dfe7e0',
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }} title={`@${info.accountName.replace(/^@/, '')}`}>
                        Account: <strong style={{ color: '#34d399' }}>@{info.accountName.replace(/^@/, '')}</strong>
                      </div>
                    )}

                    <button
                      onClick={() => handleConnectApp(app.key)}
                      disabled={connectingApp === app.key}
                      className={isConn ? 'portal-btn' : 'portal-btn portal-btn-primary'}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontSize: '0.78rem',
                        padding: '8px 12px'
                      }}
                    >
                      {connectingApp === app.key ? (
                        <>Connecting...</>
                      ) : isConn ? (
                        <><CheckCircle size={13} color="#34d399" /> Switch Account</>
                      ) : (
                        <><Zap size={13} color="#e0231c" /> Connect {app.name.split(' ')[0]}</>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Section B: Community & Comment Reply Inbox */}
            <div className="portal-bento-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '1.05rem', margin: 0, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.06em', color: '#dfe7e0' }}>
                    💬 Community & Live Comment Inbox
                  </h3>
                  <p style={{ color: '#8b9b90', fontSize: '0.82rem', margin: '4px 0 0', fontWeight: 400 }}>
                    View and reply to incoming comments across Instagram Reels & YouTube Shorts in real-time.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={handleSyncComments}
                    className="portal-btn portal-btn-primary"
                    style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                    disabled={syncingComments}
                  >
                    {syncingComments ? '⏳ Syncing...' : '🔄 Sync Comments'}
                  </button>
                  <button 
                    onClick={fetchComments}
                    className="portal-btn"
                    style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {commentsLoading ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#8b9b90', fontWeight: 500, fontSize: '0.85rem' }}>
                  Loading social comments...
                </div>
              ) : comments.length === 0 ? (
                <div style={{ padding: '36px', textAlign: 'center', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '12px', border: '1px dashed rgba(223, 231, 224, 0.16)', color: '#8b9b90' }}>
                  <MessageSquare size={32} style={{ opacity: 0.4, marginBottom: '8px' }} />
                  <div style={{ fontWeight: 600, color: '#dfe7e0', fontSize: '0.95rem' }}>No Ingested Comments Yet</div>
                  <div style={{ fontSize: '0.8rem', marginTop: '4px', fontWeight: 400 }}>
                    Comments are automatically synced every night at 2:00 AM UTC once social accounts are connected.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {comments.map(comm => (
                    <div 
                      key={comm.id || comm.comment_id} 
                      style={{ 
                        background: 'rgba(5, 7, 10, 0.65)', 
                        border: '1px solid rgba(223, 231, 224, 0.12)', 
                        borderRadius: '12px', 
                        padding: '16px', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="portal-badge portal-badge-muted" style={{ textTransform: 'capitalize' }}>
                            {comm.platform || 'Instagram'}
                          </span>
                          <strong style={{ color: '#dfe7e0', fontSize: '0.88rem' }}>
                            {(comm.commenter_name && comm.commenter_name !== 'User' && comm.commenter_name !== 'Social User')
                              ? `@${comm.commenter_name.replace(/^@/, '')}`
                              : `${comm.platform === 'youtube' ? 'YouTube User' : 'Instagram User'}`}
                          </strong>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#8b9b90', fontWeight: 500 }}>
                          {comm.post_title ? `Post: ${comm.post_title}` : `Post ID: #${comm.content_id}`}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.88rem', color: '#dfe7e0', fontWeight: 400, padding: '8px 12px', borderLeft: '3px solid var(--accent)', background: 'rgba(224, 35, 28, 0.05)', borderRadius: '0 8px 8px 0' }}>
                        "{comm.comment_text}"
                      </div>

                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <input
                          type="text"
                          placeholder="Type live reply to post on social platform..."
                          value={replyTextMap[comm.comment_id] || ''}
                          onChange={(e) => setReplyTextMap({ ...replyTextMap, [comm.comment_id]: e.target.value })}
                          className="portal-control"
                          style={{
                            flexGrow: 1,
                            padding: '8px 12px',
                            fontSize: '0.82rem'
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSendCommentReply(comm.comment_id, comm.platform);
                          }}
                        />
                        <button
                          onClick={() => handleSendCommentReply(comm.comment_id, comm.platform)}
                          className="portal-btn portal-btn-primary"
                          disabled={replyingId === comm.comment_id}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', whiteSpace: 'nowrap', padding: '8px 16px' }}
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
            <div 
              className="portal-bento-card"
              style={{ 
                padding: '20px 24px',
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                flexWrap: 'wrap', 
                gap: '16px' 
              }}
            >
              <div>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '0.98rem', color: '#dfe7e0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  ⚡ High-Velocity Metric Sync
                </h4>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#8b9b90', fontWeight: 400 }}>
                  Portal analytics automatically sync post insights continuously. Trigger a manual live refresh anytime.
                </p>
              </div>
              <button
                onClick={() => { fetchData(); showToast('✓ Live metrics synced from cache', 'success'); }}
                className="portal-btn portal-btn-primary"
                style={{ fontSize: '0.82rem', padding: '8px 18px' }}
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
                <h2 style={{ fontSize: '1.05rem', margin: '4px 0', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.08em', color: '#dfe7e0' }}>
                  Campaign Leads & Conversions
                </h2>
                <p style={{ color: '#8b9b90', fontSize: '0.85rem', margin: 0, fontWeight: 400 }}>
                  Review leads captured from forms and calls. Confirm booking appointments or record rejection details.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                {availablePortalMonths.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#8b9b90' }}>Select Month:</span>
                    <select
                      className="portal-select"
                      style={{ width: 'auto', padding: '6px 12px', fontSize: '0.82rem', fontWeight: 600 }}
                      value={leadsMonth}
                      onChange={(e) => { setLeadsMonth(e.target.value); setLeadsPage(1); }}
                    >
                      <option value="all">All Months (Total)</option>
                      {availablePortalMonths.map(m => (
                        <option key={m} value={m}>{formatMonthName(m)}</option>
                      ))}
                    </select>
                  </div>
                )}
                <button 
                  onClick={() => setShowAddLeadModal(true)}
                  className="portal-btn portal-btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
                >
                  <UserPlus size={16} /> Add Lead Manually
                </button>
                <button 
                  onClick={() => { fetchData(); showToast('Refreshing leads list...', 'info'); }}
                  className="portal-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
                  disabled={leadsLoading}
                >
                  <RefreshCw size={14} className={leadsLoading ? 'spin' : ''} /> Refresh Leads
                </button>
              </div>
            </div>

            {/* Leads Table Container */}
            {(() => {
              const monthLeads = leadsMonth === 'all'
                ? leads
                : leads.filter(l => (l.created_at || '').slice(0, 7) === leadsMonth);

              const filteredLeads = monthLeads.filter(lead => {
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
                  const treatmentMatch = lead.treatment_type && lead.treatment_type.toLowerCase().includes(q);
                  if (!nameMatch && !phoneMatch && !emailMatch && !campaignMatch && !treatmentMatch) return false;
                }
                return true;
              });

              const apptCounts = {
                all: monthLeads.length,
                Booked: monthLeads.filter(l => l.appointment_status === 'Booked').length,
                'Follow Up': monthLeads.filter(l => (l.appointment_status || 'Follow Up') === 'Follow Up').length,
                'Not Booked': monthLeads.filter(l => l.appointment_status === 'Not Booked').length,
              };

              const qualCounts = {
                all: monthLeads.length,
                Pending: monthLeads.filter(l => (l.qualification_status || 'Pending') === 'Pending').length,
                Qualified: monthLeads.filter(l => l.qualification_status === 'Qualified').length,
                Disqualified: monthLeads.filter(l => l.qualification_status === 'Disqualified').length,
              };

              const landingBuckets = leadsMonth === 'all'
                ? landingClicks
                : landingClicks.filter(b => b.month === leadsMonth);
              const landingCalls = landingBuckets.reduce((sum, b) => sum + (b.call_clicks || 0), 0);
              const landingWhatsapp = landingBuckets.reduce((sum, b) => sum + (b.whatsapp_clicks || 0), 0);

              const dueLeads = leads.filter(l => followUpState(l));
              const overdueCount = dueLeads.filter(l => followUpState(l) === 'overdue').length;

              return (
                <div>
                  {/* Taps on landing page Call & WhatsApp buttons */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px', maxWidth: '760px' }}>
                    <div className="portal-metric-card" style={{ padding: '16px' }}>
                      <span className="portal-metric-label" style={{ fontSize: '0.72rem', fontWeight: 600, color: '#8b9b90', textTransform: 'uppercase', letterSpacing: '0.04em' }}>📞 Landing Page Call Taps</span>
                      <span className="portal-metric-value" style={{ fontSize: '1.8rem', fontWeight: 600, color: '#60a5fa', display: 'block', marginTop: '4px' }}>
                        {landingCalls.toLocaleString()}
                      </span>
                    </div>

                    <div className="portal-metric-card" style={{ padding: '16px' }}>
                      <span className="portal-metric-label" style={{ fontSize: '0.72rem', fontWeight: 600, color: '#8b9b90', textTransform: 'uppercase', letterSpacing: '0.04em' }}>💬 Landing Page WhatsApp Taps</span>
                      <span className="portal-metric-value" style={{ fontSize: '1.8rem', fontWeight: 600, color: '#34d399', display: 'block', marginTop: '4px' }}>
                        {landingWhatsapp.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Overdue / Due reminder banner */}
                  {dueLeads.length > 0 && (
                    <div
                      onClick={() => { setAppointmentFilter('Follow Up'); setQualificationFilter('all'); setLeadsMonth('all'); setLeadsPage(1); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                        marginBottom: '16px', padding: '12px 16px', borderRadius: '12px',
                        border: overdueCount > 0 ? '1px solid rgba(224, 35, 28, 0.35)' : '1px solid rgba(245, 158, 11, 0.35)',
                        background: overdueCount > 0 ? 'rgba(224, 35, 28, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                        color: overdueCount > 0 ? '#ff6e67' : '#fbbf24', fontWeight: 600, fontSize: '0.85rem'
                      }}
                      title="Show the leads awaiting follow-up"
                    >
                      <span style={{ fontSize: '1.05rem' }}>⏰</span>
                      <span>
                        {overdueCount > 0 && `${overdueCount} follow-up${overdueCount === 1 ? '' : 's'} overdue`}
                        {overdueCount > 0 && dueLeads.length > overdueCount && ' · '}
                        {dueLeads.length > overdueCount && `${dueLeads.length - overdueCount} due today`}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: '0.74rem', fontWeight: 500, color: '#dfe7e0', opacity: 0.85 }}>
                        {dueLeads.slice(0, 3).map(l => l.name).filter(Boolean).join(', ')}
                        {dueLeads.length > 3 ? ` +${dueLeads.length - 3} more` : ''}
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div>
                      <h3 style={{ fontSize: '1.05rem', margin: 0, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.06em', color: '#dfe7e0' }}>Captured Leads Log</h3>
                      <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#8b9b90', fontWeight: 400 }}>Track captured leads, update call status, and record booking or rejection details.</p>
                    </div>
                  </div>

                  {/* Clean Bento Filter Bar Above Table */}
                  <div className="portal-bento-card" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap',
                    marginBottom: '16px',
                    padding: '14px 18px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flexGrow: 1 }}>
                      {/* Search Box */}
                      <div style={{ position: 'relative', minWidth: '220px', flexGrow: 1 }}>
                        <input
                          type="text"
                          className="portal-control"
                          placeholder="🔍 Search name, phone, email, campaign..."
                          value={leadSearchQuery}
                          onChange={(e) => { setLeadSearchQuery(e.target.value); setLeadsPage(1); }}
                          style={{
                            padding: '8px 14px',
                            fontSize: '0.82rem',
                            width: '100%'
                          }}
                        />
                      </div>

                      {/* Qualification Filter */}
                      <select
                        value={qualificationFilter}
                        onChange={(e) => { setQualificationFilter(e.target.value); setLeadsPage(1); }}
                        className="portal-select"
                        style={{
                          padding: '8px 14px',
                          fontSize: '0.82rem',
                          fontWeight: 600
                        }}
                      >
                        <option value="all">All Qualifications ({qualCounts.all})</option>
                        <option value="Pending">⌛ Pending ({qualCounts.Pending})</option>
                        <option value="Qualified">✅ Qualified ({qualCounts.Qualified})</option>
                        <option value="Disqualified">❌ Disqualified ({qualCounts.Disqualified})</option>
                      </select>

                      {/* Appointment Filter */}
                      <select
                        value={appointmentFilter}
                        onChange={(e) => { setAppointmentFilter(e.target.value); setLeadsPage(1); }}
                        className="portal-select"
                        style={{
                          padding: '8px 14px',
                          fontSize: '0.82rem',
                          fontWeight: 600
                        }}
                      >
                        <option value="all">All Appointments ({apptCounts.all})</option>
                        <option value="Booked">📅 Booked ({apptCounts.Booked})</option>
                        <option value="Follow Up">📞 Follow Up ({apptCounts['Follow Up']})</option>
                        <option value="Not Booked">🚫 Not Booked ({apptCounts['Not Booked']})</option>
                      </select>
                    </div>

                    {(appointmentFilter !== 'all' || qualificationFilter !== 'all' || leadSearchQuery !== '' || leadsMonth !== 'all') && (
                      <button
                        onClick={() => { setAppointmentFilter('all'); setQualificationFilter('all'); setLeadSearchQuery(''); setLeadsMonth('all'); setLeadsPage(1); }}
                        className="portal-btn"
                        style={{ padding: '6px 14px', fontSize: '0.78rem', fontWeight: 600 }}
                      >
                        Reset Filters
                      </button>
                    )}
                  </div>

                  {leads.length === 0 ? (
                    <div className="portal-bento-card" style={{ padding: '40px', textAlign: 'center', color: '#8b9b90', fontWeight: 500 }}>
                      No leads captured yet.
                    </div>
                  ) : filteredLeads.length === 0 ? (
                    <div className="portal-bento-card" style={{ padding: '40px', textAlign: 'center', color: '#8b9b90', fontWeight: 500 }}>
                      No leads match the selected filter criteria.
                      <div style={{ marginTop: '12px' }}>
                        <button
                          onClick={() => { setAppointmentFilter('all'); setQualificationFilter('all'); setLeadSearchQuery(''); setLeadsMonth('all'); setLeadsPage(1); }}
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
                              <th>Lead Details</th>
                              <th>Source / Campaign / Treatment</th>
                              <th>Captured Date</th>
                              <th>Call Status</th>
                              <th>Qualification</th>
                              <th>Appointment</th>
                              <th>Rejection Reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredLeads.slice((leadsPage - 1) * ITEMS_PER_PAGE_LEADS, leadsPage * ITEMS_PER_PAGE_LEADS).map(lead => {
                              const cleanName = (lead.name || 'Anonymous Lead').replace(/^=/, '').trim();
                              const cleanEmail = (lead.email || '').replace(/^=/, '').trim();

                              const platformBadge = 
                                lead.platform === 'Meta' ? 'portal-badge-info' :
                                lead.platform === 'Google' ? 'portal-badge-success' :
                                lead.platform === 'YouTube' ? 'portal-badge-danger' : 'portal-badge-muted';
                                  
                              return (
                                <tr key={lead.id}>
                                  <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <span style={{ fontWeight: 600, color: '#dfe7e0', fontSize: '0.88rem' }}>{cleanName}</span>
                                      {cleanEmail && <span style={{ fontSize: '0.75rem', color: '#8b9b90' }}>{cleanEmail}</span>}
                                      <span style={{ fontSize: '0.75rem', color: '#dfe7e0', fontWeight: 600 }}>{lead.phone}</span>
                                      {lead.phone && (
                                        <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                                          <button
                                            type="button"
                                            onClick={() => handleContactClick(lead, 'call')}
                                            title="Call this lead"
                                            style={{
                                              display: 'flex', alignItems: 'center', gap: '4px',
                                              padding: '3px 9px', borderRadius: '9999px',
                                              border: '1px solid rgba(59, 130, 246, 0.35)', background: 'rgba(59, 130, 246, 0.15)', color: '#93c5fd',
                                              fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer'
                                            }}
                                          >
                                            📞 Call{lead.call_clicks ? ` · ${lead.call_clicks}` : ''}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleContactClick(lead, 'whatsapp')}
                                            title="Open this lead on WhatsApp"
                                            style={{
                                              display: 'flex', alignItems: 'center', gap: '4px',
                                              padding: '3px 9px', borderRadius: '9999px',
                                              border: '1px solid rgba(16, 185, 129, 0.35)', background: 'rgba(16, 185, 129, 0.15)', color: '#6ee7b7',
                                              fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer'
                                            }}
                                          >
                                            💬 WhatsApp{lead.whatsapp_clicks ? ` · ${lead.whatsapp_clicks}` : ''}
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        <span className={`portal-badge ${platformBadge}`}>{lead.platform}</span>
                                        <span className="portal-badge" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                                          {lead.source === 'call' ? `📞 Call (${lead.call_duration_seconds || 0}s)` : '📝 Form'}
                                        </span>
                                      </div>
                                      <span style={{ fontSize: '0.75rem', color: '#8b9b90', fontWeight: 500 }}>
                                        🎯 {(lead.campaign_name || 'Direct / Organic').replace(/^=/, '').trim()}
                                      </span>
                                      {lead.treatment_type ? (
                                        <span 
                                          className="portal-badge" 
                                          onClick={() => {
                                            const val = window.prompt('Update Treatment / Service Type:', lead.treatment_type || '');
                                            if (val !== null && val.trim() !== lead.treatment_type) {
                                              handleUpdateLead(lead.id, { treatment_type: val.trim() });
                                            }
                                          }}
                                          style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#6ee7b7', border: '1px solid rgba(16, 185, 129, 0.3)', fontWeight: 600, width: 'fit-content', cursor: 'pointer' }}
                                          title="Click to edit treatment type"
                                        >
                                          🩺 {lead.treatment_type}
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const val = window.prompt('Enter Treatment / Service Type for this lead:', '');
                                            if (val && val.trim()) {
                                              handleUpdateLead(lead.id, { treatment_type: val.trim() });
                                            }
                                          }}
                                          style={{
                                            background: 'rgba(255, 255, 255, 0.04)',
                                            border: '1px dashed rgba(223, 231, 224, 0.2)',
                                            borderRadius: '9999px',
                                            padding: '2px 8px',
                                            fontSize: '0.72rem',
                                            fontWeight: 500,
                                            color: '#8b9b90',
                                            cursor: 'pointer',
                                            width: 'fit-content'
                                          }}
                                          title="Click to specify treatment type"
                                        >
                                          + Set Treatment
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', fontWeight: 500, color: '#8b9b90' }}>
                                    <div 
                                      onClick={() => {
                                        const currentDate = (lead.created_at || '').slice(0, 10);
                                        const val = window.prompt('Update Lead Captured Date (YYYY-MM-DD):', currentDate);
                                        if (val && val.trim() && val.trim() !== currentDate) {
                                          handleUpdateLead(lead.id, { created_at: val.trim() });
                                        }
                                      }}
                                      style={{ cursor: 'pointer' }}
                                      title="Click to edit lead date"
                                    >
                                      {new Date(lead.created_at.replace(' ', 'T')).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                    </div>
                                  </td>
                                  <td>
                                    <select 
                                      value={lead.call_outcome || 'Pending'}
                                      onChange={(e) => handleUpdateLead(lead.id, { call_outcome: e.target.value })}
                                      className="portal-select"
                                      style={{ 
                                        padding: '6px 22px 6px 10px',
                                        fontSize: '0.76rem',
                                        fontWeight: 600,
                                        borderRadius: '9999px',
                                        cursor: 'pointer',
                                        backgroundColor:
                                          lead.call_outcome === 'Picked Up' ? 'rgba(16, 185, 129, 0.15)' :
                                          lead.call_outcome === 'No Answer' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                        color:
                                          lead.call_outcome === 'Picked Up' ? '#34d399' :
                                          lead.call_outcome === 'No Answer' ? '#fbbf24' : '#dfe7e0',
                                        border:
                                          lead.call_outcome === 'Picked Up' ? '1px solid rgba(16, 185, 129, 0.3)' :
                                          lead.call_outcome === 'No Answer' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(223, 231, 224, 0.16)'
                                      }}
                                    >
                                      <option value="Pending">⌛ Pending</option>
                                      <option value="Picked Up">📞 Picked Up</option>
                                      <option value="No Answer">🔇 No Answer</option>
                                      <option value="Other">❓ Other</option>
                                    </select>
                                    <button
                                      type="button"
                                      title="Delete this lead — use it to clear out test entries"
                                      onClick={() => handleDeleteLead(lead)}
                                      style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '5px', padding: 0, border: 'none', background: 'none', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer', color: lead.is_test ? '#ff6e67' : '#8b9b90' }}
                                    >
                                      🗑 {lead.is_test ? 'TEST — DELETE' : 'Test'}
                                    </button>
                                  </td>
                                  <td>
                                    <select 
                                      value={lead.qualification_status || 'Pending'}
                                      onChange={(e) => handleUpdateLead(lead.id, { qualification_status: e.target.value })}
                                      className="portal-select"
                                      style={{ 
                                        padding: '6px 22px 6px 10px',
                                        fontSize: '0.76rem',
                                        fontWeight: 600,
                                        borderRadius: '9999px',
                                        cursor: 'pointer',
                                        backgroundColor:
                                          lead.qualification_status === 'Qualified' ? 'rgba(16, 185, 129, 0.15)' :
                                          lead.qualification_status === 'Disqualified' ? 'rgba(224, 35, 28, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                        color:
                                          lead.qualification_status === 'Qualified' ? '#34d399' :
                                          lead.qualification_status === 'Disqualified' ? '#ff6e67' : '#dfe7e0',
                                        border:
                                          lead.qualification_status === 'Qualified' ? '1px solid rgba(16, 185, 129, 0.3)' :
                                          lead.qualification_status === 'Disqualified' ? '1px solid rgba(224, 35, 28, 0.3)' : '1px solid rgba(223, 231, 224, 0.16)'
                                      }}
                                    >
                                      <option value="Pending">⌛ Pending</option>
                                      <option value="Qualified">✅ Qualified</option>
                                      <option value="Disqualified">❌ Disqualified</option>
                                    </select>
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '140px' }}>
                                      <select 
                                        value={lead.appointment_status || 'Follow Up'}
                                        onChange={(e) => handleUpdateLead(lead.id, { appointment_status: e.target.value })}
                                        className="portal-select"
                                        style={{ 
                                          padding: '6px 22px 6px 10px',
                                          fontSize: '0.76rem',
                                          fontWeight: 600,
                                          borderRadius: '9999px',
                                          cursor: 'pointer',
                                          backgroundColor:
                                            lead.appointment_status === 'Booked' ? 'rgba(59, 130, 246, 0.15)' :
                                            lead.appointment_status === 'Not Booked' ? 'rgba(224, 35, 28, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                          color:
                                            lead.appointment_status === 'Booked' ? '#93c5fd' :
                                            lead.appointment_status === 'Not Booked' ? '#ff6e67' : '#dfe7e0',
                                          border:
                                            lead.appointment_status === 'Booked' ? '1px solid rgba(59, 130, 246, 0.3)' :
                                            lead.appointment_status === 'Not Booked' ? '1px solid rgba(224, 35, 28, 0.3)' : '1px solid rgba(223, 231, 224, 0.16)'
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
                                          className="portal-control"
                                          style={{ 
                                            padding: '4px 8px',
                                            fontSize: '0.74rem',
                                            borderRadius: '6px',
                                            width: '100%'
                                          }}
                                        />
                                      )}
                                      {(lead.appointment_status || 'Follow Up') === 'Follow Up' && (
                                        <>
                                          <input
                                            type="date"
                                            value={lead.follow_up_date || ''}
                                            onChange={(e) => handleUpdateLead(lead.id, { follow_up_date: e.target.value })}
                                            className="portal-control"
                                            title="When should this lead be contacted again?"
                                            style={{
                                              padding: '4px 8px',
                                              fontSize: '0.74rem',
                                              borderRadius: '6px',
                                              border: followUpState(lead) ? '1px solid #ef4444' : '1px solid rgba(223, 231, 224, 0.16)',
                                              background: followUpState(lead) === 'overdue' ? 'rgba(224, 35, 28, 0.12)' : followUpState(lead) === 'due' ? 'rgba(245, 158, 11, 0.12)' : undefined,
                                              width: '100%'
                                            }}
                                          />
                                          {followUpState(lead) && (
                                            <div style={{ marginTop: '3px', fontSize: '0.66rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: followUpState(lead) === 'overdue' ? '#ff6e67' : '#fbbf24' }}>
                                              {followUpState(lead) === 'overdue'
                                                ? `⏰ Overdue by ${daysBetween(lead.follow_up_date)} day${daysBetween(lead.follow_up_date) === 1 ? '' : 's'}`
                                                : '⏰ Follow up today'}
                                            </div>
                                          )}
                                        </>
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
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '140px' }}>
                                            <select 
                                              value={selectVal}
                                              onChange={(e) => handleUpdateLead(lead.id, { rejection_reason: e.target.value })}
                                              className="portal-select"
                                              style={{ 
                                                padding: '6px 22px 6px 10px',
                                                fontSize: '0.76rem',
                                                fontWeight: 600,
                                                borderRadius: '9999px',
                                                border: '1px solid rgba(224, 35, 28, 0.35)',
                                                backgroundColor: 'rgba(224, 35, 28, 0.15)',
                                                color: '#ff8580',
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
                                                className="portal-control"
                                                style={{ 
                                                  padding: '4px 8px',
                                                  fontSize: '0.74rem',
                                                  borderRadius: '6px',
                                                  border: '1px solid rgba(224, 35, 28, 0.4)',
                                                  width: '100%'
                                                }}
                                              />
                                            )}
                                          </div>
                                        );
                                      })()
                                    ) : (
                                      <span style={{ color: '#8b9b90', fontSize: '0.8rem' }}>-</span>
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
                background: 'rgba(10, 14, 18, 0.96)',
                border: '1px solid rgba(223, 231, 224, 0.16)',
                backdropFilter: 'blur(32px)',
                boxShadow: '0 24px 60px rgba(0, 0, 0, 0.85)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid rgba(223, 231, 224, 0.12)', paddingBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ display: 'inline-flex', padding: '8px', background: 'rgba(224, 35, 28, 0.15)', color: '#ff6259', border: '1px solid rgba(224, 35, 28, 0.3)', borderRadius: '8px' }}>
                    <UserPlus size={18} />
                  </div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.06em', color: '#dfe7e0' }}>
                    Add Lead Manually
                  </h3>
                </div>
                <button 
                  type="button"
                  onClick={() => setShowAddLeadModal(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#8b9b90' }}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAddManualLead} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Name & Phone */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="portal-form-group" style={{ margin: 0 }}>
                    <label className="portal-label" style={{ color: '#aab4ad', fontSize: '0.74rem', fontWeight: 600, letterSpacing: '0.05em' }}>Full Name *</label>
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
                    <label className="portal-label" style={{ color: '#aab4ad', fontSize: '0.74rem', fontWeight: 600, letterSpacing: '0.05em' }}>Phone Number *</label>
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

                {/* Email, Campaign & Treatment */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="portal-form-group" style={{ margin: 0 }}>
                    <label className="portal-label" style={{ color: '#aab4ad', fontSize: '0.74rem', fontWeight: 600, letterSpacing: '0.05em' }}>Email Address</label>
                    <input 
                      type="email" 
                      className="portal-control"
                      placeholder="e.g. john@example.com"
                      value={newLeadData.email}
                      onChange={(e) => setNewLeadData(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                  <div className="portal-form-group" style={{ margin: 0 }}>
                    <label className="portal-label" style={{ color: '#aab4ad', fontSize: '0.74rem', fontWeight: 600, letterSpacing: '0.05em' }}>Campaign / Source Tag</label>
                    <input 
                      type="text" 
                      className="portal-control"
                      placeholder="e.g. Walk-in, Referral, Offline"
                      value={newLeadData.campaign_name}
                      onChange={(e) => setNewLeadData(prev => ({ ...prev, campaign_name: e.target.value }))}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="portal-form-group" style={{ margin: 0 }}>
                    <label className="portal-label" style={{ color: '#aab4ad', fontSize: '0.74rem', fontWeight: 600, letterSpacing: '0.05em' }}>Type of Treatment / Service</label>
                    <input 
                      type="text" 
                      className="portal-control"
                      placeholder="e.g. Root Canal, Hair Transplant"
                      value={newLeadData.treatment_type || ''}
                      onChange={(e) => setNewLeadData(prev => ({ ...prev, treatment_type: e.target.value }))}
                    />
                  </div>
                  <div className="portal-form-group" style={{ margin: 0 }}>
                    <label className="portal-label" style={{ color: '#aab4ad', fontSize: '0.74rem', fontWeight: 600, letterSpacing: '0.05em' }}>Lead Date</label>
                    <input 
                      type="date" 
                      className="portal-control"
                      value={newLeadData.created_at || new Date().toISOString().split('T')[0]}
                      onChange={(e) => setNewLeadData(prev => ({ ...prev, created_at: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Platform & Source */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="portal-form-group" style={{ margin: 0 }}>
                    <label className="portal-label" style={{ color: '#aab4ad', fontSize: '0.74rem', fontWeight: 600, letterSpacing: '0.05em' }}>Platform</label>
                    <select 
                      className="portal-select"
                      style={{ width: '100%', padding: '10px 14px' }}
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
                    <label className="portal-label" style={{ color: '#aab4ad', fontSize: '0.74rem', fontWeight: 600, letterSpacing: '0.05em' }}>Lead Type</label>
                    <select 
                      className="portal-select"
                      style={{ width: '100%', padding: '10px 14px' }}
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
                    <label className="portal-label" style={{ color: '#aab4ad', fontSize: '0.74rem', fontWeight: 600, letterSpacing: '0.05em' }}>Qualification Status</label>
                    <select 
                      className="portal-select"
                      style={{ width: '100%', padding: '10px 14px' }}
                      value={newLeadData.qualification_status}
                      onChange={(e) => setNewLeadData(prev => ({ ...prev, qualification_status: e.target.value }))}
                    >
                      <option value="Pending">⌛ Pending</option>
                      <option value="Qualified">✅ Qualified</option>
                      <option value="Disqualified">❌ Disqualified</option>
                    </select>
                  </div>
                  <div className="portal-form-group" style={{ margin: 0 }}>
                    <label className="portal-label" style={{ color: '#aab4ad', fontSize: '0.74rem', fontWeight: 600, letterSpacing: '0.05em' }}>Call Outcome</label>
                    <select 
                      className="portal-select"
                      style={{ width: '100%', padding: '10px 14px' }}
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
                  <label className="portal-label" style={{ color: '#aab4ad', fontSize: '0.74rem', fontWeight: 600, letterSpacing: '0.05em' }}>Appointment Status</label>
                  <select 
                    className="portal-select"
                    style={{ width: '100%', padding: '10px 14px' }}
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
                    <label className="portal-label" style={{ color: '#aab4ad', fontSize: '0.74rem', fontWeight: 600, letterSpacing: '0.05em' }}>Appointment Date & Time</label>
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
                    <label className="portal-label" style={{ color: '#aab4ad', fontSize: '0.74rem', fontWeight: 600, letterSpacing: '0.05em' }}>Rejection / Disqualification Reason</label>
                    <select 
                      className="portal-select"
                      style={{ width: '100%', padding: '10px 14px' }}
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

