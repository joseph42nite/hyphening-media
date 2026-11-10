#!/usr/bin/env node
/**
 * Backlink outreach worker. Runs on the Mac, started by the connector after
 * Boothroyd's weekly routine (or 007's "Find now") queues outreach runs.
 * Vault: Companies/Hyphening/SOPs/Backlink outreach.md.
 *
 * For each client run:
 *   1. Fewer than 3 approved competitors → DataForSEO suggests some; they wait
 *      for 007's approval in the SEO Monitor (nothing is used unapproved).
 *   2. The client's own dead pages that other sites link to → internal
 *      redirect fixes for the night SEO queue (never outreach, never shown to the client).
 *   3. Candidates, each double-checked here before Claude sees it:
 *        broken_link     a page linking to an approved competitor's dead page
 *        competitor_gap  a blog, resource or community site from a backlink gap report
 *                        (job.gap_candidates), or one linking to 2+ approved
 *                        competitors but not to the client
 *        mention         a page naming the client without linking to it
 *   4. Claude (WebFetch only) reads each page, finds a published contact, says
 *      whether it's worth asking, picks the client page to offer (or proposes a
 *      blog topic) and drafts a short human email. 15 prospects at most.
 *   5. Sent emails with no reply after 5 days get a follow-up draft; won links
 *      are checked again.
 * Results, or the exact reason it couldn't run, go back to the portal. A
 * DataForSEO problem (no login, rejected login, no balance) fails the run with
 * that reason so it shows in the SEO Monitor and the morning brief.
 *
 *   node scripts/outreach_worker.mjs --once
 */

import os from 'os';
import path from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { hook } from './lib/hook.mjs';
import { appendNightReport } from './lib/nightReport.mjs';
import { run, jsonBetweenTags, tail } from './lib/proc.mjs';
import { dfs, DataForSeoError } from './lib/dataforseo.mjs';

const CLAUDE_BIN = process.env.OUTREACH_CLAUDE_BIN || 'claude';
const MODEL = process.env.OUTREACH_MODEL || 'claude-sonnet-5-5';
const CLAUDE_TIMEOUT_MS = 8 * 60 * 1000;
const LOCATION_CODE = 2356; // India
const MAX_COMPETITORS = 3;

// Platforms and directories that outrank everyone and are never real competitors or prospects.
const NOT_A_SITE = /(^|\.)(google|youtube|facebook|instagram|linkedin|twitter|x|pinterest|reddit|quora|wikipedia|amazon|flipkart|justdial|practo|indiamart|sulekha|yelp|tripadvisor|zomato|swiggy|medium|blogspot|wordpress)\.[a-z.]+$/i;

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };

/** Status of a URL as a browser would see it (GET, redirects followed); 0 when unreachable. */
async function statusOf(url, fetchFn) {
  try {
    const res = await fetchFn(url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; HyphenOutreach/1.0)' } });
    return res.status;
  } catch {
    return 0;
  }
}

async function pageHtml(url, fetchFn) {
  try {
    const res = await fetchFn(url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; HyphenOutreach/1.0)' } });
    return res.ok ? (await res.text()).slice(0, 2_000_000) : null;
  } catch {
    return null;
  }
}

const linksTo = (html, domain) => new RegExp(`href=["'][^"']*${domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(html || '');

/** The client's own pages, from its sitemap, so Claude offers a real page. */
async function ourPages(site, fetchFn) {
  const xml = await pageHtml(new URL('/sitemap.xml', site).href, fetchFn);
  return [...String(xml || '').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]).slice(0, 150);
}

function vetPrompt(job, cand, pages) {
  const c = job.client;
  const what = {
    broken_link: () => `This page links to ${cand.dead_url}, a page on ${cand.competitor_domain} (a competitor) that no longer loads. We offer one of ${c.name}'s pages as a working replacement.`,
    competitor_gap: () => `This site links to competitors (${cand.competitor_domains.join(', ')}) but not to ${c.name}.${cand.site_type ? ` Our backlink gap check took it for a ${cand.site_type} site${cand.why ? ` (${cand.why})` : ''}.` : ''} Find the most relevant page on the site to suggest ${c.name} for (a resource list, a tools or partners page, an article on the topic).`,
    mention: () => `This page mentions ${c.name} but doesn't link to ${c.website_url}. We ask them to add the link.`,
  }[cand.kind]();
  return [
    `You're preparing one backlink outreach email for ${c.name} (${c.website_url}).`,
    what,
    `Page to look at: ${cand.page_url}`,
    '',
    'Use WebFetch to read the page, and the site\'s contact or about page if needed. Then decide:',
    '1. Is it worth asking? Only if the site is real, relevant to the client\'s field, not spam, not a directory or marketplace, and a person can be contacted. Otherwise relevant=false with a one-line reason.',
    '2. A contact: an email address published on the site (contact page, author bio, footer). Never guess an address. If there is none, give the contact page URL and leave contact_email empty.',
    `3. Which of the client's pages to offer (pick from this list only): ${pages.length ? pages.join(' ') : '(sitemap unavailable: use the homepage)'}`,
    job.planned_topics.length ? `   If none fits but one of these planned blog posts would, name it in proposed_topic instead: ${job.planned_topics.map((t) => t.topic).join(' | ')}` : '',
    '   If nothing fits at all, propose a new blog topic in proposed_topic and leave our_url empty.',
    '4. Draft the email: short (90-140 words), plain, written by a person at the agency. Mention their specific page. Say why the link helps their readers. No flattery, no "I hope this finds you well", no links other than the one offered, no promises, no payment offers.',
    c.blog_compliance_profile === 'healthcare' ? '   Healthcare client: no health or outcome claims of any kind.' : '',
    '   End with "Thanks," and nothing after it: the sender\'s Gmail adds their signature. Plain text, no markdown.',
    '',
    'Answer only with JSON between <json> and </json>:',
    '<json>{"relevant": true, "reason": "...", "page_title": "...", "contact_name": "", "contact_email": "", "contact_url": "", "our_url": "", "proposed_topic": "", "email_subject": "...", "email_body": "..."}</json>',
  ].filter((s) => s !== '').join('\n');
}

function followUpPrompt(job, p) {
  return [
    `Write a short, polite follow-up (40-70 words) to this outreach email for ${job.client.name}, sent 5+ days ago with no reply.`,
    'Plain text, no markdown, same tone, no pressure, end with "Thanks," and nothing after it.',
    `Original subject: ${p.email_subject}`,
    `Original email:\n${p.email_body}`,
    '',
    'Answer only with JSON between <json> and </json>: <json>{"subject": "Re: ...", "body": "..."}</json>',
  ].join('\n');
}

async function claude(prompt, tools) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'outreach-'));
  try {
    const args = ['-p', '--output-format', 'text', '--model', MODEL];
    if (tools) args.push('--allowedTools', tools);
    return await run(CLAUDE_BIN, args, { input: prompt, cwd: dir, timeoutMs: CLAUDE_TIMEOUT_MS });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Where a candidate sits in the queue: lower is checked first. */
export function candidateOrder(c) {
  if (c.kind === 'broken_link') return 0;
  if (c.kind === 'mention') return 1;
  return c.source === 'gap_report' ? 2 : 3;
}

/** One client's run. Returns what was submitted. */
export async function runOutreach(job, { dfsFn = dfs, claudeFn = claude, hookFn = hook, fetchFn = fetch } = {}) {
  const site = job.client.website_url;
  const domain = host(site);
  const known = new Set(job.known_pages);
  const stats = { competitors_suggested: 0, own_broken: 0, candidates: 0, gap_report_candidates: 0, checked: 0, not_worth_it: 0 };
  let cost = 0;
  const call = async (p, task) => { const r = await dfsFn(p, task); cost += r.cost; return r.items; };

  // 1. Competitors to approve.
  if (job.competitors.length < MAX_COMPETITORS) {
    const items = await call('dataforseo_labs/google/competitors_domain/live', { target: domain, location_code: LOCATION_CODE, language_code: 'en', limit: 20 });
    const approved = new Set(job.competitors.map((c) => c.domain));
    const suggestions = items.map((i) => i.domain).filter((d) => d && d !== domain && !approved.has(d) && !NOT_A_SITE.test(d)).slice(0, 8);
    if (suggestions.length) {
      await hookFn('report_competitors', { client_id: job.client.id, competitors: suggestions.map((d, n) => ({ url: `https://${d}`, query: 'DataForSEO: shares keywords with the client', position: n + 1 })) });
      stats.competitors_suggested = suggestions.length;
    }
  }

  // 2. The client's own dead pages that others link to: internal fixes.
  const ownBroken = new Map();
  for (const b of await call('backlinks/backlinks/live', { target: domain, mode: 'as_is', filters: ['is_broken', '=', true], limit: 100 })) {
    if (!b.url_to || !b.url_from) continue;
    if (!ownBroken.has(b.url_to)) ownBroken.set(b.url_to, []);
    ownBroken.get(b.url_to).push(b.url_from);
  }
  const own_broken = [];
  for (const [dead, from] of [...ownBroken].slice(0, 10)) {
    const s = await statusOf(dead, fetchFn);
    if (s >= 400 || s === 0) own_broken.push({ dead_url: dead, linking_pages: [...new Set(from)].slice(0, 5) });
  }
  stats.own_broken = own_broken.length;

  // 3. Candidates.
  const candidates = [];
  const competitors = job.competitors.slice(0, MAX_COMPETITORS);
  for (const comp of competitors) {
    const items = await call('backlinks/backlinks/live', { target: comp.domain, mode: 'one_per_domain', filters: ['is_broken', '=', true], order_by: ['rank,desc'], limit: 50 });
    for (const b of items) {
      if (!b.url_from || !b.url_to || known.has(b.url_from) || NOT_A_SITE.test(host(b.url_from) || '')) continue;
      candidates.push({ kind: 'broken_link', page_url: b.url_from, dead_url: b.url_to, competitor_domain: comp.domain, site_domain: host(b.url_from), domain_rank: b.domain_from_rank ?? b.rank ?? null, page_title: b.page_from_title || null });
    }
  }
  // Gap report domains: already compared and typed by the backlink gap card,
  // so they come before the 2+-competitor search below.
  const fromGapReport = new Set();
  for (const g of job.gap_candidates || []) {
    if (!g?.page_url || known.has(g.page_url) || g.site_domain === domain || NOT_A_SITE.test(g.site_domain || '')) continue;
    fromGapReport.add(g.site_domain);
    candidates.push({ kind: 'competitor_gap', source: 'gap_report', page_url: g.page_url, site_domain: g.site_domain, domain_rank: g.domain_rank, competitor_domains: g.competitor_domains, site_type: g.type, why: g.why });
  }
  stats.gap_report_candidates = fromGapReport.size;
  if (competitors.length >= 2) {
    const sets = [];
    for (const comp of competitors) sets.push(new Map((await call('backlinks/referring_domains/live', { target: comp.domain, order_by: ['rank,desc'], limit: 300 })).map((r) => [r.domain, r.rank])));
    const ours = new Set((await call('backlinks/referring_domains/live', { target: domain, limit: 1000 })).map((r) => r.domain));
    const tally = new Map();
    sets.forEach((set, i) => { for (const [d, rank] of set) { const t = tally.get(d) || { comps: [], rank: 0 }; t.comps.push(competitors[i].domain); t.rank = Math.max(t.rank, rank || 0); tally.set(d, t); } });
    for (const [d, t] of tally) {
      const page = `https://${d}/`;
      if (t.comps.length < 2 || ours.has(d) || d === domain || NOT_A_SITE.test(d) || known.has(page) || fromGapReport.has(d)) continue;
      candidates.push({ kind: 'competitor_gap', page_url: page, site_domain: d, domain_rank: t.rank, competitor_domains: t.comps });
    }
  }
  for (const m of await call('content_analysis/search/live', { keyword: job.client.name, limit: 30 })) {
    const url = m.url || m.page_url;
    const d = host(url);
    if (!url || !d || d === domain || known.has(url) || NOT_A_SITE.test(d)) continue;
    candidates.push({ kind: 'mention', page_url: url, site_domain: d, domain_rank: m.domain_rank ?? m.rank ?? null });
  }
  stats.candidates = candidates.length;

  // Broken links first (the strongest ask), then mentions, then gap report
  // domains, then the 2+-competitor search; within each, by the site's rank.
  candidates.sort((a, b) => candidateOrder(a) - candidateOrder(b) || (b.domain_rank || 0) - (a.domain_rank || 0));

  // 4. Check and draft, until enough prospects.
  const pages = await ourPages(site, fetchFn);
  const prospects = [];
  const seen = new Set();
  for (const cand of candidates) {
    if (prospects.length >= job.max_prospects || stats.checked >= job.max_prospects * 2) break;
    if (seen.has(cand.page_url)) continue;
    seen.add(cand.page_url);
    // Our own check before spending a Claude call: the page must load, a dead link must really be dead,
    // and a mention must really lack the link.
    if (cand.kind === 'broken_link') {
      const [page, dead] = await Promise.all([statusOf(cand.page_url, fetchFn), statusOf(cand.dead_url, fetchFn)]);
      if (page !== 200 || (dead > 0 && dead < 400)) continue;
    } else {
      const html = await pageHtml(cand.page_url, fetchFn);
      if (!html || (cand.kind === 'mention' && linksTo(html, domain))) continue;
    }
    stats.checked++;
    const res = await claudeFn(vetPrompt(job, cand, pages), 'WebFetch');
    const a = jsonBetweenTags(res.out);
    if (!a || !a.relevant || !a.email_subject || !a.email_body) { stats.not_worth_it++; continue; }
    const ourUrl = pages.includes(a.our_url) || a.our_url === site ? a.our_url : null;
    prospects.push({
      kind: cand.kind, page_url: cand.page_url, site_domain: cand.site_domain, page_title: a.page_title || cand.page_title,
      dead_url: cand.dead_url || null, competitor_domain: cand.competitor_domain || cand.competitor_domains?.join(', ') || null,
      domain_rank: cand.domain_rank, our_url: ourUrl, proposed_topic: ourUrl ? null : (a.proposed_topic || null), reason: a.reason,
      contact_name: a.contact_name || null, contact_email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.contact_email || '') ? a.contact_email : null,
      contact_url: a.contact_url || null, email_subject: a.email_subject, email_body: a.email_body,
    });
  }

  // 5. Follow-ups and won-link checks.
  const follow_ups = [];
  for (const p of job.follow_ups) {
    const f = jsonBetweenTags((await claudeFn(followUpPrompt(job, p), null)).out);
    if (f?.subject && f?.body) follow_ups.push({ id: p.id, subject: f.subject, body: f.body });
  }
  const verified = [];
  for (const w of job.to_verify) verified.push({ id: w.id, live: linksTo(await pageHtml(w.live_url, fetchFn), domain) });

  const payload = { run_id: job.run_id, prospects, follow_ups, verified, own_broken, stats: { ...stats, prospects: prospects.length }, cost_usd: Math.round(cost * 10000) / 10000 };
  await hookFn('submit_outreach_results', payload);
  return payload;
}

async function main() {
  const res = await hook('claim_outreach_runs', { worker: os.hostname() });
  const runs = res?.data?.runs || [];
  if (runs.length === 0) return console.log('[outreach] Nothing queued.');
  for (const job of runs) {
    try {
      const r = await runOutreach(job);
      console.log(`[outreach] ${job.client.name}: ${r.prospects.length} prospect(s), $${r.cost_usd} DataForSEO`);
      await appendNightReport(`OUTREACH · ${job.client.name} · ${r.prospects.length} prospect(s) to approve · DataForSEO ok ($${r.cost_usd}) (SEO Monitor → Outreach)`);
    } catch (err) {
      const kind = err instanceof DataForSeoError ? `dataforseo_${err.kind}` : 'other';
      console.error(`[outreach] ${job.client.name}: ${kind}: ${err.message}`);
      await hook('fail_outreach_run', { run_id: job.run_id, failure_kind: kind, error: tail(err.message, 800) }).catch(() => {});
      await appendNightReport(`OUTREACH FAILED · ${job.client.name} · ${kind === 'dataforseo_funds' ? 'DataForSEO balance or payment: top up at app.dataforseo.com' : kind === 'dataforseo_missing' ? 'DataForSEO login missing on the Mac' : kind === 'dataforseo_auth' ? 'DataForSEO login rejected' : err.message.slice(0, 200)}`);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error('[outreach] Fatal:', err); process.exit(1); });
}
