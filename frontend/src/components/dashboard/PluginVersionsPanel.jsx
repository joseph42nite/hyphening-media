import React, { useState, useEffect, useCallback } from 'react';
import { api, card, muted, label } from './blogMonitorShared.js';

/**
 * The open-source plugins a monitor runs on (claude-seo and claude-blog in the
 * SEO Monitor, claude-ads in the Ads Monitor): installed vs latest, Q's weekly
 * review, and one Update & test button. The Mac's plugin_update_worker does
 * the update, checks our skills are still there, rebuilds, runs one smoke
 * check, and rolls back on any failure. Server side: src/routes/plugins.js.
 *
 * Shows nothing when every plugin is up to date and nothing is running, apart
 * from a one-line "up to date" note, so the monitor stays about the clients.
 */

const VERDICT = {
  safe: { text: 'Safe', color: '#4ade80' },
  test_first: { text: 'Test first', color: '#facc15' },
  wait: { text: 'Wait', color: '#fb923c' },
  breaks: { text: 'Breaks our pipeline', color: '#f87171' },
};
const JOB = {
  queued: { text: 'Queued', color: '#a5b4fc' },
  running: { text: 'Updating…', color: '#a5b4fc' },
  updated: { text: 'Updated', color: '#4ade80' },
  failed: { text: 'Failed, nothing changed', color: '#f87171' },
  rolled_back: { text: 'Rolled back', color: '#f87171' },
  cancelled: { text: 'Cancelled', color: 'var(--text-muted)' },
};

const pill = (color) => ({
  display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 800,
  border: `1px solid ${color}`, color,
});
const btn = (primary, disabled) => ({
  padding: '6px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 800,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
  border: `1px solid ${primary ? 'var(--accent)' : 'var(--border-color)'}`,
  background: primary ? 'var(--accent-glow)' : 'transparent', color: 'var(--text-primary)',
});
const when = (t) => (t ? new Date(`${String(t).replace(' ', 'T')}Z`).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');

export default function PluginVersionsPanel({ monitor, showToast, isAdmin = true }) {
  const [data, setData] = useState(null);
  const [openLog, setOpenLog] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    api(`/api/plugins?monitor=${monitor}`).then(setData).catch(err => showToast?.(err.message, 'error'));
  }, [monitor, showToast]);
  useEffect(() => { load(); }, [load]);

  const anyLive = data?.plugins.some(p => p.live_job);
  useEffect(() => {
    if (!anyLive) return undefined;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [anyLive, load]);

  const update = async (p) => {
    const reviewLine = p.review_verdict ? `Q's review: ${VERDICT[p.review_verdict]?.text}.` : '';
    if (!window.confirm(`Update ${p.plugin} ${p.installed_version} → ${p.latest_version}? ${reviewLine}\n\nThe Mac updates it, checks every skill our workers call is still there, runs one smoke check and rolls back on any failure. It waits for running SEO, ads and blog runs, and never runs during the night runs.`)) return;
    setBusy(p.plugin);
    try {
      const r = await api(`/api/plugins/${p.plugin}/update`, { method: 'POST', body: '{}' });
      showToast?.(r.starts === 'now' ? `${p.plugin} update queued; the Mac starts it now` : `${p.plugin} update queued; it starts ${r.starts}`, 'success');
      load();
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (job) => {
    try {
      await api(`/api/plugins/updates/${job.id}/cancel`, { method: 'POST', body: '{}' });
      load();
    } catch (err) { showToast?.(err.message, 'error'); }
  };

  if (!data) return null;
  const shown = data.plugins.filter(p => p.behind || p.live_job || (p.last_job && ['failed', 'rolled_back'].includes(p.last_job.status)) || p.status_stale);
  if (!shown.length) {
    return (
      <p style={{ ...muted, margin: '0 0 12px' }}>
        Plugins up to date: {data.plugins.map(p => `${p.plugin} ${p.installed_version || '?'}`).join(' · ')}
      </p>
    );
  }

  return (
    <div style={{ ...card, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
        <span style={label}>Open-source plugins</span>
        <span style={muted}>{data.hold || (Object.keys(data.busy || {}).length ? `Waits for runs in flight: ${Object.entries(data.busy).map(([k, n]) => `${n} ${k}`).join(', ')}` : 'Q reviews new releases Mondays 09:00 IST')}</span>
      </div>

      {data.plugins.map((p) => {
        const v = VERDICT[p.review_verdict];
        const job = p.live_job || p.last_job;
        const j = job && JOB[job.status];
        return (
          <div key={p.plugin} style={{ borderTop: '1px solid var(--border-color)', padding: '10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <strong>{p.plugin}</strong>
                <span style={{ fontSize: '0.85rem' }}>
                  {p.installed_version || '?'}
                  {p.behind && <> → <strong style={{ color: '#facc15' }}>{p.latest_version}</strong></>}
                </span>
                {!p.behind && p.installed_version && <span style={pill('#4ade80')}>Up to date</span>}
                {p.behind && p.review_current && v && <span style={pill(v.color)} title={p.reviewed_at ? `Reviewed by ${p.reviewed_by} ${when(p.reviewed_at)}` : ''}>Q: {v.text}</span>}
                {p.behind && !p.review_current && <span style={pill('var(--text-muted)')}>Not reviewed yet</span>}
                {j && <span style={pill(j.color)}>{j.text}{job.to_version && job.status === 'updated' ? ` ${job.to_version}` : ''}</span>}
              </div>
              {isAdmin && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  {p.live_job?.status === 'queued' && <button type="button" style={btn(false)} onClick={() => cancel(p.live_job)}>Cancel</button>}
                  {job?.log && <button type="button" style={btn(false)} onClick={() => setOpenLog(openLog === p.plugin ? null : p.plugin)}>{openLog === p.plugin ? 'Hide log' : 'Log'}</button>}
                  {p.behind && !p.live_job && (
                    <button type="button" style={btn(true, !!p.blocker || busy === p.plugin)} disabled={!!p.blocker || busy === p.plugin}
                      title={p.blocker || 'Update, check skills, rebuild, smoke check; rolls back on any failure'} onClick={() => update(p)}>
                      Update &amp; test
                    </button>
                  )}
                </div>
              )}
            </div>

            {p.behind && p.review_current && p.review_summary && (
              <p style={{ margin: '6px 0 0', fontSize: '0.82rem', whiteSpace: 'pre-line' }}>{p.review_summary}</p>
            )}
            {p.behind && p.review_current && p.review_impact && (
              <p style={{ ...muted, margin: '4px 0 0' }}>Our pipelines: {p.review_impact}</p>
            )}
            {p.behind && p.new_skills.length > 0 && (
              <p style={{ ...muted, margin: '4px 0 0' }}>New skills (no card yet): {p.new_skills.join(', ')}</p>
            )}
            {p.blocker && p.behind && !p.live_job && <p style={{ ...muted, margin: '4px 0 0' }}>{p.blocker}</p>}
            {job?.error && ['failed', 'rolled_back'].includes(job.status) && (
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#fca5a5' }}>{job.error}</p>
            )}
            {p.status_stale && <p style={{ ...muted, margin: '4px 0 0' }}>The Mac last reported versions {p.status_reported_at ? when(p.status_reported_at) : 'never'}; it reports hourly while the connector runs.</p>}
            {openLog === p.plugin && job?.log && (
              <pre style={{ margin: '8px 0 0', padding: '8px', fontSize: '0.72rem', maxHeight: '240px', overflow: 'auto', background: 'rgba(0,0,0,0.25)', borderRadius: '6px', whiteSpace: 'pre-wrap' }}>{job.log}</pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
