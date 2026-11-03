import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db from '../../database.js';
import * as night from '../services/seoNight.js';
import { setMode, getMode } from '../services/automationMode.js';
import seoNightRouter from '../routes/seoNight.js';

// Everything runs inside one transaction rolled back at the end, so the local
// database the dashboard reads is left as it was. Real queued runs are parked
// inside it so only this file's runs count.
let savedMode;
beforeAll(() => {
  savedMode = getMode('seo');
  db.exec('BEGIN');
  db.prepare("UPDATE seo_agent_runs SET status = 'failed' WHERE status IN ('queued', 'running')").run();
  db.prepare("UPDATE seo_fix_batches SET status = 'discarded' WHERE status IN ('queued', 'running', 'ready', 'deploy_queued', 'deploying')").run();
  db.prepare('UPDATE crm_clients SET seo_enabled = 0').run();
});
afterAll(() => {
  db.exec('ROLLBACK');
  setMode('seo', savedMode);
});

function makeClient(overrides = {}) {
  return db.prepare(`
    INSERT INTO crm_clients (name, client_type, is_active, seo_enabled, website_url, repo_path)
    VALUES (?, 'marketing', 1, 1, 'https://example.test/', ?)
  `).run(`Night client ${Math.random()}`, overrides.repo === undefined ? '/tmp/example-repo' : overrides.repo).lastInsertRowid;
}

function audit(clientId, type, daysAgo, score = 60) {
  return db.prepare(`
    INSERT INTO seo_audits (client_id, audit_type, url, health_score, created_at) VALUES (?, ?, 'https://example.test/', ?, datetime('now', ?))
  `).run(clientId, type, score, `-${daysAgo} days`).lastInsertRowid;
}

function rec(clientId, auditId, overrides = {}) {
  return db.prepare(`
    INSERT INTO seo_recommendations (audit_id, client_id, priority, metric, issue, action_required, status)
    VALUES (?, ?, ?, ?, 'issue', 'do it', 'open')
  `).run(auditId, clientId, overrides.priority || 'High', overrides.metric || 'Meta description').lastInsertRowid;
}

describe('router', () => {
  it('authenticates every route', () => {
    expect(seoNightRouter.stack.map(l => l.name)).toContain('authenticate');
  });
});

describe('night audits', () => {
  it('does nothing on Manual', () => {
    setMode('seo', 'manual');
    makeClient();
    const r = night.queueNightAudits();
    expect(r.queued).toEqual([]);
    expect(r.skipped[0].reason).toMatch(/Manual/);
  });

  it('queues at most 3 overdue skills per client, never the skipped ones, most overdue first', () => {
    setMode('seo', 'auto');
    const id = makeClient();
    // Fresh technical audit: not due. Everything else has never run.
    audit(id, 'technical', 1);
    const due = night.dueSkills(id).map(d => d.audit_type);
    expect(due).not.toContain('technical');
    for (const skip of ['full', 'flow', 'backlinks', 'backlink_gap', 'dataforseo', 'maps']) expect(due).not.toContain(skip);

    const r = night.queueNightAudits({ by: 'Tanner', clientId: id });
    expect(r.queued).toHaveLength(night.NIGHT_SKILLS_PER_CLIENT);
    const runs = db.prepare("SELECT requested_by FROM seo_agent_runs WHERE client_id = ? AND status = 'queued'").all(id);
    expect(runs.every(x => x.requested_by === 'night:Tanner')).toBe(true);
    // Already in flight: not queued twice.
    expect(night.dueSkills(id).map(d => d.audit_type)).not.toContain(r.queued[0].agent_type);
  });
});

describe('fix batches, from queue to deploy', () => {
  let clientId;
  let batchId;
  let recs;

  it('needs a site repo and something new to look at', () => {
    setMode('seo', 'auto');
    const noRepo = makeClient({ repo: null });
    expect(night.queueSeoFixes({ clientId: noRepo }).skipped[0].reason).toMatch(/no site repo/);
    clientId = makeClient();
    expect(night.queueSeoFixes({ clientId }).skipped[0].reason).toMatch(/no new recommendations/);
  });

  it('queues one batch, and the worker claims it with the candidates', () => {
    const a = audit(clientId, 'technical', 2);
    recs = [rec(clientId, a, { metric: 'Meta description' }), rec(clientId, a, { metric: 'Rewrite hero copy' }), rec(clientId, a, { metric: 'GA4 filter' }), rec(clientId, a, { metric: 'Alt text' })];
    const q = night.queueSeoFixes({ clientId, by: 'Boothroyd' });
    expect(q.queued).toHaveLength(1);
    batchId = q.queued[0].batch_id;
    // A second start the same night finds the batch already there.
    expect(night.queueSeoFixes({ clientId }).skipped[0].reason).toMatch(/already queued/);

    const claimed = night.claimSeoFixBatches('test').find(b => b.batch_id === batchId);
    expect(claimed.candidates.map(c => c.id).sort()).toEqual([...recs].sort());
    expect(claimed.client.repo_path).toBe('/tmp/example-repo');
  });

  it('records the sort: needs_007 leaves the open list, not_code stays open', () => {
    const r = night.submitSeoTriage({ batch_id: batchId, results: [
      { id: recs[0], triage: 'safe', reason: 'meta tag' },
      { id: recs[1], triage: 'needs_007', reason: 'copy change' },
      { id: recs[2], triage: 'not_code', reason: 'analytics setting' },
      { id: recs[3], triage: 'safe', reason: 'alt text' },
    ] });
    expect(r.success).toBe(true);
    const st = (id) => db.prepare('SELECT status, fix_triage FROM seo_recommendations WHERE id = ?').get(id);
    expect(st(recs[1])).toEqual({ status: 'needs_007', fix_triage: 'needs_007' });
    expect(st(recs[2])).toEqual({ status: 'open', fix_triage: 'not_code' });
  });

  it('stores the fixes and shows them in the morning report', () => {
    night.submitSeoFixBatch({ batch_id: batchId, status: 'ready', branch: 'seo/night-x', base_commit: 'abc', fixes: [
      { rec_id: recs[0], ok: true, commit: 'c0ffee', summary: 'meta 180 → 150 chars', diff: '+<meta>' },
      { rec_id: recs[3], ok: false, error: 'build failed' },
    ] });
    const batch = db.prepare('SELECT * FROM seo_fix_batches WHERE id = ?').get(batchId);
    expect(batch.status).toBe('ready');
    expect(batch.summary).toMatch(/1 fix\(es\) ready · 1 failed · 1 need you/);

    const row = night.nightReport().clients.find(c => c.client_id === clientId);
    expect(row.fixes.map(f => f.id)).toEqual([recs[0]]);
    expect(row.failed.map(f => f.id)).toEqual([recs[3]]);
    expect(row.needs_007.map(f => f.id)).toEqual([recs[1]]);
    // Tonight's queue skips a client whose fixes are waiting for Deploy.
    expect(night.queueSeoFixes({ clientId }).skipped[0].reason).toMatch(/waiting for Deploy or Discard/);
  });

  it('Deploy → live marks the fixes completed', () => {
    expect(night.requestDeploy(batchId, { email: 'jo@test' }).status).toBe(200);
    expect(night.requestDeploy(batchId, { email: 'jo@test' }).status).toBe(409);
    const d = night.claimSeoDeploys('test').find(x => x.batch_id === batchId);
    expect(d.commits).toEqual([{ rec_id: recs[0], commit_sha: 'c0ffee', metric: 'Meta description' }]);
    night.finishSeoDeploy({ batch_id: batchId, status: 'live', live_commit: 'live1', log: 'ok' });
    expect(db.prepare('SELECT status FROM seo_recommendations WHERE id = ?').get(recs[0]).status).toBe('completed');
    expect(db.prepare('SELECT status, live_commit FROM seo_fix_batches WHERE id = ?').get(batchId)).toEqual({ status: 'live', live_commit: 'live1' });
  });

  it('a rolled-back deploy marks the fixes failed with the reason', () => {
    const a = audit(clientId, 'schema', 1);
    const r1 = rec(clientId, a, { metric: 'Schema' });
    const b = night.queueSeoFixes({ clientId }).queued[0].batch_id;
    night.claimSeoFixBatches('test');
    night.submitSeoFixBatch({ batch_id: b, status: 'ready', branch: 'seo/x', base_commit: 'a', fixes: [{ rec_id: r1, ok: true, commit: 'beef', summary: 's' }] });
    night.requestDeploy(b, {});
    night.claimSeoDeploys('test');
    night.finishSeoDeploy({ batch_id: b, status: 'rolled_back', error: 'health check failed: / → 500' });
    const r = db.prepare('SELECT status, fix_error FROM seo_recommendations WHERE id = ?').get(r1);
    expect(r.status).toBe('fix_failed');
    expect(r.fix_error).toMatch(/rolled back: health check failed/);
  });

  it('Discard moves the fixes to needs-you; Fix tonight and Ignore work on one item', () => {
    const a = audit(clientId, 'content', 1);
    const r1 = rec(clientId, a, { metric: 'Canonical' });
    const b = night.queueSeoFixes({ clientId }).queued[0].batch_id;
    night.claimSeoFixBatches('test');
    night.submitSeoFixBatch({ batch_id: b, status: 'ready', branch: 'seo/y', base_commit: 'a', fixes: [{ rec_id: r1, ok: true, commit: 'f00d', summary: 's' }] });
    expect(night.discardBatch(b, { email: 'jo@test' }).status).toBe(200);
    let r = db.prepare('SELECT status, fix_reason FROM seo_recommendations WHERE id = ?').get(r1);
    expect(r.status).toBe('needs_007');
    expect(r.fix_reason).toMatch(/Discarded by jo@test/);

    night.approveFixTonight(r1, { email: 'jo@test' });
    r = db.prepare('SELECT status, fix_approved, fix_triage FROM seo_recommendations WHERE id = ?').get(r1);
    expect(r).toEqual({ status: 'open', fix_approved: 1, fix_triage: 'safe' });
    night.ignoreRecommendation(recs[1]);
    expect(db.prepare('SELECT status FROM seo_recommendations WHERE id = ?').get(recs[1]).status).toBe('ignored');
  });
});

describe('summary for the bots', () => {
  it('reads as one line per client', () => {
    expect(night.nightSummaryText()).toMatch(/^SEO fleet: (auto|manual)\. Fixes ready/);
  });
});
