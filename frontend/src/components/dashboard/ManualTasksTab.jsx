import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Check, X, ExternalLink, Moon } from 'lucide-react';
import { api, card, muted, label } from './blogMonitorShared.js';

/**
 * Manual tasks: every open SEO and ads finding a person has to do by hand, one
 * client at a time, grouped by where the work happens. Shares the SEO Monitor's
 * client choice. Server side: src/routes/manualTasks.js, src/services/manualTasks.js.
 */
const CLIENT_KEY = 'seo_monitor_selected_client_id';
const PRIORITY_COLOR = { Critical: '#f87171', High: '#fb923c', Medium: '#facc15', Low: 'var(--text-muted)' };
const shortName = (email) => (email ? email.split('@')[0] : 'Unassigned');
const selectStyle = { padding: '4px 8px', border: '1px solid rgba(223, 231, 224, 0.18)', borderRadius: '6px', fontSize: '0.75rem', background: 'rgba(5, 7, 10, 0.85)', color: 'var(--text-primary)' };

function TaskRow({ task, isAdmin, assignees, busy, onAssign, onDone, onSkip, onFixTonight }) {
  const [skipping, setSkipping] = useState(false);
  const [reason, setReason] = useState('');
  const disabled = busy === task.key;

  return (
    <div style={{ borderTop: '1px solid var(--border-color)', padding: '12px 0', display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
      <div style={{ flex: '1 1 380px', minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ ...label, color: PRIORITY_COLOR[task.priority] }}>{task.priority}</span>
          <strong style={{ fontSize: '0.9rem', overflowWrap: 'anywhere' }}>{task.issue}</strong>
        </div>
        <div style={{ fontSize: '0.85rem', marginTop: '4px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{task.steps}</div>
        <div style={{ ...muted, marginTop: '4px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <span>From {task.card} · {new Date(task.created_at.replace(' ', 'T') + 'Z').toLocaleDateString()}</span>
          {task.page_url && (
            <a href={task.page_url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
              {task.page_url.replace(/^https?:\/\//, '')} <ExternalLink size={11} />
            </a>
          )}
          {task.campaign && <span>Campaign: {task.campaign}{task.platform ? ` (${task.platform})` : ''}</span>}
        </div>
        {task.why_manual && <div style={{ ...muted, marginTop: '2px', fontStyle: 'italic' }}>{task.why_manual}</div>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end', flex: '0 0 auto' }}>
        {isAdmin ? (
          <select style={selectStyle} value={task.assigned_to || ''} disabled={disabled} onChange={e => onAssign(task, e.target.value || null)}>
            <option value="">Unassigned</option>
            {assignees.map(a => <option key={a} value={a}>{shortName(a)}</option>)}
          </select>
        ) : (
          <span style={muted}>{shortName(task.assigned_to)}</span>
        )}
        {!skipping ? (
          <div style={{ display: 'flex', gap: '6px' }}>
            {task.area === 'site' && isAdmin && (
              <button className="btn btn-secondary" disabled={disabled} onClick={() => onFixTonight(task)} title="Let the night worker make this change tonight">
                <Moon size={13} /> Fix tonight
              </button>
            )}
            {task.area !== 'site' && (
              <button className="btn btn-secondary" disabled={disabled} onClick={() => onDone(task)}><Check size={13} /> Done</button>
            )}
            <button className="btn btn-secondary" disabled={disabled} onClick={() => setSkipping(true)}><X size={13} /> Not doing</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="Why not?"
              onKeyDown={e => { if (e.key === 'Enter' && reason.trim()) onSkip(task, reason); if (e.key === 'Escape') setSkipping(false); }}
              style={{ ...selectStyle, width: '180px' }}
            />
            <button className="btn btn-secondary" disabled={disabled || !reason.trim()} onClick={() => onSkip(task, reason)}>Save</button>
            <button className="btn btn-secondary" onClick={() => setSkipping(false)}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ManualTasksTab({ clients, showToast, isAdmin }) {
  const activeClients = clients.filter(c => c.client_type !== 'artist_curation');
  const [clientId, setClientId] = useState(() => {
    try { return localStorage.getItem(CLIENT_KEY) || ''; } catch { return ''; }
  });
  const [data, setData] = useState(null);
  const [who, setWho] = useState('all');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!activeClients.length) return;
    if (!activeClients.some(c => String(c.id) === String(clientId))) setClientId(String(activeClients[0].id));
  }, [clients]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(() => {
    if (!clientId) return;
    api(`/api/manual-tasks?client_id=${clientId}`).then(setData).catch(err => showToast(err.message, 'error'));
  }, [clientId, showToast]);
  useEffect(() => { setData(null); load(); }, [load]);

  const pickClient = (id) => {
    setClientId(id);
    try { localStorage.setItem(CLIENT_KEY, id); } catch { /* per-viewer convenience only */ }
  };

  const act = async (task, fn, success) => {
    setBusy(task.key);
    try {
      await fn();
      showToast(success, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(null);
      load();
    }
  };
  const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body || {}) });

  const handlers = {
    onAssign: (t, to) => act(t, () => post(`/api/manual-tasks/${t.key}/assign`, { assigned_to: to }), to ? `Assigned to ${shortName(to)}` : 'Unassigned'),
    onDone: (t) => act(t, () => post(`/api/manual-tasks/${t.key}/done`), 'Marked done'),
    onSkip: (t, reason) => act(t, () => post(`/api/manual-tasks/${t.key}/skip`, { reason }), 'Marked not doing'),
    onFixTonight: (t) => act(t, () => post(`/api/seo-night/recommendations/${t.key}/fix-tonight`), 'The night worker will make this change tonight'),
  };

  const visible = (tasks) => tasks.filter(t => who === 'all' || (who === 'none' ? !t.assigned_to : t.assigned_to === who));
  const areas = (data?.areas || []).map(a => ({ ...a, tasks: visible(a.tasks) })).filter(a => a.tasks.length);

  return (
    <div>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase' }}>Manual tasks</h3>
            <span style={muted}>SEO and ads findings a person has to do: off-site work, Business Profile, Search Console, content, ad accounts, and site changes waiting for your OK. Sorted each night.</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <select className="form-control" style={{ ...selectStyle, minWidth: '180px', fontSize: '0.85rem', fontWeight: 600 }} value={clientId} onChange={e => pickClient(e.target.value)}>
              {activeClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select style={{ ...selectStyle, fontSize: '0.85rem' }} value={who} onChange={e => setWho(e.target.value)}>
              <option value="all">Everyone</option>
              <option value="none">Unassigned</option>
              {(data?.assignees || []).map(a => <option key={a} value={a}>{shortName(a)}</option>)}
            </select>
            <button className="btn btn-secondary" onClick={load} title="Refresh"><RefreshCw size={14} /></button>
          </div>
        </div>
        {data && <div style={{ ...muted, marginTop: '8px' }}>{data.total} open{who !== 'all' ? ` · showing ${areas.reduce((n, a) => n + a.tasks.length, 0)}` : ''}</div>}
      </div>

      {!data && <p style={muted}>Loading…</p>}
      {data && areas.length === 0 && (
        <div style={card}><p style={{ ...muted, margin: 0 }}>Nothing to do by hand here{who !== 'all' ? ' for this person' : ''}. New findings are sorted at night, after the audits.</p></div>
      )}
      {areas.map(area => (
        <div key={area.key} style={card}>
          <div style={{ ...label, marginBottom: '4px' }}>{area.label} ({area.tasks.length})</div>
          {area.tasks.map(t => (
            <TaskRow key={t.key} task={t} isAdmin={isAdmin} assignees={data.assignees} busy={busy} {...handlers} />
          ))}
        </div>
      ))}
    </div>
  );
}
