/**
 * The marketing tab's routes are all registered. Removing the all-clients
 * overview (2026-11-10) once took the content list route with it, which left
 * every client's Content Tracker empty and made adding content throw; nothing
 * failed. This catches a route that goes missing.
 */

import { describe, it, expect } from 'vitest';
import router from '../routes/marketing.js';

const routes = router.stack
  .filter(l => l.route)
  .flatMap(l => Object.keys(l.route.methods).map(m => `${m.toUpperCase()} ${l.route.path}`));

describe('marketing routes', () => {
  it.each([
    'GET /:id/marketing/content',
    'POST /:id/marketing/content',
    'PATCH /:id/marketing/content/:contentId',
    'DELETE /:id/marketing/content/:contentId',
    'GET /:id/marketing/ads',
    'GET /:id/marketing/monthly',
    'POST /:id/marketing/monthly',
    'GET /:id/marketing/scripts',
  ])('has %s', (route) => {
    expect(routes).toContain(route);
  });

  it('no longer has the all-clients overview', () => {
    expect(routes).not.toContain('GET /marketing/all-overview');
  });
});
