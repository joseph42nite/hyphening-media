import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db from '../../database.js';
import { NIGHT_JOBS, runNightJob } from '../services/scheduler.js';
import { setMode } from '../services/automationMode.js';

// The server's own night queues (01:00 blog, 01:15 audits, 03:30 fixes).
// One transaction, rolled back, so the local database is left as it was.
beforeAll(() => {
  db.exec('BEGIN');
  db.prepare("UPDATE seo_agent_runs SET status = 'failed' WHERE status IN ('queued', 'running')").run();
  db.prepare('UPDATE crm_clients SET seo_enabled = 0, ads_enabled = 0, blog_enabled = 0').run();
});
afterAll(() => db.exec('ROLLBACK'));

const job = (name) => NIGHT_JOBS.find(j => j.name === name);

describe('night jobs', () => {
  it('run at 01:00, 01:15 and 03:30 IST', () => {
    expect(NIGHT_JOBS.map(j => [j.name, j.cron])).toEqual([
      ['blog drafts', '0 1 * * *'],
      ['SEO audits', '15 1 * * *'],
      ['SEO fixes', '30 3 * * *'],
    ]);
  });

  it('queue nothing while the fleets are on Manual', () => {
    for (const scope of ['blog', 'seo', 'ads']) setMode(scope, 'manual');
    for (const j of NIGHT_JOBS) expect(runNightJob(j).summary).toMatch(/^Nothing queued/);
  });

  it('queue the same audits the bots\' webhook did, marked as the server\'s', () => {
    setMode('seo', 'auto');
    const clientId = db.prepare(`
      INSERT INTO crm_clients (name, client_type, is_active, seo_enabled, website_url)
      VALUES ('Night job client', 'marketing', 1, 1, 'https://example.test/')
    `).run().lastInsertRowid;
    const res = runNightJob(job('SEO audits'));
    expect(res.data.queued.length).toBeGreaterThan(0);
    const runs = db.prepare("SELECT requested_by FROM seo_agent_runs WHERE client_id = ? AND status = 'queued'").all(clientId);
    expect(runs.length).toBe(res.data.queued.length);
    expect(new Set(runs.map(r => r.requested_by))).toEqual(new Set(['night:server']));
    // A second start the same night (a bot still on `start`) adds nothing.
    expect(runNightJob(job('SEO audits')).data.queued).toEqual([]);
  });

  it('log a failure instead of throwing', () => {
    expect(runNightJob({ name: 'broken', run: () => { throw new Error('boom'); } })).toBeNull();
  });
});
