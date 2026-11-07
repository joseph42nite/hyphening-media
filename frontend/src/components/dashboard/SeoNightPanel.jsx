import React, { useState, useEffect, useCallback, useMemo } from 'react';
import FleetModeToggle from './FleetModeToggle.jsx';
import SiteChangesPanel, { BUSY } from './SiteChangesPanel.jsx';
import { api, card, muted } from './blogMonitorShared.js';

/**
 * The SEO Monitor's night section. Above the client dropdown: the fleet
 * toggle, the totals, and a "waiting" line naming each client with fixes to
 * deploy or items that need you (click one to select it). Below the dropdown
 * (`selector`): Site changes for the selected client — SEO and ads fixes in
 * one queue with one Deploy (SiteChangesPanel, also in the Ads Monitor).
 * Server side: src/routes/seoNight.js.
 */
const chip = (active) => ({
  padding: '4px 12px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border-color)'}`,
  background: active ? 'var(--accent-glow)' : 'transparent', color: 'var(--text-primary)',
});

export default function SeoNightPanel({ showToast, clientId, clientName, onSelectClient, selector }) {
  const [report, setReport] = useState(null);

  const load = useCallback(() => {
    api('/api/seo-night/report').then(setReport).catch(err => showToast(err.message, 'error'));
  }, [showToast]);
  useEffect(() => { load(); }, [load]);

  // While a fix or deploy is running, check back every 15 s.
  const anyBusy = report?.clients.some(c => BUSY.includes(c.batch?.status));
  useEffect(() => {
    if (!anyBusy) return undefined;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [anyBusy, load]);

  // Every client with something to act on (SEO or ads fixes), for the line above the dropdown.
  const waiting = useMemo(() => (report?.clients || []).map(c => ({
    id: c.client_id, name: c.client_name,
    ready: (c.batch?.status === 'ready' || c.retryable) ? c.fixes.filter(f => f.status === 'ready_to_deploy').length : 0,
    needs: c.needs_007.length,
  })).filter(c => c.ready || c.needs), [report]);

  if (!report) return selector;
  const t = report.totals;

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '10px' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', textTransform: 'uppercase', fontWeight: 900, margin: 0 }}>SEO Monitor</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Fixes ready {t.fixes_ready} · Needs you {t.needs_007} · Failed {t.failed} · Marked done {t.already_done || 0} · Skills run last night {t.skills_run}
          </p>
        </div>
        <FleetModeToggle
          scope="seo"
          showToast={showToast}
          onChange={load}
          confirmText="Turn the SEO fleet to AUTO? Tanner's 01:15 routine will run each SEO-on client's overdue skills, and Boothroyd's 03:30 routine will commit safe fixes to a branch. Nothing goes live until you press Deploy here."
        />
      </div>

      {report.connector && !report.connector.online && (() => {
        // Q runs the connector 00:55-05:30 and 11:00-18:00 IST; off between those is normal.
        const ist = new Date(Date.now() + 330 * 60000);
        const m = ist.getUTCHours() * 60 + ist.getUTCMinutes();
        const inWindow = (m >= 55 && m < 330) || (m >= 660 && m < 1080);
        return (
          <div style={{ ...card, borderColor: inWindow ? '#ef4444' : '#facc15', color: inWindow ? '#fca5a5' : '#fde68a', fontSize: '0.85rem', marginBottom: '10px' }}>
            <strong>Mac connector offline</strong> since {new Date(report.connector.since).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.
            {' '}{inWindow
              ? 'It should be running now: deploys, night fixes and blog drafts are waiting. Check the Mac is on and awake.'
              : 'That is normal outside 00:55–05:30 and 11:00–18:00 IST. A Deploy pressed now starts when it next connects (Q starts it at 00:55 and 11:00).'}
          </div>
        );
      })()}

      {waiting.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px', fontSize: '0.8rem' }}>
          <span style={muted}>Waiting:</span>
          {waiting.map(c => (
            <button type="button" key={c.id} style={chip(String(c.id) === String(clientId))} onClick={() => onSelectClient?.(String(c.id))}
              title={`Select ${c.name}`}>
              {c.name}
              {c.ready > 0 && <span style={{ color: '#4ade80' }}> · {c.ready} to deploy</span>}
              {c.needs > 0 && <span style={{ color: '#facc15' }}> · {c.needs} need you</span>}
            </button>
          ))}
        </div>
      )}

      {selector}

      <SiteChangesPanel showToast={showToast} clientId={clientId} clientName={clientName} report={report} onChange={load} />
    </div>
  );
}
