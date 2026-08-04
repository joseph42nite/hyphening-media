/**
 * Tracks SEO audits a worker has claimed but not yet reported on.
 *
 * A run is claimed and executed on another machine, so "completed" cannot be
 * inferred from anything happening here — it waits for the worker's
 * create_seo_audit webhook. This timeout is the fallback for when that never
 * arrives, which is what happens if the worker is killed mid-run. Without it a
 * run stays `running` for ever and holds the dedupe slot, blocking that client
 * and skill from being triggered again.
 */

const pending = new Map();
const MINUTE = 60 * 1000;

// Generous on purpose. Marking a run timed out only stops us waiting and frees
// the queue slot, so the cost of being too slow is small; the cost of being too
// tight is flagging a live job as dead and letting a second one start.
const DEFAULT_TIMEOUT_MIN = 20;

// Per-skill ceilings. A full-sitemap audit fetches every page before the model
// starts, so the window covers measurement plus analysis, not analysis alone.
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

  // Sized for the slowest model that could serve the skill, not the fastest.
  //
  // With the 'seo' agent available, a run may be served by Nemotron 3 Ultra (a
  // reasoning model, markedly slower) or fall through its chain to DeepSeek V4
  // Flash. A window that fits DeepSeek would mark a live Nemotron run as dead,
  // so these use OpenClaw's Nemotron estimates. The cost of being generous is
  // only that a genuinely stuck run holds its queue slot longer.
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
