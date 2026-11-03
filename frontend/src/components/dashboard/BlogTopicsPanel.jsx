import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, SkipForward } from 'lucide-react';
import { api, card, muted, label } from './blogMonitorShared.js';

/** One client's topic queue: add, skip, delete. Only topics nothing has been drafted from can change. */
export default function BlogTopicsPanel({ clientId, clientName, showToast, onChanged }) {
  const [topics, setTopics] = useState([]);
  const [busy, setBusy] = useState(null);
  const [newTopic, setNewTopic] = useState({ topic: '', target_keyword: '', planned_for: '' });

  const load = useCallback(() => {
    api(`/api/blog-runs/topics?client_id=${clientId}`).then(d => setTopics(d.topics || [])).catch(err => showToast(err.message, 'error'));
  }, [clientId, showToast]);
  useEffect(() => { load(); }, [load]);

  const act = async (key, fn, success) => {
    setBusy(key);
    try {
      await fn();
      if (success) showToast(success, 'success');
      return true;
    } catch (err) {
      showToast(err.message, 'error');
      return false;
    } finally {
      setBusy(null);
      load();
      onChanged();
    }
  };

  const addTopic = async () => {
    if (!newTopic.topic.trim()) return;
    const ok = await act('add', () => api('/api/blog-runs/topics', {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId, topics: [{ ...newTopic, planned_for: newTopic.planned_for || null }] }),
    }), 'Topic added');
    if (ok) setNewTopic({ topic: '', target_keyword: '', planned_for: '' });
  };
  const toggle = (t) => act(`t${t.id}`, () => api(`/api/blog-runs/topics/${t.id}`, { method: 'PATCH', body: JSON.stringify({ status: t.status === 'planned' ? 'skipped' : 'planned' }) }));
  const remove = (t) => {
    if (!window.confirm(`Delete "${t.topic}"?`)) return;
    act(`t${t.id}`, () => api(`/api/blog-runs/topics/${t.id}`, { method: 'DELETE' }));
  };

  return (
    <div style={card}>
      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase' }}>Topics · {clientName}</h3>
      <span style={muted}>Planned topics are drafted in date order, one a night.</span>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '12px 0' }}>
        <input className="form-control" style={{ flex: '2 1 240px' }} placeholder="Topic" value={newTopic.topic} onChange={e => setNewTopic({ ...newTopic, topic: e.target.value })} />
        <input className="form-control" style={{ flex: '1 1 160px' }} placeholder="Target keyword" value={newTopic.target_keyword} onChange={e => setNewTopic({ ...newTopic, target_keyword: e.target.value })} />
        <input className="form-control" style={{ flex: '0 1 160px' }} type="date" value={newTopic.planned_for} onChange={e => setNewTopic({ ...newTopic, planned_for: e.target.value })} />
        <button className="btn btn-primary" disabled={busy === 'add' || !newTopic.topic.trim()} onClick={addTopic}><Plus size={14} /> Add</button>
      </div>

      {topics.length === 0 ? <p style={{ ...muted, margin: 0 }}>No topics yet.</p> : topics.map(t => (
        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 0', borderTop: '1px solid var(--border-color)', alignItems: 'center' }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ ...label, marginRight: '8px', color: t.status === 'planned' ? 'var(--text-primary)' : 'var(--text-muted)' }}>{t.status}</span>
            <span style={{ overflowWrap: 'anywhere' }}>{t.topic}</span>
            {t.target_keyword && <span style={muted}> · {t.target_keyword}</span>}
            {t.planned_for && <span style={muted}> · {t.planned_for}</span>}
          </div>
          {['planned', 'skipped'].includes(t.status) && (
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              <button className="btn btn-secondary" disabled={busy === `t${t.id}`} onClick={() => toggle(t)} title={t.status === 'planned' ? 'Skip' : 'Back to planned'}><SkipForward size={14} /></button>
              <button className="btn btn-secondary" disabled={busy === `t${t.id}`} onClick={() => remove(t)} title="Delete"><Trash2 size={14} /></button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
