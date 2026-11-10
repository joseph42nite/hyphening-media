/**
 * The outreach worker with DataForSEO, Claude, the web and the webhook faked:
 * what it suggests, what it double-checks before asking Claude, and how a
 * DataForSEO failure surfaces.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { runOutreach } from '../../scripts/outreach_worker.mjs';
import { dfs, DataForSeoError } from '../../scripts/lib/dataforseo.mjs';

const job = {
  run_id: 5,
  client: { id: 10, name: 'Client Co', website_url: 'https://client.example/', blog_compliance_profile: 'general' },
  competitors: [{ domain: 'rival.example' }, { domain: 'other.example' }],
  known_pages: ['https://known.example/page'],
  planned_topics: [],
  follow_ups: [],
  to_verify: [],
  max_prospects: 15,
};

const DATA = {
  'dataforseo_labs/google/competitors_domain/live': [{ domain: 'newrival.example' }, { domain: 'justdial.com' }, { domain: 'client.example' }],
  backlinks: {
    'client.example': [{ url_from: 'https://a.example/x', url_to: 'https://client.example/gone' }],
    'rival.example': [
      { url_from: 'https://good.example/list', url_to: 'https://rival.example/dead', domain_from_rank: 400 },
      { url_from: 'https://alive.example/list', url_to: 'https://rival.example/fine', domain_from_rank: 500 },
      { url_from: 'https://known.example/page', url_to: 'https://rival.example/dead2' },
    ],
    'other.example': [],
  },
  referring: { 'rival.example': [{ domain: 'both.example', rank: 300 }, { domain: 'ours.example', rank: 1 }], 'other.example': [{ domain: 'both.example', rank: 300 }, { domain: 'ours.example', rank: 1 }], 'client.example': [{ domain: 'ours.example' }] },
  mentions: [{ url: 'https://press.example/story' }, { url: 'https://linked.example/story' }],
};

async function fakeDfs(path, task) {
  const cost = 0.01;
  if (path.startsWith('dataforseo_labs')) return { items: DATA[path], cost };
  if (path === 'backlinks/backlinks/live') return { items: DATA.backlinks[task.target], cost };
  if (path === 'backlinks/referring_domains/live') return { items: DATA.referring[task.target], cost };
  if (path === 'content_analysis/search/live') return { items: DATA.mentions, cost };
  throw new Error(`unexpected ${path}`);
}

const STATUS = { 'https://client.example/gone': 404, 'https://rival.example/dead': 404, 'https://rival.example/fine': 200 };
const HTML = {
  'https://client.example/sitemap.xml': '<urlset><url><loc>https://client.example/guide</loc></url></urlset>',
  'https://press.example/story': '<p>Client Co did good work</p>',
  'https://linked.example/story': '<a href="https://client.example/">Client Co</a>',
  'https://both.example/': '<p>tools we like</p>',
};
async function fakeFetch(url) {
  const status = STATUS[url] ?? (HTML[url] !== undefined || url.startsWith('https://good.example') || url.startsWith('https://alive.example') ? 200 : 404);
  return { status, ok: status === 200, text: async () => HTML[url] || '<html></html>' };
}

const asked = [];
async function fakeClaude(prompt) {
  const page = prompt.match(/Page to look at: (\S+)/)?.[1];
  asked.push(page);
  return { code: 0, err: '', out: `<json>${JSON.stringify({ relevant: true, reason: 'fits', our_url: 'https://client.example/guide', contact_email: 'ed@site.example', email_subject: 'Quick note', email_body: 'Hi\nThanks,' })}</json>` };
}

describe('runOutreach', () => {
  it('suggests real competitors, files own dead pages, and only asks Claude about checked candidates', async () => {
    const calls = [];
    const r = await runOutreach(job, { dfsFn: fakeDfs, claudeFn: fakeClaude, fetchFn: fakeFetch, hookFn: async (e, p) => { calls.push([e, p]); return {}; } });

    const suggested = calls.find(c => c[0] === 'report_competitors')[1].competitors.map(c => c.url);
    expect(suggested).toEqual(['https://newrival.example']); // not the directory, not the client itself

    expect(r.own_broken).toEqual([{ dead_url: 'https://client.example/gone', linking_pages: ['https://a.example/x'] }]);
    const pages = r.prospects.map(p => `${p.kind} ${p.page_url}`);
    expect(pages).toContain('broken_link https://good.example/list');
    expect(pages).not.toContain('broken_link https://alive.example/list'); // its "dead" link loads
    expect(asked).not.toContain('https://known.example/page'); // already a prospect
    expect(pages).toContain('mention https://press.example/story');
    expect(pages).not.toContain('mention https://linked.example/story'); // already links to us
    expect(pages).toContain('competitor_gap https://both.example/');
    expect(r.cost_usd).toBeGreaterThan(0);
    expect(calls.at(-1)[0]).toBe('submit_outreach_results');
  });

  it('lets a DataForSEO failure through with its kind, so the run is failed with that reason', async () => {
    const failing = async () => { throw new DataForSeoError('funds', 'DataForSEO backlinks/backlinks/live: 40200 Payment Required'); };
    await expect(runOutreach(job, { dfsFn: failing, claudeFn: fakeClaude, fetchFn: fakeFetch, hookFn: async () => ({}) }))
      .rejects.toMatchObject({ kind: 'funds' });
  });
});

describe('dataforseo client', () => {
  const saved = { fetch: globalThis.fetch, login: process.env.DATAFORSEO_LOGIN, pass: process.env.DATAFORSEO_PASSWORD };
  afterEach(() => {
    globalThis.fetch = saved.fetch;
    process.env.DATAFORSEO_LOGIN = saved.login ?? '';
    process.env.DATAFORSEO_PASSWORD = saved.pass ?? '';
  });
  const answer = (body, status = 200) => { globalThis.fetch = async () => ({ ok: status === 200, status, statusText: '', json: async () => body }); };

  it('says when the login is missing, rejected, or out of balance', async () => {
    process.env.DATAFORSEO_LOGIN = '';
    await expect(dfs('x', {})).rejects.toMatchObject({ kind: 'missing' });
    process.env.DATAFORSEO_LOGIN = 'l';
    process.env.DATAFORSEO_PASSWORD = 'p';
    answer({ status_code: 40100, status_message: 'You are not authorized' });
    await expect(dfs('x', {})).rejects.toMatchObject({ kind: 'auth' });
    answer({ status_code: 20000, tasks: [{ status_code: 40200, status_message: 'Payment Required.' }] });
    await expect(dfs('x', {})).rejects.toMatchObject({ kind: 'funds' });
    answer({}, 402);
    await expect(dfs('x', {})).rejects.toMatchObject({ kind: 'funds' });
    answer({ status_code: 20000, cost: 0.02, tasks: [{ status_code: 20000, result: [{ items: [{ domain: 'a' }] }] }] });
    await expect(dfs('x', {})).resolves.toEqual({ items: [{ domain: 'a' }], cost: 0.02 });
  });

  it('tries a DataForSEO server error once more and names the real error', async () => {
    process.env.DATAFORSEO_LOGIN = 'l';
    process.env.DATAFORSEO_PASSWORD = 'p';
    let calls = 0;
    const ok = { status_code: 20000, cost: 0.01, tasks: [{ status_code: 20000, result: [{ items: [{ keyword: 'a' }] }] }] };
    globalThis.fetch = async () => (++calls === 1
      ? { ok: false, status: 500, statusText: '', json: async () => ({ status_code: 20000, status_message: 'Ok.' }) }
      : { ok: true, status: 200, json: async () => ok });
    await expect(dfs('x', {}, { retryDelayMs: 0 })).resolves.toEqual({ items: [{ keyword: 'a' }], cost: 0.01 });
    expect(calls).toBe(2);

    answer({ status_code: 20000, tasks: [{ status_code: 50000, status_message: 'Internal Error.' }] });
    await expect(dfs('x', {}, { retryDelayMs: 0 })).rejects.toThrow('x: 50000 Internal Error.');
    answer({ status_code: 40501, status_message: 'Invalid Field' });
    calls = 0;
    const once = globalThis.fetch;
    globalThis.fetch = async (...a) => { calls++; return once(...a); };
    await expect(dfs('x', {}, { retryDelayMs: 0 })).rejects.toThrow(/40501/);
    expect(calls).toBe(1); // a mistake in our request is not retried
  });
});
