import React from 'react';
import FleetModeToggle from './FleetModeToggle.jsx';
import BlogNightPanel from './BlogNightPanel.jsx';

/**
 * Blog Monitor: the night blog pipeline for every client, next to the SEO
 * and Ads monitors. The Blog tab stays Hyphening's own posts (published and
 * drafts); everything the pipeline drafts — and 007's approvals, rejections
 * and sends to clients — happens here.
 */
export default function BlogMonitorTab({ showToast }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', textTransform: 'uppercase', fontWeight: 900, margin: 0 }}>Blog Monitor</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Leiter starts the night at 01:00 IST, the Mac drafts one post per client, Vesper reviews them at 06:30, and you approve here.
          </p>
        </div>
        <FleetModeToggle
          scope="blog"
          showToast={showToast}
          confirmText="Turn the Blog fleet to AUTO? Leiter's 01:00 routine will then queue one post per client with Blog on each night. Posts still wait here for your approval."
        />
      </div>
      <BlogNightPanel showToast={showToast} />
    </div>
  );
}
