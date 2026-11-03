import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Eye, Download, RefreshCw, Plus, Trash2, SkipForward, Play, X, Send } from 'lucide-react';
import { API_BASE } from '../../api.js';

/**
 * The night blog pipeline in the Blog tab: posts the Mac's blog worker
 * drafted overnight, waiting for 007 (Approve / Reject / Approve all), and
 * each client's topic queue the 01:00 IST schedule draws from.
 * Server side: src/routes/blogRuns.js.
 */
const STATUS_LABEL = {
  queued: 'Queued', running: 'Writing…', client_review: 'With client', ready: 'Ready',
  approved: 'Approved', published: 'Published', rejected: 'Rejected', failed: 'Failed',
};
const STATUS_COLOR = {
  ready: '#4ade80', client_review: '#facc15', approved: '#60a5fa', published: '#4ade80',
  failed: '#f87171', rejected: '#f87171', running: '#a5b4fc', queued: '#a5b4fc',
};

const card = { background: 'var(--bg-card)', border: '2px solid var(--border-color)', borderRadius: '12px', padding: '16px', marginBottom: '20px' };
const muted = { color: 'var(--text-muted)', fontSize: '0.8rem' };

async function api(pathname, options = {}) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    credentials: 'include',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export default function BlogNightPanel({ showToast }) {
  const [runs, setRuns] = useState([]);
  const [busy, setBusy] = useState(null);
  const [preview, setPreview] = useState(null);
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [topics, setTopics] = useState([]);
  const [newTopic, setNewTopic] = useState({ topic: '', target_keyword: '', planned_for: '' });

  const loadRuns = useCallback(() => {
    api('/api/blog-runs').then(d => setRuns(d.runs || [])).catch(err => showToast(err.message, 'error'));
  }, [showToast]);

  const loadTopics = useCallback((id) => {
    if (!id) return setTopics([]);
    api(`/api/blog-runs/topics?client_id=${id}`).then(d => setTopics(d.topics || [])).catch(err => showToast(err.message, 'error'));
  }, [showToast]);

  useEffect(() => {
    loadRuns();
    api('/api/clients').then(d => {
      const list = (Array.isArray(d) ? d : d.clients || []).filter(c => c.blog_enabled);
      setClients(list);
      if (list.length) setClientId(String(list[0].id));
    }).catch(() => setClients([]));
  }, [loadRuns]);

  useEffect(() => { loadTopics(clientId); }, [clientId, loadTopics]);

  const act = async (key, fn, success) => {
    setBusy(key);
    try {
      const data = await fn();
      if (data?.note) showToast(data.note, 'success');
      else if (success) showToast(success, 'success');
      loadRuns();
      loadTopics(clientId);
    } catch (err) {
      showToast(err.message, 'error');
      loadRuns();
    } finally {
      setBusy(null);
    }
  };

  const approve = (run) => act(`a${run.id}`, () => api(`/api/blog-runs/${run.id}/approve`, { method: 'POST' }),
    `"${run.title}" approved`);
  const sendToClient = (run) => {
    if (!window.confirm(`Send "${run.title}" to ${run.client_name} for review? It appears under "Posts to review" in their portal (no email). When they approve, it comes back here for your OK.`)) return;
    act(`c${run.id}`, () => api(`/api/blog-runs/${run.id}/send-to-client`, { method: 'POST' }), `Sent to ${run.client_name}'s portal`);
  };
  const retry = (run) => act(`a${run.id}`, () => api(`/api/blog-runs/${run.id}/retry-publish`, { method: 'POST' }), 'Published');
  const reject = (run) => {
    const reason = window.prompt(`What should change in "${run.title}"? The topic goes back in the queue and the next draft gets this note.`);
    if (!reason) return;
    act(`r${run.id}`, () => api(`/api/blog-runs/${run.id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }), 'Sent back for a redraft');
  };
  const approveAll = () => {
    const eligible = runs.filter(r => r.status === 'ready' && r.passes_bar && r.publish_mode === 'approve_batch');
    if (!eligible.length) return showToast('Nothing passes the quality bar for batch approval', 'error');
    if (!window.confirm(`Approve and publish ${eligible.length} post(s) that pass their quality bar?`)) return;
    act('all', async () => {
      const d = await api('/api/blog-runs/approve-all', { method: 'POST' });
      const failed = d.results.filter(r => !r.ok);
      if (failed.length) throw new Error(`${d.results.length - failed.length} approved, ${failed.length} failed: ${failed[0].error}`);
      return { note: `${d.results.length} post(s) approved` };
    });
  };
  const openPreview = async (run) => {
    try {
      const d = await api(`/api/blog-runs/${run.id}/preview`);
      setPreview({ run, html: d.html });
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
  const draftNow = () => act('draft', async () => {
    const d = await api('/api/blog-runs/queue', { method: 'POST', body: JSON.stringify({ client_id: parseInt(clientId, 10) }) });
    return { note: d.connector_online ? 'Queued; the Mac is writing it now' : 'Queued; the Mac connector is offline, it will start when the connector next connects' };
  });
  const addTopic = () => {
    if (!newTopic.topic.trim()) return;
    act('topic', () => api('/api/blog-runs/topics', {
      method: 'POST',
      body: JSON.stringify({ client_id: parseInt(clientId, 10), topics: [{ ...newTopic, planned_for: newTopic.planned_for || null }] }),
    }), 'Topic added').then(() => setNewTopic({ topic: '', target_keyword: '', planned_for: '' }));
  };
  const setTopicStatus = (t, status) => act(`t${t.id}`, () => api(`/api/blog-runs/topics/${t.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }));
  const deleteTopic = (t) => {
    if (!window.confirm(`Delete "${t.topic}"?`)) return;
    act(`t${t.id}`, () => api(`/api/blog-runs/topics/${t.id}`, { method: 'DELETE' }));
  };

  const readyCount = runs.filter(r => r.status === 'ready').length;

  return (
    <>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase' }}>Ready to approve {readyCount > 0 && `(${readyCount})`}</h3>
            <span style={muted}>Approve publishes to the client's site. Reject sends it back for a redraft with your note. Send to client puts it in their portal first.</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={loadRuns} title="Refresh"><RefreshCw size={14} /></button>
            <button className="btn btn-primary" disabled={busy === 'all' || readyCount === 0} onClick={approveAll}>
              <CheckCircle size={14} /> Approve all
            </button>
          </div>
        </div>

        {runs.length === 0 ? (
          <p style={{ ...muted, margin: 0 }}>Nothing drafted yet.</p>
        ) : runs.map(run => (
          <div key={run.id} style={{ borderTop: '1px solid var(--border-color)', padding: '12px 0', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 320px', minWidth: 0 }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: STATUS_COLOR[run.status], textTransform: 'uppercase' }}>{STATUS_LABEL[run.status]}</span>
                <span style={muted}>{run.client_name}</span>
                {run.quality_score != null && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: run.passes_bar ? '#4ade80' : '#f87171' }}>
                    {run.quality_score}/{run.quality_bar}
                  </span>
                )}
                {run.audio_url && <span style={muted}>· audio</span>}
              </div>
              <div style={{ fontWeight: 700, margin: '4px 0', overflowWrap: 'anywhere' }}>{run.title || `Run #${run.id}`}</div>
              {run.blockers?.length > 0 && (
                <ul style={{ margin: '4px 0 0', paddingLeft: '18px', fontSize: '0.78rem', color: '#fca5a5' }}>
                  {run.blockers.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              )}
              {run.error && <div style={{ fontSize: '0.78rem', color: '#fca5a5', marginTop: '4px' }}>{run.error}</div>}
              {run.agent_recommendation && (
                <div style={{ fontSize: '0.8rem', marginTop: '6px', padding: '6px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.04)' }}>
                  <strong style={{ color: { approve: '#4ade80', reject: '#f87171', needs_007: '#facc15' }[run.agent_recommendation] }}>
                    {run.agent_reviewed_by || 'Bot'} recommends: {{ approve: 'approve', reject: 'reject', needs_007: 'your call' }[run.agent_recommendation]}
                  </strong>{' '}
                  <span style={{ color: 'var(--text-muted)' }}>{run.agent_review}</span>
                </div>
              )}
              {run.reject_reason && <div style={muted}>Sent back: {run.reject_reason}</div>}
              {run.client_review_note && <div style={muted}>Client: {run.client_review_note}</div>}
              {run.published_url && <a href={run.published_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem' }}>{run.published_url}</a>}
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {run.content && <button className="btn btn-secondary" onClick={() => openPreview(run)} title="Preview"><Eye size={14} /></button>}
              {run.content && ['handoff', 'repo_file', 'cms_api'].includes(run.publish_target) && (
                <a className="btn btn-secondary" href={`${API_BASE}/api/blog-runs/${run.id}/download`} title="Download HTML"><Download size={14} /></a>
              )}
              {run.status === 'ready' && (
                <>
                  <button className="btn btn-primary" disabled={busy === `a${run.id}`} onClick={() => approve(run)}><CheckCircle size={14} /> Approve</button>
                  <button className="btn btn-secondary" disabled={busy === `r${run.id}`} onClick={() => reject(run)}><XCircle size={14} /> Reject</button>
                  <button className="btn btn-secondary" disabled={busy === `c${run.id}`} onClick={() => sendToClient(run)} title="Send to the client's portal for their review"><Send size={14} /> Send to client</button>
                </>
              )}
              {run.status === 'approved' && run.error && (
                <button className="btn btn-secondary" disabled={busy === `a${run.id}`} onClick={() => retry(run)}><RefreshCw size={14} /> Retry publish</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase' }}>Topic queue</h3>
            <span style={muted}>When Leiter starts the night (01:00 IST, Blog on Auto), the next planned topic is drafted, one per client.</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select className="form-control" value={clientId} onChange={e => setClientId(e.target.value)} style={{ minWidth: '200px' }}>
              {clients.length === 0 && <option value="">No client has Blog on</option>}
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn btn-secondary" disabled={!clientId || busy === 'draft'} onClick={draftNow} title="Queue the next topic now, whatever the Blog switch says">
              <Play size={14} /> Draft now
            </button>
          </div>
        </div>

        {clientId && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <input className="form-control" style={{ flex: '2 1 240px' }} placeholder="Topic" value={newTopic.topic} onChange={e => setNewTopic({ ...newTopic, topic: e.target.value })} />
            <input className="form-control" style={{ flex: '1 1 160px' }} placeholder="Target keyword" value={newTopic.target_keyword} onChange={e => setNewTopic({ ...newTopic, target_keyword: e.target.value })} />
            <input className="form-control" style={{ flex: '0 1 160px' }} type="date" value={newTopic.planned_for} onChange={e => setNewTopic({ ...newTopic, planned_for: e.target.value })} />
            <button className="btn btn-primary" disabled={busy === 'topic' || !newTopic.topic.trim()} onClick={addTopic}><Plus size={14} /> Add</button>
          </div>
        )}

        {topics.length === 0 ? <p style={{ ...muted, margin: 0 }}>No topics yet.</p> : topics.map(t => (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 0', borderTop: '1px solid var(--border-color)', alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', marginRight: '8px', color: t.status === 'planned' ? 'var(--text-primary)' : 'var(--text-muted)' }}>{t.status}</span>
              <span style={{ overflowWrap: 'anywhere' }}>{t.topic}</span>
              {t.target_keyword && <span style={muted}> · {t.target_keyword}</span>}
              {t.planned_for && <span style={muted}> · {t.planned_for}</span>}
            </div>
            {['planned', 'skipped'].includes(t.status) && (
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button className="btn btn-secondary" disabled={busy === `t${t.id}`} onClick={() => setTopicStatus(t, t.status === 'planned' ? 'skipped' : 'planned')} title={t.status === 'planned' ? 'Skip' : 'Back to planned'}>
                  <SkipForward size={14} />
                </button>
                <button className="btn btn-secondary" disabled={busy === `t${t.id}`} onClick={() => deleteTopic(t)} title="Delete"><Trash2 size={14} /></button>
              </div>
            )}
          </div>
        ))}
      </div>

      {preview && (
        <div className="modal-overlay" onClick={() => setPreview(null)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', width: '100%', maxWidth: '820px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={muted}>{preview.run.client_name} · {preview.run.meta_title}</div>
                <div style={muted}>{preview.run.meta_description}</div>
              </div>
              <button className="btn btn-secondary" onClick={() => setPreview(null)}><X size={14} /></button>
            </div>
            {preview.run.cover_image_url && /^https:\/\//.test(preview.run.cover_image_url) && (
              <img src={preview.run.cover_image_url} alt={preview.run.cover_alt || ''} style={{ width: '100%', borderRadius: '8px', margin: '12px 0' }} />
            )}
            {preview.run.audio_url && <audio controls src={preview.run.audio_url} style={{ width: '100%', marginBottom: '12px' }} />}
            <div className="blog-preview" dangerouslySetInnerHTML={{ __html: preview.html }} />
            {preview.run.evidence?.serp_urls?.length > 0 && (
              <details style={{ marginTop: '16px' }}>
                <summary style={muted}>Evidence</summary>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>{JSON.stringify(preview.run.evidence, null, 2)}</pre>
              </details>
            )}
          </div>
        </div>
      )}
    </>
  );
}
