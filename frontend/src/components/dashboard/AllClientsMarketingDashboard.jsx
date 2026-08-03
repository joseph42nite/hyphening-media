import React, { useState } from 'react';
import { BarChart3, TrendingUp, Users, DollarSign, Eye, Globe, ChevronRight } from 'lucide-react';

export default function AllClientsMarketingDashboard({ overviewData = [], onSelectClient }) {
  const [activeChartTab, setActiveChartTab] = useState('ad_leads'); // 'ad_leads' | 'efficiency' | 'content_views' | 'seo_traffic'

  if (!overviewData || overviewData.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)', margin: '16px 0' }}>
        <BarChart3 size={48} style={{ color: 'var(--text-muted)', marginBottom: '12px', opacity: 0.5 }} />
        <h4 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)' }}>No Marketing Data Found</h4>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
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

  // Format large numbers for bar graphs
  const formatCompact = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toLocaleString();
  };

  return (
    <div style={{ textStyle: 'left', marginTop: '12px' }}>
      {/* 1. Global Overview Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Ad Spend</span>
            <div style={{ background: '#dbeafe', color: '#1e40af', padding: '6px', borderRadius: '8px' }}><DollarSign size={16} /></div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            ₹{totalSpend.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Across {overviewData.length} client portfolios
          </div>
        </div>

        <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Leads</span>
            <div style={{ background: '#d1fae5', color: '#065f46', padding: '6px', borderRadius: '8px' }}><Users size={16} /></div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#059669' }}>
            {totalLeads.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ color: '#047857', fontWeight: 700 }}>🎯 {totalQualified} Qual.</span>
            <span>•</span>
            <span style={{ color: '#2563eb', fontWeight: 700 }}>📅 {totalBookings} Bookings</span>
          </div>
        </div>

        <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Avg CPL & ROAS</span>
            <div style={{ background: '#fef3c7', color: '#b45309', padding: '6px', borderRadius: '8px' }}><TrendingUp size={16} /></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>₹{avgCpl}</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent)', background: '#f59e0b20', padding: '2px 8px', borderRadius: '6px' }}>{avgRoas}x ROAS</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Average acquisition efficiency
          </div>
        </div>

        <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Social Content Reach</span>
            <div style={{ background: '#fee2e2', color: '#991b1b', padding: '6px', borderRadius: '8px' }}><Eye size={16} /></div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#dc2626' }}>
            {formatCompact(totalContentViews)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Instagram & YouTube video views
          </div>
        </div>

        <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>SEO & GMB Traffic</span>
            <div style={{ background: '#e0e7ff', color: '#3730a3', padding: '6px', borderRadius: '8px' }}><Globe size={16} /></div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#4f46e5' }}>
            {formatCompact(totalWebTraffic + totalGmbViews)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {formatCompact(totalWebTraffic)} web visits • {formatCompact(totalGmbViews)} GMB views
          </div>
        </div>
      </div>

      {/* 2. Interactive Bar Graphs Section */}
      <div style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '14px', border: '1px solid var(--border-color)', marginBottom: '28px', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BarChart3 size={20} color="var(--accent)" />
              Client Performance Comparison
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Comparative graphs across all active client accounts</span>
          </div>

          {/* Chart Metric Selector Tabs */}
          <div style={{ display: 'flex', background: 'var(--bg-primary)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)', gap: '4px' }}>
            <button
              onClick={() => setActiveChartTab('ad_leads')}
              style={{
                padding: '6px 12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: activeChartTab === 'ad_leads' ? 'var(--accent)' : 'transparent',
                color: activeChartTab === 'ad_leads' ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.2s ease'
              }}
            >
              💰 Spend & Leads
            </button>
            <button
              onClick={() => setActiveChartTab('efficiency')}
              style={{
                padding: '6px 12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: activeChartTab === 'efficiency' ? 'var(--accent)' : 'transparent',
                color: activeChartTab === 'efficiency' ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.2s ease'
              }}
            >
              ⚡ CPL & ROAS
            </button>
            <button
              onClick={() => setActiveChartTab('content_views')}
              style={{
                padding: '6px 12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: activeChartTab === 'content_views' ? 'var(--accent)' : 'transparent',
                color: activeChartTab === 'content_views' ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.2s ease'
              }}
            >
              🎥 Content Views
            </button>
            <button
              onClick={() => setActiveChartTab('seo_traffic')}
              style={{
                padding: '6px 12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: activeChartTab === 'seo_traffic' ? 'var(--accent)' : 'transparent',
                color: activeChartTab === 'seo_traffic' ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.2s ease'
              }}
            >
              🌐 SEO & GMB
            </button>
          </div>
        </div>

        {/* Dynamic Bar Graph Render */}
        <div style={{ marginTop: '12px' }}>
          {activeChartTab === 'ad_leads' && (
            <ClientBarGraph
              data={overviewData}
              primaryKey={(c) => c.ad_metrics?.total_spend || 0}
              secondaryKey={(c) => c.ad_metrics?.total_leads || 0}
              primaryLabel="Total Ad Spend (₹)"
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
              primaryLabel="Cost Per Lead (CPL ₹)"
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

      {/* 3. All Clients Performance Overview Table */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Client Performance Leaderboard</h3>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Click on any client to open their detailed report</span>
      </div>

      <div className="table-container table-scrollable-y" style={{ marginBottom: '32px' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>#</th>
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
                  <td style={{ fontWeight: 700, color: 'var(--accent)' }}>
                    {displayName}
                  </td>
                  <td style={{ fontWeight: 700 }}>
                    ₹{(client.ad_metrics?.total_spend || 0).toLocaleString()}
                  </td>
                  <td style={{ fontWeight: 800, color: '#059669' }}>
                    {(client.ad_metrics?.total_leads || 0).toLocaleString()}
                  </td>
                  <td>
                    {client.ad_metrics?.qualified_leads || 0}
                  </td>
                  <td style={{ fontWeight: 700, color: '#2563eb' }}>
                    {client.ad_metrics?.confirmed_bookings || 0}
                  </td>
                  <td>
                    {client.ad_metrics?.avg_cpl ? `₹${client.ad_metrics.avg_cpl}` : '-'}
                  </td>
                  <td style={{ fontWeight: 700, color: (client.ad_metrics?.roas || 0) >= 2 ? '#059669' : 'var(--text-primary)' }}>
                    {client.ad_metrics?.roas ? `${client.ad_metrics.roas}x` : '-'}
                  </td>
                  <td>
                    {(client.content_metrics?.total_views || 0).toLocaleString()}
                  </td>
                  <td>
                    {(client.seo_metrics?.website_traffic || 0).toLocaleString()}
                  </td>
                  <td>
                    {(client.seo_metrics?.gmb_views || 0).toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectClient?.(client);
                      }}
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
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

// Custom responsive SVG/CSS Bar Graph Component
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
      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700 }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: primaryColor }} />
          <span>{primaryLabel}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700 }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: secondaryColor }} />
          <span>{secondaryLabel}</span>
        </div>
      </div>

      {/* Bar Chart Container */}
      <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '12px', minHeight: '260px', alignItems: 'flex-end', borderBottom: '2px solid var(--border-color)' }}>
        {data.map((c, idx) => {
          const valPrimary = primaryKey(c);
          const valSecondary = secondaryKey(c);
          const heightPctPrimary = Math.max((valPrimary / maxPrimary) * 100, 4);
          const heightPctSecondary = Math.max((valSecondary / maxSecondary) * 100, 4);
          const clientName = c.name;
          const isHovered = hoveredIdx === idx;

          return (
            <div
              key={c.id || idx}
              style={{
                flex: 1,
                minWidth: '80px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                position: 'relative'
              }}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Tooltip on Hover */}
              {isHovered && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    marginBottom: '8px',
                    background: '#1e293b',
                    color: '#fff',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
                    zIndex: 10,
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none'
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: '4px', borderBottom: '1px solid #334155', paddingBottom: '2px' }}>
                    {c.parent_name ? `${c.parent_name} - ${c.name}` : c.name}
                  </div>
                  <div style={{ color: primaryColor, fontWeight: 700 }}>
                    {primaryLabel}: {formatPrimary(valPrimary)}
                  </div>
                  <div style={{ color: secondaryColor, fontWeight: 700 }}>
                    {secondaryLabel}: {formatSecondary(valSecondary)}
                  </div>
                </div>
              )}

              {/* Bars Group */}
              <div style={{ display: 'flex', gap: '4px', height: '200px', alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
                {/* Primary Bar */}
                <div style={{ width: '22px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <div
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      marginBottom: '2px',
                      color: 'var(--text-muted)',
                      transform: 'scale(0.85)'
                    }}
                  >
                    {valPrimary > 0 ? formatPrimary(valPrimary) : '0'}
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: `${heightPctPrimary}%`,
                      background: primaryColor,
                      borderRadius: '4px 4px 0 0',
                      transition: 'height 0.3s ease, filter 0.2s ease',
                      filter: isHovered ? 'brightness(1.15)' : 'none'
                    }}
                  />
                </div>

                {/* Secondary Bar */}
                <div style={{ width: '22px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <div
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      marginBottom: '2px',
                      color: 'var(--text-muted)',
                      transform: 'scale(0.85)'
                    }}
                  >
                    {valSecondary > 0 ? formatSecondary(valSecondary) : '0'}
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: `${heightPctSecondary}%`,
                      background: secondaryColor,
                      borderRadius: '4px 4px 0 0',
                      transition: 'height 0.3s ease, filter 0.2s ease',
                      filter: isHovered ? 'brightness(1.15)' : 'none'
                    }}
                  />
                </div>
              </div>

              {/* Client Label */}
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: isHovered ? 'var(--accent)' : 'var(--text-muted)',
                  textAlign: 'center',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  maxWidth: '90px'
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
