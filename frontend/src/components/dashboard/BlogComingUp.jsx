import React from 'react';
import { Play, SkipForward } from 'lucide-react';
import { card, muted, label } from './blogMonitorShared.js';

/** Every Blog-on client's next topic, and whether tonight's start drafts it. From GET /api/blog-runs/outlook. */
export default function BlogComingUp({ outlook, busy, onDraftNow, onSkipTopic }) {
  return (
    <div style={card}>
      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase' }}>Coming up</h3>
      <span style={muted}>The next planned topic per client. When Blog is on Auto, Leiter's 01:00 start drafts the ones marked Tonight.</span>
      {outlook.length === 0 ? <p style={{ ...muted, marginTop: '12px' }}>No client has Blog on.</p> : outlook.map(c => (
        <div key={c.client_id} style={{ borderTop: '1px solid var(--border-color)', padding: '10px 0', marginTop: '8px', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 360px', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ ...label, color: c.tonight ? '#4ade80' : 'var(--text-muted)' }}>{c.tonight ? 'Tonight' : c.blocked}</span>
              <span style={{ ...muted, fontWeight: 700 }}>{c.client_name}</span>
              <span style={muted}>· {c.used_this_month}/{c.posts_per_month} this month · {c.planned_count} planned{c.audio ? ' · audio' : ''}</span>
            </div>
            <div style={{ fontWeight: 600, marginTop: '4px', overflowWrap: 'anywhere' }}>
              {c.next_topic ? c.next_topic.topic : <span style={muted}>Nothing planned. Add topics in the Topics tab or ask Vesper for a calendar.</span>}
              {c.next_topic?.planned_for && <span style={muted}> · {c.next_topic.planned_for}</span>}
            </div>
          </div>
          {c.next_topic && (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn btn-secondary" disabled={busy === `t${c.next_topic.id}`} onClick={() => onSkipTopic(c.next_topic)} title="Skip this topic"><SkipForward size={14} /></button>
              <button className="btn btn-secondary" disabled={busy === `d${c.client_id}`} onClick={() => onDraftNow(c)} title="Draft it now, whatever the Blog switch says"><Play size={14} /> Draft now</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
