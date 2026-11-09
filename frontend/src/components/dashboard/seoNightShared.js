/** "2026-11-08" (a night) → "08/11/2026". Anything else passes through unchanged. */
export const ddmmyyyy = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd;
};

/** Labels for a night fix batch, shared by the SEO Monitor's Last night panel and its drawer. */
export const BATCH_LABEL = {
  queued: 'Fixes queued', running: 'Fixing…', ready: 'Ready to deploy', empty: 'No fixes', failed: 'Fixes failed',
  deploy_queued: 'Deploy queued', deploying: 'Deploying…', live: 'Live ✓', rolled_back: 'Rolled back', deploy_failed: 'Deploy failed', discarded: 'Discarded',
};
export const BATCH_COLOR = {
  ready: '#4ade80', live: '#4ade80', running: '#a5b4fc', queued: '#a5b4fc', deploy_queued: '#a5b4fc', deploying: '#a5b4fc',
  failed: '#f87171', rolled_back: '#facc15', deploy_failed: '#f87171', empty: 'var(--text-muted)', discarded: 'var(--text-muted)',
};
