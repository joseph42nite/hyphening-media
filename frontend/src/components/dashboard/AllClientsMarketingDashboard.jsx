import React, { useState } from 'react';
import { BarChart3, TrendingUp, Users, DollarSign, Eye, Globe, ChevronRight } from 'lucide-react';

export default function AllClientsMarketingDashboard({ overviewData = [], onSelectClient }) {
  const [activeChartTab, setActiveChartTab] = useState('ad_leads'); // 'ad_leads' | 'efficiency' | 'content_views' | 'seo_traffic'

  if (!overviewData || overviewData.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px', background: '#ffffff', borderRadius: '16px', border: '3px solid #000000', boxShadow: 'var(--shadow-md)', margin: '16px 0' }}>
        <BarChart3 size={48} style={{ color: '#000000', marginBottom: '12px', opacity: 0.5 }} />
        <h4 style={{ margin: '0 0 8px 0', color: '#000000', fontWeight: 900, textTransform: 'uppercase' }}>No Marketing Data Found</h4>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>
          Select an individual client or ensure clients have recorded marketing activity.
        </p>
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
      {/* 1. Global Overview Bento Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        
        {/* Ad Spend Card */}
        <div style={{ background: '#ffffff', padding: '18px', borderRadius: '16px', border: '3px solid #000000', boxShadow: 'var(--shadow-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: '#000000', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Ad Spend</span>
            <div style={{ background: '#dbeafe', color: '#000000', padding: '6px', borderRadius: '8px', border: '2px solid #000000' }}><DollarSign size={16} /></div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#000000', fontFamily: 'var(--font-heading)' }}>
            ₹{totalSpend.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, marginTop: '4px' }}>
            Across {overviewData.length} client portfolios
          </div>
        </div>

        {/* Total Leads Card */}
        <div style={{ background: '#ffffff', padding: '18px', borderRadius: '16px', border: '3px solid #000000', boxShadow: 'var(--shadow-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: '#000000', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Leads</span>
            <div style={{ background: '#d1fae5', color: '#000000', padding: '6px', borderRadius: '8px', border: '2px solid #000000' }}><Users size={16} /></div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#059669', fontFamily: 'var(--font-heading)' }}>
            {totalLeads.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: '#047857', fontWeight: 800, background: '#d1fae5', padding: '2px 8px', borderRadius: '9999px', border: '1px solid #000' }}>🎯 {totalQualified} Qual.</span>
            <span style={{ color: '#2563eb', fontWeight: 800, background: '#dbeafe', padding: '2px 8px', borderRadius: '9999px', border: '1px solid #000' }}>📅 {totalBookings} Booked</span>
          </div>
        </div>

        {/* Avg CPL & ROAS Card */}
        <div style={{ background: '#ffffff', padding: '18px', borderRadius: '16px', border: '3px solid #000000', boxShadow: 'var(--shadow-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: '#000000', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Avg CPL & ROAS</span>
            <div style={{ background: '#fef3c7', color: '#000000', padding: '6px', borderRadius: '8px', border: '2px solid #000000' }}><TrendingUp size={16} /></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: 900, color: '#000000', fontFamily: 'var(--font-heading)' }}>₹{avgCpl}</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 900, color: '#000000', background: '#fef3c7', padding: '2px 8px', borderRadius: '9999px', border: '1px solid #000' }}>{avgRoas}x ROAS</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, marginTop: '4px' }}>
            Average acquisition efficiency
          </div>
        </div>

        {/* Social Reach Card */}
        <div style={{ background: '#ffffff', padding: '18px', borderRadius: '16px', border: '3px solid #000000', boxShadow: 'var(--shadow-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: '#000000', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Social Content Reach</span>
            <div style={{ background: '#fee2e2', color: '#000000', padding: '6px', borderRadius: '8px', border: '2px solid #000000' }}><Eye size={16} /></div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#dc2626', fontFamily: 'var(--font-heading)' }}>
            {formatCompact(totalContentViews)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, marginTop: '4px' }}>
            Instagram & YouTube video views
          </div>
        </div>

        {/* SEO & GMB Card */}
        <div style={{ background: '#ffffff', padding: '18px', borderRadius: '16px', border: '3px solid #000000', boxShadow: 'var(--shadow-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: '#000000', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px' }}>SEO & GMB Traffic</span>
            <div style={{ background: '#e0e7ff', color: '#000000', padding: '6px', borderRadius: '8px', border: '2px solid #000000' }}><Globe size={16} /></div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#4f46e5', fontFamily: 'var(--font-heading)' }}>
            {formatCompact(totalWebTraffic + totalGmbViews)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, marginTop: '4px' }}>
            {formatCompact(totalWebTraffic)} web visits • {formatCompact(totalGmbViews)} GMB views
          </div>
        </div>
      </div>

      {/* 2. Interactive Bar Chart Container */}
      <div style={{ background: '#ffffff', padding: '24px', borderRadius: '18px', border: '3px solid #000000', boxShadow: 'var(--shadow-md)', marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '-0.02em' }}>
              <BarChart3 size={22} color="#000000" />
              Client Performance Comparison
            </h3>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>Comparative metrics across all active client accounts</span>
          </div>

          {/* Metric Selector Pill Tabs */}
          <div style={{ display: 'flex', background: '#f4f4f5', padding: '4px', borderRadius: '9999px', border: '2px solid #000000', gap: '4px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveChartTab('ad_leads')}
              style={{
                padding: '6px 14px',
                fontSize: '0.8rem',
                fontWeight: 800,
                borderRadius: '9999px',
                border: activeChartTab === 'ad_leads' ? '2px solid #000000' : '2px solid transparent',
                cursor: 'pointer',
                background: activeChartTab === 'ad_leads' ? '#000000' : 'transparent',
                color: activeChartTab === 'ad_leads' ? '#ffffff' : '#000000',
                boxShadow: activeChartTab === 'ad_leads' ? '2px 2px 0px #000000' : 'none',
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
                border: activeChartTab === 'efficiency' ? '2px solid #000000' : '2px solid transparent',
                cursor: 'pointer',
                background: activeChartTab === 'efficiency' ? '#000000' : 'transparent',
                color: activeChartTab === 'efficiency' ? '#ffffff' : '#000000',
                boxShadow: activeChartTab === 'efficiency' ? '2px 2px 0px #000000' : 'none',
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
                border: activeChartTab === 'content_views' ? '2px solid #000000' : '2px solid transparent',
                cursor: 'pointer',
                background: activeChartTab === 'content_views' ? '#000000' : 'transparent',
                color: activeChartTab === 'content_views' ? '#ffffff' : '#000000',
                boxShadow: activeChartTab === 'content_views' ? '2px 2px 0px #000000' : 'none',
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
                border: activeChartTab === 'seo_traffic' ? '2px solid #000000' : '2px solid transparent',
                cursor: 'pointer',
                background: activeChartTab === 'seo_traffic' ? '#000000' : 'transparent',
                color: activeChartTab === 'seo_traffic' ? '#ffffff' : '#000000',
                boxShadow: activeChartTab === 'seo_traffic' ? '2px 2px 0px #000000' : 'none',
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>Client Performance Leaderboard</h3>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Click on any client row to open their detailed report</span>
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
                  <td style={{ fontWeight: 800, color: '#000000' }}>
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
                  <td style={{ fontWeight: 800, color: (client.ad_metrics?.roas || 0) >= 2 ? '#059669' : '#000000' }}>
                    {client.ad_metrics?.roas ? `${client.ad_metrics.roas}x` : '-'}
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
                        border: '2px solid #000000',
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

  return (
    <div style={{ marginTop: '8px' }}>
      {/* Neo-Brutalist Legend */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 12px', border: '2px solid #000000', borderRadius: '8px', background: '#ffffff', boxShadow: '2px 2px 0px #000000' }}>
          <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: primaryColor, border: '1px solid #000000' }} />
          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#000000' }}>{primaryLabel}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 12px', border: '2px solid #000000', borderRadius: '8px', background: '#ffffff', boxShadow: '2px 2px 0px #000000' }}>
          <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: secondaryColor, border: '1px solid #000000' }} />
          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#000000' }}>{secondaryLabel}</span>
        </div>
      </div>

      {/* Bar Chart Container with generous top space to prevent tooltip clipping */}
      <div style={{
        display: 'flex',
        gap: '24px',
        overflowX: 'auto',
        paddingTop: '50px',
        paddingBottom: '16px',
        minHeight: '300px',
        alignItems: 'flex-end',
        borderBottom: '3px solid #000000',
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
                gap: '12px',
                position: 'relative'
              }}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Neo-Brutalist Tooltip on Hover */}
              {isHovered && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    marginBottom: '12px',
                    background: '#000000',
                    color: '#ffffff',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '2px solid #000000',
                    boxShadow: '4px 4px 0px rgba(0,0,0,0.3)',
                    fontSize: '0.78rem',
                    zIndex: 100,
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none'
                  }}
                >
                  <div style={{ fontWeight: 900, marginBottom: '6px', borderBottom: '1px solid #334155', paddingBottom: '4px', textTransform: 'uppercase', color: '#38bdf8' }}>
                    {c.parent_name ? `${c.parent_name} - ${c.name}` : c.name}
                  </div>
                  <div style={{ color: '#ffffff', fontWeight: 800, margin: '2px 0' }}>
                    🔹 {primaryLabel}: <span style={{ color: '#4ade80' }}>{formatPrimary(valPrimary)}</span>
                  </div>
                  <div style={{ color: '#ffffff', fontWeight: 800, margin: '2px 0' }}>
                    🔸 {secondaryLabel}: <span style={{ color: '#60a5fa' }}>{formatSecondary(valSecondary)}</span>
                  </div>
                </div>
              )}

              {/* Bars Group */}
              <div style={{ display: 'flex', gap: '8px', height: '220px', alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
                
                {/* Primary Bar */}
                <div style={{ width: '28px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                  {/* Clean Neo-Brutalist Value Pill above bar */}
                  <div
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 900,
                      marginBottom: '4px',
                      color: '#000000',
                      background: '#ffffff',
                      border: '1px solid #000000',
                      borderRadius: '4px',
                      padding: '1px 4px',
                      whiteSpace: 'nowrap',
                      boxShadow: '1px 1px 0px #000000'
                    }}
                  >
                    {valPrimary > 0 ? formatPrimary(valPrimary) : '0'}
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: `${heightPctPrimary}%`,
                      background: primaryColor,
                      border: '2px solid #000000',
                      borderRadius: '6px 6px 0 0',
                      boxShadow: isHovered ? '3px 3px 0px #000000' : 'none',
                      transition: 'height 0.3s ease, transform 0.15s ease',
                      transform: isHovered ? 'translateY(-2px)' : 'none'
                    }}
                  />
                </div>

                {/* Secondary Bar */}
                <div style={{ width: '28px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                  {/* Clean Neo-Brutalist Value Pill above bar */}
                  <div
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 900,
                      marginBottom: '4px',
                      color: '#000000',
                      background: '#ffffff',
                      border: '1px solid #000000',
                      borderRadius: '4px',
                      padding: '1px 4px',
                      whiteSpace: 'nowrap',
                      boxShadow: '1px 1px 0px #000000'
                    }}
                  >
                    {valSecondary > 0 ? formatSecondary(valSecondary) : '0'}
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: `${heightPctSecondary}%`,
                      background: secondaryColor,
                      border: '2px solid #000000',
                      borderRadius: '6px 6px 0 0',
                      boxShadow: isHovered ? '3px 3px 0px #000000' : 'none',
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
                  fontWeight: 800,
                  color: isHovered ? '#000000' : 'var(--text-primary)',
                  textAlign: 'center',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  maxWidth: '110px',
                  background: isHovered ? '#e4e4e7' : 'transparent',
                  padding: '2px 6px',
                  borderRadius: '4px'
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
