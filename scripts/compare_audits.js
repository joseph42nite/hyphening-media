/**
 * Side-by-side comparison of two audits of the same skill, for judging whether
 * one model actually produces better output than another.
 *
 * The point is NOT to decide from these numbers alone. Coverage and volume are
 * easy for a weak model to inflate — inventing ten findings scores "better"
 * than reporting three real ones. Use this to line the two reports up, then
 * spot-check the claims against the live site. Accuracy is the thing that
 * separates models on this task; everything printed here is just context.
 *
 * Usage:
 *   node scripts/compare_audits.js <clientId> <auditType>   # latest two
 *   node scripts/compare_audits.js --ids 12 15              # two specific audits
 */

import db from '../database.js';

function getAudit(id) {
  return db.prepare('SELECT * FROM seo_audits WHERE id = ?').get(id);
}

function getRecs(auditId) {
  return db.prepare(`
    SELECT priority, metric, issue, action_required, page_url, status
    FROM seo_recommendations WHERE audit_id = ? ORDER BY
      CASE priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END
  `).all(auditId);
}

// Which model produced this audit, as reported by OpenClaw at the time.
function getModel(auditId) {
  const run = db.prepare('SELECT actual_model, model FROM seo_agent_runs WHERE audit_id = ?').get(auditId);
  if (!run) return 'unknown (no run record — audit predates run tracking)';
  return run.actual_model || `${run.model} (configured; OpenClaw reported nothing)`;
}

function summarise(audit) {
  const recs = getRecs(audit.id);
  const byPriority = {};
  for (const r of recs) byPriority[r.priority] = (byPriority[r.priority] || 0) + 1;

  const pages = new Set(recs.map(r => r.page_url).filter(Boolean));
  if (audit.page_url) pages.add(audit.page_url);

  // A recommendation you cannot hand to someone is not a recommendation.
  // Crude but useful proxy: does the action name a specific target?
  const vague = recs.filter(r => (r.action_required || '').trim().length < 40).length;

  return {
    audit,
    recs,
    model: getModel(audit.id),
    score: audit.health_score ?? audit.technical_score ?? audit.on_page_score ?? null,
    total: recs.length,
    byPriority,
    pages: pages.size,
    vague
  };
}

function printSide(label, s) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${label}  —  audit #${s.audit.id}   ${s.audit.created_at}`);
  console.log('='.repeat(70));
  console.log(`  model reported : ${s.model}`);
  console.log(`  score          : ${s.score ?? '--'}`);
  console.log(`  pages covered  : ${s.pages}`);
  console.log(`  findings       : ${s.total}  ${JSON.stringify(s.byPriority)}`);
  console.log(`  thin actions   : ${s.vague} of ${s.total} under 40 chars`);
  console.log();
  for (const r of s.recs) {
    console.log(`  [${r.priority}] ${r.metric}`);
    console.log(`     page  : ${r.page_url || '(site-wide)'}`);
    console.log(`     issue : ${r.issue}`);
    console.log(`     do    : ${r.action_required}`);
    console.log();
  }
}

function main() {
  const args = process.argv.slice(2);
  let a, b;

  if (args[0] === '--ids') {
    a = getAudit(Number(args[1]));
    b = getAudit(Number(args[2]));
  } else {
    const [clientId, auditType] = args;
    if (!clientId || !auditType) {
      console.error('Usage: node scripts/compare_audits.js <clientId> <auditType>');
      console.error('   or: node scripts/compare_audits.js --ids <auditIdA> <auditIdB>');
      process.exit(1);
    }
    // id DESC breaks the tie: created_at has second resolution, and a
    // multi-URL audit writes several rows within the same second, so
    // ordering on the timestamp alone can invert "earlier" and "later".
    const rows = db.prepare(`
      SELECT * FROM seo_audits WHERE client_id = ? AND audit_type = ?
      ORDER BY created_at DESC, id DESC LIMIT 2
    `).all(clientId, auditType);
    if (rows.length < 2) {
      console.error(`Need two '${auditType}' audits for client ${clientId}; found ${rows.length}.`);
      process.exit(1);
    }
    [b, a] = rows; // b = newest, a = the one before it
  }

  if (!a || !b) {
    console.error('Could not load both audits.');
    process.exit(1);
  }

  printSide('A (earlier)', summarise(a));
  printSide('B (later)', summarise(b));

  console.log('='.repeat(70));
  console.log('HOW TO JUDGE — do this before trusting any number above:');
  console.log('='.repeat(70));
  console.log(`
  1. ACCURACY (decides it). Pick 5 findings from each and verify them
     against the live site. View source, run PageSpeed, check the header.
     Count how many are TRUE. A model that invents findings is worse no
     matter how many it produces or how confident it sounds.

  2. FALSE POSITIVES. Of the claims you checked, how many were wrong?
     One fabricated finding costs more than five missed ones — someone
     will action it.

  3. ACTIONABILITY. Could you hit "Assign to SMM" on each recommendation
     as written, with no edits? "Improve page speed" fails. "Compress
     hero.jpg, 2.3MB, on /services" passes.

  4. COHERENCE. Does the score match the findings? 91/100 alongside eight
     Critical issues means the model is not reasoning about its own output.

  5. COVERAGE. More pages is better ONLY if the findings are accurate.
     Check this last, never first.
`);
}

main();
