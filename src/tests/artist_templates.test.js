import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import db from '../../database.js';
import * as templates from '../services/artistTemplates.js';

// One transaction rolled back at the end, so the local database is left as it was.
beforeAll(() => db.exec('BEGIN'));
afterAll(() => db.exec('ROLLBACK'));

const makeVenue = (name = `Venue ${Math.random()}`) =>
  Number(db.prepare('INSERT INTO venues (name) VALUES (?)').run(name).lastInsertRowid);

const setDefault = (type, text) => db.prepare(`
  INSERT INTO artist_message_templates (template_key, template_text) VALUES (?, ?)
  ON CONFLICT(template_key) DO UPDATE SET template_text = excluded.template_text
`).run(type, text);

describe('venue artist templates service', () => {
  it('falls back to the default when a venue has no template of its own', () => {
    setDefault('confirmation', 'Default confirmation for {{artist_name}}');
    const venue = makeVenue();
    const t = templates.getVenueTemplate(venue, 'confirmation');
    expect(t).toMatchObject({ text: 'Default confirmation for {{artist_name}}', isCustom: false });
  });

  it('saves per venue, keeps venues separate, and leaves the default alone', () => {
    setDefault('confirmation', 'The default');
    const a = makeVenue();
    const b = makeVenue();
    templates.saveVenueTemplate(a, 'confirmation', 'Venue A message');
    templates.saveVenueTemplate(a, 'confirmation', 'Venue A message, edited');

    expect(templates.getVenueTemplate(a, 'confirmation')).toMatchObject({ text: 'Venue A message, edited', isCustom: true, defaultText: 'The default' });
    expect(templates.getVenueTemplate(b, 'confirmation')).toMatchObject({ text: 'The default', isCustom: false });
    expect(templates.getDefaultTemplate('confirmation')).toBe('The default');
    // Template types are separate too.
    expect(templates.getVenueTemplate(a, 'onboarding').isCustom).toBe(false);
  });

  it('clearing a venue template returns it to the default', () => {
    setDefault('confirmation', 'The default');
    const venue = makeVenue();
    templates.saveVenueTemplate(venue, 'confirmation', 'Custom');
    expect(templates.clearVenueTemplate(venue, 'confirmation')).toMatchObject({ text: 'The default', isCustom: false });
  });

  it('drops a venue template when the venue is deleted', () => {
    const venue = makeVenue();
    templates.saveVenueTemplate(venue, 'confirmation', 'Custom');
    db.prepare('DELETE FROM venues WHERE id = ?').run(venue);
    const left = db.prepare('SELECT COUNT(*) AS n FROM venue_artist_message_templates WHERE venue_id = ?').get(venue);
    expect(left.n).toBe(0);
  });
});

describe('/api/artists/templates/venues/:venueId/:type', () => {
  let server;
  let base;
  let cookie;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ||= 'test-access-secret';
    const { default: artistsRouter } = await import('../routes/artists.js');
    const userId = db.prepare(
      "INSERT INTO users (email, password_hash, name, role) VALUES (?, 'x', 'Template Tester', 'admin')",
    ).run(`template-test-${Date.now()}@example.com`).lastInsertRowid;
    cookie = `access_token=${jwt.sign({ userId }, process.env.JWT_ACCESS_SECRET)}`;

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/artists', artistsRouter);
    await new Promise(resolve => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}/api/artists`;
  });

  afterAll(() => server?.close());

  const call = (path, { method = 'GET', body, auth = true } = {}) => fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

  it('requires sign-in', async () => {
    const venue = makeVenue();
    expect((await call(`/templates/venues/${venue}/confirmation`, { auth: false })).status).toBe(401);
  });

  it('loads the default, saves a venue template, then clears it', async () => {
    setDefault('confirmation', 'Route default');
    const venue = makeVenue();

    let res = await call(`/templates/venues/${venue}/confirmation`);
    expect(res.status).toBe(200);
    expect((await res.json()).template).toMatchObject({ text: 'Route default', isCustom: false });

    res = await call(`/templates/venues/${venue}/confirmation`, { method: 'PUT', body: { text: 'Hi {{artist_name}}, see you at {{venue_name}}' } });
    expect(res.status).toBe(200);
    expect((await res.json()).template).toMatchObject({ text: 'Hi {{artist_name}}, see you at {{venue_name}}', isCustom: true });

    res = await call(`/templates/venues/${venue}/confirmation`);
    expect((await res.json()).template.isCustom).toBe(true);

    // The global templates endpoint still returns the default.
    res = await call('/templates');
    expect((await res.json()).templates.confirmation).toBe('Route default');

    res = await call(`/templates/venues/${venue}/confirmation`, { method: 'DELETE' });
    expect((await res.json()).template).toMatchObject({ text: 'Route default', isCustom: false });
  });

  it('rejects an unknown type or venue', async () => {
    const venue = makeVenue();
    expect((await call(`/templates/venues/${venue}/nonsense`)).status).toBe(400);
    expect((await call('/templates/venues/999999999/confirmation')).status).toBe(404);
    expect((await call('/templates/venues/abc/confirmation', { method: 'PUT', body: { text: 'x' } })).status).toBe(404);
  });
});
