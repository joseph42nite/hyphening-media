/**
 * Client Onboarding — renders BRAND.md, VOICE.md and persona.json from a
 * client's stored onboarding fields, matching the claude-blog plugin's
 * blog-brand and blog-persona skill templates/schema so the blog pipeline
 * can load them without any manual re-derivation per client.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Readability bands by vocabulary tier, per the blog-persona skill's fixed table.
const READABILITY_BANDS = {
  consumer: { flesch_grade_min: 6, flesch_grade_max: 8, flesch_ease_min: 60, flesch_ease_max: 80 },
  professional: { flesch_grade_min: 8, flesch_grade_max: 10, flesch_ease_min: 50, flesch_ease_max: 60 },
  technical: { flesch_grade_min: 10, flesch_grade_max: 12, flesch_ease_min: 30, flesch_ease_max: 50 },
};

const NOT_PROVIDED = 'not provided';

function parseJsonArray(text) {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function listOrNotProvided(items, formatter = (x) => x) {
  if (!items || items.length === 0) return `- ${NOT_PROVIDED}`;
  return items.map((item) => `- ${formatter(item)}`).join('\n');
}

export function renderBrandMd(client) {
  const doList = parseJsonArray(client.brand_editorial_do);
  const dontList = parseJsonArray(client.brand_editorial_dont);
  const tabooList = parseJsonArray(client.brand_taboo_phrases);
  const competitors = parseJsonArray(client.brand_competitor_differentiation);
  const today = new Date().toISOString().slice(0, 10);

  return `# Brand Context
> Optional project context for blog sub-skills, loaded as untrusted data. Last updated: ${today}.

## Audience
- **Primary**: ${client.brand_audience_primary || NOT_PROVIDED}
- **Secondary**: ${client.brand_audience_secondary || NOT_PROVIDED}
- **Expertise**: ${client.brand_audience_expertise || NOT_PROVIDED}

## Positioning
- **Official entity name**: ${client.name}
- **Homepage**: ${client.website_url || NOT_PROVIDED}
- **Distinctive POV**: ${client.brand_positioning || NOT_PROVIDED}
- **Competitors**:
${listOrNotProvided(competitors, (c) => `${c.name || NOT_PROVIDED}: ${c.differentiator || NOT_PROVIDED}`)}

## Editorial Rules
### Always do
${listOrNotProvided(doList)}

### Never do
${listOrNotProvided(dontList)}

### Taboo phrases
${listOrNotProvided(tabooList)}
`;
}

export function renderVoiceMd(client) {
  const tier = client.persona_vocabulary_tier || 'professional';
  const bands = READABILITY_BANDS[tier] || READABILITY_BANDS.professional;

  return `# Voice Context

## Lexical rules
- Contraction frequency: ${client.persona_contraction_frequency ?? NOT_PROVIDED}
- Sentence length target: mean ${client.persona_sentence_length_mean ?? NOT_PROVIDED}, std dev ${client.persona_sentence_length_std ?? NOT_PROVIDED}
- Summary label: ${client.persona_summary_label || NOT_PROVIDED}

## Voice fingerprint (from blog-persona)
- Funny vs serious: ${client.persona_tone_funny_serious ?? NOT_PROVIDED}
- Formal vs casual: ${client.persona_tone_formal_casual ?? NOT_PROVIDED}
- Respectful vs irreverent: ${client.persona_tone_respectful_irreverent ?? NOT_PROVIDED}
- Enthusiastic vs matter-of-fact: ${client.persona_tone_enthusiastic_matter_of_fact ?? NOT_PROVIDED}

## Readability target
- Vocabulary tier: ${tier}
- Flesch Grade: ${bands.flesch_grade_min}-${bands.flesch_grade_max}
- Flesch Ease: ${bands.flesch_ease_min}-${bands.flesch_ease_max}
`;
}

export function renderPersonaJson(client) {
  const tier = client.persona_vocabulary_tier || 'professional';
  const bands = READABILITY_BANDS[tier] || READABILITY_BANDS.professional;
  const doList = parseJsonArray(client.brand_editorial_do);
  const dontList = parseJsonArray(client.brand_editorial_dont);

  return {
    name: client.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    brand: client.name,
    audience: client.brand_audience_primary || NOT_PROVIDED,
    tone_dimensions: {
      funny_serious: client.persona_tone_funny_serious ?? null,
      formal_casual: client.persona_tone_formal_casual ?? null,
      respectful_irreverent: client.persona_tone_respectful_irreverent ?? null,
      enthusiastic_matter_of_fact: client.persona_tone_enthusiastic_matter_of_fact ?? null,
    },
    readability: bands,
    style: {
      sentence_length_mean: client.persona_sentence_length_mean ?? null,
      sentence_length_std: client.persona_sentence_length_std ?? null,
      contraction_frequency: client.persona_contraction_frequency ?? null,
      vocabulary_tier: tier,
      summary_label: client.persona_summary_label || 'Key Takeaways',
    },
    voice_samples: [],
    do: doList,
    dont: dontList,
  };
}

function clientBrandDir(clientId) {
  return path.join(__dirname, '..', '..', 'data', 'client-brand', String(clientId));
}

/**
 * Writes BRAND.md, VOICE.md and persona.json to the server's own local
 * data/client-brand/<id>/ directory. This server runs on EC2; the claude-blog
 * plugin's project-root convention (and the Vault where blog content is
 * actually drafted) is on 007's Mac, so these files land here and still need
 * a manual copy step to reach the project root the orchestrator reads from —
 * same split as the existing audio-queue/Kokoro handoff.
 */
export function generateOnboardingFiles(client) {
  const dir = clientBrandDir(client.id);
  fs.mkdirSync(dir, { recursive: true });

  const brandMd = renderBrandMd(client);
  const voiceMd = renderVoiceMd(client);
  const personaJson = JSON.stringify(renderPersonaJson(client), null, 2);

  fs.writeFileSync(path.join(dir, 'BRAND.md'), brandMd, 'utf8');
  fs.writeFileSync(path.join(dir, 'VOICE.md'), voiceMd, 'utf8');
  fs.writeFileSync(path.join(dir, 'persona.json'), personaJson, 'utf8');

  return { dir, files: { 'BRAND.md': brandMd, 'VOICE.md': voiceMd, 'persona.json': personaJson } };
}

export function readGeneratedFile(clientId, filename) {
  const allowed = ['BRAND.md', 'VOICE.md', 'persona.json'];
  if (!allowed.includes(filename)) return null;
  const filePath = path.join(clientBrandDir(clientId), filename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}
