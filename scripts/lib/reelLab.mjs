/**
 * The Reel Lab worker's pure parts: the prompt, and turning the model's draft
 * plus the skills' Python checks into the result the Script Tracker shows.
 * Kept apart from scripts/ig_worker.mjs so they can be tested without Claude.
 */

export const HOOK_COUNT = 5;

/** hooks.json with the formulas a compliance profile excludes taken out. */
export function filterHooks(hooksJson, healthcare, profile) {
  if (profile !== 'healthcare') return hooksJson;
  const excluded = new Set(Object.keys(healthcare.excluded_formulas || {}).map(Number));
  return { ...hooksJson, hooks: hooksJson.hooks.filter((h) => !excluded.has(Number(h.id))) };
}

const block = (title, value) => `## ${title}\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;

/**
 * The prompt. The model writes result.json in its working directory and
 * nothing else; the worker runs every check and talks to the Ops Center.
 */
export function buildPrompt(job, { healthcare }) {
  const isHealthcare = job.compliance_profile === 'healthcare';
  const o = job.onboarding || {};
  const voice = {
    client: job.client.name,
    instagram: job.client.instagram_url,
    website: job.client.website_url,
    audience_primary: o.brand_audience_primary,
    audience_secondary: o.brand_audience_secondary,
    positioning: o.brand_positioning,
    do: o.brand_editorial_do,
    dont: o.brand_editorial_dont,
    never_say: o.brand_taboo_phrases,
    tone_0_to_1: {
      funny_to_serious: o.persona_tone_funny_serious,
      formal_to_casual: o.persona_tone_formal_casual,
      respectful_to_irreverent: o.persona_tone_respectful_irreverent,
      enthusiastic_to_matter_of_fact: o.persona_tone_enthusiastic_matter_of_fact,
    },
    vocabulary: o.persona_vocabulary_tier,
    on_camera_style: job.instagram_voice?.on_camera_style,
    phrases_they_actually_say: job.instagram_voice?.signature_phrases,
  };

  const task = job.mode === 'improve'
    ? [
      'Improve the hooks of this existing script. Keep its idea and facts. Write five new hooks, then',
      'tighten the body so it follows any of them (you may trim or reorder lines; do not add new claims).',
      '',
      block('The script', { title: job.script?.title, text: job.script?.script_text }),
    ].join('\n')
    : [
      'Write one Reel for this client, borrowing what made the reference reels work (the hook shape, the pacing,',
      'the payoff), not their topic or words. Pick one idea that fits this client.',
    ].join('\n');

  return [
    `You are writing an Instagram Reel for ${job.client.name}, a client of Hyphening Media. Staff review everything before it`,
    'goes anywhere; nothing you write is posted.',
    '',
    'Work only in the current directory: write only result.json here. You have Read, Write, Edit, Glob and Grep; there is',
    'no shell and no web. Do not open any .env file.',
    '',
    '## How to write it',
    '',
    'Read these first. They are the craft: hook formulas, structure, on-screen text, caption rules, what reads as AI.',
    '- skills/ig-reel/SKILL.md and skills/ig-reel/hooks.json (the only formulas you may use)',
    '- skills/ig-caption/SKILL.md',
    '- skills/ig-human/SKILL.md',
    '',
    'Ignore every step in them that runs a Python tool, reads or writes ~/.claude/instagram, asks the user a question,',
    'logs anything or prints a "READY" block. Here the worker runs hookscore.py, beats.py, caption.py, humanize.py and',
    'detect.py on your draft after you finish, and staff see those scores. So write to pass them: concrete hooks',
    '(numbers, names), no greeting or preamble, the hook under 3 seconds spoken, no beat over 4 seconds, the last line',
    'echoing a word from the hook, one ask, no em dashes, no stock phrases, contractions.',
    '',
    task,
    '',
    block('Viral reels staff found (what happens in them, in their words)', job.references || []),
    job.topic ? `Topic staff want: ${job.topic}\n` : '',
    job.notes ? `Staff notes: ${job.notes}\n` : '',
    block('Client voice (from onboarding)', voice),
    block("This client's own recent reels against their median views (multiple = views / median)", job.performance || {}),
    job.search_keywords?.length ? `Search terms to work into the caption as normal phrases: ${job.search_keywords.join(', ')}\n` : '',
    isHealthcare ? [
      '## Healthcare rules (this is a clinic; these override the skills)',
      '',
      ...healthcare.rules.map((r) => `- ${r}`),
      '- The hooks.json you have already leaves out the formulas a clinic cannot use. Use only what is in it.',
      '',
    ].join('\n') : '',
    '## Never fabricate',
    '',
    'No invented numbers, patients, clients, results or quotes. If a line needs a fact you were not given, write',
    '{{what is needed}} in it and list it under "placeholders".',
    '',
    '## Output: result.json',
    '',
    `Exactly this shape. ${HOOK_COUNT} hooks, each from a different formula in hooks.json. "body" is the script after the hook,`,
    'one spoken beat per line, and must work after any of the hooks (start with the stake line). "on_screen" cards',
    'point at a line: 0 is the hook, 1 is body[0], and so on; six words or fewer each.',
    '',
    '```json',
    JSON.stringify({
      title: 'short working title for the script card',
      angle: 'the one idea, in one sentence',
      reference_lessons: ['per reference reel: which formula it used and why it held attention, one line'],
      target_seconds: 30,
      hooks: [{ formula_id: 3, formula_name: 'Nobody Tells You', spoken: 'the line said out loud', on_screen: 'THE HOOK CARD', why: 'why this hook fits this idea' }],
      body: ['line said after the hook', '...'],
      on_screen: [{ line: 0, text: 'CARD TEXT' }],
      caption: { text: 'the full caption, up to 5 hashtags on the last line' },
      placeholders: ['{{source + number}} for the success-rate line'],
      notes: ['anything staff should know before shooting'],
    }, null, 2),
    '```',
    '',
    'Write result.json and stop.',
  ].filter((x) => x !== '').join('\n');
}

/** Validate the model's draft enough to post-process it. Returns { draft } or { error }. */
export function parseDraft(raw) {
  let d;
  try { d = JSON.parse(raw); } catch { return { error: 'result.json is not valid JSON' }; }
  if (!Array.isArray(d.hooks) || !d.hooks.length) return { error: 'result.json has no hooks' };
  if (!Array.isArray(d.body) || !d.body.filter((l) => typeof l === 'string' && l.trim()).length) return { error: 'result.json has no script body' };
  d.hooks = d.hooks.filter((h) => h && typeof h.spoken === 'string' && h.spoken.trim());
  d.body = d.body.filter((l) => typeof l === 'string' && l.trim()).map((l) => l.trim());
  d.on_screen = Array.isArray(d.on_screen) ? d.on_screen : [];
  d.caption = d.caption && typeof d.caption === 'object' ? d.caption : { text: typeof d.caption === 'string' ? d.caption : '' };
  return { draft: d };
}

/** Hooks using a formula the profile excludes are dropped, whatever the model did. */
export function dropExcluded(hooks, healthcare, profile) {
  if (profile !== 'healthcare') return { hooks, dropped: [] };
  const excluded = new Set(Object.keys(healthcare.excluded_formulas || {}).map(Number));
  const dropped = hooks.filter((h) => excluded.has(Number(h.formula_id)));
  return { hooks: hooks.filter((h) => !excluded.has(Number(h.formula_id))), dropped };
}

/** Every {{...}} left in the text, so staff see what still needs a real fact. */
export function findPlaceholders(texts) {
  const found = new Set();
  for (const t of texts) for (const m of String(t || '').matchAll(/\{\{[^}]{1,120}\}\}/g)) found.add(m[0]);
  return [...found];
}

/** What humanize.py changed, as short lines ('1 x EM DASH -> ","', '1 x "delve into" -> "look at"'). */
export function describeCleanup(report) {
  const out = [];
  for (const r of [...(report?.invisible || []), ...(report?.typographic || [])]) {
    // Names come as "— EM DASH": drop the character itself, keep the words.
    const name = String(r.name || 'character').replace(/^\S+\s+(?=[A-Z])/, '');
    out.push(`${r.count || 1} x ${name}${r.to !== undefined ? ` -> ${r.to === '' ? '(removed)' : `"${r.to}"`}` : ' (removed)'}`);
  }
  for (const r of report?.lexical || []) {
    out.push(`${r.count || 1} x "${r.find}" -> ${r.replace === '(deleted)' ? '(removed)' : `"${r.replace}"`}`);
  }
  for (const s of report?.structures || []) out.push(`flagged: ${s.name || s.tell || JSON.stringify(s).slice(0, 80)}`);
  return out;
}

/**
 * Put the checked pieces together into the stored result: hooks sorted by
 * score, each with its own beat sheet (hook + body).
 */
export function assembleResult(draft, { scores, beats, caption, human, cleaned, dropped }) {
  const hooks = draft.hooks.map((h, i) => {
    const s = scores[i] || {};
    const b = beats[i] || {};
    return {
      formula_id: Number.isFinite(Number(h.formula_id)) ? Number(h.formula_id) : null,
      formula_name: h.formula_name || '',
      spoken: h.spoken,
      on_screen: h.on_screen || '',
      why: h.why || '',
      score: Number.isFinite(s.score) ? s.score : null,
      verdict: s.verdict || '',
      weakest: s.weakest || '',
      flags: (s.flags || []).map((f) => (typeof f === 'string' ? f : f.detail || f.message || JSON.stringify(f))),
      beats: (b.beats || []).map((x) => ({ start: x.start, dur: x.dur, label: x.label || '', text: x.text, flags: x.flags || [] })),
      total_seconds: Number.isFinite(b.total_seconds) ? b.total_seconds : null,
      beat_notes: b.notes || [],
    };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const notes = [...(Array.isArray(draft.notes) ? draft.notes : [])];
  for (const d of dropped || []) notes.push(`Dropped hook "${d.spoken}": formula #${d.formula_id} is not used for healthcare clients.`);
  const top = hooks[0];
  if (top && top.score != null && top.score < 50) notes.push(`The best hook scored ${top.score}. Under 50 usually means the idea needs a sharper, more specific claim.`);

  return {
    title: draft.title || 'Reel',
    angle: draft.angle || '',
    reference_lessons: Array.isArray(draft.reference_lessons) ? draft.reference_lessons : [],
    target_seconds: Number.isFinite(draft.target_seconds) ? draft.target_seconds : null,
    hooks,
    body: draft.body,
    on_screen: draft.on_screen.filter((c) => c && c.text).map((c) => ({ line: Number.isInteger(c.line) ? c.line : 0, text: String(c.text) })),
    caption: {
      text: draft.caption.text || '',
      visible: caption?.visible || '',
      truncated: !!caption?.truncated,
      checks: caption?.checks || [],
    },
    human: human ? { score: human.human_score, verdict: human.verdict, checks: human.checks || {}, cleaned: cleaned || [] } : null,
    placeholders: [...new Set([...(Array.isArray(draft.placeholders) ? draft.placeholders : []),
      ...findPlaceholders([...draft.hooks.map((h) => h.spoken), ...draft.body, draft.caption.text])])],
    notes,
  };
}
