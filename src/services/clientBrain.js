/**
 * Client Brain: one versioned marketing profile per client.
 *
 * The sections follow marketing-skills' product-marketing context doc
 * (.agents/product-marketing.md), so every skill in that plugin reads it
 * first. The existing brand and voice onboarding fields (onboardingFields.js)
 * are folded into the rendered doc rather than asked again.
 *
 * Saved in the database and rendered when a run starts (renderBrainMarkdown),
 * the same "read live" rule the blog pipeline follows: there is no file to
 * keep in sync between EC2 and the Mac.
 *
 * Claims are the only product claims copy may make. Each needs a source; a
 * claim the client can't back up does not belong here.
 */

import db from '../../database.js';
import { ONBOARDING_FIELDS } from './onboardingFields.js';

export const BRAIN_SECTIONS = [
  { key: 'product_overview', label: 'Product or service', hint: 'What it is, who it is for, what it replaces. One paragraph.' },
  { key: 'target_audience', label: 'Ideal customer', hint: 'Company type, size, location, signs they need it now, and who is not a fit.' },
  { key: 'personas', label: 'Buyers and users', hint: 'The people involved: who uses it, who champions it, who decides, who pays.' },
  { key: 'pains', label: 'Problems it solves', hint: 'In the customer\'s words where possible.' },
  { key: 'competitors', label: 'Competitors and alternatives', hint: 'Direct competitors, other ways they solve it today (spreadsheets, an agency, doing nothing).' },
  { key: 'differentiation', label: 'Why choose us', hint: 'What only we do, or do best.' },
  { key: 'objections', label: 'Objections', hint: 'What makes people hesitate, and the honest answer to each.' },
  { key: 'switching_forces', label: 'Why people switch (or don\'t)', hint: 'What pushes them away from today\'s way, what pulls them to us, what keeps them stuck.' },
  { key: 'customer_language', label: 'Customer language', hint: 'Phrases customers actually use. Quotes are best.' },
  { key: 'brand_voice', label: 'Voice', hint: 'How we sound. Brand and voice onboarding is added to this automatically.' },
  { key: 'proof_points', label: 'Proof', hint: 'Results, numbers, named customers, case studies we are allowed to mention.' },
  { key: 'goals', label: 'Goal and next step', hint: 'What we want people to do (book a demo, reply, visit) and what counts as a win.' },
  { key: 'paid_ads', label: 'Ads notes (optional)', hint: 'Anything paid campaigns must know.' },
];
const SECTION_KEYS = BRAIN_SECTIONS.map((s) => s.key);
const MAX_SECTION = 6000;
const MAX_CLAIMS = 60;
const MAX_LEARNINGS = 100;

const parse = (s, fallback) => {
  if (s == null) return fallback;
  try { const v = JSON.parse(s); return v ?? fallback; } catch { return fallback; }
};
const text = (v, max) => {
  if (v == null) return '';
  return String(v).replace(/\r\n/g, '\n').trim().slice(0, max);
};

function cleanSections(input) {
  const out = {};
  for (const key of SECTION_KEYS) {
    const v = text(input?.[key], MAX_SECTION);
    if (v) out[key] = v;
  }
  return out;
}

function cleanClaims(input) {
  return (Array.isArray(input) ? input : [])
    .map((c) => (typeof c === 'string' ? { claim: c } : c))
    .map((c) => ({ claim: text(c?.claim, 500), source: text(c?.source, 300) }))
    .filter((c) => c.claim)
    .slice(0, MAX_CLAIMS);
}

function cleanLearnings(input) {
  return (Array.isArray(input) ? input : [])
    .map((l) => ({
      date: text(l?.date, 10) || new Date().toISOString().slice(0, 10),
      learning: text(l?.learning, 500),
      evidence: text(l?.evidence, 500),
      applies_to: text(l?.applies_to, 120),
      status: ['active', 'testing', 'retired'].includes(l?.status) ? l.status : 'active',
    }))
    .filter((l) => l.learning)
    .slice(0, MAX_LEARNINGS);
}

/** The client's brain, or an empty one (version 0) if nothing is saved yet. */
export function getBrain(clientId) {
  const row = db.prepare('SELECT * FROM client_brain WHERE client_id = ?').get(clientId);
  return {
    client_id: Number(clientId),
    version: row?.version || 0,
    sections: parse(row?.sections, {}),
    claims: parse(row?.claims, []),
    learnings: parse(row?.learnings, []),
    updated_by: row?.updated_by || null,
    updated_at: row?.updated_at || null,
  };
}

/**
 * Save a new version. Only the parts passed change: sections merge key by key
 * (an empty string clears one), claims and learnings replace when given.
 */
export function saveBrain(clientId, { sections, claims, learnings } = {}, { by = 'staff', note = null } = {}) {
  const client = db.prepare('SELECT id FROM crm_clients WHERE id = ?').get(clientId);
  if (!client) return { status: 404, error: 'Client not found' };
  const cur = getBrain(clientId);
  const nextSections = { ...cur.sections };
  if (sections && typeof sections === 'object') {
    for (const key of SECTION_KEYS) {
      if (sections[key] === undefined) continue;
      const v = text(sections[key], MAX_SECTION);
      if (v) nextSections[key] = v; else delete nextSections[key];
    }
  }
  const next = {
    sections: cleanSections(nextSections),
    claims: claims !== undefined ? cleanClaims(claims) : cur.claims,
    learnings: learnings !== undefined ? cleanLearnings(learnings) : cur.learnings,
  };
  const same = JSON.stringify(next.sections) === JSON.stringify(cur.sections)
    && JSON.stringify(next.claims) === JSON.stringify(cur.claims)
    && JSON.stringify(next.learnings) === JSON.stringify(cur.learnings);
  if (same && cur.version > 0) return { status: 200, brain: cur, unchanged: true };

  const version = cur.version + 1;
  const by80 = String(by || 'staff').slice(0, 80);
  db.transaction(() => {
    db.prepare(`
      INSERT INTO client_brain (client_id, version, sections, claims, learnings, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(client_id) DO UPDATE SET version = excluded.version, sections = excluded.sections,
        claims = excluded.claims, learnings = excluded.learnings, updated_by = excluded.updated_by, updated_at = excluded.updated_at
    `).run(clientId, version, JSON.stringify(next.sections), JSON.stringify(next.claims), JSON.stringify(next.learnings), by80);
    db.prepare('INSERT INTO client_brain_versions (client_id, version, sections, claims, learnings, changed_by, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(clientId, version, JSON.stringify(next.sections), JSON.stringify(next.claims), JSON.stringify(next.learnings), by80, note ? String(note).slice(0, 300) : null);
  })();
  return { status: 200, brain: getBrain(clientId) };
}

export function listBrainVersions(clientId, limit = 20) {
  return db.prepare('SELECT id, version, changed_by, note, created_at FROM client_brain_versions WHERE client_id = ? ORDER BY version DESC LIMIT ?')
    .all(clientId, Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100));
}

/** Put an older version back, as a new version. */
export function restoreBrainVersion(clientId, version, by) {
  const v = db.prepare('SELECT * FROM client_brain_versions WHERE client_id = ? AND version = ?').get(clientId, version);
  if (!v) return { status: 404, error: `Version ${version} not found` };
  const sections = parse(v.sections, {});
  // Clear sections the old version didn't have.
  for (const key of SECTION_KEYS) if (!(key in sections)) sections[key] = '';
  return saveBrain(clientId, { sections, claims: parse(v.claims, []), learnings: parse(v.learnings, []) }, { by, note: `restored version ${version}` });
}

/** Sections with nothing in them, by key. */
export function missingSections(brain, keys = SECTION_KEYS) {
  return keys.filter((k) => !text(brain.sections?.[k], MAX_SECTION));
}

function onboardingVoice(clientId) {
  const row = db.prepare(`SELECT ${ONBOARDING_FIELDS.join(', ')} FROM crm_clients WHERE id = ?`).get(clientId);
  if (!row) return [];
  const list = (f) => parse(row[f], []).filter(Boolean);
  const lines = [];
  if (row.brand_audience_primary) lines.push(`- Primary audience: ${row.brand_audience_primary}`);
  if (row.brand_audience_secondary) lines.push(`- Secondary audience: ${row.brand_audience_secondary}`);
  if (row.brand_positioning) lines.push(`- Positioning: ${row.brand_positioning}`);
  if (list('brand_editorial_do').length) lines.push(`- Always: ${list('brand_editorial_do').join('; ')}`);
  if (list('brand_editorial_dont').length) lines.push(`- Never: ${list('brand_editorial_dont').join('; ')}`);
  if (list('brand_taboo_phrases').length) lines.push(`- Never say: ${list('brand_taboo_phrases').join('; ')}`);
  const comp = parse(row.brand_competitor_differentiation, []);
  if (Array.isArray(comp) && comp.length) {
    lines.push(`- Versus competitors: ${comp.map((c) => (typeof c === 'string' ? c : `${c.name}${c.differentiator ? `: ${c.differentiator}` : ''}`)).join('; ')}`);
  }
  if (row.persona_vocabulary_tier) lines.push(`- Vocabulary: ${row.persona_vocabulary_tier}`);
  return lines;
}

/**
 * The brain as marketing-skills' .agents/product-marketing.md, with the
 * client's group and compliance notes on top so every skill sees them.
 */
export function renderBrainMarkdown(clientId) {
  const client = db.prepare('SELECT id, name, website_url, client_group FROM crm_clients WHERE id = ?').get(clientId);
  if (!client) return null;
  const brain = getBrain(clientId);
  const out = [
    `# Product marketing context: ${client.name}`,
    '',
    `Version ${brain.version}${brain.updated_at ? `, saved ${brain.updated_at} UTC` : ''}. Generated by the Hyphening Ops Center from the client's Brain; edit it there, not here.`,
    '',
    `- Website: ${client.website_url || 'not on file'}`,
    `- Client group: ${client.client_group || 'not set'}`,
  ];
  if (client.client_group === 'healthcare') {
    out.push('- Compliance: a regulated healthcare practice in India (NMC or Dental Council). No testimonials, before/after results, inducements, discounts, superlatives ("best", "trusted") or outcome promises. No unsolicited outreach to patients.');
  }
  out.push('');
  for (const s of BRAIN_SECTIONS) {
    const body = text(brain.sections[s.key], MAX_SECTION);
    const extra = s.key === 'brand_voice' ? onboardingVoice(clientId) : [];
    if (!body && !extra.length) continue;
    out.push(`## ${s.label}`, '');
    if (body) out.push(body, '');
    if (extra.length) out.push('From brand and voice onboarding:', ...extra, '');
  }
  out.push('## Approved claims', '');
  if (brain.claims.length) {
    out.push('Only these product claims may be made. Anything else needs a source first.', '');
    for (const c of brain.claims) out.push(`- ${c.claim}${c.source ? ` (source: ${c.source})` : ''}`);
  } else {
    out.push('None approved yet: make no specific product claims.');
  }
  out.push('');
  if (brain.learnings.length) {
    out.push('## Learnings', '', '| Date | Learning | Evidence | Applies to | Status |', '|---|---|---|---|---|');
    for (const l of brain.learnings) out.push(`| ${l.date} | ${l.learning} | ${l.evidence} | ${l.applies_to} | ${l.status} |`);
    out.push('');
  }
  return out.join('\n');
}
