/**
 * The Bing and Shopify cards (claude-seo 2.6.2, migration 123).
 *
 * Bing unlocks per client, only on what the worker's probe reported: a working
 * key and this client's site verified under it. Shopify is shown but switched
 * off until a Shopify client exists, and never runs at night.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'os';
import path from 'path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import db from '../../database.js';
import { unavailableReason } from '../routes/seo.js';
import { probe, siteHost, bingKey } from '../../scripts/lib/bing.mjs';

beforeAll(() => db.exec('BEGIN'));
afterAll(() => db.exec('ROLLBACK'));

function makeClient() {
  return db.prepare(`
    INSERT INTO crm_clients (name, client_type, is_active, seo_enabled, website_url)
    VALUES (?, 'marketing', 1, 1, 'https://example.test/')
  `).run(`Bing client ${Math.random()}`).lastInsertRowid;
}

function reportBing(clientId, bing) {
  db.prepare(`
    INSERT INTO seo_audits (client_id, audit_type, url, report_json) VALUES (?, 'technical', 'https://example.test/', ?)
  `).run(clientId, JSON.stringify({ capabilities: { bing } }));
}

describe('card config', () => {
  it('has a monthly bing card and an on-demand shopify card', () => {
    const rows = Object.fromEntries(db.prepare(
      "SELECT audit_type, stale_after_days FROM agent_run_config WHERE audit_type IN ('bing', 'shopify')",
    ).all().map(r => [r.audit_type, r.stale_after_days]));
    expect(rows).toEqual({ bing: 30, shopify: 9999 });
  });
});

describe('bing gating', () => {
  it('is blocked until a run has reported on Bing', () => {
    expect(unavailableReason('bing', makeClient())).toMatch(/No run has reported/);
  });

  it('says the key is missing', () => {
    const c = makeClient();
    reportBing(c, { available: false, reason: 'missing' });
    expect(unavailableReason('bing', c)).toMatch(/BING_WEBMASTER_API_KEY/);
  });

  it('says the key was rejected', () => {
    const c = makeClient();
    reportBing(c, { available: false, reason: 'auth' });
    expect(unavailableReason('bing', c)).toMatch(/rejected/);
  });

  it('wants the site verified', () => {
    const c = makeClient();
    reportBing(c, { available: true, verified: false });
    expect(unavailableReason('bing', c)).toMatch(/not verified/);
  });

  it('unlocks for a verified site, for that client only', () => {
    const c = makeClient();
    reportBing(c, { available: true, verified: true });
    expect(unavailableReason('bing', c)).toBeNull();
    expect(unavailableReason('bing', makeClient())).not.toBeNull();
  });
});

describe('shopify', () => {
  it('is switched off for every client', () => {
    expect(unavailableReason('shopify', makeClient())).toMatch(/no Shopify client yet/);
  });
});

describe('bing probe', () => {
  const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body });

  it('matches the site with or without www', () => {
    expect(siteHost('https://www.Example.com/page')).toBe('example.com');
    expect(siteHost('example.com')).toBe('example.com');
  });

  it('needs a key', async () => {
    expect(await probe('https://example.com/', { key: null })).toEqual({ available: false, reason: 'missing' });
  });

  it('finds a verified site', async () => {
    const r = await probe('https://example.com/', { key: 'k', fetchFn: ok({ d: [{ Url: 'https://www.example.com/', IsVerified: true }] }) });
    expect(r).toEqual({ available: true, verified: true });
  });

  it('does not count an unverified or different site', async () => {
    expect((await probe('https://example.com/', { key: 'k', fetchFn: ok({ d: [{ Url: 'https://example.com/', IsVerified: false }] }) })).verified).toBe(false);
    expect((await probe('https://example.com/', { key: 'k', fetchFn: ok({ d: [{ Url: 'https://other.com/', IsVerified: true }] }) })).verified).toBe(false);
  });

  it('reports a rejected key', async () => {
    const r = await probe('https://example.com/', { key: 'k', fetchFn: async () => ({ ok: false, status: 401 }) });
    expect(r).toEqual({ available: false, reason: 'auth' });
  });

  it('never throws on a network error', async () => {
    const r = await probe('https://example.com/', { key: 'k', fetchFn: async () => { throw new Error('offline'); } });
    expect(r).toMatchObject({ available: false, reason: 'other' });
  });

  it('reads the key where claude-seo does, config file first', () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'bing-home-'));
    try {
      mkdirSync(path.join(home, '.claude'));
      writeFileSync(path.join(home, '.claude/settings.json'), JSON.stringify({ env: { BING_WEBMASTER_API_KEY: 'from-settings' } }));
      expect(bingKey(home)).toBe('from-settings');
      mkdirSync(path.join(home, '.config/claude-seo'), { recursive: true });
      writeFileSync(path.join(home, '.config/claude-seo/backlinks-api.json'), JSON.stringify({ bing_api_key: 'from-config' }));
      expect(bingKey(home)).toBe('from-config');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
