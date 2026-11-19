/**
 * The review a night fix must pass before it is committed, after the manifest's
 * checks. Two parts:
 *
 *   1. Rules, no model involved: on the built site (the manifest's deploy
 *      local_dir), every page whose <title> or meta description changed must
 *      stay within length, must not repeat the brand, and the diff must not add
 *      superlatives or (for healthcare clients) medical or regulatory claims.
 *   2. A second Claude run that only reads: it sees the recommendation, the
 *      diff and the before → after titles and says "pass" or "hold". Anything
 *      but a clear "pass" holds the fix.
 *
 * A held fix is undone and goes to 007 ("needs you") with the reason, instead
 * of sitting in the Deploy queue looking ready.
 *
 * Why: the fix model is told not to add claims or break titles, but nothing
 * checked. On 18 Nov 2026 night fixes for a dermatologist went live with
 * "Best Dermatologist ..." (84 characters), a new "US-FDA cleared lasers"
 * claim, and a booking-page title that named the clinic twice.
 */

import path from 'path';
import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';

export const TITLE_MAX = 65;
export const DESCRIPTION_MAX = 160;
const MAX_PAGES = 3000;

/** Words a fix may not add, for any client: superlatives and promises. */
const CLAIMS = [
  /\bbest\b/i, /\btop[- ]rated\b/i, /\bno\.? ?1\b/i, /#1\b/, /\bnumber one\b/i, /\bleading\b/i, /\bfinest\b/i,
  /\bworld[- ]class\b/i, /\bguarantee[ds]?\b/i, /\b100 ?%/i, /\brisk[- ]free\b/i,
];
/** And for healthcare clients: outcome, safety and regulatory claims. */
const HEALTH_CLAIMS = [
  /\bcures?\b/i, /\bcured\b/i, /\bpermanent(ly)?\b/i, /\bpainless\b/i, /\bsafest\b/i, /\bno side[- ]effects?\b/i,
  /\bfda\b/i, /\bclinically\b/i, /\bproven\b/i, /\bcertified\b/i, /\bapproved\b/i, /\bmiracle\b/i,
];

const decode = (s) => s
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

function headOf(html) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const desc = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i);
  return { title: title ? decode(title[1]) : null, description: desc ? decode(desc[1]) : null };
}

/** { 'acne/index.html': { title, description } } for the built site, or null when there is none. */
export async function snapshotHeads(dir) {
  if (!dir || !existsSync(dir)) return null;
  const heads = {};
  let n = 0;
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (n >= MAX_PAGES) return;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) await walk(p); }
      else if (e.name.endsWith('.html')) { n++; heads[path.relative(dir, p)] = headOf(await readFile(p, 'utf8')); }
    }
  }
  await walk(dir);
  return heads;
}

/** Pages whose title or description differ between two snapshots. */
export function headChanges(before, after) {
  if (!before || !after) return [];
  const out = [];
  for (const [page, now] of Object.entries(after)) {
    const was = before[page] || { title: null, description: null };
    if (was.title !== now.title || was.description !== now.description) out.push({ page, before: was, after: now });
  }
  return out;
}

const words = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(Boolean);

/** A run of 3+ words that appears in two different parts of a title ("A | Dr X Clinic | Dr X Dermatology"). */
export function repeatedName(title) {
  const parts = title.split(/\s*[|–—]\s*|\s[-:]\s/).map(words).filter((w) => w.length);
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      for (let k = 0; k + 3 <= parts[i].length; k++) {
        const gram = parts[i].slice(k, k + 3).join(' ');
        if (` ${parts[j].join(' ')} `.includes(` ${gram} `)) return gram;
      }
    }
  }
  return null;
}

/** Added/removed lines of a unified diff, without the file headers. */
function diffLines(diff, sign) {
  return diff.split('\n').filter((l) => l.startsWith(sign) && !l.startsWith(`${sign}${sign}${sign}`)).map((l) => l.slice(1));
}

/** Problems the rules find; [] when the fix may go on to the review. */
export function ruleProblems({ diff, changes, healthcare }) {
  const problems = [];
  for (const { page, before, after } of changes) {
    const t = after.title || '';
    const t0 = before.title || '';
    if (t.length > TITLE_MAX && t.length > t0.length) problems.push(`${page}: the title is ${t.length} characters (keep it to ${TITLE_MAX}): "${t}"`);
    const name = t && repeatedName(t);
    if (name && name !== (t0 && repeatedName(t0))) problems.push(`${page}: the title names "${name}" twice: "${t}"`);
    const d = after.description || '';
    const d0 = before.description || '';
    if (d.length > DESCRIPTION_MAX && d.length > d0.length) problems.push(`${page}: the meta description is ${d.length} characters (keep it to ${DESCRIPTION_MAX})`);
  }
  const added = diffLines(diff, '+').join('\n');
  const removed = diffLines(diff, '-').join('\n');
  const count = (re, s) => (s.match(new RegExp(re.source, `${re.flags.replace('g', '')}g`)) || []).length;
  for (const re of healthcare ? [...CLAIMS, ...HEALTH_CLAIMS] : CLAIMS) {
    if (count(re, added) > count(re, removed)) {
      const word = added.match(re)[0];
      problems.push(`adds "${word}": a claim the night fixes may not make${healthcare ? ' (healthcare client)' : ''}`);
    }
  }
  return problems;
}

export function reviewPrompt({ client, rec, diff, changes, healthcare }) {
  return [
    `You are reviewing one automatic night fix to ${client.name}'s website (${client.website_url}) before it is committed. If you pass it, it is queued to go live. You can read the code in the current folder; you cannot change anything.`,
    '',
    `It was made for recommendation #${rec.id} (${rec.audit_type} audit): ${rec.metric}. Issue: ${rec.issue}. Action asked: ${rec.action_required}.`,
    rec.fix_approved && rec.fix_note ? `007 approved this change and said: """${rec.fix_note}"""` : '',
    '',
    'Hold it (verdict "hold") if ANY of these is true:',
    '- It changes or adds a claim, fact, number, price, credential, certification, approval (e.g. "FDA"), experience figure, superlative ("best", "top", "leading") or promise that was not already on this page.',
    healthcare ? '- Healthcare client: any health, outcome, safety or regulatory wording that was not already there, however small.' : '',
    `- A title or meta description ends up too long (titles over ${TITLE_MAX} characters, descriptions over ${DESCRIPTION_MAX}), keyword-stuffed, or repeats the brand or clinic name. Check the final title as the site renders it (layouts often add " | Brand" after every page title), shown below.`,
    '- It does more than the recommendation asked, changes design or layout, or would read worse to a patient or customer than before.',
    '- It looks broken: wrong page, a typo, broken markup or schema, a link to a page that does not exist.',
    'Otherwise pass it. When unsure, hold it: 007 will look.',
    '',
    changes.length ? `Rendered titles and descriptions that changed (before → after):\n${changes.map((c) => `- ${c.page}\n  title: "${c.before.title}" → "${c.after.title}"\n  description: "${c.before.description}" → "${c.after.description}"`).join('\n')}` : 'No rendered title or description changed (or the site has no built output to compare).',
    '',
    'The diff:',
    diff.slice(0, 15000),
    '',
    'Answer between <json> and </json>, the reason in one plain sentence for a busy owner:',
    '<json>{"verdict": "pass", "reason": "..."}</json> or <json>{"verdict": "hold", "reason": "..."}</json>',
  ].filter((s) => s !== '').join('\n');
}

/** The review's answer; anything but a clear pass is a hold. */
export function readVerdict(answer, raw) {
  if (answer && answer.verdict === 'pass') return { pass: true, reason: String(answer.reason || '') };
  if (answer && answer.verdict === 'hold') return { pass: false, reason: String(answer.reason || 'the review held it') };
  return { pass: false, reason: `the review gave no clear answer: ${String(raw || '').trim().slice(-200)}` };
}
