import { API_BASE } from '../../api.js';

/** Labels, styles and the fetch helper shared by the Blog Monitor's parts. Server side: src/routes/blogRuns.js. */
export const STATUS_LABEL = {
  queued: 'Queued', running: 'Writing…', client_review: 'With client', ready: 'Ready',
  approved: 'Approved', published: 'Published', rejected: 'Rejected', failed: 'Failed',
};
export const STATUS_COLOR = {
  ready: '#4ade80', client_review: '#facc15', approved: '#60a5fa', published: '#4ade80',
  failed: '#f87171', rejected: '#f87171', running: '#a5b4fc', queued: '#a5b4fc',
};
export const REC_COLOR = { approve: '#4ade80', reject: '#f87171', needs_007: '#facc15' };
export const REC_LABEL = { approve: 'approve', reject: 'reject', needs_007: 'your call' };

export const card = { background: 'var(--bg-card)', border: '2px solid var(--border-color)', borderRadius: '12px', padding: '16px', marginBottom: '20px' };
export const muted = { color: 'var(--text-muted)', fontSize: '0.8rem' };
export const label = { fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase' };

export async function api(pathname, options = {}) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    credentials: 'include',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/**
 * What 007 must look at before approving: the worker's problems, plus
 * missing narration when the client has audio on. The worker's notes on how
 * it worked (evidence.worker_notes) are kept apart and never counted.
 */
export function problemsOf(run) {
  const list = [...(run.blockers || [])];
  if (run.audio_expected && run.content && !run.audio_url) list.push('no audio, though this client has audio on');
  return list;
}
