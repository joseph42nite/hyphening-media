/**
 * Prompts and checks for scripts/growth_worker.mjs, kept apart so tests can
 * read them without running Claude.
 *
 * Every prompt points the model at two files the worker writes into its
 * working folder: .agents/product-marketing.md (the client's Brain, which
 * every marketing-skills skill reads first) and job.json (this run's facts).
 * The model writes its answer to result.json.
 */

import { resolveMx, resolveTxt } from 'dns/promises';

const HEADER = (job) => [
  `You are working for Hyphening Media, a marketing agency, on the client ${job.client.name} (${job.client.website_url || 'no website on file'}).`,
  'Read .agents/product-marketing.md first: it is the client\'s approved marketing context. This run\'s facts are in job.json.',
  'Rules:',
  '- Only make product claims listed under "Approved claims" in that file. Never invent numbers, customers or results.',
  '- Research with WebSearch and WebFetch on public pages only. No logins, no LinkedIn or Google Maps scraping, no CAPTCHAs, no forms.',
  '- Never send an email, post, sign up or contact anyone.',
  '- Write your answer as one JSON object to result.json in this folder, and nothing else to disk.',
  ...(job.client.client_group === 'healthcare'
    ? ['- This is a regulated healthcare practice in India: no testimonials, before/after results, inducements, discounts, superlatives or outcome promises.']
    : []),
  '',
].join('\n');

const SECTION_KEYS = ['product_overview', 'target_audience', 'personas', 'pains', 'competitors', 'differentiation', 'objections',
  'switching_forces', 'customer_language', 'brand_voice', 'proof_points', 'goals', 'paid_ads'];

const PROMPTS = {
  brain_build: () => [
    'Use the `product-marketing` skill from the marketing-skills plugin, and `customer-research` for the customer language section.',
    'Propose every section of the context doc from the client\'s website (read the homepage and the main product, pricing, about and case-study pages) and what the doc already says.',
    'Keep existing text that is good; fill gaps; mark anything you could not find as "Unknown: ask the client" rather than guessing.',
    'Claims: list only claims you can point to a page for, with that page as the source.',
    `result.json: {"sections": {${SECTION_KEYS.map((k) => `"${k}": "..."`).join(', ')}}, "claims": [{"claim": "...", "source": "https://..."}], "open_questions": ["..."], "recommendations": [{"title": "...", "detail": "...", "priority": "high|medium|low"}], "summary": "two lines"}`,
  ],
  competitor_research: () => [
    'Use the `competitor-profiling` skill from the marketing-skills plugin. Profile the 3 to 5 competitors that matter most for the ideal customer in the context doc.',
    'Keep what you saw (with the page and date) apart from what you conclude. Pricing only if public.',
    'result.json: {"competitors_section": "the Competitors section of the context doc, ready to paste", "profiles": [{"name": "...", "domain": "...", "positioning": "...", "pricing": "...", "strengths": "...", "weaknesses": "...", "sources": ["https://..."]}], "recommendations": [{"title": "...", "detail": "...", "priority": "high|medium|low"}], "summary": "two lines"}',
  ],
  outbound_prospects: (job) => [
    'Use the `prospecting` skill, then the `cold-email` skill, from the marketing-skills plugin.',
    `1. Find up to ${job.wanted} companies that fit the ideal customer in the context doc, in these countries: ${(job.outbound.target_countries || []).join(', ') || 'see job.json'}.`,
    `   Never: these countries (${(job.outbound.excluded_countries || []).join(', ') || 'none'}), any email or domain in job.json "suppression", any domain in "known_domains". job.json "rejected_examples" are leads 007 turned down: don't bring more like them.`,
    `   Where to look: ${job.outbound.lead_source_notes || 'industry directories and association member lists, then company websites'}.`,
    '2. One contact per company: the person most likely to own the problem (see the buyers section). The email must be one you found published on a page you list in source_urls. If only a general address (info@, sales@) is published, use it and leave contact_name empty. Never guess an address from a name pattern.',
    '3. Score each hot, warm or cold, and tier 1 to 3, with one line on why them and the signal that makes now a good time.',
    `4. Draft a sequence of 3 emails (days 0, 3 and 8) per the cold-email skill: plain text, first email under about 80 words, subject 2 to 4 lowercase words, no links in email 1, one low-friction ask, written to that person and company. The ask: ${job.outbound.offer || 'see job.json'}.`,
    `   Booking: ${job.outbound.booking_method === 'booking_link' ? 'offer to send a time or a booking link in a reply; never paste the link in email 1' : job.outbound.booking_method === 'own_tool' ? 'offer to send a time to meet (the client books it in their own tool)' : 'ask for a reply'}.`,
    `   Sign off as ${job.outbound.sender_name || 'the sender'}${job.outbound.sender_title ? `, ${job.outbound.sender_title}` : ''}, first name only. Do not add an address, unsubscribe line or signature block: we add the footer.`,
    'result.json: {"leads": [{"company": "...", "domain": "...", "country": "...", "industry": "...", "size_band": "...", "contact_name": "...", "contact_title": "...", "contact_email": "...", "email_status": "unverified", "linkedin_url": null, "signal": "...", "why_prospect": "...", "source_urls": ["https://..."], "score": "hot|warm|cold", "tier": 1, "confidence": "high|medium|low", "sequence": [{"day": 0, "subject": "...", "body": "..."}, {"day": 3, "subject": "...", "body": "..."}, {"day": 8, "subject": "...", "body": "..."}]}], "recommendations": [{"title": "...", "detail": "...", "priority": "high|medium|low"}], "summary": "two lines: how many found, where, what was hard"}',
  ],
  outbound_replies: () => [
    'Use the `cold-email` skill from the marketing-skills plugin (its reply-handling guidance). job.json "replies" lists prospects who answered, with what they said and what we sent.',
    'Sort each reply: positive, meeting, question, objection, not_now, referral, wrong_person, out_of_office, not_interested or unsubscribe.',
    'Draft the answer a person at the client would send (short, plain, no claims outside the approved list). For not_interested or unsubscribe: no draft, next step "add to do-not-contact".',
    'result.json: {"drafts": [{"lead_id": 1, "company": "...", "category": "...", "suggested_reply": "... or null", "next_step": "..."}], "summary": "two lines"}',
  ],
  outbound_retro: () => [
    'Use the `cold-email` skill and the outbound operator guidance in `marketing-loops` from the marketing-skills plugin.',
    'job.json has this client\'s numbers ("stats"), the last 14 days of events and recent replies.',
    'Check the stop rules first: bounces over 2% means pause sending; under 1% replies after 300 contacted means stop and rework the angle or the list.',
    'Then say what worked and what didn\'t, with the numbers, and propose learnings for the context doc (status "testing" until proven).',
    'result.json: {"health": "ok|warn|stop", "summary": "three lines", "learnings": [{"learning": "...", "evidence": "...", "applies_to": "cold-email", "status": "testing"}], "recommendations": [{"title": "...", "detail": "...", "priority": "high|medium|low"}]}',
  ],
};

export function buildPrompt(job) {
  const body = PROMPTS[job.card_key];
  if (!body) throw new Error(`no prompt for card ${job.card_key}`);
  return `${HEADER(job)}${body(job).join('\n')}\n`;
}

/** job.json for the model: the facts, without the Brain (it has the markdown). */
export function jobFacts(job) {
  const { brain_markdown: _md, brain: _b, ...facts } = job;
  return facts;
}

/** Light shape check before submitting; the server validates every field again. */
export function checkResult(cardKey, r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return 'result.json is not a JSON object';
  if (cardKey === 'brain_build' && (typeof r.sections !== 'object' || !r.sections)) return 'no "sections" object';
  if (cardKey === 'competitor_research' && !r.competitors_section) return 'no "competitors_section"';
  if (cardKey === 'outbound_prospects' && !Array.isArray(r.leads)) return 'no "leads" list';
  if (cardKey === 'outbound_replies' && !Array.isArray(r.drafts)) return 'no "drafts" list';
  if (cardKey === 'outbound_retro' && !['ok', 'warn', 'stop'].includes(r.health)) return 'no "health" of ok, warn or stop';
  return null;
}

/**
 * MX, SPF and DMARC for each sending domain, and what to fix. DKIM needs the
 * provider's selector, so it is left to the mailbox provider's own check.
 */
export async function checkDomains(domains, { mx = resolveMx, txt = resolveTxt } = {}) {
  const out = [];
  const recs = [];
  for (const domain of domains) {
    const row = { domain, mx: [], spf: null, dmarc: null, dmarc_policy: null, problems: [] };
    try { row.mx = (await mx(domain)).map((m) => m.exchange).sort(); } catch { /* none */ }
    try { row.spf = (await txt(domain)).map((t) => t.join('')).find((t) => /^v=spf1\b/i.test(t)) || null; } catch { /* none */ }
    try {
      row.dmarc = (await txt(`_dmarc.${domain}`)).map((t) => t.join('')).find((t) => /^v=DMARC1\b/i.test(t)) || null;
      row.dmarc_policy = row.dmarc?.match(/\bp=(\w+)/i)?.[1]?.toLowerCase() || null;
    } catch { /* none */ }
    if (!row.mx.length) row.problems.push('no MX record: replies to this domain will bounce');
    if (!row.spf) row.problems.push('no SPF record');
    else if (/\+all\b/.test(row.spf)) row.problems.push('SPF ends in +all, which lets anyone send as this domain');
    if (!row.dmarc) row.problems.push('no DMARC record (start with v=DMARC1; p=none)');
    for (const p of row.problems) recs.push({ title: `${domain}: ${p}`, detail: 'Fix it in the domain\'s DNS settings, then run this check again. Check DKIM in the mailbox provider\'s settings too.', priority: 'high' });
    out.push(row);
  }
  const bad = out.filter((d) => d.problems.length).length;
  return {
    domains: out,
    recommendations: recs,
    summary: bad ? `${bad} of ${out.length} sending domain(s) need DNS fixes before sending` : `All ${out.length} sending domain(s) have MX, SPF and DMARC`,
  };
}
