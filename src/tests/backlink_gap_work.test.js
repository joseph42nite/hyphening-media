/**
 * A backlink gap report turned into work (src/services/backlinkGap.js):
 * directories and news/PR sites become Manual tasks, blogs, resources and
 * communities go to outreach, and one competitor's report never touches
 * another's tasks. Real schema, one transaction rolled back at the end.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// The webhook handler broadcasts through server.js, which would start the app.
vi.mock('../../server.js', () => ({ broadcastEvent: () => {} }));

import db from '../../database.js';
import { handleCreateSeoAudit } from '../webhooks/seoAudits.js';
import { gapTasks, outreachGapCandidates, gapStatusByCompetitor } from '../services/backlinkGap.js';
import { claimOutreachRuns } from '../services/outreach.js';
import { listManualTasks } from '../services/manualTasks.js';
import { candidateOrder } from '../../scripts/outreach_worker.mjs';

beforeAll(() => {
  db.exec('BEGIN');
  db.prepare("UPDATE outreach_runs SET status = 'done' WHERE status IN ('queued', 'running')").run();
});
afterAll(() => db.exec('ROLLBACK'));

let clientId;

const report = (gaps) => ({ competitor: { domain: 'x' }, gap_domains: gaps });
const nico = [
  { domain: 'goodfirms.co', rank: 80, type: 'directory', why: 'Agency directory' },
  { domain: 'www.news21.co.in', rank: 23, type: 'news_pr' },
  { domain: 'sukiweb.net', rank: 51, type: 'blog', why: 'Marketing blog' },
  { domain: 'tools.example', rank: 10, type: 'resource' },
  { domain: 'foro3d.com', rank: 159, type: 'irrelevant' },
];

function gapRun(competitor) {
  return db.prepare(`
    INSERT INTO seo_agent_runs (client_id, agent_type, status, requested_by, competitor_domain, started_at)
    VALUES (?, 'backlink_gap', 'running', 'test', ?, datetime('now'))
  `).run(clientId, competitor).lastInsertRowid;
}

function store(competitor, gaps) {
  const runId = gapRun(competitor);
  const res = handleCreateSeoAudit({
    run_id: runId, client_id: clientId, audit_type: 'backlink_gap', url: 'https://client.example/',
    summary: 'gap', recommendations: [{ priority: 'High', metric: 'Profile', issue: 'Spammy links', action_required: 'Review them' }],
    report_json: report(gaps),
  });
  expect(res.success, res.summary).toBe(true);
  return db.prepare('SELECT MAX(id) id FROM seo_audits WHERE client_id = ?').get(clientId).id;
}

const openRecs = (auditId) => db.prepare("SELECT * FROM seo_recommendations WHERE audit_id = ? AND status = 'open' ORDER BY id").all(auditId);

describe('gapTasks', () => {
  it('makes one task per directory and news/PR domain, nothing for the rest', () => {
    const tasks = gapTasks({ clientName: 'Client Co', competitor: 'nicodigital.com', report: report(nico) });
    expect(tasks.map(t => `${t.metric} ${t.page_url}`)).toEqual([
      'Directory listing https://goodfirms.co/',
      'News or PR placement https://news21.co.in/',
    ]);
    expect(tasks[0]).toMatchObject({ priority: 'High', fix_triage: 'not_code', manual_area: 'offsite', manual_group: 'gap:goodfirms.co' });
    expect(tasks[1].priority).toBe('Low');
  });

  it('ignores a malformed list', () => {
    expect(gapTasks({ clientName: 'C', competitor: 'r', report: { gap_domains: [{ domain: 'not a domain', type: 'directory' }] } })).toEqual([]);
    expect(gapTasks({ clientName: 'C', competitor: 'r', report: null })).toEqual([]);
  });
});

describe('storing a gap report', () => {
  let nicoAudit;

  beforeAll(() => {
    clientId = db.prepare("INSERT INTO crm_clients (name, client_type, is_active, seo_enabled, website_url) VALUES (?, 'marketing', 1, 1, 'https://client.example/')")
      .run(`Gap client ${Math.random()}`).lastInsertRowid;
    const comp = db.prepare("INSERT INTO client_competitors (client_id, domain, url, status) VALUES (?, ?, ?, 'approved')");
    comp.run(clientId, 'nicodigital.com', 'https://nicodigital.com');
    comp.run(clientId, 'socialee.in', 'https://socialee.in');
  });

  it('adds the tasks next to the report\'s own recommendations, already sorted for Manual tasks', () => {
    nicoAudit = store('nicodigital.com', nico);
    const recs = openRecs(nicoAudit);
    expect(recs.map(r => r.metric)).toEqual(['Profile', 'Directory listing', 'News or PR placement']);
    const offsite = listManualTasks(clientId).areas.find(a => a.key === 'offsite');
    expect(offsite.tasks.map(t => t.page_url)).toEqual(expect.arrayContaining(['https://goodfirms.co/', 'https://news21.co.in/']));
  });

  it('a report against another competitor leaves the first one\'s tasks open, and shared domains show once', () => {
    const socialAudit = store('socialee.in', [{ domain: 'goodfirms.co', rank: 80, type: 'directory' }]);
    expect(openRecs(nicoAudit)).toHaveLength(3);
    expect(openRecs(socialAudit)).toHaveLength(2);
    const goodfirms = listManualTasks(clientId).areas.find(a => a.key === 'offsite').tasks.filter(t => t.page_url === 'https://goodfirms.co/');
    expect(goodfirms).toHaveLength(1);
    expect(goodfirms[0].keys).toHaveLength(2);
  });

  it('a new report against the same competitor replaces its open tasks', () => {
    const again = store('nicodigital.com', [{ domain: 'clutch.co', rank: 90, type: 'directory' }]);
    expect(openRecs(nicoAudit)).toHaveLength(0);
    expect(openRecs(again).map(r => r.page_url)).toContain('https://clutch.co/');
  });

  it('outreach gets the blog, resource and community domains of each competitor\'s latest report', () => {
    store('socialee.in', [
      { domain: 'sukiweb.net', rank: 60, type: 'blog' },
      { domain: 'forum.example', rank: 5, type: 'community' },
      { domain: 'dir.example', rank: 99, type: 'directory' },
    ]);
    // nicodigital's latest report (clutch.co only) has nothing for outreach; its first one is replaced.
    const cands = outreachGapCandidates(clientId, ['https://forum.example/']);
    expect(cands.map(c => c.site_domain)).toEqual(['sukiweb.net']);
    expect(cands[0]).toMatchObject({ page_url: 'https://sukiweb.net/', type: 'blog', competitor_domains: ['socialee.in'] });
  });

  it('summarises each competitor\'s latest gap report for the screens', () => {
    const status = gapStatusByCompetitor(clientId);
    expect(Object.keys(status).sort()).toEqual(['nicodigital.com', 'socialee.in']);
    expect(status['socialee.in']).toMatchObject({ directories: 1, news_pr: 0, outreach: 2, irrelevant: 0, untyped: 0 });
    expect(status['nicodigital.com']).toMatchObject({ directories: 1, outreach: 0 });
  });

  it('hands them to the worker with the run', () => {
    db.prepare("INSERT INTO outreach_runs (client_id, requested_by) VALUES (?, 'test')").run(clientId);
    const job = claimOutreachRuns('test').find(j => j.client.id === clientId);
    expect(job.gap_candidates.map(c => c.site_domain)).toEqual(['sukiweb.net', 'forum.example']);
  });
});

describe('outreach worker order', () => {
  it('checks broken links, then mentions, then gap report domains, then its own gap search', () => {
    const order = [
      { kind: 'competitor_gap' },
      { kind: 'competitor_gap', source: 'gap_report' },
      { kind: 'mention' },
      { kind: 'broken_link' },
    ].sort((a, b) => candidateOrder(a) - candidateOrder(b)).map(c => c.source || c.kind);
    expect(order).toEqual(['broken_link', 'mention', 'gap_report', 'competitor_gap']);
  });
});
