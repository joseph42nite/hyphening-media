import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Rocket, Trash2, Eye, RefreshCw, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import FleetModeToggle from './FleetModeToggle.jsx';
import SeoNightDrawer from './SeoNightDrawer.jsx';
import { api, card, muted, label } from './blogMonitorShared.js';
import { BATCH_LABEL, BATCH_COLOR } from './seoNightShared.js';

/**
 * The SEO Monitor's night section. Above the client dropdown: the fleet
 * toggle, the totals, and a "waiting" line naming each client with fixes to
 * deploy or items that need you (click one to select it). Below the dropdown
 * (`selector`): "Last night" for the selected client only — the skills that
 * ran overnight with their scores, the safe fixes waiting on a branch, what
 * needs 007 and what failed, and the Deploy button that is the approval for
 * them. Server side: src/routes/seoNight.js.
 */
const BUSY = ['queued', 'running', 'deploy_queued', 'deploying'];

const chip = (active) => ({
  padding: '4px 12px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border-color)'}`,
  background: active ? 'var(--accent-glow)' : 'transparent', color: 'var(--text-primary)',
});

function ScoreChange({ run }) {
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

export default function SeoNightPanel({ showToast, clientId, clientName, onSelectClient, selector }) {
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(null);
  const [open, setOpen] = useState({});
  const [drawerId, setDrawerId] = useState(null);

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

  const rows = useMemo(() => (report?.clients || []).filter(c => String(c.client_id) === String(clientId)), [report, clientId]);
  // Every SEO-on client with something to act on, for the line above the dropdown.
  const waiting = useMemo(() => (report?.clients || []).map(c => ({
    id: c.client_id, name: c.client_name,
    ready: (c.batch?.status === 'ready' || c.retryable) ? c.fixes.filter(f => f.status === 'ready_to_deploy').length : 0,
    needs: c.needs_007.length,
  })).filter(c => c.ready || c.needs), [report]);

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
      load();
    }
  };

  const deploy = (c) => {
    const n = c.fixes.filter(f => f.status === 'ready_to_deploy').length;
    if (!window.confirm(`Deploy ${n} SEO fix(es) to ${c.client_name}'s live site? The Mac pushes them, deploys, and checks the site; if the check fails it rolls them back.`)) return;
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

  if (!report) return selector;
  const t = report.totals;
  const drawerClient = drawerId != null && rows.find(r => r.client_id === drawerId);

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

      {clientId && rows.length === 0 && (
        <div style={{ ...card, ...muted, marginBottom: '20px' }}>
          Night audits and fixes are off for {clientName || 'this client'}: SEO is not on for them. Turn it on in the client's settings to have skills run overnight and safe fixes waiting here to deploy.
        </div>
      )}

      {rows.length > 0 && <div style={{ ...card, marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase' }}>Last night · deploy</h3>
          <button className="btn btn-secondary" onClick={load} title="Refresh"><RefreshCw size={14} /></button>
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
                  {c.runs.length ? c.runs.map(r => <ScoreChange key={r.id} run={r} />) : <span>No skills ran last night</span>}
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
    </div>
  );
}
