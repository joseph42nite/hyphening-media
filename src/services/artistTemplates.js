/**
 * Quick Artist Message Templates: global defaults (artist_message_templates)
 * plus per-venue overrides (venue_artist_message_templates).
 */
import db from '../../database.js';

export const TEMPLATE_TYPES = ['onboarding', 'confirmation'];

export function isTemplateType(type) {
  return TEMPLATE_TYPES.includes(type);
}

export function getDefaultTemplate(type) {
  const row = db.prepare('SELECT template_text FROM artist_message_templates WHERE template_key = ?').get(type);
  return row ? row.template_text : '';
}

export function venueExists(venueId) {
  return !!db.prepare('SELECT 1 FROM venues WHERE id = ?').get(venueId);
}

/**
 * The template a venue should use: its own text if it has one, else the default.
 */
export function getVenueTemplate(venueId, type) {
  const row = db.prepare(
    'SELECT template_text, updated_at FROM venue_artist_message_templates WHERE venue_id = ? AND template_key = ?',
  ).get(venueId, type);
  const defaultText = getDefaultTemplate(type);
  if (row) {
    return { venueId: Number(venueId), type, text: row.template_text, isCustom: true, defaultText, updatedAt: row.updated_at };
  }
  return { venueId: Number(venueId), type, text: defaultText, isCustom: false, defaultText, updatedAt: null };
}

export function saveVenueTemplate(venueId, type, text) {
  const templateText = typeof text === 'string' ? text : '';
  db.prepare(`
    INSERT INTO venue_artist_message_templates (venue_id, template_key, template_text, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(venue_id, template_key) DO UPDATE SET
      template_text = excluded.template_text,
      updated_at = datetime('now')
  `).run(venueId, type, templateText);
  return getVenueTemplate(venueId, type);
}

/** Removes the venue's override so it falls back to the default. */
export function clearVenueTemplate(venueId, type) {
  db.prepare('DELETE FROM venue_artist_message_templates WHERE venue_id = ? AND template_key = ?').run(venueId, type);
  return getVenueTemplate(venueId, type);
}
