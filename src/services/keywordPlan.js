/**
 * Keyword-checked blog topics, the same loop for every client:
 *
 *   1. Collect: Search Console near misses (searches the client already shows
 *      up for at positions 4-30) and DataForSEO ideas from the client's niche
 *      keywords in onboarding (crm_clients.brand_niche_keywords), or from its
 *      top Search Console searches when onboarding has none.
 *   2. Check: monthly searches, difficulty and intent from DataForSEO.
 *   3. Score in code (scoreKeyword) and list the keepers in the Blog Monitor.
 *   4. 007 approves one → it becomes a blog topic (approveKeyword). A client
 *      with keywords_auto_approve = N gets its N best approved each month.
 *   5. Next month's refresh records the client's new position for every
 *      keyword, approved ones included, so a post's keyword shows if it moved.
 *
 * No AI here: every number is an API call, every decision a rule below.
 */

import db from '../../database.js';
import * as gsc from './searchConsoleClient.js';
import { dfs, hasLogin } from '../../scripts/lib/dataforseo.mjs';

const INDIA = { location_code: 2356, language_code: 'en' };

// The rules. Kept as plain numbers so they are easy to argue with.
export const MIN_VOLUME = 20;        // monthly searches
export const MAX_DIFFICULTY = 30;    // 0-100; a young site rarely ranks above this
const NEAR_MISS = { from: 4, to: 30, minImpressions: 10 };
const INTENT_WEIGHT = { transactional: 1.5, commercial: 1.3, informational: 1, navigational: 0 };
const MAX_NEW_PER_REFRESH = 40;
const IDEAS_LIMIT = 300;
const AUTO_SEEDS = 10;

const defaultSources = { gsc, dfs, hasLogin };

const norm = (k) => String(k || '').toLowerCase().replace(/\s+/g, ' ').trim();
const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

/** Onboarding's niche keywords: a JSON array as text, or one per line. */
export function nicheKeywords(text) {
  if (!text) return [];
  let list;
  try { list = JSON.parse(text); } catch { list = String(text).split('\n'); }
  return (Array.isArray(list) ? list : []).map(norm).filter(Boolean);
}

/**
 * { keep, score, reason } for one keyword. Near misses get leeway on volume
 * and difficulty: Google already shows the client for them.
 */
export function scoreKeyword({ search_volume: volume, difficulty, intent, position, impressions }) {
  const nearMiss = position != null && position >= NEAR_MISS.from && position <= NEAR_MISS.to
    && (impressions ?? 0) >= NEAR_MISS.minImpressions;
  if (intent === 'navigational') return { keep: false, reason: 'someone looking for a specific site' };
  if (volume == null && !nearMiss) return { keep: false, reason: 'no search data' };
  if ((volume ?? 0) < MIN_VOLUME && !nearMiss) return { keep: false, reason: 'too few searches' };
  if ((difficulty ?? 0) > MAX_DIFFICULTY && !(nearMiss && position <= 20)) return { keep: false, reason: 'too hard to rank for yet' };

  // Search Console impressions cover 90 days; a third is a rough month.
  const demand = Math.max(volume ?? 0, Math.round((impressions ?? 0) / 3));
  const boost = !nearMiss ? 1 : position <= 10 ? 2 : position <= 20 ? 1.5 : 1.2;
  const ease = 1 - (difficulty ?? 20) / 100;
  const score = Math.round(demand * (INTENT_WEIGHT[intent] ?? 1) * boost * ease * 10) / 10;
  return { keep: score > 0, score, reason: null };
}

function last90Days(now = new Date()) {
  // Search Console's final data trails by 2-3 days.
  const end = new Date(now.getTime() - 3 * 86400000);
  const start = new Date(end.getTime() - 89 * 86400000);
  return { since: start.toISOString().slice(0, 10), until: end.toISOString().slice(0, 10) };
}

/** DataForSEO Labs item → our fields. */
function fromDfs(item) {
  return {
    keyword: norm(item.keyword),
    search_volume: item.keyword_info?.search_volume ?? null,
    difficulty: item.keyword_properties?.keyword_difficulty ?? null,
    intent: item.search_intent_info?.main_intent ?? null,
  };
}

/**
 * One client's refresh. Returns { added, updated, cost, notes }.
 * `sources` exists so tests can stand in for the APIs.
 */
export async function refreshKeywords(clientId, { sources = defaultSources, now = new Date() } = {}) {
  const client = db.prepare('SELECT id, name, gsc_property, brand_niche_keywords FROM crm_clients WHERE id = ?').get(clientId);
  if (!client) throw new Error(`Client ${clientId} not found`);

  const notes = [];
  const found = new Map(); // keyword → merged fields
  const merge = (k, fields) => found.set(k, { ...(found.get(k) || { keyword: k }), ...fields });
  let cost = 0;

  // 1. Search Console: where the client stands for every search it shows up for.
  if (!client.gsc_property) {
    notes.push('Search Console not connected, so no near misses or positions.');
  } else {
    try {
      for (const q of await sources.gsc.getQueries(client.gsc_property, last90Days(now))) {
        merge(norm(q.query), { position: round1(q.position), impressions: q.impressions, source: 'search_console' });
      }
    } catch (err) {
      notes.push(`Search Console failed: ${err.message}`);
    }
  }

  // 2. DataForSEO: volume, difficulty and intent, plus ideas from the seeds.
  let seeds = nicheKeywords(client.brand_niche_keywords);
  if (!seeds.length) {
    seeds = [...found.values()].filter(k => k.position != null && k.position <= NEAR_MISS.to)
      .sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0)).slice(0, AUTO_SEEDS).map(k => k.keyword);
    if (seeds.length) notes.push('No niche keywords in onboarding, so the top Search Console searches were used as seeds.');
  }
  if (!sources.hasLogin()) {
    notes.push('DataForSEO login missing, so no search volumes or ideas.');
  } else {
    const nearMisses = [...found.values()]
      .filter(k => k.position >= NEAR_MISS.from && k.position <= NEAR_MISS.to && k.impressions >= NEAR_MISS.minImpressions)
      .map(k => k.keyword);
    // Approved keywords are re-checked too, so their numbers stay current.
    const approved = db.prepare("SELECT keyword FROM seo_keywords WHERE client_id = ? AND status = 'approved'").all(clientId).map(r => r.keyword);
    const toCheck = [...new Set([...nearMisses, ...approved])].slice(0, 700);
    try {
      if (toCheck.length) {
        const r = await sources.dfs('dataforseo_labs/google/keyword_overview/live', { ...INDIA, keywords: toCheck });
        cost += r.cost;
        for (const item of r.items) { const k = fromDfs(item); merge(k.keyword, k); }
      }
      if (seeds.length) {
        const r = await sources.dfs('dataforseo_labs/google/keyword_ideas/live', { ...INDIA, keywords: seeds.slice(0, 20), limit: IDEAS_LIMIT });
        cost += r.cost;
        for (const item of r.items) {
          const k = fromDfs(item);
          merge(k.keyword, { ...k, source: found.get(k.keyword)?.source || 'ideas' });
        }
      } else {
        notes.push('No niche keywords in onboarding and no Search Console searches, so no new ideas.');
      }
    } catch (err) {
      notes.push(`DataForSEO failed: ${err.message}`);
    }
  }

  // 3. Score and save.
  const existing = new Map(db.prepare('SELECT * FROM seo_keywords WHERE client_id = ?').all(clientId).map(r => [r.keyword, r]));
  const topics = new Set(db.prepare("SELECT target_keyword FROM blog_topics WHERE client_id = ? AND status <> 'skipped' AND target_keyword IS NOT NULL")
    .all(clientId).map(r => norm(r.target_keyword)));

  const update = db.prepare(`
    UPDATE seo_keywords SET
      search_volume = COALESCE(@search_volume, search_volume), difficulty = COALESCE(@difficulty, difficulty),
      intent = COALESCE(@intent, intent), impressions = @impressions,
      prev_position = position, position = @position, score = @score, checked_at = datetime('now')
    WHERE id = @id
  `);
  const insert = db.prepare(`
    INSERT INTO seo_keywords (client_id, keyword, source, search_volume, difficulty, intent, impressions, position, score)
    VALUES (@client_id, @keyword, @source, @search_volume, @difficulty, @intent, @impressions, @position, @score)
  `);
  const removeStale = db.prepare("DELETE FROM seo_keywords WHERE id = ? AND status = 'candidate'");

  const fresh = [];
  const result = db.transaction(() => {
    let updated = 0;
    for (const [keyword, row] of existing) {
      const k = { ...found.get(keyword) };
      const { keep, score } = scoreKeyword({ ...row, ...k });
      // A candidate that no longer passes the rules leaves the list.
      if (row.status === 'candidate' && !keep) { removeStale.run(row.id); continue; }
      update.run({
        id: row.id, search_volume: k.search_volume ?? null, difficulty: k.difficulty ?? null, intent: k.intent ?? null,
        impressions: k.impressions ?? null, position: k.position ?? null, score: score ?? null,
      });
      updated++;
    }
    for (const k of found.values()) {
      if (existing.has(k.keyword) || topics.has(k.keyword)) continue;
      const { keep, score } = scoreKeyword(k);
      if (keep) fresh.push({ ...k, score });
    }
    fresh.sort((a, b) => b.score - a.score);
    const added = fresh.slice(0, MAX_NEW_PER_REFRESH);
    for (const k of added) {
      insert.run({
        client_id: clientId, keyword: k.keyword, source: k.source || 'ideas',
        search_volume: k.search_volume ?? null, difficulty: k.difficulty ?? null, intent: k.intent ?? null,
        impressions: k.impressions ?? null, position: k.position ?? null, score: k.score,
      });
    }
    return { added: added.length, updated };
  })();

  return { ...result, cost: Math.round(cost * 10000) / 10000, notes };
}

/** The client's N best candidates become topics, if it has auto-approve on. Returns how many. */
export function autoApprove(clientId) {
  const n = db.prepare('SELECT keywords_auto_approve FROM crm_clients WHERE id = ?').get(clientId)?.keywords_auto_approve || 0;
  if (n <= 0) return 0;
  const best = db.prepare("SELECT id FROM seo_keywords WHERE client_id = ? AND status = 'candidate' ORDER BY score DESC LIMIT ?").all(clientId, n);
  for (const k of best) approveKeyword(k.id, 'auto');
  return best.length;
}

/** Every active marketing client, once a month. */
export async function runMonthlyKeywords({ sources = defaultSources } = {}) {
  const clients = db.prepare("SELECT id, name FROM crm_clients WHERE is_active = 1 AND client_type = 'marketing'").all();
  const results = [];
  for (const c of clients) {
    try {
      const r = await refreshKeywords(c.id, { sources });
      results.push({ client_id: c.id, name: c.name, ...r, auto_approved: autoApprove(c.id) });
    } catch (err) {
      results.push({ client_id: c.id, name: c.name, error: err.message });
    }
  }
  for (const r of results) {
    console.log(`[KEYWORDS] ${r.name}: ${r.error ? 'ERROR ' + r.error : `${r.added} new, ${r.updated} rechecked, ${r.auto_approved} auto-approved, $${r.cost}${r.notes.length ? ' — ' + r.notes.join(' ') : ''}`}`);
  }
  return results;
}

/** Approving a keyword makes it the client's next blog topic. Returns the topic id. */
export function approveKeyword(id, by) {
  const k = db.prepare('SELECT * FROM seo_keywords WHERE id = ?').get(id);
  if (!k) throw new Error('Keyword not found');
  if (k.status !== 'candidate') throw new Error(`Keyword is already ${k.status}`);
  const facts = [
    k.search_volume != null ? `${k.search_volume} searches/month in India` : null,
    k.difficulty != null ? `difficulty ${k.difficulty}/100` : null,
    k.intent ? `${k.intent} intent` : null,
    k.position != null ? `client ranks #${k.position} today` : null,
  ].filter(Boolean).join(', ');
  return db.transaction(() => {
    db.prepare("UPDATE seo_keywords SET status = 'approved', decided_by = ?, decided_at = datetime('now') WHERE id = ?").run(by, id);
    return db.prepare(`
      INSERT INTO blog_topics (client_id, topic, target_keyword, notes, created_by, keyword_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(k.client_id, k.keyword, k.keyword, `Write for the search "${k.keyword}" (${facts}).`, by, id).lastInsertRowid;
  })();
}

export function rejectKeyword(id, by) {
  const changed = db.prepare("UPDATE seo_keywords SET status = 'rejected', decided_by = ?, decided_at = datetime('now') WHERE id = ? AND status = 'candidate'")
    .run(by, id).changes;
  if (!changed) throw new Error('Only a candidate keyword can be rejected');
}
