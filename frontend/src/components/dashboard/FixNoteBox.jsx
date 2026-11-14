import React, { useState } from 'react';
import { Moon } from 'lucide-react';
import { muted } from './blogMonitorShared.js';

// Same limit as FIX_NOTE_MAX in src/services/seoNight.js.
export const FIX_NOTE_MAX = 1000;

/**
 * What opens under an item when 007 presses "Fix tonight": an optional note on
 * how the change should be made, which the night worker follows (it outranks
 * the recommendation's wording). Empty is fine: that's the old one-click approve.
 * Ctrl/Cmd+Enter confirms, Esc cancels.
 */
export default function FixNoteBox({ confirmLabel = 'Fix tonight', disabled, onConfirm, onCancel }) {
  const [note, setNote] = useState('');
  const tooLong = note.trim().length > FIX_NOTE_MAX;
  const confirm = () => { if (!disabled && !tooLong) onConfirm(note.trim()); };

  return (
    <div style={{ flexBasis: '100%', width: '100%', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <textarea
        autoFocus
        aria-label="Instructions for the night worker"
        value={note}
        onChange={e => setNote(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) confirm();
        }}
        placeholder={'How should it be done? (optional)\ne.g. "use the Bengaluru address from the footer" or "keep the hero headline as it is"'}
        rows={3}
        style={{
          width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '8px 10px', fontSize: '0.85rem', fontFamily: 'inherit',
          border: `1px solid ${tooLong ? '#f87171' : 'rgba(223, 231, 224, 0.18)'}`, borderRadius: '6px',
          background: 'rgba(5, 7, 10, 0.85)', color: 'var(--text-primary)',
        }}
      />
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={disabled || tooLong} onClick={confirm}><Moon size={14} /> {confirmLabel}</button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <span style={{ ...muted, color: tooLong ? '#f87171' : muted.color }}>
          {tooLong ? `${note.trim().length} / ${FIX_NOTE_MAX} characters` : 'The night worker follows this; the fix still waits for Deploy.'}
        </span>
      </div>
    </div>
  );
}

/** The note 007 gave with "Fix tonight", shown wherever the item appears afterwards. */
export function FixNote({ note }) {
  if (!note) return null;
  return (
    <div style={{ fontSize: '0.8rem', marginTop: '4px', padding: '6px 8px', borderLeft: '2px solid #a78bfa', background: 'rgba(167, 139, 250, 0.08)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      <span style={{ fontWeight: 700, color: '#c4b5fd' }}>Your note: </span>{note}
    </div>
  );
}
