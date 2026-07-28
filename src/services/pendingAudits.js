/**
 * Tracks SEO audits that have been handed off to OpenClaw but haven't
 * reported back yet. The trigger hand-off (openclaw_seo_runner.js) finishes
 * long before the actual audit does, so "completed" can't be based on that
 * process exiting — it has to wait for OpenClaw's create_seo_audit webhook.
 * This timeout is the fallback for when that webhook never arrives.
 */

const pending = new Map();
const MINUTE = 60 * 1000;
const DEFAULT_TIMEOUT_MIN = 15;

// Per-skill ceilings confirmed by OpenClaw (2026-07-28). OpenClaw's own agent
// runtime timeout is effectively unbounded (48h default), so these windows are
// purely ours — marking a run timed out only stops us waiting and frees the
// queue slot. Anything too tight would flag a live job as dead; the values
// below are OpenClaw's stated realistic ceilings per skill.
const TIMEOUT_MINUTES = new Map([
  // Heavy external API calls (DataForSEO, backlink providers, image generation)
  ['backlinks', 45],
  ['dataforseo', 45],
  ['competitor_pages', 45],
  ['image_gen', 45],
  ['maps', 45],
  // Topic modeling
  ['cluster', 30],
  // Research- and generation-heavy, scale with word count
  ['content', 25],
  ['content_brief', 25],
  ['sxo', 25],

  // The five skills moved from deepseek-v4-flash to Nemotron 3 Ultra (free).
  // Nemotron is a reasoning model: it spends longer thinking before emitting,
  // so these windows are wider than the work itself would suggest. Numbers
  // confirmed by OpenClaw (2026-07-28) and assume sequential execution — a
  // Master Audit fires one skill at a time, so no queueing is added on top.
  ['technical', 35],
  ['schema', 25],
  ['images', 25],
  ['sitemap', 20],
  ['hreflang', 20],
]);

function key(clientId, agentType) {
  return `${clientId}:${agentType}`;
}

/** How long this skill is allowed to run before we give up on its webhook. */
export function timeoutMsFor(agentType) {
  return (TIMEOUT_MINUTES.get(agentType) ?? DEFAULT_TIMEOUT_MIN) * MINUTE;
}

// overrideMs is used when re-arming a timer after a server restart, where the
// run has already burned part of its window and only the remainder is left.
export function registerPendingAudit(clientId, agentType, onTimeout, overrideMs = null) {
  const k = key(clientId, agentType);
  clearPendingAudit(clientId, agentType);
  const timeoutMs = overrideMs ?? timeoutMsFor(agentType);
  const handle = setTimeout(() => {
    pending.delete(k);
    onTimeout();
  }, timeoutMs);
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
