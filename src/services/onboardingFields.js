// Client brand/voice onboarding field list, shared by the admin routes
// (src/routes/clients.js) and the client-facing portal routes
// (src/routes/portal.js) so the two don't drift out of sync.
//
// Mapped 1:1 to the claude-blog plugin's blog-brand and blog-persona skill
// inputs. Pulled live by GET .../onboarding at the moment a blog skill run
// needs them — deliberately not rendered to BRAND.md/VOICE.md/persona.json
// files, so there's nothing to keep in sync across EC2 and the Mac where
// those skills actually run.
export const ONBOARDING_JSON_FIELDS = ['brand_editorial_do', 'brand_editorial_dont', 'brand_taboo_phrases', 'brand_competitor_differentiation', 'brand_niche_keywords'];

export const ONBOARDING_FIELDS = [
  'brand_audience_primary', 'brand_audience_secondary', 'brand_audience_expertise',
  'brand_positioning', ...ONBOARDING_JSON_FIELDS.slice(0, 4),
  'persona_tone_funny_serious', 'persona_tone_formal_casual',
  'persona_tone_respectful_irreverent', 'persona_tone_enthusiastic_matter_of_fact',
  'persona_sentence_length_mean', 'persona_sentence_length_std',
  'persona_vocabulary_tier', 'persona_contraction_frequency', 'persona_summary_label',
  'brand_niche_keywords', 'brand_publishing_cadence',
];

// JSON-array fields arrive from the caller already stringified.
export function parseJsonArrayInput(val) {
  if (typeof val !== 'string') return [];
  return val.split('\n').map((line) => line.trim()).filter(Boolean);
}
