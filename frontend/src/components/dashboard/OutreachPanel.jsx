import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Search, AlertTriangle, CheckCircle } from 'lucide-react';
import OutreachDrawer from './OutreachDrawer.jsx';
import { api, card, muted, label } from './blogMonitorShared.js';
import { KIND_LABEL, STATUS_LABEL, VIEWS } from './outreachShared.js';

/**
 * Backlink outreach in the SEO Monitor, under "Last night". The Mac finds
 * prospects weekly (DataForSEO + Claude), 007 approves and assigns them, and
 * the assigned staff member sends from their own Gmail. Whether DataForSEO
 * worked on the last run is shown first, so a missing login or an empty
 * balance is never silent. Shows the client picked in the SEO Monitor's
 * dropdown only. Server side: src/routes/outreach.js.
 */
const DFS_COLOR = { ok: '#4ade80', never: 'var(--text-muted)', missing: '#f87171', auth: '#f87171', funds: '#f87171', failed: '#f87171' };

const tabStyle = (active) => ({
  all: 'unset', cursor: 'pointer', padding: '6px 2px', marginRight: '16px', fontSize: '0.8rem', fontWeight: 800,
  textTransform: 'uppercase', color: active ? 'var(--text-primary)' : 'var(--text-muted)',
  borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
});

export default function OutreachPanel({ showToast, clientId, seoOn = true }) {
  const [data, setData] = useState(null);
  const [view, setView] = useState('approve');
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(null);
  const [ccDraft, setCcDraft] = useState(null);

  const load = useCallback(() => {
    api('/api/outreach').then(setData).catch(err => showToast(err.message, 'error'));
  }, [showToast]);
  useEffect(() => { load(); }, [load]);

  const mine = (r) => String(r.client_id) === String(clientId);
  const running = data?.runs.some(r => mine(r) && ['queued', 'running'].includes(r.status));
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [running, load]);

  const prospects = useMemo(() => (data?.prospects || []).filter(mine), [data, clientId]);
  const inView = (v) => prospects.filter(p => v.statuses.includes(p.status));
  const current = VIEWS.find(v => v.id === view);
  const rows = data ? inView(current) : [];
  const open = prospects.find(p => p.id === openId);

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

  const findNow = () => act('find', async () => {
    const d = await api('/api/outreach/run', { method: 'POST', body: JSON.stringify({ client_id: Number(clientId) }) });
    return { note: d.connector_online ? `Finding prospects for ${d.queued.map(q => q.client_name).join(', ')}` : 'Queued; the Mac connector is offline, it starts when it next connects' };
  });
  const saveCc = () => act('cc', async () => { await api('/api/outreach/cc', { method: 'PUT', body: JSON.stringify({ emails: ccDraft }) }); setCcDraft(null); }, 'CC list saved');
  const approve = (p, draft) => act(`a${p.id}`, () => api(`/api/outreach/${p.id}/approve`, { method: 'POST', body: JSON.stringify(draft) }), 'Approved: it\'s in the sender\'s To send list');
  const reject = (p) => act(`r${p.id}`, () => api(`/api/outreach/${p.id}/reject`, { method: 'POST' }), 'Rejected').then(ok => ok && setOpenId(null));
  const sent = (p) => act(`s${p.id}`, () => api(`/api/outreach/${p.id}/sent`, { method: 'POST' }), 'Marked sent; a follow-up is drafted after 5 days without a reply');
  const outcome = (p, kind) => {
    let body = { outcome: kind };
    if (kind === 'won') {
      const live = window.prompt('Paste the page where the link is now live:');
      if (!live) return;
      body = { ...body, live_url: live };
    }
    if (kind !== 'won') {
      const note = window.prompt(kind === 'replied' ? 'What did they say? (short note)' : 'Why was it lost? (optional)');
      if (note === null) return;
      body = { ...body, note };
    }
    act(`o${p.id}`, () => api(`/api/outreach/${p.id}/outcome`, { method: 'POST', body: JSON.stringify(body) }), STATUS_LABEL[kind]);
  };

  // Outreach runs only for clients with SEO on; for the rest it could only fail.
  if (!data || !clientId || !seoOn) return null;
  const dfs = data.dataforseo;
  const failedRuns = data.runs.filter(r => mine(r) && r.status === 'failed');

  return (
    <div style={{ ...card, marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase' }}>Outreach</h3>
          <span style={muted}>Backlink prospects found weekly. Approve and assign; the sender opens it in Gmail and marks it sent.</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={load} title="Refresh"><RefreshCw size={14} /></button>
          {data.admin && <button className="btn btn-secondary" disabled={busy === 'find' || running} onClick={findNow}><Search size={14} /> {running ? 'Finding…' : 'Find now'}</button>}
        </div>
      </div>

      {/* DataForSEO first: a problem here means no new prospects until it's fixed. */}
      {data.admin && (
        <div style={{ margin: '10px 0', padding: '8px 10px', borderRadius: '8px', fontSize: '0.82rem', display: 'flex', gap: '8px', alignItems: 'flex-start',
          background: dfs.state === 'ok' || dfs.state === 'never' ? 'rgba(255,255,255,0.03)' : 'rgba(239, 68, 68, 0.12)', border: `1px solid ${DFS_COLOR[dfs.state]}` }}>
          {dfs.state === 'ok' ? <CheckCircle size={15} color={DFS_COLOR.ok} /> : <AlertTriangle size={15} color={DFS_COLOR[dfs.state]} />}
          <div>
            <strong style={{ color: DFS_COLOR[dfs.state] }}>DataForSEO: {dfs.state === 'ok' ? 'working' : dfs.state === 'never' ? 'not run yet' : 'needs you'}</strong>{' '}
            <span>{dfs.message}</span>
            {dfs.state === 'funds' && <> · <a href="https://app.dataforseo.com/" target="_blank" rel="noopener noreferrer">Top up</a></>}
            {failedRuns.length > 0 && <div style={{ ...muted, marginTop: '2px' }}>Failed last run: {failedRuns.map(r => r.client_name).join(', ')}</div>}
          </div>
        </div>
      )}

      {data.admin && (
        <div style={{ ...muted, marginBottom: '8px' }}>
          CC on every email (internal staff): {ccDraft === null
            ? <><strong style={{ color: 'var(--text-primary)' }}>{data.cc.join(', ') || 'nobody yet'}</strong> · <button type="button" style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setCcDraft(data.cc.join(', '))}>edit</button></>
            : <span style={{ display: 'inline-flex', gap: '6px' }}>
                <input className="form-control" style={{ minWidth: '320px' }} value={ccDraft} onChange={e => setCcDraft(e.target.value)} placeholder="name@hypheningmedia.com, …" />
                <button className="btn btn-primary" disabled={busy === 'cc'} onClick={saveCc}>Save</button>
                <button className="btn btn-secondary" onClick={() => setCcDraft(null)}>Cancel</button>
              </span>}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          {VIEWS.map(v => (
            <button type="button" key={v.id} style={tabStyle(view === v.id)} onClick={() => setView(v.id)}>
              {v.label} ({inView(v).length})
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? <p style={{ ...muted, margin: '10px 0 0' }}>Nothing here.</p> : rows.map(p => (
        <button type="button" key={p.id} onClick={() => setOpenId(p.id)}
          style={{ all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--border-color)', width: '100%', flexWrap: 'wrap' }}>
          <span style={{ minWidth: 0, flex: '1 1 380px' }}>
            <span style={{ ...label, color: '#a5b4fc', marginRight: '8px' }}>{KIND_LABEL[p.kind]}</span>
            <strong>{p.site_domain}</strong>
            {p.domain_rank != null && <span style={muted}> · rank {p.domain_rank}</span>}
            <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.reason || p.page_title || p.page_url}</span>
          </span>
          <span style={{ ...muted, alignSelf: 'center' }}>
            {STATUS_LABEL[p.status]}{p.assignee_name ? ` · ${p.assignee_name}` : ''}{!p.contact_email && ['to_approve', 'to_send'].includes(p.status) ? ' · no email found' : ''}
          </span>
        </button>
      ))}

      {open && (
        <OutreachDrawer
          prospect={open}
          admin={data.admin}
          staff={data.staff}
          defaultCc={data.cc}
          busy={busy}
          showToast={showToast}
          onClose={() => setOpenId(null)}
          onApprove={approve}
          onReject={reject}
          onSent={sent}
          onOutcome={outcome}
        />
      )}
    </div>
  );
}
