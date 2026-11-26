import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Play, RefreshCw, CheckCircle, XCircle, Download, Key, AlertTriangle } from 'lucide-react';
import { API_BASE } from '../../api.js';
import { api, card, muted, label } from './blogMonitorShared.js';

/**
 * The Outbound tab: the Client Brain cards and cold outbound for any
 * marketing client. Cards say exactly what to add before they can run;
 * every lead and email waits here for approval; approved leads export as CSV
 * for the client's sending tool; replies, bounces and bookings come back
 * through the events link. Server side: src/routes/growth.js.
 */
const STATUS_VIEWS = [
  { id: 'to_approve', label: 'To approve', statuses: ['to_approve'] },
  { id: 'approved', label: 'Ready to send', statuses: ['approved'] },
  { id: 'in_sequence', label: 'In sequence', statuses: ['in_sequence'] },
  { id: 'replied', label: 'Replied', statuses: ['replied', 'positive'] },
  { id: 'meetings', label: 'Meetings', statuses: ['meeting_booked', 'meeting_held', 'opportunity'] },
  { id: 'closed', label: 'Closed', statuses: ['won', 'lost', 'bounced', 'unsubscribed', 'rejected'] },
];
const RUN_COLOR = { queued: '#a5b4fc', running: '#a5b4fc', done: '#4ade80', failed: '#f87171', cancelled: 'var(--text-muted)' };
const SCORE_COLOR = { hot: '#f87171', warm: '#facc15', cold: '#60a5fa' };
const EVENT_LABEL = {
  reply: 'Replied', positive_reply: 'Positive reply', meeting_booked: 'Meeting booked', meeting_held: 'Meeting held',
  opportunity: 'Opportunity', won: 'Won', lost: 'Lost', bounce: 'Bounced', unsubscribe: 'Unsubscribed', note: 'Note',
};
const pill = (color) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 800, border: `1px solid ${color}`, color });
const when = (t) => (t ? new Date(`${String(t).replace(' ', 'T')}${/Z$/.test(t) ? '' : 'Z'}`).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const tabStyle = (active) => ({
  all: 'unset', cursor: 'pointer', padding: '6px 2px', marginRight: '16px', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase',
  color: active ? 'var(--text-primary)' : 'var(--text-muted)', borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
});

function CardRow({ c, onRun, onCancel, onApply, busy, isAdmin }) {
  const [showApply, setShowApply] = useState(false);
  const [keys, setKeys] = useState([]);
  const run = c.live_run || c.last_run;
  const done = c.last_done;
  const proposal = done?.result;
  const proposedKeys = proposal ? [...Object.keys(proposal.sections || {}), ...(proposal.competitors_section ? ['competitors'] : [])] : [];
  const canApply = done && !done.applied_at && ['brain_build', 'competitor_research', 'outbound_retro'].includes(c.key);
  return (
    <div style={{ borderTop: '1px solid var(--border-color)', padding: '12px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 320px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <strong>{c.label}</strong>
            {c.ready && !c.live_run && <span style={pill(c.due ? '#facc15' : '#4ade80')}>{c.due ? 'Due' : 'Ready'}</span>}
            {run && <span style={pill(RUN_COLOR[run.status])}>{run.status === 'running' ? 'Running…' : run.status}{run.finished_at ? ` · ${when(run.finished_at)}` : ''}</span>}
            {c.skills.length > 0 && <span style={muted}>{c.skills.join(' + ')}</span>}
          </div>
          <p style={{ ...muted, margin: '4px 0 0' }}>{c.about}</p>
          {c.unavailable && <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: '#fca5a5' }}>{c.unavailable}</p>}
          {c.missing.length > 0 && (
            <div style={{ margin: '8px 0 0', padding: '8px 10px', borderRadius: '8px', border: '1px solid #facc15', background: 'rgba(250,204,21,0.06)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#facc15', marginBottom: '4px' }}>ADD BEFORE RUNNING</div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.8rem' }}>
                {c.missing.map(m => <li key={m.key}>{m.label}{m.where ? <span style={muted}> · {m.where}</span> : null}</li>)}
              </ul>
            </div>
          )}
          {run?.status === 'failed' && run.error && <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: '#fca5a5' }}>{run.error}</p>}
          {done?.summary && <p style={{ margin: '6px 0 0', fontSize: '0.82rem', whiteSpace: 'pre-line' }}>{done.summary}</p>}
          {done?.result?.skipped?.length > 0 && (
            <p style={{ ...muted, margin: '4px 0 0' }}>Skipped: {done.result.skipped.slice(0, 6).map(s => `${s.lead} (${s.reason})`).join('; ')}{done.result.skipped.length > 6 ? '…' : ''}</p>
          )}
          {c.key === 'outbound_deliverability' && done?.result?.domains && (
            <ul style={{ margin: '6px 0 0', paddingLeft: '18px', fontSize: '0.8rem' }}>
              {done.result.domains.map(d => <li key={d.domain}><strong>{d.domain}</strong>: {d.problems.length ? d.problems.join('; ') : 'MX, SPF and DMARC OK'}</li>)}
            </ul>
          )}
          {c.key === 'outbound_retro' && done?.result?.health && (
            <p style={{ margin: '6px 0 0', fontSize: '0.82rem' }}><span style={pill(done.result.health === 'ok' ? '#4ade80' : done.result.health === 'warn' ? '#facc15' : '#f87171')}>{done.result.health}</span></p>
          )}
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {c.live_run?.status === 'queued' && <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => onCancel(c.live_run)}>Cancel</button>}
            {canApply && <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => setShowApply(!showApply)}>Review proposal</button>}
            {!c.live_run && (
              <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                disabled={!c.ready || busy === c.key} title={c.ready ? 'Queue this run on the Mac' : 'Add what is listed first'} onClick={() => onRun(c)}>
                <Play size={12} /> Run
              </button>
            )}
          </div>
        )}
      </div>

      {showApply && proposal && (
        <div style={{ marginTop: '10px', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          {proposedKeys.length > 0 && (
            <>
              <div style={label}>Proposed sections</div>
              <p style={{ ...muted, margin: '2px 0 8px' }}>Tick the sections to overwrite. Left unticked, only sections that are empty now are filled.</p>
              {proposedKeys.map(k => (
                <details key={k} style={{ marginBottom: '6px' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '0.82rem' }}>
                    <input type="checkbox" checked={keys.includes(k)} onChange={e => setKeys(e.target.checked ? [...keys, k] : keys.filter(x => x !== k))} onClick={e => e.stopPropagation()} style={{ marginRight: '6px' }} />
                    {k.replace(/_/g, ' ')}
                  </summary>
                  <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.78rem', margin: '6px 0 0 22px' }}>{k === 'competitors' && proposal.competitors_section ? proposal.competitors_section : proposal.sections?.[k]}</pre>
                </details>
              ))}
            </>
          )}
          {proposal.claims?.length > 0 && <p style={{ fontSize: '0.8rem', margin: '6px 0' }}>Claims with a source are added: {proposal.claims.filter(x => x.source).length}</p>}
          {proposal.learnings?.length > 0 && (
            <ul style={{ fontSize: '0.8rem', margin: '6px 0', paddingLeft: '18px' }}>{proposal.learnings.map((l, i) => <li key={i}>{l.learning} <span style={muted}>({l.evidence})</span></li>)}</ul>
          )}
          {proposal.open_questions?.length > 0 && (
            <><div style={label}>Ask the client</div><ul style={{ fontSize: '0.8rem', margin: '4px 0', paddingLeft: '18px' }}>{proposal.open_questions.map((q, i) => <li key={i}>{q}</li>)}</ul></>
          )}
          <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '0.78rem', marginTop: '6px' }} onClick={() => onApply(done, keys).then(ok => ok && setShowApply(false))}>
            Apply to the Brain
          </button>
        </div>
      )}
    </div>
  );
}

function LeadRow({ lead, open, onToggle, onDecide, onSave, onEvent, isAdmin }) {
  const [seq, setSeq] = useState(lead.sequence);
  const [eventType, setEventType] = useState('reply');
  const [detail, setDetail] = useState('');
  useEffect(() => { setSeq(lead.sequence); }, [lead]);
  const editable = lead.status === 'to_approve' && isAdmin;
  return (
    <div style={{ borderTop: '1px solid var(--border-color)', padding: '10px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', cursor: 'pointer' }} onClick={onToggle}>
        <div>
          {lead.score && <span style={{ ...pill(SCORE_COLOR[lead.score]), marginRight: '6px' }}>{lead.score}{lead.tier ? ` · T${lead.tier}` : ''}</span>}
          <strong>{lead.company}</strong>
          <span style={muted}> · {lead.contact_name || 'general address'}{lead.contact_title ? `, ${lead.contact_title}` : ''} · {lead.contact_email}{lead.country ? ` · ${lead.country}` : ''}</span>
          {lead.email_status !== 'valid' && <span style={{ ...muted, color: lead.email_status === 'invalid' ? '#f87171' : '#facc15' }}> · email {lead.email_status}</span>}
        </div>
        <span style={muted}>{lead.status.replace(/_/g, ' ')}{lead.last_event_at ? ` · ${when(lead.last_event_at)}` : ''}</span>
      </div>
      {open && (
        <div style={{ marginTop: '8px', paddingLeft: '4px' }}>
          {lead.why_prospect && <p style={{ margin: '0 0 4px', fontSize: '0.82rem' }}><strong>Why:</strong> {lead.why_prospect}</p>}
          {lead.signal && <p style={{ margin: '0 0 4px', fontSize: '0.82rem' }}><strong>Why now:</strong> {lead.signal}</p>}
          {lead.source_urls.length > 0 && (
            <p style={{ ...muted, margin: '0 0 8px' }}>Sources: {lead.source_urls.map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer noopener" style={{ marginRight: '8px' }}>{i + 1}</a>)}</p>
          )}
          {lead.reply_note && <p style={{ margin: '0 0 8px', fontSize: '0.82rem', whiteSpace: 'pre-line' }}><strong>Their reply:</strong> {lead.reply_note}</p>}
          {seq.map((s, i) => (
            <div key={i} style={{ marginBottom: '8px' }}>
              <div style={label}>Email {i + 1} · day {s.day}</div>
              {editable ? (
                <>
                  <input className="form-control" style={{ marginBottom: '4px' }} value={s.subject} onChange={e => setSeq(seq.map((x, j) => (j === i ? { ...x, subject: e.target.value } : x)))} />
                  <textarea className="form-control" rows="5" value={s.body} onChange={e => setSeq(seq.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} />
                </>
              ) : (
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.82rem', margin: '2px 0 0' }}><strong>{s.subject}</strong>{'\n'}{s.body}</pre>
              )}
            </div>
          ))}
          {editable && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {JSON.stringify(seq) !== JSON.stringify(lead.sequence) && <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => onSave(lead, seq)}>Save edits</button>}
              <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                onClick={() => onDecide(lead, 'approve', JSON.stringify(seq) !== JSON.stringify(lead.sequence) ? seq : null)}><CheckCircle size={12} /> Approve</button>
              <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                onClick={() => onDecide(lead, 'reject')}><XCircle size={12} /> Reject</button>
            </div>
          )}
          {isAdmin && !['to_approve', 'rejected'].includes(lead.status) && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
              <select className="form-control" style={{ maxWidth: '180px' }} value={eventType} onChange={e => setEventType(e.target.value)}>
                {Object.entries(EVENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input className="form-control" style={{ flex: '1 1 200px' }} placeholder="What they said, or a note" value={detail} onChange={e => setDetail(e.target.value)} />
              <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => onEvent(lead, eventType, detail).then(ok => ok && setDetail(''))}>Record</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OutboundTab({ auth, clients = [], showToast }) {
  const isAdmin = ['admin', 'super_admin'].includes(auth?.role);
  const marketing = useMemo(() => clients.filter(c => ['marketing', 'both'].includes(c.client_type) && c.is_active !== 0), [clients]);
  const [clientId, setClientId] = useState(() => {
    try { return localStorage.getItem('outbound_client') || ''; } catch { return ''; }
  });
  const [cards, setCards] = useState([]);
  const [leads, setLeads] = useState({ leads: [], stats: null });
  const [recs, setRecs] = useState([]);
  const [events, setEvents] = useState([]);
  const [dnc, setDnc] = useState([]);
  const [view, setView] = useState('to_approve');
  const [openLead, setOpenLead] = useState(null);
  const [busy, setBusy] = useState(null);
  const [newKey, setNewKey] = useState(null);
  const [dncText, setDncText] = useState('');
  const [dncReason, setDncReason] = useState('do_not_contact');

  useEffect(() => {
    if (!clientId && marketing.length) setClientId(String(marketing[0].id));
  }, [marketing, clientId]);
  useEffect(() => { try { if (clientId) localStorage.setItem('outbound_client', clientId); } catch { /* storage off */ } }, [clientId]);

  const client = marketing.find(c => String(c.id) === String(clientId));
  const base = `/api/clients/${clientId}`;

  // Each part loads on its own, so one failed request doesn't blank the tab,
  // and an answer for a client no longer selected is dropped.
  const seq = React.useRef(0);
  const load = useCallback(async () => {
    if (!clientId) return;
    const mine = ++seq.current;
    const parts = await Promise.allSettled([
      api(`${base}/growth/cards`), api(`${base}/outbound/leads`), api(`${base}/growth/recommendations`),
      api(`${base}/outbound/events?limit=30`), api(`${base}/outbound/suppression`),
    ]);
    if (mine !== seq.current) return;
    const [c, l, r, e, s] = parts.map(p => (p.status === 'fulfilled' ? p.value : null));
    if (c) setCards(c.cards);
    if (l) setLeads(l);
    if (r) setRecs(r.recommendations);
    if (e) setEvents(e.events);
    if (s) setDnc(s.entries);
    const failed = parts.find(p => p.status === 'rejected');
    if (failed) showToast(failed.reason?.message || 'Some of the Outbound tab did not load', 'error');
  }, [base, clientId, showToast]);
  useEffect(() => { setNewKey(null); setCards([]); setLeads({ leads: [], stats: null }); setRecs([]); setEvents([]); setDnc([]); }, [clientId]);
  useEffect(() => { load(); }, [load]);

  const live = cards.some(c => c.live_run);
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [live, load]);

  const act = async (key, fn, ok) => {
    setBusy(key);
    try { const d = await fn(); if (ok) showToast(typeof ok === 'function' ? ok(d) : ok, 'success'); await load(); return true; } catch (err) { showToast(err.message, 'error'); return false; } finally { setBusy(null); }
  };
  const post = (path, body = {}) => api(`${base}${path}`, { method: 'POST', body: JSON.stringify(body) });

  const runCard = (c) => act(c.key, () => post(`/growth/run/${c.key}`), (d) => `${c.label} queued; ${d.starts === 'now' ? 'the Mac starts it now' : 'it starts when the Mac connects'}`);
  const cancelRun = (run) => act('cancel', () => post(`/growth/runs/${run.id}/cancel`), 'Cancelled');
  const applyRun = (run, keys) => act('apply', () => post(`/growth/runs/${run.id}/apply`, { keys }), (d) => `Applied: ${d.applied.sections.length} section(s), ${d.applied.claims} claim(s), ${d.applied.learnings} learning(s)`);
  const decide = (lead, decision, seq) => act(`lead${lead.id}`, async () => {
    if (seq) await api(`${base}/outbound/leads/${lead.id}`, { method: 'PATCH', body: JSON.stringify({ sequence: seq }) });
    return post(`/outbound/leads/${lead.id}/decide`, { decision });
  }, decision === 'approve' ? `${lead.company} approved` : `${lead.company} rejected`);
  const saveLead = (lead, sequence) => act(`lead${lead.id}`, () => api(`${base}/outbound/leads/${lead.id}`, { method: 'PATCH', body: JSON.stringify({ sequence }) }), 'Saved');
  const recordEvent = (lead, type, detail) => act(`lead${lead.id}`, () => post(`/outbound/leads/${lead.id}/event`, { type, detail }), 'Recorded');
  const setRec = (rec, status) => act(`rec${rec.id}`, () => api(`${base}/growth/recommendations/${rec.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }));
  const rotateKey = async () => {
    if (!window.confirm('Make a new events key? A tool still using an older key stops working until you give it this one.')) return;
    await act('key', async () => { const d = await post('/outbound/events-key'); setNewKey(d.events_key); return d; }, 'New events key made: copy it now, it is shown once');
  };
  const addDnc = () => act('dnc', () => post('/outbound/suppression', { entries: dncText, reason: dncReason }), (d) => { setDncText(''); return `${d.added} added${d.rejected?.length ? `, ${d.rejected.length} not an email or domain` : ''}`; });
  const removeDnc = (e) => act(`dnc${e.id}`, () => api(`${base}/outbound/suppression/${e.id}`, { method: 'DELETE' }));
  const download = (mark) => {
    if (mark && !window.confirm('Download the CSV and mark these leads as in sequence? Do this when you load them into the sending tool.')) return;
    window.location.href = `${API_BASE}${base}/outbound/export.csv${mark ? '?mark=1' : ''}`;
    if (mark) setTimeout(load, 1500);
  };

  if (!marketing.length) return <div style={card}><p style={muted}>No marketing clients yet.</p></div>;
  const brainCards = cards.filter(c => c.monitor === 'brain');
  const outboundCards = cards.filter(c => c.monitor === 'outbound');
  const outboundBlocked = outboundCards[0]?.unavailable;
  const stats = leads.stats;
  const current = STATUS_VIEWS.find(v => v.id === view);
  const rows = leads.leads.filter(l => current.statuses.includes(l.status));
  const count = (v) => leads.leads.filter(l => v.statuses.includes(l.status)).length;

  return (
    <div>
      <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <select className="form-control" style={{ maxWidth: '320px' }} value={clientId} onChange={e => { setClientId(e.target.value); setView('to_approve'); setOpenLead(null); }}>
            {marketing.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {client && <span style={muted}>{client.client_group ? client.client_group.replace(/_/g, ' ') : 'no client group set'} · outbound {client.outbound_enabled ? 'on' : 'off'}</span>}
        </div>
        <button className="btn btn-secondary" onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><RefreshCw size={14} /> Refresh</button>
      </div>

      <div style={card}>
        <div style={label}>Client Brain</div>
        <p style={{ ...muted, margin: '4px 0 0' }}>The profile every marketing run reads. Edit it in Clients → Onboarding (or the client fills it in from their portal); these cards propose additions.</p>
        {brainCards.map(c => <CardRow key={c.key} c={c} onRun={runCard} onCancel={cancelRun} onApply={applyRun} busy={busy} isAdmin={isAdmin} />)}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <div style={label}>Cold outbound</div>
          {stats && !outboundBlocked && (
            <span style={muted}>
              {stats.by_status.to_approve} to approve · {stats.contacted} contacted · replies {stats.reply_rate ?? '–'}% · bounces {stats.bounce_rate ?? '–'}% · {stats.meetings} meetings
            </span>
          )}
        </div>
        {outboundBlocked && <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: '#fca5a5' }}><AlertTriangle size={14} style={{ verticalAlign: '-2px' }} /> {outboundBlocked}</p>}
        {!outboundBlocked && stats?.bounce_rate > 2 && (
          <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: '#fca5a5' }}><AlertTriangle size={14} style={{ verticalAlign: '-2px' }} /> Bounces are over 2%: pause sending and check the list and the domains.</p>
        )}
        {!outboundBlocked && outboundCards.map(c => <CardRow key={c.key} c={c} onRun={runCard} onCancel={cancelRun} onApply={applyRun} busy={busy} isAdmin={isAdmin} />)}
      </div>

      {!outboundBlocked && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            <div>{STATUS_VIEWS.map(v => <button key={v.id} type="button" style={tabStyle(view === v.id)} onClick={() => setView(v.id)}>{v.label} ({count(v)})</button>)}</div>
            {view === 'approved' && isAdmin && count(current) > 0 && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }} onClick={() => download(false)}><Download size={12} /> CSV</button>
                <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }} onClick={() => download(true)}><Download size={12} /> CSV and mark sent</button>
              </div>
            )}
          </div>
          {view === 'approved' && <p style={{ ...muted, margin: '0 0 6px' }}>Load the CSV into the sending tool: each step's subject and body are columns, with the sender, postal address and opt-out line already added to each body.</p>}
          {rows.length === 0 && <p style={muted}>Nothing here.</p>}
          {rows.map(l => (
            <LeadRow key={l.id} lead={l} open={openLead === l.id} onToggle={() => setOpenLead(openLead === l.id ? null : l.id)}
              onDecide={decide} onSave={saveLead} onEvent={recordEvent} isAdmin={isAdmin} />
          ))}
        </div>
      )}

      {recs.length > 0 && (
        <div style={card}>
          <div style={label}>Recommendations and reply drafts</div>
          {recs.map(r => (
            <div key={r.id} style={{ borderTop: '1px solid var(--border-color)', padding: '8px 0', display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 320px' }}>
                <span style={{ ...pill(r.priority === 'high' ? '#f87171' : r.priority === 'medium' ? '#facc15' : '#60a5fa'), marginRight: '6px' }}>{r.priority}</span>
                <strong style={{ fontSize: '0.85rem' }}>{r.title}</strong>
                {r.detail && <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', margin: '4px 0 0' }}>{r.detail}</pre>}
              </div>
              {isAdmin && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '0.75rem' }} onClick={() => setRec(r, 'done')}>Done</button>
                  <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '0.75rem' }} onClick={() => setRec(r, 'dismissed')}>Dismiss</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!outboundBlocked && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          <div style={card}>
            <div style={label}>Events link (sending and booking tools)</div>
            <p style={{ ...muted, margin: '4px 0 8px' }}>
              The sending tool's webhook and the client's booking tool send replies, bounces, unsubscribes and bookings here, with this client's key in the <code>x-outbound-key</code> header.
            </p>
            <code style={{ display: 'block', fontSize: '0.75rem', wordBreak: 'break-all', marginBottom: '6px' }}>POST {window.location.origin}/api/outbound/events</code>
            <code style={{ display: 'block', fontSize: '0.72rem', wordBreak: 'break-all', marginBottom: '8px', color: 'var(--text-muted)' }}>{'{ "email": "...", "type": "meeting_booked", "detail": "..." }'}</code>
            {newKey && <code style={{ display: 'block', fontSize: '0.75rem', wordBreak: 'break-all', padding: '6px', border: '1px solid #4ade80', borderRadius: '6px', marginBottom: '8px' }}>{newKey}</code>}
            {isAdmin && <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }} disabled={busy === 'key'} onClick={rotateKey}><Key size={12} /> {newKey ? 'Make another key' : 'Make a new key'}</button>}
            {events.length > 0 && (
              <ul style={{ margin: '12px 0 0', paddingLeft: '18px', fontSize: '0.78rem', maxHeight: '220px', overflowY: 'auto' }}>
                {events.map(e => <li key={e.id}>{when(e.occurred_at)} · {e.type.replace(/_/g, ' ')} · {e.company || e.email || 'unknown'} <span style={muted}>({e.source.replace('_', ' ')})</span></li>)}
              </ul>
            )}
          </div>

          <div style={card}>
            <div style={label}>Do-not-contact ({dnc.length})</div>
            <p style={{ ...muted, margin: '4px 0 8px' }}>Customers, unsubscribes and bounces. Checked when leads come in, when they are approved and again at export.</p>
            {isAdmin && (
              <>
                <textarea className="form-control" rows="3" placeholder="One email or domain per line" value={dncText} onChange={e => setDncText(e.target.value)} />
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  <select className="form-control" style={{ maxWidth: '180px' }} value={dncReason} onChange={e => setDncReason(e.target.value)}>
                    {['customer', 'do_not_contact', 'competitor', 'unsubscribed', 'bounced', 'complaint'].map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                  </select>
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} disabled={!dncText.trim() || busy === 'dnc'} onClick={addDnc}>Add</button>
                </div>
              </>
            )}
            <ul style={{ margin: '10px 0 0', paddingLeft: '18px', fontSize: '0.78rem', maxHeight: '200px', overflowY: 'auto' }}>
              {dnc.slice(0, 200).map(e => (
                <li key={e.id}>{e.value} <span style={muted}>· {e.reason.replace(/_/g, ' ')}</span>
                  {isAdmin && <button type="button" onClick={() => removeDnc(e)} style={{ all: 'unset', cursor: 'pointer', marginLeft: '6px', color: '#f87171' }} title="Remove">×</button>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
