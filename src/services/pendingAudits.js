/**
 * Tracks SEO audits that have been handed off to OpenClaw but haven't
 * reported back yet. The trigger hand-off (openclaw_seo_runner.js) finishes
 * long before the actual audit does, so "completed" can't be based on that
 * process exiting — it has to wait for OpenClaw's create_seo_audit webhook.
 * This timeout is the fallback for when that webhook never arrives.
 */

const pending = new Map();
const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

function key(clientId, agentType) {
  return `${clientId}:${agentType}`;
}

export function registerPendingAudit(clientId, agentType, onTimeout) {
  const k = key(clientId, agentType);
  clearPendingAudit(clientId, agentType);
  const handle = setTimeout(() => {
    pending.delete(k);
    onTimeout();
  }, TIMEOUT_MS);
  pending.set(k, handle);
}

export function clearPendingAudit(clientId, agentType) {
  const k = key(clientId, agentType);
  const handle = pending.get(k);
  if (handle) {
    clearTimeout(handle);
    pending.delete(k);
  }
}
