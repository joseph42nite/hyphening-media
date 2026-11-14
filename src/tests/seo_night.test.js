import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db from '../../database.js';
import * as night from '../services/seoNight.js';
import { setMode, getMode } from '../services/automationMode.js';
import seoNightRouter from '../routes/seoNight.js';
import { unavailableReason } from '../routes/seo.js';

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
    INSERT INTO crm_clients (name, client_type, is_active, seo_enabled, website_url, repo_path, contact_phone, is_ecommerce)
    VALUES (?, 'marketing', 1, 1, 'https://example.test/', ?, ?, ?)
  `).run(`Night client ${Math.random()}`, overrides.repo === undefined ? '/tmp/example-repo' : overrides.repo,
    overrides.phone === undefined ? '+91 90000 00000' : overrides.phone, overrides.ecommerce ? 1 : 0).lastInsertRowid;
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

  it('queues every skill past its cadence, most overdue first; on-demand and fresh ones wait', () => {
    setMode('seo', 'auto');
    const id = makeClient();
    // Fresh technical audit: not due. A 40-day-old content audit (30-day cadence): due.
    audit(id, 'technical', 1);
    audit(id, 'content', 40);
    const due = night.dueSkills(id);
    const types = due.map(d => d.audit_type);
    expect(types).not.toContain('technical');
    expect(types).toContain('content');
    // The Full card was removed (migration 113).
    expect(types).not.toContain('full');
    // Cards on cadence that used to be skipped at night now run when due.
    for (const t of ['flow', 'backlinks']) expect(types).toContain(t);
    // 9999 = on demand: never queued.
    const onDemand = db.prepare('SELECT audit_type FROM agent_run_config WHERE stale_after_days >= 9999').all().map(r => r.audit_type);
    for (const t of onDemand) expect(types).not.toContain(t);
    // Blocked cards (no data source) stay out, the same as their Run button.
    for (const t of types) expect(unavailableReason(t, id)).toBeNull();

    const r = night.queueNightAudits({ by: 'Tanner', clientId: id });
    expect(r.queued.map(q => q.agent_type).sort()).toEqual([...types].sort());
    const runs = db.prepare("SELECT requested_by FROM seo_agent_runs WHERE client_id = ? AND status = 'queued'").all(id);
    expect(runs.every(x => x.requested_by === 'night:Tanner')).toBe(true);
    // Already in flight: not queued twice.
    expect(night.dueSkills(id)).toEqual([]);
  });
});

describe('disabled cards are never run at night', () => {
  it('e-commerce only for e-commerce clients; local only with a phone on file', () => {
    setMode('seo', 'auto');
    const shop = makeClient({ ecommerce: true });
    const agency = makeClient({ phone: null });
    expect(unavailableReason('ecommerce', agency)).toMatch(/Not an e-commerce client/);
    expect(unavailableReason('ecommerce', shop)).toBeNull();
    expect(unavailableReason('local', agency)).toMatch(/contact phone/);
    expect(unavailableReason('local', shop)).toBeNull();
    const agencyDue = night.dueSkills(agency).map(d => d.audit_type);
    expect(agencyDue).not.toContain('ecommerce');
    expect(agencyDue).not.toContain('local');
    expect(night.dueSkills(shop).map(d => d.audit_type)).toContain('ecommerce');
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
    recs = [rec(clientId, a, { metric: 'Meta description' }), rec(clientId, a, { metric: 'Rewrite hero copy' }), rec(clientId, a, { metric: 'GA4 filter' }), rec(clientId, a, { metric: 'Alt text' }), rec(clientId, a, { metric: 'Canonical tag' })];
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
      { id: recs[4], triage: 'already_done', reason: 'index.html already has a canonical link' },
    ] });
    expect(r.success).toBe(true);
    const st = (id) => db.prepare('SELECT status, fix_triage FROM seo_recommendations WHERE id = ?').get(id);
    expect(st(recs[1])).toEqual({ status: 'needs_007', fix_triage: 'needs_007' });
    expect(st(recs[2])).toEqual({ status: 'open', fix_triage: 'not_code' });
    expect(st(recs[4])).toEqual({ status: 'completed', fix_triage: 'already_done' });
  });

  it('stores the fixes and shows them in the morning report', () => {
    night.submitSeoFixBatch({ batch_id: batchId, status: 'ready', branch: 'seo/night-x', base_commit: 'abc', fixes: [
      { rec_id: recs[0], ok: true, commit: 'c0ffee', summary: 'meta 180 → 150 chars', diff: '+<meta>' },
      { rec_id: recs[3], ok: false, error: 'build failed' },
    ] });
    const batch = db.prepare('SELECT * FROM seo_fix_batches WHERE id = ?').get(batchId);
    expect(batch.status).toBe('ready');
    expect(batch.summary).toMatch(/1 fix\(es\) ready · 1 failed · 1 already done · 1 need you/);

    const row = night.nightReport().clients.find(c => c.client_id === clientId);
    expect(row.fixes.map(f => f.id)).toEqual([recs[0]]);
    expect(row.failed.map(f => f.id)).toEqual([recs[3]]);
    expect(row.needs_007.map(f => f.id)).toEqual([recs[1]]);
    expect(row.already_done.map(f => f.id)).toEqual([recs[4]]);
    expect(row.already_done[0].fix_reason).toMatch(/canonical/);
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

describe('retry after a deploy that failed before pushing', () => {
  it('keeps the fixes ready, offers Retry deploy, and holds back tonight\'s batch', () => {
    setMode('seo', 'auto');
    const id = makeClient();
    const a = audit(id, 'technical', 1);
    const r1 = rec(id, a, { metric: 'Title' });
    const b = night.queueSeoFixes({ clientId: id }).queued[0].batch_id;
    night.claimSeoFixBatches('test');
    night.submitSeoFixBatch({ batch_id: b, status: 'ready', branch: 'seo/z', base_commit: 'a', fixes: [{ rec_id: r1, ok: true, commit: 'abc1', summary: 's' }] });
    night.requestDeploy(b, {});
    night.claimSeoDeploys('test');
    night.finishSeoDeploy({ batch_id: b, status: 'deploy_failed', pushed: false, error: 'check failed: vite: command not found' });

    expect(db.prepare('SELECT status FROM seo_recommendations WHERE id = ?').get(r1).status).toBe('ready_to_deploy');
    const row = night.nightReport().clients.find(c => c.client_id === id);
    expect(row.retryable).toBe(true);
    rec(id, a, { metric: 'Something new' });
    expect(night.queueSeoFixes({ clientId: id }).skipped[0].reason).toMatch(/waiting for Deploy or Discard/);
    expect(night.requestDeploy(b, {}).status).toBe(200);
    // The retry clears the error but keeps why the last attempt failed.
    expect(db.prepare('SELECT error, previous_error FROM seo_fix_batches WHERE id = ?').get(b))
      .toEqual({ error: null, previous_error: 'check failed: vite: command not found' });

    // Failing after the push is different: those fixes are done for.
    night.claimSeoDeploys('test');
    night.finishSeoDeploy({ batch_id: b, status: 'deploy_failed', pushed: true, error: 'ROLLBACK PUSH FAILED' });
    expect(db.prepare('SELECT status FROM seo_recommendations WHERE id = ?').get(r1).status).toBe('fix_failed');
    expect(night.nightReport().clients.find(c => c.client_id === id).retryable).toBe(false);
  });
});

describe('fixes wait for the night audits', () => {
  it('a batch is not claimed while the client has skills queued or running', () => {
    setMode('seo', 'auto');
    const id = makeClient();
    const a = audit(id, 'technical', 1);
    rec(id, a);
    const run = night.queueNightAudits({ clientId: id }).queued[0];
    const b = night.queueSeoFixes({ clientId: id }).queued[0].batch_id;
    expect(night.claimSeoFixBatches('test').map(x => x.batch_id)).not.toContain(b);
    db.prepare("UPDATE seo_agent_runs SET status = 'completed' WHERE client_id = ?").run(id);
    expect(night.claimSeoFixBatches('test').map(x => x.batch_id)).toContain(b);
    expect(run).toBeTruthy();
  });
});

describe('summary for the bots', () => {
  it('reads as one line per client', () => {
    expect(night.nightSummaryText()).toMatch(/^SEO fleet: (auto|manual)\. Fixes ready/);
  });
});

describe('ads website-code findings share the client\'s fix batch', () => {
  it('queues, sorts, fixes, deploys and reports ads findings next to SEO ones', () => {
    const savedAds = getMode('ads');
    setMode('seo', 'manual');
    setMode('ads', 'auto');
    try {
      const id = makeClient();
      db.prepare('UPDATE crm_clients SET seo_enabled = 0, ads_enabled = 1 WHERE id = ?').run(id);
      const adsAudit = db.prepare("INSERT INTO ads_audits (client_id, agent_type, period_month) VALUES (?, 'landing', '2026-11')").run(id).lastInsertRowid;
      const adsRec = (kind, metric) => db.prepare(`
        INSERT INTO ads_recommendations (audit_id, client_id, priority, metric, issue, action_required, kind)
        VALUES (?, ?, 'High', ?, 'issue', 'do it', ?)`).run(adsAudit, id, metric, kind).lastInsertRowid;
      const site = adsRec('site_code', 'Form attribution');
      const unsorted = adsRec(null, 'Landing speed');
      adsRec('ad_account', 'Broad match waste');

      // SEO is on Manual and off for the client; the ads fleet alone queues it.
      const q = night.queueSeoFixes({ clientId: id });
      expect(q.queued[0].candidates).toBe(2);
      const job = night.claimSeoFixBatches('test').find(x => x.batch_id === q.queued[0].batch_id);
      expect(job.candidates.map(c => c.id).sort()).toEqual([`ads-${site}`, `ads-${unsorted}`].sort());
      expect(job.candidates.every(c => c.fleet === 'ads' && c.audit_type === 'ads landing')).toBe(true);
      expect(job.client).not.toHaveProperty('ads_enabled');

      night.submitSeoTriage({ batch_id: job.batch_id, results: [
        { id: `ads-${site}`, triage: 'safe', reason: 'hidden page_url field' },
        { id: `ads-${unsorted}`, triage: 'not_code', reason: 'hosting' },
      ] });
      expect(db.prepare('SELECT status, fix_triage FROM ads_recommendations WHERE id = ?').get(unsorted)).toEqual({ status: 'open', fix_triage: 'not_code' });

      night.submitSeoFixBatch({ batch_id: job.batch_id, status: 'ready', branch: 'seo/a', base_commit: 'a', fixes: [{ rec_id: `ads-${site}`, ok: true, commit: 'c0de', summary: 'adds page_url' }] });
      const row = night.nightReport().clients.find(c => c.client_id === id);
      expect(row.ads_enabled).toBe(true);
      expect(row.fixes).toEqual([expect.objectContaining({ id: `ads-${site}`, fleet: 'ads', status: 'ready_to_deploy' })]);

      night.requestDeploy(job.batch_id, {});
      const d = night.claimSeoDeploys('test').find(x => x.batch_id === job.batch_id);
      expect(d.commits).toEqual([{ rec_id: `ads-${site}`, commit_sha: 'c0de', metric: 'Form attribution' }]);
      night.finishSeoDeploy({ batch_id: job.batch_id, status: 'live', live_commit: 'l' });
      expect(db.prepare('SELECT status FROM ads_recommendations WHERE id = ?').get(site).status).toBe('completed');

      expect(night.ignoreRecommendation(`ads-${unsorted}`).status).toBe(200);
      expect(db.prepare('SELECT status FROM ads_recommendations WHERE id = ?').get(unsorted).status).toBe('ignored');
    } finally {
      setMode('ads', savedAds);
    }
  });

  it('keeps ads and SEO ids apart', () => {
    expect(night.parseRecKey('ads-7')).toMatchObject({ fleet: 'ads', id: 7 });
    expect(night.parseRecKey(7)).toMatchObject({ fleet: 'seo', id: 7 });
    expect(night.parseRecKey('7')).toMatchObject({ fleet: 'seo', id: 7 });
    expect(night.parseRecKey('ads-x')).toBeNull();
  });
});

describe('how much one night sorts', () => {
  it('hands over up to TRIAGE_LIMIT findings, most urgent first, and still fixes at most 8', () => {
    setMode('seo', 'auto');
    const clientId = makeClient();
    const a = audit(clientId, 'plan', 1);
    const low = Array.from({ length: night.TRIAGE_LIMIT + 5 }, () => rec(clientId, a, { priority: 'Low' }));
    const critical = rec(clientId, a, { priority: 'Critical' });

    const batchId = night.queueSeoFixes({ clientId }).queued[0].batch_id;
    const claimed = night.claimSeoFixBatches('test').find(b => b.batch_id === batchId);

    expect(night.TRIAGE_LIMIT).toBe(100);
    expect(claimed.candidates).toHaveLength(night.TRIAGE_LIMIT);
    expect(claimed.candidates[0].id).toBe(critical);
    expect(low.length).toBeGreaterThan(night.TRIAGE_LIMIT);
    expect(claimed.max_fixes).toBe(night.NIGHT_FIXES_PER_CLIENT);
    expect(night.NIGHT_FIXES_PER_CLIENT).toBe(8);
  });
});

describe('safe findings past a night\'s cap', () => {
  it('are picked up again the next night', () => {
    setMode('seo', 'auto');
    const clientId = makeClient();
    const a = audit(clientId, 'schema', 1);
    const r = rec(clientId, a, { metric: 'Favicon 404' });

    const first = night.queueSeoFixes({ clientId }).queued[0].batch_id;
    night.claimSeoFixBatches('test');
    night.submitSeoTriage({ batch_id: first, results: [{ id: r, triage: 'safe', reason: 'add favicon.ico' }] });
    // The 8 fixes went to other findings: this one was sorted safe but not attempted.
    night.submitSeoFixBatch({ batch_id: first, status: 'empty', fixes: [] });
    expect(db.prepare('SELECT status, fix_triage FROM seo_recommendations WHERE id = ?').get(r)).toEqual({ status: 'open', fix_triage: 'safe' });

    const next = night.queueSeoFixes({ clientId });
    expect(next.queued).toHaveLength(1);
    const claimed = night.claimSeoFixBatches('test').find(b => b.batch_id === next.queued[0].batch_id);
    expect(claimed.candidates.map(c => c.id)).toEqual([r]);
  });
});

describe('a fix that changed nothing', () => {
  it('is closed as already done, or handed to 007, not counted as failed', () => {
    setMode('seo', 'auto');
    const clientId = makeClient();
    const a = audit(clientId, 'plan', 1);
    const [done, blocked, approved, broke] = [rec(clientId, a), rec(clientId, a), rec(clientId, a), rec(clientId, a)];
    db.prepare('UPDATE seo_recommendations SET fix_approved = 1 WHERE id = ?').run(approved);

    const batchId = night.queueSeoFixes({ clientId }).queued[0].batch_id;
    night.claimSeoFixBatches('test');
    night.submitSeoTriage({ batch_id: batchId, results: [done, blocked, approved, broke].map(id => ({ id, triage: 'safe', reason: 'x' })) });
    night.submitSeoFixBatch({ batch_id: batchId, status: 'empty', fixes: [
      { rec_id: done, ok: false, no_change: 'already_done', summary: 'the /capabilities pages already exist', error: 'No change made: ...' },
      { rec_id: blocked, ok: false, no_change: 'blocked', summary: 'needs the React components', error: 'No change made: ...' },
      // 007 asked for it and it still couldn't be done: that is a failure he should see.
      { rec_id: approved, ok: false, no_change: 'blocked', summary: 'needs facts we do not have', error: 'No change made: ...' },
      { rec_id: broke, ok: false, error: '"npm run build" failed' },
    ] });

    const st = (id) => db.prepare('SELECT status, fix_triage, fix_reason FROM seo_recommendations WHERE id = ?').get(id);
    expect(st(done)).toEqual({ status: 'completed', fix_triage: 'already_done', fix_reason: 'the /capabilities pages already exist' });
    expect(st(blocked)).toEqual({ status: 'needs_007', fix_triage: 'needs_007', fix_reason: 'needs the React components' });
    expect(st(approved).status).toBe('fix_failed');
    expect(st(broke).status).toBe('fix_failed');
    const batch = db.prepare('SELECT status, summary FROM seo_fix_batches WHERE id = ?').get(batchId);
    expect(batch.status).toBe('empty');
    expect(batch.summary).toBe('0 fix(es) ready · 2 failed · 1 already done · 1 need you');
  });
});

describe('Fix tonight with a note', () => {
  it('stores the note, hands it to the worker, and shows it while it waits', () => {
    setMode('seo', 'auto');
    const clientId = makeClient();
    const a = audit(clientId, 'local', 1);
    const r = rec(clientId, a, { metric: 'LocalBusiness schema' });
    db.prepare("UPDATE seo_recommendations SET status = 'needs_007', fix_triage = 'needs_007' WHERE id = ?").run(r);

    const res = night.approveFixTonight(r, { email: 'jo@test' }, { note: '  Use the Bengaluru address from the footer.  ' });
    expect(res).toEqual({ status: 200, note: 'Use the Bengaluru address from the footer.' });
    expect(db.prepare('SELECT status, fix_approved, fix_note FROM seo_recommendations WHERE id = ?').get(r))
      .toEqual({ status: 'open', fix_approved: 1, fix_note: 'Use the Bengaluru address from the footer.' });

    const row = night.nightReport().clients.find(c => c.client_id === clientId);
    expect(row.approved_for_tonight).toBe(1);
    expect(row.tonight.map(t => [t.id, t.fix_note])).toEqual([[r, 'Use the Bengaluru address from the footer.']]);

    const batchId = night.queueSeoFixes({ clientId }).queued[0].batch_id;
    const claimed = night.claimSeoFixBatches('test').find(b => b.batch_id === batchId);
    expect(claimed.candidates[0]).toMatchObject({ id: r, fix_approved: 1, fix_note: 'Use the Bengaluru address from the footer.' });
  });

  it('works without a note, clears an old one on retry, and refuses one that is too long', () => {
    const clientId = makeClient();
    const r = rec(clientId, audit(clientId, 'local', 1));
    db.prepare("UPDATE seo_recommendations SET status = 'fix_failed', fix_note = 'old note' WHERE id = ?").run(r);
    expect(night.approveFixTonight(r, { email: 'jo@test' }).status).toBe(200);
    expect(db.prepare('SELECT fix_note FROM seo_recommendations WHERE id = ?').get(r).fix_note).toBeNull();

    db.prepare("UPDATE seo_recommendations SET status = 'needs_007', fix_approved = 0 WHERE id = ?").run(r);
    expect(night.approveFixTonight(r, {}, { note: 'x'.repeat(night.FIX_NOTE_MAX + 1) }).status).toBe(400);
    expect(night.approveFixTonight(r, {}, { note: 42 }).status).toBe(400);
    expect(db.prepare('SELECT status FROM seo_recommendations WHERE id = ?').get(r).status).toBe('needs_007');
  });
});
