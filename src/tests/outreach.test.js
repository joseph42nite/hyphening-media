import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db from '../../database.js';
import * as o from '../services/outreach.js';
import outreachRouter from '../routes/outreach.js';

// One transaction, rolled back at the end: the local database is left as it was.
beforeAll(() => {
  db.exec('BEGIN');
  db.prepare("UPDATE outreach_runs SET status = 'done' WHERE status IN ('queued', 'running')").run();
  db.prepare('UPDATE crm_clients SET seo_enabled = 0').run();
});
afterAll(() => db.exec('ROLLBACK'));

const admin = { id: 900001, role: 'admin', email: 'jo@test' };
let clientId;
let staffA;
let staffB;

function user(name, role = 'ops_social_media_manager') {
  return db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, 'x', ?, ?)").run(`${name}-${Math.random()}@test`, name, role).lastInsertRowid;
}

const prospect = (n, extra = {}) => ({
  kind: 'broken_link', page_url: `https://blog${n}.example/resources`, site_domain: `blog${n}.example`, dead_url: 'https://rival.example/old',
  competitor_domain: 'rival.example', domain_rank: 300 + n, our_url: 'https://client.example/guide', reason: 'Resource list in our field',
  contact_email: `editor@blog${n}.example`, email_subject: 'A dead link on your resources page', email_body: 'Hi,\n...\nThanks,', ...extra,
});

describe('router', () => {
  it('authenticates every route', () => {
    expect(outreachRouter.stack.map(l => l.name)).toContain('authenticate');
  });
});

describe('a run, from queue to prospects', () => {
  let runId;

  it('queues one run per SEO-on client, never twice', () => {
    clientId = db.prepare("INSERT INTO crm_clients (name, client_type, is_active, seo_enabled, website_url) VALUES (?, 'marketing', 1, 1, 'https://client.example/')")
      .run(`Outreach client ${Math.random()}`).lastInsertRowid;
    const q = o.queueOutreachRuns({ clientId, by: 'Boothroyd' });
    expect(q.queued).toHaveLength(1);
    runId = q.queued[0].run_id;
    expect(o.queueOutreachRuns({ clientId }).skipped[0].reason).toMatch(/already queued/);
  });

  it('hands the worker its competitors and known pages', () => {
    db.prepare("INSERT INTO client_competitors (client_id, domain, url, status) VALUES (?, 'rival.example', 'https://rival.example', 'approved')").run(clientId);
    db.prepare("INSERT INTO client_competitors (client_id, domain, url, status) VALUES (?, 'maybe.example', 'https://maybe.example', 'discovered')").run(clientId);
    const job = o.claimOutreachRuns('test').find(j => j.run_id === runId);
    expect(job.competitors.map(c => c.domain)).toEqual(['rival.example']);
    expect(job.max_prospects).toBe(o.PROSPECTS_PER_RUN);
  });

  it('stores prospects with the internal CC, adds a blog topic when we have no page, and files own dead pages as internal fixes', () => {
    o.setSetting('outreach_cc', 'deepanjan@hyphening.test, not-an-email, jo@hyphening.test', 'test');
    const r = o.submitOutreachResults({
      run_id: runId,
      prospects: [prospect(1), prospect(1), prospect(2, { our_url: null, proposed_topic: 'How to pick a creative agency' }), { kind: 'mention', page_url: 'nope' }],
      own_broken: [{ dead_url: 'https://client.example/old-page', linking_pages: ['https://a.example/x'] }],
      stats: { candidates: 9 }, cost_usd: 0.42,
    });
    expect(r.success).toBe(true);
    const rows = db.prepare('SELECT * FROM outreach_prospects WHERE client_id = ? ORDER BY id').all(clientId);
    expect(rows).toHaveLength(2); // the duplicate and the malformed one are dropped
    expect(rows[0]).toMatchObject({ status: 'to_approve', email_cc: 'deepanjan@hyphening.test, jo@hyphening.test' });
    expect(rows[1].blog_topic_id).toBeTruthy();
    expect(db.prepare('SELECT topic FROM blog_topics WHERE id = ?').get(rows[1].blog_topic_id).topic).toBe('How to pick a creative agency');
    const fix = db.prepare("SELECT * FROM seo_recommendations WHERE client_id = ? AND metric = 'Broken backlink target'").get(clientId);
    expect(fix.action_required).toMatch(/301 redirect from \/old-page/);
    expect(o.dataForSeoStatus().state).toBe('ok');
  });
});

describe('approval, sending and the outcome', () => {
  let id;
  beforeAll(() => {
    staffA = user('Asha');
    staffB = user('Bilal');
    id = db.prepare('SELECT id FROM outreach_prospects WHERE client_id = ? ORDER BY id LIMIT 1').get(clientId).id;
  });

  it('needs someone to send it, and keeps 007\'s edits', () => {
    expect(o.approveProspect(id, {}, admin).error).toMatch(/Choose who sends it/);
    const r = o.approveProspect(id, { assigned_to: staffA, email_subject: 'Edited subject' }, admin);
    expect(r.status).toBe(200);
    expect(r.prospect).toMatchObject({ status: 'to_send', email_subject: 'Edited subject', assigned_to: staffA, approved_by: 'jo@test' });
  });

  it('only the sender (or an admin) sees it and marks it sent', () => {
    expect(o.outreachReport({ id: staffB, role: 'ops_social_media_manager' }).prospects.map(p => p.id)).not.toContain(id);
    expect(o.outreachReport({ id: staffA, role: 'ops_social_media_manager' }).prospects.map(p => p.id)).toContain(id);
    expect(o.markSent(id, { id: staffB, role: 'ops_social_media_manager' }).status).toBe(403);
    expect(o.markSent(id, { id: staffA, role: 'ops_social_media_manager' }).status).toBe(200);
  });

  it('drafts a follow-up after 5 days, which needs approval again', () => {
    db.prepare("UPDATE outreach_prospects SET sent_at = datetime('now', '-6 days') WHERE id = ?").run(id);
    const run = o.queueOutreachRuns({ clientId }).queued[0].run_id;
    const job = o.claimOutreachRuns('test').find(j => j.run_id === run);
    expect(job.follow_ups.map(f => f.id)).toContain(id);
    o.submitOutreachResults({ run_id: run, follow_ups: [{ id, subject: 'Re: Edited subject', body: 'Just checking in.\nThanks,' }] });
    expect(db.prepare('SELECT status FROM outreach_prospects WHERE id = ?').get(id).status).toBe('follow_up_to_approve');
    o.approveProspect(id, {}, admin);
    o.markSent(id, admin);
    expect(db.prepare('SELECT status, follow_up_count FROM outreach_prospects WHERE id = ?').get(id)).toEqual({ status: 'sent', follow_up_count: 1 });
  });

  it('a win needs the live page', () => {
    expect(o.markOutcome(id, { outcome: 'won' }, admin).status).toBe(400);
    expect(o.markOutcome(id, { outcome: 'won', live_url: 'https://blog1.example/resources' }, admin).status).toBe(200);
    expect(o.outreachSummaryText()).toMatch(/1 won/);
  });
});

describe('when DataForSEO fails, it says so', () => {
  it('records the kind and shows it as a problem in the brief', () => {
    const run = o.queueOutreachRuns({ clientId }).queued[0].run_id;
    o.claimOutreachRuns('test');
    o.failOutreachRun({ run_id: run, failure_kind: 'dataforseo_funds' });
    const s = o.dataForSeoStatus();
    expect(s.state).toBe('funds');
    expect(s.message).toMatch(/top up/);
    expect(o.outreachSummaryText()).toMatch(/DataForSEO PROBLEM: .*top up/);
  });
});
