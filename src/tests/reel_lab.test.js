import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db from '../../database.js';
import * as rl from '../services/reelLab.js';
import reelLabRouter from '../routes/reelLab.js';
import { KNOWN_EVENTS, executeEvent } from '../routes/webhooks.js';

// One transaction, rolled back at the end: the local database is left as it was.
beforeAll(() => {
  db.exec('BEGIN');
  db.prepare("UPDATE reel_lab_runs SET status = 'failed' WHERE status IN ('queued', 'running')").run();
});
afterAll(() => db.exec('ROLLBACK'));

let clientId;
let clinicId;

const newClient = (name, profile = 'general') => db.prepare(`
  INSERT INTO crm_clients (name, client_type, is_active, blog_compliance_profile, ig_on_camera_style, brand_niche_keywords)
  VALUES (?, 'marketing', 1, ?, 'Fast, warm, talks to camera', '["dental implants"]')
`).run(`${name} ${Math.random()}`, profile).lastInsertRowid;

const goodResult = (over = {}) => ({
  title: 'Implant myths',
  angle: 'Implants are not just for the old',
  reference_lessons: ['Nobody Tells You: opened on a fear'],
  target_seconds: 30,
  hooks: [
    { formula_id: 3, formula_name: 'Nobody Tells You', spoken: 'Nobody tells you implants last 25 years.', on_screen: 'IMPLANTS: 25 YEARS', score: 61.2, verdict: 'OK', weakest: 'ADDRESS', flags: [],
      beats: [{ start: 0, dur: 2.5, label: 'HOOK', text: 'Nobody tells you implants last 25 years.', flags: [] }, { start: 2.5, dur: 2, label: '', text: 'Here is why.', flags: [] }, { start: 4.5, dur: 2, label: 'CTA', text: 'Book a check.', flags: [] }],
      total_seconds: 6.5, beat_notes: ['Short'] },
    { formula_id: 20, formula_name: 'Permission', spoken: 'You do not need perfect teeth to start.', on_screen: 'NO PERFECT TEETH', score: 80.1, verdict: 'STRONG', weakest: 'STAKES', flags: [], beats: [], total_seconds: 6 },
  ],
  body: ['Here is why.', 'Book a check.'],
  on_screen: [{ line: 0, text: 'IMPLANTS' }, { line: 2, text: 'BOOK' }],
  caption: { text: 'Implants explained.\n\nComment BOOK.\n#dentalimplants', visible: 'Implants explained.', truncated: false, checks: [{ check: 'ONE ASK', status: 'PASS', detail: 'one' }] },
  human: { score: 77, verdict: 'PASS', checks: { BURSTINESS: { score: 70, detail: 'ok' } }, cleaned: ['1 x EM DASH -> ","'] },
  placeholders: [],
  notes: [],
  ...over,
});

describe('router', () => {
  it('authenticates every route', () => {
    expect(reelLabRouter.stack.map((l) => l.name)).toContain('authenticate');
  });
});

describe('queueing', () => {
  beforeAll(() => {
    clientId = newClient('Reel client');
    clinicId = newClient('Reel clinic', 'healthcare');
  });

  it('refuses a bare link with nothing said about it', () => {
    const r = rl.queueReelLabRun({ clientId, references: [{ url: 'https://www.instagram.com/reel/abc/' }] });
    expect(r.status).toBe(400);
  });

  it('refuses something that is not a link, and more than three reels', () => {
    expect(rl.queueReelLabRun({ clientId, references: [{ url: 'not a link', notes: 'x' }] }).status).toBe(400);
    const four = Array.from({ length: 4 }, (_, i) => ({ url: `https://x.example/${i}`, notes: 'n' }));
    expect(rl.queueReelLabRun({ clientId, references: four }).status).toBe(400);
  });

  it('queues one run per client at a time', () => {
    const r = rl.queueReelLabRun({ clientId, month: '2026-12', references: [{ url: 'https://www.instagram.com/reel/abc/', notes: 'Opens: "Nobody tells you..."' }], requestedBy: 'jo@test' });
    expect(r.run.status).toBe('queued');
    expect(r.run.references).toHaveLength(1);
    expect(r.run.month).toBe('2026-12');
    const again = rl.queueReelLabRun({ clientId, topic: 'another' });
    expect(again.status).toBe(409);
  });

  it('an improve run needs a script of the same client', () => {
    expect(rl.queueReelLabRun({ clientId: clinicId, mode: 'improve', scriptId: 999999999 }).status).toBe(404);
  });
});

describe('a run, from claim to saved Draft', () => {
  let runId;

  it('claims with everything the worker needs', () => {
    const jobs = rl.claimReelLabRuns('test-mac', 3);
    const job = jobs.find((j) => j.client.id === clientId);
    expect(job).toBeTruthy();
    runId = job.run_id;
    expect(job.mode).toBe('new');
    expect(job.compliance_profile).toBe('general');
    expect(job.instagram_voice.on_camera_style).toMatch(/warm/);
    expect(job.search_keywords).toContain('dental implants');
    expect(job.performance).toMatchObject({ reels: 0, top: [], bottom: [] });
    expect(rl.getReelLabRow(runId).status).toBe('running');
  });

  it('logs progress lines', () => {
    rl.appendReelLabLog({ run_id: runId, log: 'Writing...' });
    expect(rl.serializeReelLabRun(rl.getReelLabRow(runId)).log[0]).toMatch(/Writing/);
  });

  it('refuses a result without hooks', () => {
    expect(rl.submitReelLabResult({ run_id: runId, result: { body: ['x'] } }).success).toBe(false);
  });

  it('stores a result, dropping fields it does not know', () => {
    const r = rl.submitReelLabResult({ run_id: runId, model: 'claude-sonnet-5-5', result: goodResult({ evil: '<script>' }) });
    expect(r.success).toBe(true);
    const run = rl.serializeReelLabRun(rl.getReelLabRow(runId));
    expect(run.status).toBe('ready');
    expect(run.result.evil).toBeUndefined();
    expect(run.result.hooks).toHaveLength(2);
  });

  it('saves the chosen hook as a Draft with the hook recorded', () => {
    const r = rl.saveReelLabRun(runId, { hookIndex: 0, title: 'Implants: 25 years' }, 'jo@test');
    expect(r.script_id).toBeTruthy();
    const s = db.prepare('SELECT * FROM marketing_scripts WHERE id = ?').get(r.script_id);
    expect(s.status).toBe('Draft');
    expect(s.format).toBe('reel');
    expect(s.month).toBe('2026-12');
    expect(s.title).toBe('Implants: 25 years');
    expect(s.reference_video_link).toBe('https://www.instagram.com/reel/abc/');
    expect(s.hook_formula).toBe('#3 Nobody Tells You');
    expect(s.hook_score).toBe(61.2);
    expect(s.reel_lab_run_id).toBe(runId);
    expect(s.script_text).toMatch(/^HOOK \(Nobody Tells You, scored 61.2\)\nNobody tells you implants last 25 years\./);
    // On-screen cards get the time of the line they point at.
    expect(s.script_text).toContain('0:04.5  BOOK');
    expect(s.script_text).toContain('CAPTION\nImplants explained.');
    expect(rl.getReelLabRow(runId).status).toBe('saved');
  });

  it('cannot be saved twice', () => {
    expect(rl.saveReelLabRun(runId, { hookIndex: 1 }).status).toBe(409);
  });
});

describe('improve hooks', () => {
  it('rewrites the script it came from', () => {
    const scriptId = db.prepare(`
      INSERT INTO marketing_scripts (client_id, month, title, script_text, format, status, has_unseen_changes)
      VALUES (?, '2026-11', 'Old', 'Hi everyone, today...', 'reel', 'Pending Client Approval', 0)
    `).run(clinicId).lastInsertRowid;
    const q = rl.queueReelLabRun({ clientId: clinicId, mode: 'improve', scriptId });
    expect(q.run.month).toBe('2026-11');
    const job = rl.claimReelLabRuns('test-mac', 3).find((j) => j.run_id === q.run.id);
    expect(job.compliance_profile).toBe('healthcare');
    expect(job.script.script_text).toMatch(/today/);
    rl.submitReelLabResult({ run_id: q.run.id, result: goodResult() });
    const r = rl.saveReelLabRun(q.run.id, { hookIndex: 1 });
    expect(r.script_id).toBe(scriptId);
    const s = db.prepare('SELECT * FROM marketing_scripts WHERE id = ?').get(scriptId);
    expect(s.status).toBe('Pending Client Approval');
    expect(s.hook_text).toBe('You do not need perfect teeth to start.');
    expect(s.has_unseen_changes).toBe(1);
    expect(s.script_text).toMatch(/^HOOK \(Permission, scored 80.1\)/);
  });
});

describe('failures', () => {
  it('a failed run frees the client for the next one', () => {
    const id = newClient('Fail client');
    const q = rl.queueReelLabRun({ clientId: id, topic: 'gum care' });
    expect(rl.failReelLabRun({ run_id: q.run.id, error: 'claude exited 1' }).success).toBe(true);
    expect(rl.getReelLabRow(q.run.id).error).toBe('claude exited 1');
    expect(rl.queueReelLabRun({ clientId: id, topic: 'gum care' }).run).toBeTruthy();
  });

  it('a run left running too long is marked failed', () => {
    const id = newClient('Stale client');
    const q = rl.queueReelLabRun({ clientId: id, topic: 'x' });
    db.prepare("UPDATE reel_lab_runs SET status = 'running', started_at = datetime('now', '-2 hours') WHERE id = ?").run(q.run.id);
    rl.failStaleReelLabRuns();
    expect(rl.getReelLabRow(q.run.id).status).toBe('failed');
  });
});

describe('client performance', () => {
  it('ranks their own reels against their median', () => {
    const id = newClient('Perf client');
    const ins = db.prepare(`
      INSERT INTO marketing_content_tracker (client_id, platform, post_type, title, date, views, metrics_synced_at, status)
      VALUES (?, 'instagram', 'Reel', ?, date('now', ?), ?, datetime('now'), 'Posted')
    `);
    [100, 200, 300, 400, 5000, 50, 250, 350, 150].forEach((v, i) => ins.run(id, `Reel ${i}`, `-${i + 1} days`, v));
    ins.run(id, 'Too old', '-400 days', 99999);
    const p = rl.clientReelPerformance(id);
    expect(p.reels).toBe(9);
    expect(p.median_views).toBe(250);
    expect(p.top[0]).toMatchObject({ views: 5000, multiple: 20 });
    expect(p.bottom).toHaveLength(3);
  });
});

describe('webhooks', () => {
  it('knows the four Reel Lab events', () => {
    for (const e of ['claim_reel_lab_runs', 'submit_reel_lab_result', 'fail_reel_lab_run', 'reel_lab_log']) expect(KNOWN_EVENTS).toContain(e);
    expect(executeEvent('claim_reel_lab_runs', { worker_id: 'x' }).success).toBe(true);
    expect(executeEvent('submit_reel_lab_result', { run_id: 999999999 }).success).toBe(false);
  });
});
