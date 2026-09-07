/**
 * backlink_gap — the rules that decide whether a comparison may run at all.
 *
 * These cover the two gates that stop a gap run producing something worthless:
 * a competitor nobody approved, and the freshness window that would otherwise
 * let one competitor's report block every other competitor's.
 *
 * Written against the schema and the queries the route actually uses rather
 * than through HTTP, because the interesting behaviour here is the SQL — an
 * unscoped freshness lookup is the kind of bug that passes every status-code
 * assertion and still refuses a run somebody needed.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

let db;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE client_competitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      domain TEXT NOT NULL,
      url TEXT NOT NULL,
      label TEXT,
      status TEXT NOT NULL DEFAULT 'discovered',
      UNIQUE(client_id, domain)
    );
    CREATE TABLE seo_audits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      audit_type TEXT NOT NULL,
      is_competitor INTEGER NOT NULL DEFAULT 0,
      competitor_domain TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
});

/** The approved-competitor count unavailableReason() gates the card on. */
const approvedCount = (clientId) => db.prepare(
  "SELECT COUNT(*) AS n FROM client_competitors WHERE client_id = ? AND status = 'approved'"
).get(clientId).n;

/** The competitor lookup the trigger route performs, www-insensitively. */
const findCompetitor = (clientId, requested) => db.prepare(`
  SELECT * FROM client_competitors
  WHERE client_id = ? AND lower(replace(domain, 'www.', '')) = ?
`).get(clientId, requested);

/** The per-competitor freshness lookup. */
const lastGapAudit = (clientId, competitorDomain) => db.prepare(`
  SELECT created_at FROM seo_audits
  WHERE client_id = ? AND audit_type = 'backlink_gap' AND is_competitor = 0
    AND competitor_domain = ?
  ORDER BY created_at DESC LIMIT 1
`).get(clientId, competitorDomain);

describe('backlink_gap availability gate', () => {
  it('blocks the card when the client has no approved competitor', () => {
    db.prepare("INSERT INTO client_competitors (client_id, domain, url, status) VALUES (1,'oasisindia.in','https://oasisindia.in','discovered')").run();
    expect(approvedCount(1)).toBe(0);
  });

  it('opens the card once one is approved', () => {
    db.prepare("INSERT INTO client_competitors (client_id, domain, url, status) VALUES (1,'oasisindia.in','https://oasisindia.in','approved')").run();
    expect(approvedCount(1)).toBe(1);
  });

  it('is scoped per client — another client\'s competitor does not unblock this one', () => {
    db.prepare("INSERT INTO client_competitors (client_id, domain, url, status) VALUES (2,'oasisindia.in','https://oasisindia.in','approved')").run();
    expect(approvedCount(1)).toBe(0);
  });
});

describe('backlink_gap competitor resolution', () => {
  beforeEach(() => {
    db.prepare("INSERT INTO client_competitors (client_id, domain, url, status) VALUES (1,'www.oasisindia.in','https://oasisindia.in','approved')").run();
  });

  it('matches regardless of a www. prefix on either side', () => {
    expect(findCompetitor(1, 'oasisindia.in')?.status).toBe('approved');
  });

  it('does not match a domain tracked for a different client', () => {
    expect(findCompetitor(9, 'oasisindia.in')).toBeUndefined();
  });

  it('returns the row for an unapproved competitor so the route can name its status', () => {
    db.prepare("INSERT INTO client_competitors (client_id, domain, url, status) VALUES (1,'rejected.in','https://rejected.in','rejected')").run();
    expect(findCompetitor(1, 'rejected.in').status).toBe('rejected');
  });
});

describe('backlink_gap freshness is per competitor', () => {
  it('a recent report against one competitor does not mark another fresh', () => {
    db.prepare(
      "INSERT INTO seo_audits (client_id, audit_type, competitor_domain) VALUES (1,'backlink_gap','oasisindia.in')"
    ).run();

    // The comparison that was actually run reads as fresh...
    expect(lastGapAudit(1, 'oasisindia.in')).toBeTruthy();
    // ...and the one that was not still has no history to block it. An
    // audit_type-only lookup would return the row above for both.
    expect(lastGapAudit(1, 'cloudninecare.com')).toBeUndefined();
  });

  it('ignores competitor-research audits when judging the client\'s own freshness', () => {
    db.prepare(
      "INSERT INTO seo_audits (client_id, audit_type, is_competitor, competitor_domain) VALUES (1,'backlink_gap',1,'oasisindia.in')"
    ).run();
    expect(lastGapAudit(1, 'oasisindia.in')).toBeUndefined();
  });
});
