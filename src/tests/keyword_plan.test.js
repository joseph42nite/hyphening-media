import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db from '../../database.js';
import {
  scoreKeyword, refreshKeywords, approveKeyword, rejectKeyword, autoApprove, nicheKeywords, MIN_VOLUME, MAX_DIFFICULTY,
} from '../services/keywordPlan.js';
import { handleAddBlogTopics } from '../webhooks/agentPipelines.js';

beforeAll(() => db.exec('BEGIN'));
afterAll(() => db.exec('ROLLBACK'));

// Seeds live in onboarding's niche keywords, stored as a JSON array.
function makeClient({ gsc = 'sc-domain:example.test', seeds = ['Dentist HSR Layout'] } = {}) {
  return db.prepare(`
    INSERT INTO crm_clients (name, client_type, is_active, website_url, gsc_property, brand_niche_keywords)
    VALUES (?, 'marketing', 1, 'https://example.test/', ?, ?)
  `).run(`Keyword client ${Math.random()}`, gsc, seeds ? JSON.stringify(seeds) : null).lastInsertRowid;
}

const item = (keyword, volume, difficulty, intent) => ({
  keyword,
  keyword_info: { search_volume: volume },
  keyword_properties: { keyword_difficulty: difficulty },
  search_intent_info: { main_intent: intent },
});

// Stand-ins for Search Console and DataForSEO.
function fakeSources({ queries, overview = [], ideas = [], login = true } = {}) {
  const calls = [];
  return {
    calls,
    hasLogin: () => login,
    gsc: { getQueries: async () => queries ?? [
      { query: 'Root Canal Cost Bangalore', clicks: 2, impressions: 120, position: 12.3 },
      { query: 'dentist near me', clicks: 0, impressions: 3, position: 25 },    // too few impressions
      { query: 'example dental', clicks: 40, impressions: 300, position: 1.2 }, // already on top
    ] },
    dfs: async (path, task) => {
      calls.push({ path, task });
      if (path.includes('keyword_overview')) return { items: overview, cost: 0.01 };
      return { items: ideas, cost: 0.02 };
    },
  };
}

const rows = (clientId) => db.prepare('SELECT * FROM seo_keywords WHERE client_id = ? ORDER BY score DESC').all(clientId);

describe('scoreKeyword', () => {
  it('keeps searched, reachable keywords and ranks buying intent higher', () => {
    const info = scoreKeyword({ search_volume: 100, difficulty: 10, intent: 'informational' });
    const buy = scoreKeyword({ search_volume: 100, difficulty: 10, intent: 'transactional' });
    expect(info.keep).toBe(true);
    expect(buy.score).toBeGreaterThan(info.score);
  });

  it('drops keywords with too few searches, too hard, or someone else\'s site', () => {
    expect(scoreKeyword({ search_volume: MIN_VOLUME - 1, difficulty: 5, intent: 'commercial' }).reason).toBe('too few searches');
    expect(scoreKeyword({ search_volume: 500, difficulty: MAX_DIFFICULTY + 1, intent: 'commercial' }).reason).toBe('too hard to rank for yet');
    expect(scoreKeyword({ search_volume: 500, difficulty: 5, intent: 'navigational' }).keep).toBe(false);
    expect(scoreKeyword({ search_volume: null, difficulty: null, intent: null }).reason).toBe('no search data');
    // DataForSEO's misspellings come with the real keyword's volume but no difficulty.
    expect(scoreKeyword({ search_volume: 246000, difficulty: null, intent: 'commercial' }).reason).toMatch(/no difficulty score/);
  });

  it('gives near misses leeway and a boost', () => {
    const near = { search_volume: 5, difficulty: 45, intent: 'commercial', position: 12, impressions: 60 };
    expect(scoreKeyword(near).keep).toBe(true);
    const far = scoreKeyword({ search_volume: 100, difficulty: 10, intent: 'commercial' });
    const close = scoreKeyword({ search_volume: 100, difficulty: 10, intent: 'commercial', position: 6, impressions: 50 });
    expect(close.score).toBeGreaterThan(far.score);
  });
});

describe('refreshKeywords', () => {
  it('collects near misses and seed ideas, checks them, and saves only keepers', async () => {
    const id = makeClient();
    const sources = fakeSources({
      overview: [item('root canal cost bangalore', 90, 40, 'commercial')],
      ideas: [
        item('dentist in hsr layout', 260, 12, 'transactional'),
        item('dental clinic hsr', 30, 70, 'commercial'),   // too hard
        item('teeth trivia', 5, 2, 'informational'),       // too few searches
        item('dentsit in hsr layout', 260, null, 'transactional'), // a typo: no difficulty
      ],
    });
    const r = await refreshKeywords(id, { sources });

    expect(r.notes).toEqual([]);
    expect(r.cost).toBe(0.03);
    // Only near misses go to keyword_overview; the page already at #1.2 does not.
    expect(sources.calls[0].task.keywords).toEqual(['root canal cost bangalore']);
    expect(sources.calls[1].task.keywords).toEqual(['dentist hsr layout']);
    // Only ideas that can pass the rules are asked for.
    expect(sources.calls[1].task.filters).toEqual([
      ['keyword_properties.keyword_difficulty', '<=', MAX_DIFFICULTY], 'and', ['keyword_info.search_volume', '>=', MIN_VOLUME],
    ]);

    const saved = rows(id);
    expect(saved.map(k => k.keyword)).toEqual(['dentist in hsr layout', 'root canal cost bangalore']);
    expect(saved[1]).toMatchObject({ source: 'search_console', position: 12.3, impressions: 120, search_volume: 90, status: 'candidate' });
  });

  it('drops an unscored candidate saved before the misspelling rule', async () => {
    const id = makeClient({ seeds: null });
    db.prepare("INSERT INTO seo_keywords (client_id, keyword, source, search_volume, intent, score) VALUES (?, 'digiatl marketing', 'ideas', 246000, 'commercial', 255840)").run(id);
    await refreshKeywords(id, { sources: fakeSources({ queries: [] }) });
    expect(rows(id)).toEqual([]);
  });

  it('notes what is missing instead of failing', async () => {
    const id = makeClient({ gsc: null, seeds: null });
    const r = await refreshKeywords(id, { sources: fakeSources({ login: false }) });
    expect(r.added).toBe(0);
    expect(r.notes.join(' ')).toMatch(/Search Console not connected/);
    expect(r.notes.join(' ')).toMatch(/DataForSEO login missing/);
  });

  it('skips keywords already used by a topic and never re-suggests a rejected one', async () => {
    const id = makeClient();
    db.prepare("INSERT INTO blog_topics (client_id, topic, target_keyword) VALUES (?, 'Old post', 'Dentist In HSR Layout')").run(id);
    db.prepare("INSERT INTO seo_keywords (client_id, keyword, source, status) VALUES (?, 'dental implants hsr', 'ideas', 'rejected')").run(id);
    await refreshKeywords(id, { sources: fakeSources({ queries: [], ideas: [
      item('dentist in hsr layout', 260, 12, 'transactional'),
      item('dental implants hsr', 200, 10, 'transactional'),
    ] }) });
    const saved = db.prepare('SELECT keyword, status FROM seo_keywords WHERE client_id = ?').all(id);
    expect(saved).toEqual([{ keyword: 'dental implants hsr', status: 'rejected' }]);
  });

  it('falls back to the top Search Console searches when onboarding has no niche keywords', async () => {
    const id = makeClient({ seeds: null });
    const sources = fakeSources();
    const r = await refreshKeywords(id, { sources });
    const ideasCall = sources.calls.find(c => c.path.includes('keyword_ideas'));
    // Most impressions first; the 3-impression search at #25 still counts as a seed.
    expect(ideasCall.task.keywords).toEqual(['example dental', 'root canal cost bangalore', 'dentist near me']);
    expect(r.notes.join(' ')).toMatch(/top Search Console searches were used as seeds/);
  });

  it('reads niche keywords stored as JSON or as lines', () => {
    expect(nicheKeywords('["Dentist  HSR", ""]')).toEqual(['dentist hsr']);
    expect(nicheKeywords('braces bangalore\nimplants')).toEqual(['braces bangalore', 'implants']);
    expect(nicheKeywords(null)).toEqual([]);
  });

  it('records the new position of approved keywords next month', async () => {
    const id = makeClient({ seeds: null });
    const ideas = [item('dentist in hsr layout', 260, 12, 'transactional')];
    await refreshKeywords(id, { sources: fakeSources({ queries: [{ query: 'dentist in hsr layout', clicks: 0, impressions: 40, position: 18 }], overview: ideas }) });
    const k = rows(id)[0];
    approveKeyword(k.id, 'test');

    await refreshKeywords(id, { sources: fakeSources({ queries: [{ query: 'dentist in hsr layout', clicks: 9, impressions: 300, position: 6.4 }], overview: ideas }) });
    expect(rows(id)[0]).toMatchObject({ status: 'approved', position: 6.4, prev_position: 18 });
  });
});

describe('approving', () => {
  it('turns a keyword into the client\'s next topic, once', async () => {
    const id = makeClient();
    const kw = db.prepare("INSERT INTO seo_keywords (client_id, keyword, source, search_volume, difficulty, intent) VALUES (?, 'braces cost bangalore', 'ideas', 140, 18, 'commercial')").run(id).lastInsertRowid;
    const topicId = approveKeyword(kw, 'joseph@hyphening.com');
    const topic = db.prepare('SELECT * FROM blog_topics WHERE id = ?').get(topicId);
    expect(topic).toMatchObject({ client_id: id, target_keyword: 'braces cost bangalore', keyword_id: kw, status: 'planned' });
    expect(topic.notes).toMatch(/140 searches\/month/);
    expect(() => approveKeyword(kw, 'x')).toThrow(/already approved/);
    expect(() => rejectKeyword(kw, 'x')).toThrow();
  });

  it('auto-approve turns only the best N candidates into topics, and is off by default', () => {
    const id = makeClient();
    const add = db.prepare("INSERT INTO seo_keywords (client_id, keyword, source, score) VALUES (?, ?, 'ideas', ?)");
    add.run(id, 'low', 10); add.run(id, 'high', 90); add.run(id, 'mid', 50);
    expect(autoApprove(id)).toBe(0);

    db.prepare('UPDATE crm_clients SET keywords_auto_approve = 2 WHERE id = ?').run(id);
    expect(autoApprove(id)).toBe(2);
    const approved = db.prepare("SELECT keyword, decided_by FROM seo_keywords WHERE client_id = ? AND status = 'approved' ORDER BY score DESC").all(id);
    expect(approved).toEqual([{ keyword: 'high', decided_by: 'auto' }, { keyword: 'mid', decided_by: 'auto' }]);
    expect(db.prepare('SELECT COUNT(*) n FROM blog_topics WHERE client_id = ?').get(id).n).toBe(2);
  });

  it('bots can no longer add topics without a keyword', () => {
    const r = handleAddBlogTopics({ client_id: makeClient(), topics: [{ topic: 'Made up' }] });
    expect(r.success).toBe(false);
    expect(r.summary).toMatch(/approved keywords/);
  });
});
