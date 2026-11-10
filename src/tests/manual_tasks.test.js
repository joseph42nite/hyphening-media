import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db from '../../database.js';
import * as manual from '../services/manualTasks.js';
import { submitSeoTriage } from '../services/seoNight.js';
import manualRouter from '../routes/manualTasks.js';

// One transaction rolled back at the end, so the local database is left as it was.
beforeAll(() => db.exec('BEGIN'));
afterAll(() => db.exec('ROLLBACK'));

function makeClient() {
  return db.prepare(`
    INSERT INTO crm_clients (name, client_type, is_active, seo_enabled, ads_enabled, website_url)
    VALUES (?, 'marketing', 1, 1, 1, 'https://example.test/')
  `).run(`Manual client ${Math.random()}`).lastInsertRowid;
}
const seoAudit = (clientId, type) => db.prepare(
  "INSERT INTO seo_audits (client_id, audit_type, url) VALUES (?, ?, 'https://example.test/')",
).run(clientId, type).lastInsertRowid;
const adsAudit = (clientId, type) => db.prepare(
  'INSERT INTO ads_audits (client_id, agent_type) VALUES (?, ?)',
).run(clientId, type).lastInsertRowid;

function seoRec(clientId, auditId, { priority = 'High', status = 'open', triage = null, area = null } = {}) {
  return db.prepare(`
    INSERT INTO seo_recommendations (audit_id, client_id, priority, metric, issue, action_required, status, fix_triage, manual_area)
    VALUES (?, ?, ?, 'm', 'issue', 'steps', ?, ?, ?)
  `).run(auditId, clientId, priority, status, triage, area).lastInsertRowid;
}
function adsRec(clientId, auditId, { kind = null, status = 'open' } = {}) {
  return db.prepare(`
    INSERT INTO ads_recommendations (audit_id, client_id, priority, metric, issue, action_required, status, kind)
    VALUES (?, ?, 'Medium', 'CPL', 'issue', 'steps', ?, ?)
  `).run(auditId, clientId, status, kind).lastInsertRowid;
}
const keysIn = (list) => list.areas.flatMap(a => a.tasks.map(t => t.key));
const areaOf = (list, key) => list.areas.find(a => a.tasks.some(t => t.key === key))?.key;

describe('router', () => {
  it('authenticates every route', () => {
    expect(manualRouter.stack.map(l => l.name)).toContain('authenticate');
  });
});

describe('what counts as a manual task', () => {
  it('takes not_code, needs_007 and ad-account/business ads work, and nothing else', () => {
    const id = makeClient();
    const backlinks = seoAudit(id, 'backlinks');
    const offsite = seoRec(id, backlinks, { triage: 'not_code' });
    const site = seoRec(id, backlinks, { status: 'needs_007', triage: 'needs_007' });
    const safe = seoRec(id, backlinks, { triage: 'safe' });
    const unsorted = seoRec(id, backlinks);
    const done = seoRec(id, backlinks, { status: 'completed', triage: 'not_code' });
    const ads = adsAudit(id, 'google');
    const account = adsRec(id, ads, { kind: 'ad_account' });
    const code = adsRec(id, ads, { kind: 'site_code' });

    const list = manual.listManualTasks(id);
    const keys = keysIn(list);
    expect(keys).toEqual(expect.arrayContaining([String(offsite), String(site), `ads-${account}`]));
    for (const k of [safe, unsorted, done]) expect(keys).not.toContain(String(k));
    expect(keys).not.toContain(`ads-${code}`);
    expect(list.total).toBe(3);

    expect(areaOf(list, String(site))).toBe('site');
    expect(areaOf(list, String(offsite))).toBe('offsite'); // from the Backlinks card
    expect(areaOf(list, `ads-${account}`)).toBe('ad_account');
  });

  it('leaves out findings a newer audit replaced', () => {
    const id = makeClient();
    const a = seoAudit(id, 'maps');
    const old = seoRec(id, a, { triage: 'not_code' });
    db.prepare('UPDATE seo_recommendations SET superseded_by_audit_id = ? WHERE id = ?').run(a, old);
    expect(manual.listManualTasks(id).total).toBe(0);
  });

  it("prefers the night worker's area over the card's", () => {
    const id = makeClient();
    const r = seoRec(id, seoAudit(id, 'backlinks'), { triage: 'not_code', area: 'gbp' });
    expect(areaOf(manual.listManualTasks(id), String(r))).toBe('gbp');
  });
});

describe('night worker sort', () => {
  it('stores the area for not_code only, and only known areas', () => {
    const id = makeClient();
    const a = seoAudit(id, 'content');
    const batch = db.prepare("INSERT INTO seo_fix_batches (client_id, night, status) VALUES (?, '2026-11-10', 'running')").run(id).lastInsertRowid;
    const r1 = seoRec(id, a);
    const r2 = seoRec(id, a);
    const r3 = seoRec(id, a);
    submitSeoTriage({ batch_id: batch, results: [
      { id: r1, triage: 'not_code', area: 'content', reason: 'write it' },
      { id: r2, triage: 'not_code', area: 'mars', reason: 'x' },
      { id: r3, triage: 'needs_007', area: 'gbp', reason: 'copy change' },
    ] });
    const area = (r) => db.prepare('SELECT manual_area FROM seo_recommendations WHERE id = ?').get(r).manual_area;
    expect(area(r1)).toBe('content');
    expect(area(r2)).toBeNull();
    expect(area(r3)).toBeNull();
  });
});

describe('night sort outcomes', () => {
  function sort(results, clientId) {
    const batch = db.prepare("INSERT INTO seo_fix_batches (client_id, night, status) VALUES (?, '2026-11-10', 'running')").run(clientId).lastInsertRowid;
    return submitSeoTriage({ batch_id: batch, results });
  }
  const row = (id) => db.prepare('SELECT status, fix_triage, manual_area, manual_group, manual_note FROM seo_recommendations WHERE id = ?').get(id);

  it('code waits for your OK; automatic closes itself; neither is manual', () => {
    const id = makeClient();
    const a = seoAudit(id, 'technical');
    const code = seoRec(id, a);
    const auto = seoRec(id, a);
    sort([
      { id: code, triage: 'code', reason: 'image attributes are in app components' },
      { id: auto, triage: 'automatic', reason: 'the Technical card re-runs PageSpeed monthly' },
    ], id);
    expect(row(code)).toMatchObject({ status: 'needs_007', fix_triage: 'needs_007' });
    expect(row(auto)).toMatchObject({ status: 'ignored', manual_area: 'automatic' });
    expect(row(auto).manual_note).toMatch(/Covered automatically/);
    const list = manual.listManualTasks(id);
    expect(keysIn(list)).toEqual([String(code)]);
    expect(list.areas[0].key).toBe('site');
  });

  it('content with a keyword goes to the Keywords panel; without one it stays manual', () => {
    const id = makeClient();
    const a = seoAudit(id, 'local');
    const withKw = seoRec(id, a);
    const without = seoRec(id, a);
    sort([
      { id: withKw, triage: 'content', keyword: '  Dental Clinic Marketing  Bangalore ', reason: 'case study' },
      { id: without, triage: 'content', reason: 'needs a plan' },
    ], id);
    expect(row(withKw)).toMatchObject({ status: 'completed', manual_area: 'content' });
    const kw = db.prepare("SELECT source, status FROM seo_keywords WHERE client_id = ? AND keyword = 'dental clinic marketing bangalore'").get(id);
    expect(kw).toEqual({ source: 'audit', status: 'candidate' });
    expect(row(without)).toMatchObject({ status: 'open', manual_area: 'content' });
  });

  it('merges the same work raised by several cards into one task', () => {
    const id = makeClient();
    const r1 = seoRec(id, seoAudit(id, 'local'), { priority: 'Low' });
    const r2 = seoRec(id, seoAudit(id, 'google'), { priority: 'Medium' });
    const r3 = seoRec(id, seoAudit(id, 'schema'), { priority: 'Low' });
    sort([r1, r2, r3].map(r => ({ id: r, triage: 'not_code', area: 'google', group: 'GA4 internal traffic filter', reason: 'GA4 setting' })), id);
    expect(row(r1).manual_group).toBe('ga4-internal-traffic-filter');

    const list = manual.listManualTasks(id);
    expect(list.total).toBe(1);
    expect(list.findings).toBe(3);
    const task = list.areas[0].tasks[0];
    expect(task.priority).toBe('Medium');
    expect(task.cards.sort()).toEqual(['google', 'local', 'schema']);
    expect(manual.countManualTasks(id)).toEqual({ total: 1, high: 0 });

    // One click acts on the whole group.
    const [first] = manual.assignees();
    manual.assignManualTask(String(r3), first);
    expect(db.prepare('SELECT COUNT(*) n FROM seo_recommendations WHERE id IN (?, ?, ?) AND assigned_to = ?').get(r1, r2, r3, first).n).toBe(3);
    manual.closeManualTask(task.key, 'done', { user: { email: first } });
    expect([r1, r2, r3].map(r => row(r).status)).toEqual(['completed', 'completed', 'completed']);
  });
});

describe('actions', () => {
  it('assigns only to the listed staff', () => {
    const id = makeClient();
    const r = seoRec(id, seoAudit(id, 'backlinks'), { triage: 'not_code' });
    const [first] = manual.assignees();
    expect(manual.assignManualTask(String(r), first).status).toBe(200);
    expect(manual.listManualTasks(id).areas[0].tasks[0].assigned_to).toBe(first);
    expect(manual.assignManualTask(String(r), 'someone@else.test').status).toBe(400);
    expect(manual.assignManualTask(String(r), null).status).toBe(200);
  });

  it('done closes it; not doing needs a reason; neither works twice', () => {
    const id = makeClient();
    const a = seoAudit(id, 'backlinks');
    const r1 = seoRec(id, a, { triage: 'not_code' });
    const r2 = seoRec(id, a, { triage: 'not_code' });
    const user = { email: 'omkar@hypheningmedia.com' };

    expect(manual.closeManualTask(String(r1), 'done', { user }).status).toBe(200);
    const row = db.prepare('SELECT status, manual_by FROM seo_recommendations WHERE id = ?').get(r1);
    expect(row).toEqual({ status: 'completed', manual_by: user.email });
    expect(manual.closeManualTask(String(r1), 'done', { user }).status).toBe(409);

    expect(manual.closeManualTask(String(r2), 'skip', { user }).status).toBe(400);
    expect(manual.closeManualTask(String(r2), 'skip', { note: 'not our market', user }).status).toBe(200);
    expect(db.prepare('SELECT status, manual_note FROM seo_recommendations WHERE id = ?').get(r2))
      .toEqual({ status: 'ignored', manual_note: 'not our market' });
    expect(manual.listManualTasks(id).total).toBe(0);
  });

  it('counts open tasks for the badge and the morning brief', () => {
    const id = makeClient();
    const a = seoAudit(id, 'backlinks');
    seoRec(id, a, { triage: 'not_code', priority: 'Critical' });
    seoRec(id, a, { triage: 'not_code', priority: 'Low' });
    expect(manual.countManualTasks(id)).toEqual({ total: 2, high: 1 });
    expect(manual.manualSummaryLines().some(l => l.includes('2 manual task(s), 1 High'))).toBe(true);
  });
});
