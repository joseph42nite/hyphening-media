import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Check, X } from 'lucide-react';
import { api, card, muted, label } from './blogMonitorShared.js';

/**
 * One client's keywords: the onboarding seeds DataForSEO expands, candidates scored by
 * src/services/keywordPlan.js, and the approved ones with how their position
 * has moved. Approving a keyword adds it to the topic queue below.
 */
export default function KeywordsPanel({ clientId, clientName, showToast, onApproved }) {
  const [keywords, setKeywords] = useState([]);
  const [seeds, setSeeds] = useState([]);
  const [autoApprove, setAutoApprove] = useState(0);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    api(`/api/blog-runs/keywords?client_id=${clientId}`)
      .then(d => { setKeywords(d.keywords || []); setSeeds(d.seeds || []); setAutoApprove(d.auto_approve || 0); })
      .catch(err => showToast(err.message, 'error'));
  }, [clientId, showToast]);
  useEffect(() => { load(); }, [load]);

  const act = async (key, fn, success) => {
    setBusy(key);
    try {
      const r = await fn();
      if (success) showToast(typeof success === 'function' ? success(r) : success, 'success');
      return r;
    } catch (err) {
      showToast(err.message, 'error');
      return null;
    } finally {
      setBusy(null);
      load();
    }
  };

  const saveAutoApprove = (n) => act('auto', () => api('/api/blog-runs/keywords/settings', {
    method: 'PUT', body: JSON.stringify({ client_id: clientId, auto_approve: n }),
  }), n ? `The best ${n} keywords will become topics on their own each month` : 'Auto-approve off');

  const refresh = () => act('refresh', () => api('/api/blog-runs/keywords/refresh', {
    method: 'POST', body: JSON.stringify({ client_id: clientId }),
  }), r => [`${r.added} new, ${r.updated} rechecked ($${r.cost}).`, ...r.notes].join(' '));

  const approve = async (k) => {
    if (await act(`k${k.id}`, () => api(`/api/blog-runs/keywords/${k.id}/approve`, { method: 'POST' }), `"${k.keyword}" added to topics`)) onApproved();
  };
  const reject = (k) => act(`k${k.id}`, () => api(`/api/blog-runs/keywords/${k.id}/reject`, { method: 'POST' }));

  const candidates = keywords.filter(k => k.status === 'candidate');
  const approved = keywords.filter(k => k.status === 'approved');

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase' }}>Keywords · {clientName}</h3>
        <button className="btn btn-secondary" disabled={busy === 'refresh'} onClick={refresh}>
          <RefreshCw size={14} /> {busy === 'refresh' ? 'Checking…' : 'Check keywords now'}
        </button>
      </div>
      <span style={muted}>
        Checked on the 4th of each month: Search Console near misses plus DataForSEO ideas from the seeds, scored by searches, difficulty and intent. Approve one to make it a topic.
      </span>

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', margin: '12px 0', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <span style={label}>Seeds · niche keywords from onboarding</span>
          <div style={{ ...muted, marginTop: '4px', overflowWrap: 'anywhere' }}>
            {seeds.length ? seeds.join(' · ') : 'None yet, so the top Search Console searches are used. Add niche keywords in the client\'s onboarding (Clients → Onboarding, or the client\'s portal).'}
          </div>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={label}>Auto-approve each month</span>
          <select className="form-control" value={autoApprove} disabled={busy === 'auto'} onChange={e => saveAutoApprove(parseInt(e.target.value, 10))}>
            <option value={0}>Off · I approve each one</option>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>Best {n} become topics</option>)}
          </select>
        </label>
      </div>

      <KeywordTable rows={candidates} empty="No candidates yet. Press Check keywords now." busy={busy}
        actions={k => (
          <>
            <button className="btn btn-primary" disabled={busy === `k${k.id}`} onClick={() => approve(k)} title="Make it a topic"><Check size={14} /></button>
            <button className="btn btn-secondary" disabled={busy === `k${k.id}`} onClick={() => reject(k)} title="Not for us"><X size={14} /></button>
          </>
        )} />

      {approved.length > 0 && (
        <>
          <div style={{ ...label, marginTop: '16px' }}>Approved · position now vs last check</div>
          <KeywordTable rows={approved} />
        </>
      )}
    </div>
  );
}

function KeywordTable({ rows, empty, actions }) {
  if (!rows.length) return <p style={{ ...muted, margin: 0 }}>{empty}</p>;
  const cell = { padding: '6px 8px', borderTop: '1px solid var(--border-color)', fontSize: '0.85rem' };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            {['Keyword', 'Searches/mo', 'Difficulty', 'Intent', 'Position', 'Score', ''].map(h => <th key={h} style={{ ...label, padding: '6px 8px' }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(k => (
            <tr key={k.id}>
              <td style={{ ...cell, overflowWrap: 'anywhere' }}>{k.keyword}{k.source === 'search_console' && <span style={muted}> · near miss</span>}{k.source === 'audit' && <span style={muted}> · from an SEO audit</span>}</td>
              <td style={cell}>{k.search_volume ?? '-'}</td>
              <td style={cell}>{k.difficulty ?? '-'}</td>
              <td style={cell}>{k.intent ?? '-'}</td>
              <td style={cell}><Position now={k.position} prev={k.prev_position} /></td>
              <td style={cell}>{k.score ?? '-'}</td>
              <td style={{ ...cell, whiteSpace: 'nowrap' }}>{actions && <div style={{ display: 'flex', gap: '6px' }}>{actions(k)}</div>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Lower is better, so a smaller number is a move up.
function Position({ now, prev }) {
  if (now == null) return <span style={muted}>not ranking</span>;
  const diff = prev == null ? 0 : Math.round((prev - now) * 10) / 10;
  return (
    <span>
      #{now}
      {diff !== 0 && <span style={{ color: diff > 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}> {diff > 0 ? '▲' : '▼'}{Math.abs(diff)}</span>}
    </span>
  );
}
