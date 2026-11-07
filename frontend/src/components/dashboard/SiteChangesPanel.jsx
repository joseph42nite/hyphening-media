import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Rocket, Trash2, Eye, RefreshCw, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import SeoNightDrawer from './SeoNightDrawer.jsx';
import { api, card, muted, label } from './blogMonitorShared.js';
import { BATCH_LABEL, BATCH_COLOR } from './seoNightShared.js';

/**
 * Site changes for one client, shown under the client dropdown in both the
 * SEO and the Ads Monitor: the night worker's fixes from both fleets on one
 * branch (each tagged SEO or Ads), what needs 007, what failed, and the one
 * Deploy button that is the approval for all of them. One queue per client,
 * because SEO and ads fixes change the same site and go live in the same
 * deploy. Server side: src/routes/seoNight.js.
 *
 * Pass `report` and `onChange` to share a report the parent already loads (the
 * SEO Monitor's night panel); without them it loads its own.
 */
export const BUSY = ['queued', 'running', 'deploy_queued', 'deploying'];

const tag = (f) => (f.fleet === 'ads' ? { ...f, metric: `Ads · ${f.metric}` } : f);

export function ScoreChange({ run }) {
  if (run.status !== 'completed') {
    return <span style={{ color: run.status === 'failed' ? '#f87171' : 'var(--text-muted)' }}>{run.agent_type} {run.status}</span>;
  }
  if (run.score == null) return <span>{run.agent_type} done</span>;
  const delta = run.previous_score == null ? null : run.score - run.previous_score;
  return (
    <span>
      {run.agent_type} {run.previous_score ?? 'new'}→{run.score}
      {delta != null && delta !== 0 && <span style={{ color: delta > 0 ? '#4ade80' : '#f87171' }}> {delta > 0 ? '▲' : '▼'}</span>}
    </span>
  );
}

export default function SiteChangesPanel({ showToast, clientId, clientName, report: shared, onChange }) {
  const [own, setOwn] = useState(null);
  const [busy, setBusy] = useState(null);
  const [open, setOpen] = useState({});
  const [drawerId, setDrawerId] = useState(null);

  const standalone = shared === undefined;
  const reload = useCallback(() => {
    if (!standalone) return onChange?.();
    // Admin only on the server; anyone else simply doesn't see the section.
    return api('/api/seo-night/report').then(setOwn).catch(() => setOwn({ clients: [], hidden: true }));
  }, [standalone, onChange]);
  useEffect(() => { if (standalone) reload(); }, [standalone, reload]);
  const report = standalone ? own : shared;

  // Standalone: while a fix or deploy is running, check back every 15 s.
  const anyBusy = standalone && report?.clients.some(c => String(c.client_id) === String(clientId) && BUSY.includes(c.batch?.status));
  useEffect(() => {
    if (!anyBusy) return undefined;
    const t = setInterval(reload, 15000);
    return () => clearInterval(t);
  }, [anyBusy, reload]);

  const rows = useMemo(() => (report?.clients || [])
    .filter(c => String(c.client_id) === String(clientId))
    .map(c => ({ ...c, fixes: c.fixes.map(tag), failed: c.failed.map(tag), needs_007: c.needs_007.map(tag), already_done: (c.already_done || []).map(tag) })),
  [report, clientId]);

  const act = async (key, fn, success) => {
    setBusy(key);
    try {
      const d = await fn();
      showToast(d?.note || success, 'success');
      return true;
    } catch (err) {
      showToast(err.message, 'error');
      return false;
    } finally {
      setBusy(null);
      reload();
    }
  };

  const deploy = (c) => {
    const n = c.fixes.filter(f => f.status === 'ready_to_deploy').length;
    if (!window.confirm(`Deploy ${n} fix(es) to ${c.client_name}'s live site? The Mac pushes them, deploys, and checks the site; if the check fails it rolls them back.`)) return;
    act(`d${c.batch.id}`, async () => {
      const d = await api(`/api/seo-night/batches/${c.batch.id}/deploy`, { method: 'POST' });
      return { note: d.connector_online ? `Deploying ${c.client_name}…` : 'Deploy queued; the Mac connector is offline, it starts when the connector next connects' };
    });
  };
  const discard = (c) => {
    if (!window.confirm(`Discard last night's fixes for ${c.client_name}? They move to "needs you" so they aren't redone tonight.`)) return;
    act(`x${c.batch.id}`, () => api(`/api/seo-night/batches/${c.batch.id}/discard`, { method: 'POST' }), 'Discarded');
  };
  const fixTonight = (rec) => act(`f${rec.id}`, () => api(`/api/seo-night/recommendations/${rec.id}/fix-tonight`, { method: 'POST' }), 'Will be fixed tonight');
  const ignore = (rec) => act(`i${rec.id}`, () => api(`/api/seo-night/recommendations/${rec.id}/ignore`, { method: 'POST' }), 'Ignored');

  if (!report || report.hidden || !clientId) return null;
  const drawerClient = drawerId != null && rows.find(r => r.client_id === drawerId);

  return (
    <>
      {rows.length === 0 && (
        <div style={{ ...card, ...muted, marginBottom: '20px' }}>
          Site changes are off for {clientName || 'this client'}: neither SEO nor Ads is on for them. Turn one on in the client's settings to have the night worker prepare website fixes here to deploy.
        </div>
      )}

      {rows.length > 0 && <div style={{ ...card, marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase' }}>Site changes · deploy</h3>
          <button className="btn btn-secondary" onClick={reload} title="Refresh"><RefreshCw size={14} /></button>
        </div>
        {rows.map(c => {
          const b = c.batch;
          const ready = c.fixes.filter(f => f.status === 'ready_to_deploy');
          const isOpen = open[c.client_id];
          return (
            <div key={c.client_id} style={{ borderTop: '1px solid var(--border-color)', padding: '12px 0', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 380px', minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>{c.client_name}</strong>
                  {b && (
                    <span style={{ ...label, color: BATCH_COLOR[b.status] }}>
                      {BUSY.includes(b.status) && <Loader2 size={11} className="spin" style={{ verticalAlign: '-1px', marginRight: 4 }} />}
                      {BATCH_LABEL[b.status]}{b.night ? ` · ${b.night}` : ''}
                    </span>
                  )}
                </div>
                <div style={{ ...muted, marginTop: '4px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <span>Takes {[c.seo_enabled && 'SEO', c.ads_enabled && 'Ads website'].filter(Boolean).join(' and ')} findings</span>
                  {c.seo_enabled && (c.runs.length ? c.runs.map(r => <ScoreChange key={r.id} run={r} />) : <span>· no SEO skills ran last night</span>)}
                </div>
                {c.setup && <div style={{ fontSize: '0.78rem', color: '#facc15', marginTop: '4px' }}>{c.setup}</div>}
                {(b?.error && !c.setup) && <div style={{ fontSize: '0.78rem', color: '#fca5a5', marginTop: '4px' }}>{b.error}</div>}
                {(b?.previous_error && !b.error && b.status !== 'live') && (
                  <div style={{ fontSize: '0.78rem', color: '#fca5a5', marginTop: '4px', opacity: 0.8 }}>Last attempt failed: {b.previous_error}</div>
                )}
                <button type="button" onClick={() => setOpen({ ...open, [c.client_id]: !isOpen })}
                  style={{ all: 'unset', cursor: 'pointer', fontSize: '0.8rem', marginTop: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span style={{ color: '#4ade80' }}>{ready.length} fix{ready.length === 1 ? '' : 'es'} ready</span>
                  <span style={{ color: c.needs_007.length ? '#facc15' : 'var(--text-muted)' }}>· {c.needs_007.length} need you</span>
                  <span style={{ color: c.failed.length ? '#f87171' : 'var(--text-muted)' }}>· {c.failed.length} failed</span>
                  {c.already_done?.length > 0 && <span style={{ color: '#60a5fa' }}>· {c.already_done.length} already done</span>}
                  {c.approved_for_tonight > 0 && <span style={muted}>· {c.approved_for_tonight} approved for tonight</span>}
                </button>
                {isOpen && (
                  <ul style={{ margin: '6px 0 0', paddingLeft: '18px', fontSize: '0.8rem' }}>
                    {ready.map(f => <li key={f.id} style={{ color: '#4ade80' }}>{f.metric}: <span style={{ color: 'var(--text-muted)' }}>{f.fix_summary}</span></li>)}
                    {c.needs_007.slice(0, 8).map(f => <li key={f.id} style={{ color: '#facc15' }}>{f.metric}: <span style={{ color: 'var(--text-muted)' }}>{f.fix_reason}</span></li>)}
                    {c.needs_007.length > 8 && <li style={muted}>…and {c.needs_007.length - 8} more in Review</li>}
                    {c.failed.map(f => <li key={f.id} style={{ color: '#f87171' }}>{f.metric}: <span style={{ color: 'var(--text-muted)' }}>{f.fix_error}</span></li>)}
                    {(c.already_done || []).map(f => <li key={f.id} style={{ color: '#60a5fa' }}>{f.metric}: <span style={{ color: 'var(--text-muted)' }}>{f.fix_reason}</span></li>)}
                  </ul>
                )}
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={() => setDrawerId(c.client_id)}><Eye size={14} /> Review</button>
                {(b?.status === 'ready' || c.retryable) && (
                  <>
                    <button className="btn btn-primary" disabled={busy === `d${b.id}`} onClick={() => deploy(c)}><Rocket size={14} /> {c.retryable ? 'Retry deploy' : 'Deploy'}</button>
                    <button className="btn btn-secondary" disabled={busy === `x${b.id}`} onClick={() => discard(c)} title="Discard last night's fixes"><Trash2 size={14} /></button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>}

      {drawerClient && (() => {
        return (
          <SeoNightDrawer
            client={drawerClient}
            busy={busy}
            onClose={() => setDrawerId(null)}
            onDeploy={deploy}
            onDiscard={discard}
            onFixTonight={fixTonight}
            onIgnore={ignore}
          />
        );
      })()}
      {drawerClient && (
        <SeoNightDrawer
          client={drawerClient}
          busy={busy}
          onClose={() => setDrawerId(null)}
          onDeploy={deploy}
          onDiscard={discard}
          onFixTonight={fixTonight}
          onIgnore={ignore}
        />
      )}
    </>
  );
}
