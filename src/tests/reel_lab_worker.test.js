import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildPrompt, filterHooks, parseDraft, dropExcluded, assembleResult, findPlaceholders, describeCleanup } from '../../scripts/lib/reelLab.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SKILLS = path.join(ROOT, 'plugins/instagram-agent/skills');
const healthcare = JSON.parse(readFileSync(path.join(ROOT, 'plugins/instagram-agent/healthcare.json'), 'utf8'));
const hooksJson = JSON.parse(readFileSync(path.join(SKILLS, 'ig-reel/hooks.json'), 'utf8'));
// Same rule as the worker: exit 1 is a verdict that did not pass, still JSON.
const py = (script, args, input) => {
  try {
    return JSON.parse(execFileSync('python3', ['-I', path.join(SKILLS, script), ...args, '--json'], { input }).toString());
  } catch (err) {
    if (err.status === 1) return JSON.parse(err.stdout.toString());
    throw err;
  }
};

const job = (over = {}) => ({
  run_id: 1, mode: 'new', topic: 'IVF after 35', references: [{ url: 'https://www.instagram.com/reel/x/', notes: 'Opens on "Nobody tells you"' }],
  client: { id: 1, name: 'Janya Fertility', instagram_url: null, website_url: 'https://janya.example' },
  compliance_profile: 'general', onboarding: { brand_audience_primary: 'couples trying to conceive' },
  instagram_voice: { on_camera_style: 'calm doctor', signature_phrases: 'Let us talk honestly' },
  search_keywords: ['ivf clinic'], performance: { reels: 0, top: [], bottom: [] }, ...over,
});

describe('healthcare filtering', () => {
  it('the excluded ids exist in hooks.json', () => {
    const ids = new Set(hooksJson.hooks.map((h) => h.id));
    for (const id of Object.keys(healthcare.excluded_formulas)) expect(ids.has(Number(id)), id).toBe(true);
  });

  it('leaves hooks.json alone for general clients and filters it for clinics', () => {
    expect(filterHooks(hooksJson, healthcare, 'general').hooks).toHaveLength(26);
    const filtered = filterHooks(hooksJson, healthcare, 'healthcare').hooks;
    expect(filtered).toHaveLength(26 - Object.keys(healthcare.excluded_formulas).length);
    expect(filtered.some((h) => h.id === 25)).toBe(false);
  });

  it('drops an excluded hook even if the model used one', () => {
    const hooks = [{ formula_id: 25, spoken: 'One patient got pregnant in a month' }, { formula_id: 3, spoken: 'Nobody tells you' }];
    const r = dropExcluded(hooks, healthcare, 'healthcare');
    expect(r.hooks.map((h) => h.formula_id)).toEqual([3]);
    expect(r.dropped).toHaveLength(1);
    expect(dropExcluded(hooks, healthcare, 'general').hooks).toHaveLength(2);
  });
});

describe('the prompt', () => {
  it('carries the references, voice and keywords, and healthcare rules only for clinics', () => {
    const general = buildPrompt(job(), { healthcare });
    expect(general).toContain('Opens on \\"Nobody tells you\\"');
    expect(general).toContain('calm doctor');
    expect(general).toContain('ivf clinic');
    expect(general).not.toContain('Healthcare rules');
    expect(buildPrompt(job({ compliance_profile: 'healthcare' }), { healthcare })).toContain(healthcare.rules[0]);
  });

  it('gives the existing script in improve mode', () => {
    const p = buildPrompt(job({ mode: 'improve', script: { title: 'Old', script_text: 'Hi everyone' } }), { healthcare });
    expect(p).toContain('Improve the hooks');
    expect(p).toContain('Hi everyone');
  });
});

describe('parsing the draft', () => {
  it('refuses broken or empty drafts', () => {
    expect(parseDraft('{').error).toBeTruthy();
    expect(parseDraft('{"hooks":[],"body":["x"]}').error).toBeTruthy();
    expect(parseDraft('{"hooks":[{"spoken":"x"}],"body":[]}').error).toBeTruthy();
  });

  it('accepts a caption given as a plain string', () => {
    expect(parseDraft('{"hooks":[{"spoken":"x"}],"body":["y"],"caption":"hi"}').draft.caption.text).toBe('hi');
  });
});

describe('putting the checks together (with the real Python tools)', () => {
  const draft = parseDraft(JSON.stringify({
    title: 'IVF after 35', target_seconds: 25,
    hooks: [
      { formula_id: 3, formula_name: 'Nobody Tells You', spoken: 'Hey guys, today we talk about fertility', on_screen: 'FERTILITY' },
      { formula_id: 23, formula_name: 'The Statistic', spoken: 'Nobody tells you IVF success drops after 35.', on_screen: 'IVF AFTER 35' },
    ],
    body: ['Here is what changes at 35.', 'Egg count falls every year after 30.', 'At {{age}} the odds are {{source + number}}.', 'So ask about egg testing at 33, not 35.'],
    on_screen: [{ line: 0, text: 'AFTER 35' }],
    caption: { text: 'IVF after 35: what actually changes.\n\nComment TEST for the checklist.\n#ivf' },
  })).draft;
  const scores = py('ig-reel/hookscore.py', ['-'], draft.hooks.map((h) => h.spoken).join('\n') + '\n');
  const beats = draft.hooks.map((h) => py('ig-reel/beats.py', ['-', '--target', '25'], [h.spoken, ...draft.body].join('\n') + '\n'));
  const caption = py('ig-caption/caption.py', ['-', '--keywords', 'ivf clinic'], draft.caption.text);
  const human = py('ig-human/detect.py', ['-'], draft.body.join('\n'));
  const result = assembleResult(draft, { scores, beats, caption, human, cleaned: [], dropped: [] });

  it('sorts hooks by their measured score, best first', () => {
    expect(result.hooks[0].spoken).toMatch(/^Nobody tells you/);
    expect(result.hooks[0].score).toBeGreaterThan(result.hooks[1].score);
    expect(result.hooks[1].flags.join(' ')).toMatch(/Greeting/);
  });

  it('gives each hook its own beat sheet over the same body', () => {
    for (const h of result.hooks) expect(h.beats).toHaveLength(1 + draft.body.length);
    expect(result.hooks[0].total_seconds).toBeGreaterThan(5);
  });

  it('carries the caption checks, the human score and the placeholders', () => {
    expect(result.caption.checks.find((c) => c.check === 'SEARCH TERMS')).toBeTruthy();
    expect(typeof result.human.score).toBe('number');
    expect(result.placeholders).toEqual(['{{age}}', '{{source + number}}']);
  });
});

describe('small helpers', () => {
  it('finds placeholders once each', () => {
    expect(findPlaceholders(['a {{x}} b {{x}}', '{{y}}'])).toEqual(['{{x}}', '{{y}}']);
  });

  it('describes what the humanizer changed', () => {
    const out = py('ig-human/humanize.py', ['-'], 'Stop scrolling — let us delve into this.\n');
    const lines = describeCleanup(out.report);
    expect(lines).toContain('1 x EM DASH -> ","');
    expect(lines).toContain('1 x "delve into" -> "look at"');
    expect(lines).toContain('1 x "stop scrolling" -> (removed)');
  });
});
