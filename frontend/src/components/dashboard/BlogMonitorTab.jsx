import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CheckCircle, RefreshCw } from 'lucide-react';
import FleetModeToggle from './FleetModeToggle.jsx';
import BlogRunRow from './BlogRunRow.jsx';
import BlogRunDrawer from './BlogRunDrawer.jsx';
import BlogComingUp from './BlogComingUp.jsx';
import BlogTopicsPanel from './BlogTopicsPanel.jsx';
import { api, card, muted } from './blogMonitorShared.js';

/**
 * Blog Monitor: the night blog pipeline for every client, next to the SEO
 * and Ads monitors. The Blog tab stays Hyphening's own posts (published and
 * drafts); everything the pipeline drafts — and 007's approvals, rejections
 * and sends to clients — happens here.
 *
 * "To approve" is all clients at once, newest night first; the client chips
 * filter every view. Coming up, Topics and History sit in their own tabs so
 * the morning pass is just the queue and the drawer.
 */
const VIEWS = [
  { id: 'approve', label: 'To approve' },
  { id: 'coming', label: 'Coming up' },
  { id: 'topics', label: 'Topics' },
  { id: 'history', label: 'History' },
];
const RECENT_FAIL_HOURS = 72;
const ageHours = (ts) => (ts ? (Date.now() - new Date(`${ts.replace(' ', 'T')}${ts.endsWith('Z') ? '' : 'Z'}`).getTime()) / 3600000 : Infinity);

const chip = (active) => ({
  padding: '4px 12px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border-color)'}`,
  background: active ? 'var(--accent-glow)' : 'transparent', color: 'var(--text-primary)',
});
const tabStyle = (active) => ({
  all: 'unset', cursor: 'pointer', padding: '8px 4px', marginRight: '18px', fontSize: '0.85rem', fontWeight: 800,
  textTransform: 'uppercase', color: active ? 'var(--text-primary)' : 'var(--text-muted)',
  borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
});

export default function BlogMonitorTab({ showToast }) {
  const [view, setView] = useState('approve');
  const [clientFilter, setClientFilter] = useState(null);
  const [runs, setRuns] = useState([]);
  const [history, setHistory] = useState([]);
  const [outlook, setOutlook] = useState([]);
  const [busy, setBusy] = useState(null);
  const [drawer, setDrawer] = useState(null); // { ids: [...], id }

  const loadRuns = useCallback(() => {
    api('/api/blog-runs').then(d => setRuns(d.runs || [])).catch(err => showToast(err.message, 'error'));
  }, [showToast]);
  const loadOutlook = useCallback(() => {
    api('/api/blog-runs/outlook').then(d => setOutlook(d.clients || [])).catch(err => showToast(err.message, 'error'));
  }, [showToast]);
  const loadHistory = useCallback(() => {
    api('/api/blog-runs?status=approved,published,rejected,failed').then(d => setHistory(d.runs || [])).catch(err => showToast(err.message, 'error'));
  }, [showToast]);
  const reload = useCallback(() => { loadRuns(); loadOutlook(); if (view === 'history') loadHistory(); }, [loadRuns, loadOutlook, loadHistory, view]);

  useEffect(() => { loadRuns(); loadOutlook(); }, [loadRuns, loadOutlook]);
  useEffect(() => { if (view === 'history') loadHistory(); }, [view, loadHistory]);

  const clients = useMemo(() => {
    const byId = new Map(outlook.map(c => [c.client_id, c.client_name]));
    runs.forEach(r => { if (!byId.has(r.client_id)) byId.set(r.client_id, r.client_name); });
    return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [outlook, runs]);
  const mine = useCallback((r) => clientFilter == null || r.client_id === clientFilter, [clientFilter]);

  const ready = runs.filter(r => r.status === 'ready' && mine(r));
  const attention = runs.filter(r => mine(r) && ((r.status === 'failed' && ageHours(r.updated_at) <= RECENT_FAIL_HOURS) || (r.status === 'approved' && r.error)));
  const inProgress = runs.filter(r => mine(r) && (['queued', 'running', 'client_review'].includes(r.status) || (r.status === 'approved' && !r.error)));
  const counts = {
    ready: runs.filter(r => r.status === 'ready' && mine(r)).length,
    client: runs.filter(r => r.status === 'client_review' && mine(r)).length,
    failed: attention.length,
    tonight: outlook.filter(c => c.tonight && (clientFilter == null || c.client_id === clientFilter)).length,
  };

  const act = async (key, fn, success) => {
    setBusy(key);
    try {
      const data = await fn();
      showToast(data?.note || success, 'success');
      return true;
    } catch (err) {
      showToast(err.message, 'error');
      return false;
    } finally {
      setBusy(null);
      reload();
    }
  };

  // After acting on the post in the drawer, move on to the next one in the same list.
  const advanceDrawer = (runId) => setDrawer(d => {
    if (!d || d.id !== runId) return d;
    const ids = d.ids.filter(id => id !== runId);
    if (ids.length === 0) return null;
    const i = Math.min(d.ids.indexOf(runId), ids.length - 1);
    return { ids, id: ids[i] };
  });

  const approve = async (run) => {
    if (await act(`a${run.id}`, () => api(`/api/blog-runs/${run.id}/approve`, { method: 'POST' }), `"${run.title}" approved`)) advanceDrawer(run.id);
  };
  const reject = async (run) => {
    const reason = window.prompt(`What should change in "${run.title}"? The topic goes back in the queue and the next draft gets this note.`);
    if (!reason) return;
    if (await act(`r${run.id}`, () => api(`/api/blog-runs/${run.id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }), 'Sent back for a redraft')) advanceDrawer(run.id);
  };
  const sendToClient = async (run) => {
    if (!window.confirm(`Send "${run.title}" to ${run.client_name} for review? It appears under "Posts to review" in their portal (no email). When they approve, it comes back here for your OK.`)) return;
    if (await act(`c${run.id}`, () => api(`/api/blog-runs/${run.id}/send-to-client`, { method: 'POST' }), `Sent to ${run.client_name}'s portal`)) advanceDrawer(run.id);
  };
  const retryPublish = (run) => act(`a${run.id}`, () => api(`/api/blog-runs/${run.id}/retry-publish`, { method: 'POST' }), 'Published');
  const approveAll = () => {
    const eligible = ready.filter(r => r.passes_bar && r.publish_mode === 'approve_batch');
    if (!eligible.length) return showToast('Nothing passes the quality bar for batch approval', 'error');
    if (!window.confirm(`Approve and publish ${eligible.length} post(s) that pass their quality bar? This covers every client on batch approval, whatever the filter shows.`)) return;
    act('all', async () => {
      const d = await api('/api/blog-runs/approve-all', { method: 'POST' });
      const failed = d.results.filter(r => !r.ok);
      if (failed.length) throw new Error(`${d.results.length - failed.length} approved, ${failed.length} failed: ${failed[0].error}`);
      return { note: `${d.results.length} post(s) approved` };
    });
  };
  const draftNow = (c) => act(`d${c.client_id}`, async () => {
    const d = await api('/api/blog-runs/queue', { method: 'POST', body: JSON.stringify({ client_id: c.client_id }) });
    return { note: d.connector_online ? `Queued for ${c.client_name}; the Mac is writing it now` : `Queued for ${c.client_name}; the Mac connector is offline, it starts when the connector next connects` };
  });
  const skipTopic = (t) => act(`t${t.id}`, () => api(`/api/blog-runs/topics/${t.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'skipped' }) }), 'Topic skipped');

  const allRuns = [...runs, ...history];
  const drawerRun = drawer && allRuns.find(r => r.id === drawer.id);
  const openDrawer = (list) => (run) => setDrawer({ ids: list.filter(r => r.content).map(r => r.id), id: run.id });
  const rowProps = { busy, onApprove: approve, onReject: reject, onSend: sendToClient, onRetryPublish: retryPublish };
  const historyRows = history.filter(mine);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', textTransform: 'uppercase', fontWeight: 900, margin: 0 }}>Blog Monitor</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Ready {counts.ready} · With client {counts.client} · Failed {counts.failed} · Tonight {counts.tonight}
          </p>
        </div>
        <FleetModeToggle
          scope="blog"
          showToast={showToast}
          onChange={loadOutlook}
          confirmText="Turn the Blog fleet to AUTO? Leiter's 01:00 routine will then queue one post per client with Blog on each night. Posts still wait here for your approval."
        />
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <button type="button" style={chip(clientFilter == null)} onClick={() => setClientFilter(null)}>All</button>
        {clients.map(c => (
          <button type="button" key={c.id} style={chip(clientFilter === c.id)} onClick={() => setClientFilter(c.id)}>{c.name}</button>
        ))}
      </div>

      <div style={{ borderBottom: '1px solid var(--border-color)', marginBottom: '16px', display: 'flex', flexWrap: 'wrap' }}>
        {VIEWS.map(v => (
          <button type="button" key={v.id} style={tabStyle(view === v.id)} onClick={() => setView(v.id)}>
            {v.label}{v.id === 'approve' && counts.ready > 0 ? ` (${counts.ready})` : ''}
          </button>
        ))}
      </div>

      {view === 'approve' && (
        <>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
              <span style={muted}>Approve publishes to the client's site. ✕ sends it back for a redraft with your note. ➤ puts it in the client's portal first.</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" onClick={reload} title="Refresh"><RefreshCw size={14} /></button>
                <button className="btn btn-primary" disabled={busy === 'all' || ready.length === 0} onClick={approveAll}><CheckCircle size={14} /> Approve all</button>
              </div>
            </div>
            {ready.length === 0
              ? <p style={{ ...muted, margin: '8px 0 0' }}>Nothing waiting for you.</p>
              : ready.map(run => <BlogRunRow key={run.id} run={run} onPreview={openDrawer(ready)} {...rowProps} />)}
          </div>

          {attention.length > 0 && (
            <div style={card}>
              <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase', color: '#f87171' }}>Needs attention</h3>
              <span style={muted}>Failed in the last {RECENT_FAIL_HOURS} hours, or approved but not published. Q retries failed runs; older ones are in History.</span>
              {attention.map(run => <BlogRunRow key={run.id} run={run} onPreview={openDrawer(attention)} {...rowProps} />)}
            </div>
          )}

          {inProgress.length > 0 && (
            <div style={card}>
              <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase' }}>In progress</h3>
              {inProgress.map(run => <BlogRunRow key={run.id} run={run} onPreview={openDrawer(inProgress)} {...rowProps} />)}
            </div>
          )}
        </>
      )}

      {view === 'coming' && (
        <BlogComingUp outlook={outlook.filter(c => clientFilter == null || c.client_id === clientFilter)} busy={busy} onDraftNow={draftNow} onSkipTopic={skipTopic} />
      )}

      {view === 'topics' && (clientFilter == null
        ? <div style={card}><p style={{ ...muted, margin: 0 }}>Pick a client above to see and edit its topics.</p></div>
        : <BlogTopicsPanel key={clientFilter} clientId={clientFilter} clientName={clients.find(c => c.id === clientFilter)?.name} showToast={showToast} onChanged={loadOutlook} />)}

      {view === 'history' && (
        <div style={card}>
          <span style={muted}>Approved, published, sent back and failed posts, newest first.</span>
          {historyRows.length === 0
            ? <p style={{ ...muted, margin: '8px 0 0' }}>Nothing yet.</p>
            : historyRows.map(run => <BlogRunRow key={run.id} run={run} onPreview={openDrawer(historyRows)} {...rowProps} />)}
        </div>
      )}

      {drawerRun && (() => {
        const i = drawer.ids.indexOf(drawerRun.id);
        return (
          <BlogRunDrawer
            run={drawerRun}
            position={i + 1}
            total={drawer.ids.length}
            busy={busy}
            showToast={showToast}
            onClose={() => setDrawer(null)}
            onPrev={i > 0 ? () => setDrawer({ ...drawer, id: drawer.ids[i - 1] }) : null}
            onNext={i < drawer.ids.length - 1 ? () => setDrawer({ ...drawer, id: drawer.ids[i + 1] }) : null}
            onApprove={approve}
            onReject={reject}
            onSend={sendToClient}
          />
        );
      })()}
    </div>
  );
}
