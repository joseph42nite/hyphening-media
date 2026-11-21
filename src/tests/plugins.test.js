import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'os';
import path from 'path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import db from '../../database.js';
import * as p from '../services/plugins.js';
import pluginRouter from '../routes/plugins.js';
import { executeEvent } from '../routes/webhooks.js';
import { lostPieces, lastJson, latestRelease, skillNames, clearSetupLeftovers } from '../../scripts/plugin_update_worker.mjs';
import { run } from '../../scripts/lib/proc.mjs';
import { existsSync } from 'fs';
import { installedPlugin } from '../../scripts/lib/plugins.mjs';

// One transaction, rolled back at the end: the local database is left as it was.
beforeAll(() => {
  db.exec('BEGIN');
  for (const t of ['seo_agent_runs', 'ads_agent_runs', 'blog_agent_runs', 'outreach_runs']) {
    db.prepare(`UPDATE ${t} SET status = 'failed' WHERE status = 'running'`).run();
  }
  db.prepare("UPDATE seo_fix_batches SET status = 'failed' WHERE status IN ('running', 'deploying')").run();
  db.prepare('DELETE FROM plugin_updates').run();
  db.prepare('UPDATE plugin_status SET installed_version = NULL, latest_version = NULL, reviewed_version = NULL, review_verdict = NULL, status_reported_at = NULL').run();
});
afterAll(() => db.exec('ROLLBACK'));

const admin = { id: 900001, role: 'admin', email: 'jo@test' };
const DAY = new Date('2026-11-21T08:00:00Z'); // 13:30 IST
const NIGHT = new Date('2026-11-21T21:00:00Z'); // 02:30 IST

describe('router', () => {
  it('authenticates every route', () => {
    expect(pluginRouter.stack.map(l => l.name)).toContain('authenticate');
  });
});

describe('versions', () => {
  it('compares x.y.z numerically', () => {
    expect(p.olderThan('2.4.2', '2.6.2')).toBe(true);
    expect(p.olderThan('2.10.0', '2.9.9')).toBe(false);
    expect(p.olderThan('v2.6.2', '2.6.2')).toBe(false);
    expect(p.olderThan(null, '2.6.2')).toBe(false);
  });

  it('holds updates during the night runs, in IST', () => {
    expect(p.inNightHold(NIGHT)).toBe(true);
    expect(p.inNightHold(DAY)).toBe(false);
  });
});

describe('from report to update', () => {
  let jobId;

  it('reports a plugin as behind once the Mac says so, and asks for status again when it is stale', () => {
    expect(p.statusDue()).toBe(true);
    const r = executeEvent('report_plugin_status', { plugins: [
      { plugin: 'claude-seo', installed_version: '2.4.2', installed_sha: 'aaa', latest_version: 'v2.6.2', latest_sha: 'bbb' },
      { plugin: 'claude-blog', installed_version: '2.3.2', latest_version: '2.3.2' },
      { plugin: 'claude-ads', installed_version: '2.1.0', latest_version: null },
      { plugin: 'not-ours', installed_version: '1.0.0' },
    ] });
    expect(r.success).toBe(true);
    expect(r.summary).toMatch(/claude-seo 2\.4\.2 → 2\.6\.2/);
    expect(p.statusDue()).toBe(false);
    const seo = p.listPlugins({ monitor: 'seo' }).plugins.find(x => x.plugin === 'claude-seo');
    expect(seo.behind).toBe(true);
    expect(seo.latest_version).toBe('2.6.2');
    expect(p.listPlugins({ monitor: 'ads' }).plugins.map(x => x.plugin)).toEqual(['claude-ads']);
  });

  it('keeps the button off until Q has reviewed that exact release', () => {
    expect(p.requestPluginUpdate('claude-seo', admin)).toMatchObject({ status: 409, error: expect.stringMatching(/not reviewed 2\.6\.2/) });
    executeEvent('report_plugin_review', { plugin: 'claude-seo', version: '2.6.1', verdict: 'safe' });
    expect(p.requestPluginUpdate('claude-seo', admin).status).toBe(409);
  });

  it('refuses a release Q says breaks our pipeline', () => {
    executeEvent('report_plugin_review', { plugin: 'claude-seo', version: '2.6.2', verdict: 'breaks', summary: 'drops seo-drift' });
    expect(p.requestPluginUpdate('claude-seo', admin)).toMatchObject({ status: 409, error: expect.stringMatching(/breaks/) });
  });

  it('rejects a review with a made-up verdict', () => {
    expect(executeEvent('report_plugin_review', { plugin: 'claude-seo', version: '2.6.2', verdict: 'yolo' }).success).toBe(false);
  });

  it('queues once Q says test first, never twice', () => {
    const r = executeEvent('report_plugin_review', { plugin: 'claude-seo', version: '2.6.2', sha: 'bbb', verdict: 'test_first', summary: 'Four releases', new_skills: ['seo-bing', 'Bad Name!', 'seo-shopify'] });
    expect(r.success).toBe(true);
    const seo = p.listPlugins().plugins.find(x => x.plugin === 'claude-seo');
    expect(seo.new_skills).toEqual(['seo-bing', 'seo-shopify']);
    expect(seo.blocker).toBe(null);
    const q = p.requestPluginUpdate('claude-seo', admin);
    expect(q.status).toBe(200);
    expect(q.job).toMatchObject({ plugin: 'claude-seo', status: 'queued', from_version: '2.4.2', target_version: '2.6.2', requested_by: 'jo@test' });
    jobId = q.job.id;
    expect(p.requestPluginUpdate('claude-seo', admin)).toMatchObject({ status: 409, error: 'An update is already queued' });
  });

  it('waits during the night and while a run reads the plugin', () => {
    expect(p.claimPluginUpdates('mac', { now: NIGHT })).toMatchObject({ jobs: [], held: expect.stringMatching(/night/) });
    const client = db.prepare('SELECT id FROM crm_clients LIMIT 1').get();
    if (client) {
      const run = db.prepare("INSERT INTO outreach_runs (client_id, status) VALUES (?, 'running')").run(client.id).lastInsertRowid;
      expect(p.claimPluginUpdates('mac', { now: DAY })).toMatchObject({ jobs: [], held: expect.stringMatching(/1 outreach/) });
      db.prepare("UPDATE outreach_runs SET status = 'done' WHERE id = ?").run(run);
    }
    expect(db.prepare('SELECT status FROM plugin_updates WHERE id = ?').get(jobId).status).toBe('queued');
  });

  it('hands the worker what it must keep, and marks the job running', () => {
    const r = p.claimPluginUpdates('mac', { now: DAY });
    expect(r.jobs).toHaveLength(1);
    const job = r.jobs[0];
    expect(job).toMatchObject({ update_id: jobId, install_id: 'claude-seo@agricidaniel-claude-seo', marketplace: 'agricidaniel-claude-seo' });
    expect(job.required_skills).toContain('seo');
    expect(job.required_scripts).toContain('scripts/drift_baseline.py');
    expect(job.smoke_url).toMatch(/^https:\/\//);
    expect(db.prepare('SELECT status FROM plugin_updates WHERE id = ?').get(jobId).status).toBe('running');
    expect(p.cancelPluginUpdate(jobId).status).toBe(409);
  });

  it('records the worker log and the new version', () => {
    expect(executeEvent('plugin_update_log', { update_id: jobId, log: 'now on 2.6.2' }).success).toBe(true);
    const f = executeEvent('finish_plugin_update', { update_id: jobId, status: 'updated', to_version: '2.6.2', log: 'all good' });
    expect(f.success).toBe(true);
    const seo = p.listPlugins().plugins.find(x => x.plugin === 'claude-seo');
    expect(seo).toMatchObject({ installed_version: '2.6.2', behind: false, blocker: 'Up to date' });
    expect(seo.last_job).toMatchObject({ status: 'updated', to_version: '2.6.2' });
    expect(executeEvent('finish_plugin_update', { update_id: jobId, status: 'updated' }).success).toBe(false);
  });

  it('a rolled-back update keeps the old version and the error', () => {
    db.prepare("UPDATE plugin_status SET installed_version = '2.3.1', latest_version = '2.3.2', reviewed_version = '2.3.2', review_verdict = 'safe' WHERE plugin = 'claude-blog'").run();
    const q = p.requestPluginUpdate('claude-blog', admin);
    expect(q.status).toBe(200);
    p.claimPluginUpdates('mac', { now: DAY });
    executeEvent('finish_plugin_update', { update_id: q.job.id, status: 'rolled_back', to_version: '2.3.1', error: 'smoke check failed: no score' });
    const blog = p.listPlugins().plugins.find(x => x.plugin === 'claude-blog');
    expect(blog).toMatchObject({ installed_version: '2.3.1', behind: true, blocker: null });
    expect(blog.last_job).toMatchObject({ status: 'rolled_back', error: 'smoke check failed: no score' });
    expect(p.pluginSummaryLines().join('\n')).toMatch(/claude-blog: 2\.3\.1 installed, 2\.3\.2 out \(Q: safe\)/);
  });

  it('cancels a queued update', () => {
    const q = p.requestPluginUpdate('claude-blog', admin);
    expect(p.cancelPluginUpdate(q.job.id).status).toBe(200);
    expect(p.requestPluginUpdate('claude-blog', admin).status).toBe(200);
  });
});

describe('the Mac worker', () => {
  let tmp;
  beforeAll(() => { tmp = mkdtempSync(path.join(os.tmpdir(), 'plugin-test-')); });
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  const install = (name, skills, scripts = []) => {
    const root = path.join(tmp, name);
    for (const s of skills) { mkdirSync(path.join(root, 'skills', s), { recursive: true }); writeFileSync(path.join(root, 'skills', s, 'SKILL.md'), '---\nname: x\n---'); }
    for (const s of scripts) { mkdirSync(path.dirname(path.join(root, s)), { recursive: true }); writeFileSync(path.join(root, s), ''); }
    return root;
  };

  it('flags a skill or script we call that the new version dropped, and lists new ones', () => {
    const oldRoot = install('old', ['seo', 'seo-drift', 'seo-geo'], ['scripts/gsc_query.py']);
    const newRoot = install('new', ['seo', 'seo-geo', 'seo-bing']);
    mkdirSync(path.join(newRoot, 'skills', 'not-a-skill'), { recursive: true });
    expect(skillNames(newRoot)).toEqual(['seo', 'seo-bing', 'seo-geo']);
    const r = lostPieces({ oldRoot, newRoot, skills: ['seo', 'seo-drift', 'seo-never-shipped'], scripts: ['scripts/gsc_query.py', 'scripts/never.py'] });
    expect(r).toEqual({ lostSkills: ['seo-drift'], lostScripts: ['scripts/gsc_query.py'], added: ['seo-bing'] });
  });

  it('reads the version Claude Code runs, not the newest cache folder', () => {
    const file = path.join(tmp, 'installed_plugins.json');
    writeFileSync(file, JSON.stringify({ version: 2, plugins: { 'claude-seo@m': [{ scope: 'user', installPath: '/x/2.4.2', version: '2.4.2', gitCommitSha: 'abc' }] } }));
    expect(installedPlugin('claude-seo@m', file)).toEqual({ version: '2.4.2', installPath: '/x/2.4.2', sha: 'abc' });
    expect(installedPlugin('nope@m', file)).toBe(null);
  });

  it('clears a killed setup\'s lock and staging folder, never the live runtime or a running setup', async () => {
    const data = path.join(tmp, 'seo-data');
    mkdirSync(path.join(data, '.venv'), { recursive: true });
    mkdirSync(path.join(data, '.venv.next-999999'), { recursive: true });
    mkdirSync(path.join(data, `.venv.next-${process.pid}`), { recursive: true });
    writeFileSync(path.join(data, '.setup.lock'), '999999\n1795250619\n');
    const removed = await clearSetupLeftovers(data);
    expect(removed.sort()).toEqual(['.setup.lock', '.venv.next-999999']);
    expect(existsSync(path.join(data, '.venv'))).toBe(true);
    expect(existsSync(path.join(data, `.venv.next-${process.pid}`))).toBe(true);
    writeFileSync(path.join(data, '.setup.lock'), `${process.pid}\n1\n`);
    expect(await clearSetupLeftovers(data)).toEqual([]);
  });

  it('stops the whole process tree on a timeout, not just the direct child', async () => {
    // Like pip under claude-seo's setup: a grandchild whose output is not ours.
    const tree = (marker, killTree) => run('/bin/sh', ['-c', `node -e "setTimeout(()=>{},5000)" ${marker} >/dev/null 2>&1 & wait`], { timeoutMs: 800, killTree });
    const survivor = async (marker) => { await new Promise((r) => setTimeout(r, 600)); return (await run('pgrep', ['-f', marker])).out.trim(); };

    const plain = `/tmp/plugin-test-plain-${process.pid}-${Date.now()}`;
    await tree(plain, false);
    const left = await survivor(plain);
    expect(left).not.toBe(''); // the bug: only the direct child was stopped
    await run('kill', [left]);

    const grouped = `/tmp/plugin-test-tree-${process.pid}-${Date.now()}`;
    const res = await tree(grouped, true);
    expect(res.err).toMatch(/timed out/);
    expect(await survivor(grouped)).toBe('');
  });

  it('finds the JSON line a smoke run ends with', () => {
    expect(lastJson('The audit went fine.\n{"ok": true, "score": 72}\n')).toEqual({ ok: true, score: 72 });
    expect(lastJson('no json here')).toBe(null);
  });

  it('reads the latest release and its commit, and survives GitHub failing', async () => {
    const fake = async (url) => ({
      ok: true,
      json: async () => (url.includes('/releases/latest') ? { tag_name: 'v2.6.2', published_at: '2026-11-15T10:00:00Z' } : { sha: 'deadbeef' }),
    });
    expect(await latestRelease('AgriciDaniel/claude-seo', { fetchFn: fake })).toEqual({ version: '2.6.2', sha: 'deadbeef', published_at: '2026-11-15T10:00:00Z' });
    const down = async () => ({ ok: false, status: 403 });
    expect(await latestRelease('AgriciDaniel/claude-seo', { fetchFn: down })).toMatchObject({ version: null, error: 'releases HTTP 403' });
  });
});
