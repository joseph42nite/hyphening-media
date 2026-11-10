/**
 * Every audit type the SEO Monitor can queue can also be stored. backlink_gap
 * (migration 073) could be queued and run, but both the webhook's accepted list
 * and the CHECK on seo_audits rejected its result, so run #124 (2026-11-10)
 * spent its tokens and lost the report. backlink_gap.test.js missed it because
 * it builds its own seo_audits without the CHECK; this one uses the real schema.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db from '../../database.js';
import { normaliseAuditType } from '../webhooks/seoAudits.js';

beforeAll(() => db.exec('BEGIN'));
afterAll(() => db.exec('ROLLBACK'));

const configured = db.prepare('SELECT audit_type FROM agent_run_config').all().map(r => r.audit_type);

describe('SEO audit types', () => {
  it('knows every configured audit type', () => {
    expect(configured).toContain('backlink_gap');
  });

  it.each(configured)('%s is accepted by the webhook and the seo_audits table', (type) => {
    expect(normaliseAuditType(type)).toBe(type);
    const clientId = db.prepare('SELECT id FROM crm_clients LIMIT 1').get()?.id
      ?? db.prepare("INSERT INTO crm_clients (name, client_type) VALUES ('Audit type test', 'marketing')").run().lastInsertRowid;
    expect(() => db.prepare('INSERT INTO seo_audits (client_id, audit_type, url) VALUES (?, ?, ?)')
      .run(clientId, type, 'https://example.test/')).not.toThrow();
  });
});
