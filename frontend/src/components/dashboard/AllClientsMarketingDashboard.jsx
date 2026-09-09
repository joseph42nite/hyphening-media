import React, { useState } from 'react';
import { BarChart3, TrendingUp, Users, DollarSign, Eye, Globe, ChevronRight } from 'lucide-react';

export default function AllClientsMarketingDashboard({
  overviewData = [],
  onSelectClient,
  availableMonths = [],
  selectedMonth = '',
  onMonthChange
}) {
  const [activeChartTab, setActiveChartTab] = useState('ad_leads'); // 'ad_leads' | 'efficiency' | 'content_views' | 'seo_traffic'

  const formatMonthLabel = (m) => {
    if (!m) return 'All time';
    const [year, mon] = m.split('-');
    const name = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'][parseInt(mon, 10) - 1];
    return `${name} ${year}`;
  };

  const monthPicker = onMonthChange && availableMonths.length > 0 ? (
    <select
      value={selectedMonth}
      onChange={e => onMonthChange(e.target.value)}
      style={{ padding: '6px 10px', fontSize: '0.8rem', fontWeight: 800, border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
      title="Scope every figure on this dashboard to one month"
    >
      <option value="">All time</option>
      {availableMonths.map(m => (
        <option key={m} value={m}>{formatMonthLabel(m)}</option>
      ))}
    </select>
  ) : null;

  if (!overviewData || overviewData.length === 0) {
    return (
      <div style={{ margin: '16px 0' }}>
        {/* The picker stays reachable here — a month with no activity must not
            strand you with no way to select another one. */}
        {monthPicker && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>{monthPicker}</div>
        )}
        <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-md)' }}>
          <BarChart3 size={48} style={{ color: 'var(--accent)', marginBottom: '12px', opacity: 0.8 }} />
          <h4 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)', fontWeight: 900, textTransform: 'uppercase' }}>No Marketing Data Found</h4>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>
            {selectedMonth
              ? `No recorded activity for ${formatMonthLabel(selectedMonth)}. Try another month.`
              : 'Select an individual client or ensure clients have recorded marketing activity.'}
          </p>
        </div>
      </div>
    );
  }

  // Aggregate stats across all clients
  const totalSpend = overviewData.reduce((acc, c) => acc + (c.ad_metrics?.total_spend || 0), 0);
  const totalLeads = overviewData.reduce((acc, c) => acc + (c.ad_metrics?.total_leads || 0), 0);
  const totalQualified = overviewData.reduce((acc, c) => acc + (c.ad_metrics?.qualified_leads || 0), 0);
  const totalBookings = overviewData.reduce((acc, c) => acc + (c.ad_metrics?.confirmed_bookings || 0), 0);
  const avgCpl = totalLeads > 0 ? Math.round(totalSpend / totalLeads) : 0;
  const totalContentViews = overviewData.reduce((acc, c) => acc + (c.content_metrics?.total_views || 0), 0);
  const totalWebTraffic = overviewData.reduce((acc, c) => acc + (c.seo_metrics?.website_traffic || 0), 0);
  const totalGmbViews = overviewData.reduce((acc, c) => acc + (c.seo_metrics?.gmb_views || 0), 0);

  // Overall ROAS
  const clientsWithSpend = overviewData.filter(c => (c.ad_metrics?.total_spend || 0) > 0);
  const avgRoas = clientsWithSpend.length > 0
    ? (clientsWithSpend.reduce((acc, c) => acc + (c.ad_metrics?.roas || 0), 0) / clientsWithSpend.length).toFixed(2)
    : '0.00';

  // Format large numbers for bar graphs cleanly
  const formatCompact = (num) => {
    if (!num) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toLocaleString();
  };

  return (
    <div style={{ textAlign: 'left', marginTop: '16px' }}>
      {/* The month picker lives down in the leaderboard header but scopes every
          figure on this page, so the period is stated above the cards it governs
          rather than leaving them to read as all-time totals. */}
      {selectedMonth && (
        <div style={{ display: 'inline-block', marginBottom: '12px', padding: '4px 12px', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.35)', color: '#fbbf24', borderRadius: '9999px', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Showing {formatMonthLabel(selectedMonth)}
        </div>
      )}

      {/* 1. Global Overview Bento Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        
        {/* Ad Spend Card */}
        <div style={{ background: 'var(--bg-card)', padding: '18px', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-md)', backdropFilter: 'blur(20px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Ad Spend</span>
            <div style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '6px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.3)' }}><DollarSign size={16} /></div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
            ₹{totalSpend.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, marginTop: '4px' }}>
            Across {overviewData.length} client portfolios
          </div>
        </div>

        {/* Total Leads Card */}
        <div style={{ background: 'var(--bg-card)', padding: '18px', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-md)', backdropFilter: 'blur(20px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Leads</span>
            <div style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '6px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.3)' }}><Users size={16} /></div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#34d399', fontFamily: 'var(--font-heading)' }}>
            {totalLeads.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: '#34d399', fontWeight: 800, background: 'rgba(16, 185, 129, 0.15)', padding: '2px 8px', borderRadius: '9999px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>🎯 {totalQualified} Qual.</span>
            <span style={{ color: '#38bdf8', fontWeight: 800, background: 'rgba(56, 189, 248, 0.15)', padding: '2px 8px', borderRadius: '9999px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>📅 {totalBookings} Booked</span>
          </div>
        </div>

        {/* Avg CPL & ROAS Card */}
        <div style={{ background: 'var(--bg-card)', padding: '18px', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-md)', backdropFilter: 'blur(20px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Avg CPL & ROAS</span>
            <div style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', padding: '6px', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.3)' }}><TrendingUp size={16} /></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>₹{avgCpl}</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 900, color: '#fbbf24', background: 'rgba(245, 158, 11, 0.15)', padding: '2px 8px', borderRadius: '9999px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>{avgRoas}x ROAS</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, marginTop: '4px' }}>
            Average acquisition efficiency
          </div>
        </div>

        {/* Social Reach Card */}
        <div style={{ background: 'var(--bg-card)', padding: '18px', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-md)', backdropFilter: 'blur(20px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Social Content Reach</span>
            <div style={{ background: 'rgba(224, 35, 28, 0.15)', color: '#ff6b6b', padding: '6px', borderRadius: '8px', border: '1px solid rgba(224, 35, 28, 0.3)' }}><Eye size={16} /></div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#ff6b6b', fontFamily: 'var(--font-heading)' }}>
            {formatCompact(totalContentViews)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, marginTop: '4px' }}>
            Instagram & YouTube video views
          </div>
        </div>

        {/* SEO & GMB Card */}
        <div style={{ background: 'var(--bg-card)', padding: '18px', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-md)', backdropFilter: 'blur(20px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>SEO & GMB Traffic</span>
            <div style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', padding: '6px', borderRadius: '8px', border: '1px solid rgba(99, 102, 241, 0.3)' }}><Globe size={16} /></div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#818cf8', fontFamily: 'var(--font-heading)' }}>
            {formatCompact(totalWebTraffic + totalGmbViews)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, marginTop: '4px' }}>
            {formatCompact(totalWebTraffic)} web visits • {formatCompact(totalGmbViews)} GMB views
          </div>
        </div>
      </div>

      {/* 2. Interactive Bar Chart Container */}
      <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '18px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-md)', backdropFilter: 'blur(20px)', marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '-0.02em' }}>
              <BarChart3 size={22} color="var(--accent)" />
              Client Performance Comparison
            </h3>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>Comparative metrics across all active client accounts</span>
          </div>

          {/* Metric Selector Pill Tabs */}
          <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.04)', padding: '4px', borderRadius: '9999px', border: '1px solid var(--border-color)', gap: '4px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveChartTab('ad_leads')}
              style={{
                padding: '6px 14px',
                fontSize: '0.8rem',
                fontWeight: 800,
                borderRadius: '9999px',
                border: activeChartTab === 'ad_leads' ? '1px solid #ff3b30' : '1px solid transparent',
                cursor: 'pointer',
                background: activeChartTab === 'ad_leads' ? 'var(--accent)' : 'transparent',
                color: activeChartTab === 'ad_leads' ? '#ffffff' : 'var(--text-secondary)',
                boxShadow: activeChartTab === 'ad_leads' ? '0 2px 10px rgba(224, 35, 28, 0.4)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              💰 Spend & Leads
            </button>
            <button
              onClick={() => setActiveChartTab('efficiency')}
              style={{
                padding: '6px 14px',
                fontSize: '0.8rem',
                fontWeight: 800,
                borderRadius: '9999px',
                border: activeChartTab === 'efficiency' ? '1px solid #ff3b30' : '1px solid transparent',
                cursor: 'pointer',
                background: activeChartTab === 'efficiency' ? 'var(--accent)' : 'transparent',
                color: activeChartTab === 'efficiency' ? '#ffffff' : 'var(--text-secondary)',
                boxShadow: activeChartTab === 'efficiency' ? '0 2px 10px rgba(224, 35, 28, 0.4)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              ⚡ CPL & ROAS
            </button>
            <button
              onClick={() => setActiveChartTab('content_views')}
              style={{
                padding: '6px 14px',
                fontSize: '0.8rem',
                fontWeight: 800,
                borderRadius: '9999px',
                border: activeChartTab === 'content_views' ? '1px solid #ff3b30' : '1px solid transparent',
                cursor: 'pointer',
                background: activeChartTab === 'content_views' ? 'var(--accent)' : 'transparent',
                color: activeChartTab === 'content_views' ? '#ffffff' : 'var(--text-secondary)',
                boxShadow: activeChartTab === 'content_views' ? '0 2px 10px rgba(224, 35, 28, 0.4)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              🎥 Content Views
            </button>
            <button
              onClick={() => setActiveChartTab('seo_traffic')}
              style={{
                padding: '6px 14px',
                fontSize: '0.8rem',
                fontWeight: 800,
                borderRadius: '9999px',
                border: activeChartTab === 'seo_traffic' ? '1px solid #ff3b30' : '1px solid transparent',
                cursor: 'pointer',
                background: activeChartTab === 'seo_traffic' ? 'var(--accent)' : 'transparent',
                color: activeChartTab === 'seo_traffic' ? '#ffffff' : 'var(--text-secondary)',
                boxShadow: activeChartTab === 'seo_traffic' ? '0 2px 10px rgba(224, 35, 28, 0.4)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              🌐 SEO & GMB
            </button>
          </div>
        </div>

        {/* Dynamic Bar Graph Render */}
        <div style={{ marginTop: '16px' }}>
          {activeChartTab === 'ad_leads' && (
            <ClientBarGraph
              data={overviewData}
              primaryKey={(c) => c.ad_metrics?.total_spend || 0}
              secondaryKey={(c) => c.ad_metrics?.total_leads || 0}
              primaryLabel="Total Ad Spend"
              secondaryLabel="Leads Captured"
              primaryColor="#2563eb"
              secondaryColor="#10b981"
              formatPrimary={(val) => `₹${formatCompact(val)}`}
              formatSecondary={(val) => `${val} leads`}
            />
          )}

          {activeChartTab === 'efficiency' && (
            <ClientBarGraph
              data={overviewData}
              primaryKey={(c) => c.ad_metrics?.avg_cpl || 0}
              secondaryKey={(c) => c.ad_metrics?.roas || 0}
              primaryLabel="Cost Per Lead (CPL)"
              secondaryLabel="ROAS (x)"
              primaryColor="#f59e0b"
              secondaryColor="#8b5cf6"
              formatPrimary={(val) => `₹${val}`}
              formatSecondary={(val) => `${val}x`}
            />
          )}

          {activeChartTab === 'content_views' && (
            <ClientBarGraph
              data={overviewData}
              primaryKey={(c) => c.content_metrics?.total_views || 0}
              secondaryKey={(c) => c.content_metrics?.total_posts || 0}
              primaryLabel="Total Video Views"
              secondaryLabel="Posts Tracked"
              primaryColor="#ef4444"
              secondaryColor="#06b6d4"
              formatPrimary={(val) => formatCompact(val)}
              formatSecondary={(val) => `${val} posts`}
            />
          )}

          {activeChartTab === 'seo_traffic' && (
            <ClientBarGraph
              data={overviewData}
              primaryKey={(c) => c.seo_metrics?.website_traffic || 0}
              secondaryKey={(c) => c.seo_metrics?.gmb_views || 0}
              primaryLabel="Website Sessions"
              secondaryLabel="GMB Profile Views"
              primaryColor="#4f46e5"
              secondaryColor="#ec4899"
              formatPrimary={(val) => formatCompact(val)}
              formatSecondary={(val) => formatCompact(val)}
            />
          )}
        </div>
      </div>

      {/* 3. Neo-Brutalist Client Leaderboard Table */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '12px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>
          Client Performance Leaderboard
          {selectedMonth && (
            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
              · {formatMonthLabel(selectedMonth)}
            </span>
          )}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Click on any client row to open their detailed report</span>
          {monthPicker}
        </div>
      </div>

      <div className="table-container table-scrollable-y" style={{ marginBottom: '32px' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: '50px', textAlign: 'center' }}>#</th>
              <th>Client Name</th>
              <th>Ad Spend (₹)</th>
              <th>Leads Captured</th>
              <th>Qual. Leads</th>
              <th>Bookings</th>
              <th>Avg CPL</th>
              <th title="Spend divided by confirmed bookings — measured">Cost / Booking</th>
              <th>ROAS</th>
              <th>Content Views</th>
              <th>Web Traffic</th>
              <th>GMB Views</th>
              <th style={{ textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {overviewData.map((client, index) => {
              const displayName = client.parent_name ? `${client.parent_name} - ${client.name}` : client.name;
              return (
                <tr
                  key={client.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelectClient?.(client)}
                >
                  <td style={{ textAlign: 'center', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                    {index + 1}
                  </td>
                  <td style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                    {displayName}
                  </td>
                  <td style={{ fontWeight: 800 }}>
                    ₹{(client.ad_metrics?.total_spend || 0).toLocaleString()}
                  </td>
                  <td style={{ fontWeight: 800, color: '#059669' }}>
                    {(client.ad_metrics?.total_leads || 0).toLocaleString()}
                  </td>
                  <td style={{ fontWeight: 700 }}>
                    {client.ad_metrics?.qualified_leads || 0}
                  </td>
                  <td style={{ fontWeight: 800, color: '#2563eb' }}>
                    {client.ad_metrics?.confirmed_bookings || 0}
                  </td>
                  <td style={{ fontWeight: 700 }}>
                    {client.ad_metrics?.avg_cpl ? `₹${client.ad_metrics.avg_cpl}` : '-'}
                  </td>
                  <td style={{ fontWeight: 800 }}>
                    {client.ad_metrics?.cost_per_booking_inr != null
                      ? `₹${client.ad_metrics.cost_per_booking_inr.toLocaleString()}`
                      : '-'}
                  </td>
                  <td style={{ fontWeight: 800, color: (client.ad_metrics?.roas || 0) >= 2 ? '#34d399' : 'var(--text-primary)' }}>
                    {client.ad_metrics?.roas ? `${client.ad_metrics.roas}x` : '-'}
                    {client.ad_metrics?.roas_is_estimated && (
                      <span title="Estimated from procedure prices — no actual revenue entered"
                        style={{ marginLeft: '4px', fontSize: '0.6rem', fontWeight: 900, background: '#fef3c7', border: '1px solid #f59e0b', color: '#92400e', padding: '1px 4px', borderRadius: '4px', verticalAlign: 'middle' }}>EST</span>
                    )}
                  </td>
                  <td style={{ fontWeight: 700 }}>
                    {(client.content_metrics?.total_views || 0).toLocaleString()}
                  </td>
                  <td style={{ fontWeight: 700 }}>
                    {(client.seo_metrics?.website_traffic || 0).toLocaleString()}
                  </td>
                  <td style={{ fontWeight: 700 }}>
                    {(client.seo_metrics?.gmb_views || 0).toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectClient?.(client);
                      }}
                      className="btn btn-secondary"
                      style={{
                        padding: '4px 12px',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        border: '1px solid var(--border-color)',
                        boxShadow: 'var(--shadow-sm)',
                        borderRadius: '9999px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      View <ChevronRight size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Neo-Brutalist Custom Bar Graph Component
function ClientBarGraph({
  data,
  primaryKey,
  secondaryKey,
  primaryLabel,
  secondaryLabel,
  primaryColor,
  secondaryColor,
  formatPrimary,
  formatSecondary
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const maxPrimary = Math.max(...data.map(c => primaryKey(c)), 1);
  const maxSecondary = Math.max(...data.map(c => secondaryKey(c)), 1);

  const hoveredClient = hoveredIdx !== null ? data[hoveredIdx] : null;

  return (
    <div style={{ marginTop: '8px' }}>
      {/* Top Control Bar: Legend + Active Hover Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        
        {/* Live Hover Detail Banner (100% in-flow, zero overflow/clipping guaranteed) */}
        <div style={{ flex: 1, minWidth: '280px' }}>
          {hoveredClient ? (
            <div style={{
              background: '#000000',
              color: '#ffffff',
              padding: '8px 16px',
              borderRadius: '10px',
              border: '2px solid #000000',
              boxShadow: '3px 3px 0px #000000',
              display: 'flex',
              alignItems: 'center',
              justify: 'space-between',
              gap: '12px',
              fontSize: '0.82rem',
              fontWeight: 800
            }}>
              <span style={{ color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                📍 {hoveredClient.parent_name ? `${hoveredClient.parent_name} - ${hoveredClient.name}` : hoveredClient.name}
              </span>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <span>🔹 {primaryLabel}: <strong style={{ color: '#4ade80' }}>{formatPrimary(primaryKey(hoveredClient))}</strong></span>
                <span>🔸 {secondaryLabel}: <strong style={{ color: '#60a5fa' }}>{formatSecondary(secondaryKey(hoveredClient))}</strong></span>
              </div>
            </div>
          ) : (
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              color: 'var(--text-muted)',
              padding: '8px 16px',
              borderRadius: '10px',
              border: '1px dashed var(--border-color)',
              fontSize: '0.8rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              💡 Hover over any client bar below for metric breakdown
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.04)' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: primaryColor }} />
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-primary)' }}>{primaryLabel}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.04)' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: secondaryColor }} />
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-primary)' }}>{secondaryLabel}</span>
          </div>
        </div>
      </div>

      {/* Bar Chart Container */}
      <div style={{
        display: 'flex',
        gap: '24px',
        overflowX: 'auto',
        paddingTop: '24px',
        paddingBottom: '16px',
        minHeight: '260px',
        alignItems: 'flex-end',
        borderBottom: '1px solid var(--border-color)',
        position: 'relative'
      }}>
        {data.map((c, idx) => {
          const valPrimary = primaryKey(c);
          const valSecondary = secondaryKey(c);
          const heightPctPrimary = Math.max((valPrimary / maxPrimary) * 100, 6);
          const heightPctSecondary = Math.max((valSecondary / maxSecondary) * 100, 6);
          const clientName = c.name;
          const isHovered = hoveredIdx === idx;

          return (
            <div
              key={c.id || idx}
              style={{
                flex: 1,
                minWidth: '110px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
                position: 'relative',
                padding: '4px',
                borderRadius: '8px',
                background: isHovered ? 'rgba(0,0,0,0.03)' : 'transparent',
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Bars Group */}
              <div style={{ display: 'flex', gap: '8px', height: '200px', alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
                
                {/* Primary Bar */}
                <div style={{ width: '32px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                  {/* Clean Neo-Brutalist Value Pill above bar */}
                  <div
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 900,
                      marginBottom: '4px',
                      background: isHovered ? primaryColor : 'rgba(12, 16, 22, 0.95)',
                      color: '#ffffff',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      padding: '1px 5px',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {valPrimary > 0 ? formatPrimary(valPrimary) : '0'}
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: `${heightPctPrimary}%`,
                      background: primaryColor,
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px 6px 0 0',
                      boxShadow: isHovered ? `0 4px 16px ${primaryColor}88` : 'none',
                      transition: 'height 0.3s ease, transform 0.15s ease',
                      transform: isHovered ? 'translateY(-2px)' : 'none'
                    }}
                  />
                </div>

                {/* Secondary Bar */}
                <div style={{ width: '32px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                  {/* Clean Value Pill above bar */}
                  <div
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 900,
                      marginBottom: '4px',
                      background: isHovered ? secondaryColor : 'rgba(12, 16, 22, 0.95)',
                      color: '#ffffff',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      padding: '1px 5px',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {valSecondary > 0 ? formatSecondary(valSecondary) : '0'}
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: `${heightPctSecondary}%`,
                      background: secondaryColor,
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px 6px 0 0',
                      boxShadow: isHovered ? `0 4px 16px ${secondaryColor}88` : 'none',
                      transition: 'height 0.3s ease, transform 0.15s ease',
                      transform: isHovered ? 'translateY(-2px)' : 'none'
                    }}
                  />
                </div>

              </div>

              {/* Client Label */}
              <div
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 900,
                  color: isHovered ? 'var(--accent)' : 'var(--text-primary)',
                  textAlign: 'center',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  maxWidth: '110px',
                  background: isHovered ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                  border: isHovered ? '1px solid var(--border-color)' : '1px solid transparent',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  boxShadow: isHovered ? 'var(--shadow-sm)' : 'none'
                }}
                title={clientName}
              >
                {clientName}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
