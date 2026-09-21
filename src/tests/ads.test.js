import { describe, it, expect } from 'vitest';
import db from '../../database.js';
import adsRouter, { queueRouter } from '../routes/ads.js';
import { buildFactPack, checkRequirements, packForAgent } from '../services/adsFacts.js';

/** A client with campaigns, and one with none. Chosen from the data rather than
 *  created, so these tests never write to the database the dashboard reads. */
function pickClients() {
  const withSpend = db.prepare(`
    SELECT client_id AS id FROM marketing_ad_campaigns GROUP BY client_id LIMIT 1
  `).get();
  const withoutSpend = db.prepare(`
    SELECT id FROM crm_clients
    WHERE client_type = 'marketing'
      AND id NOT IN (SELECT DISTINCT client_id FROM marketing_ad_campaigns)
    LIMIT 1
  `).get();
  return { withSpend, withoutSpend };
}

describe('ads routers', () => {
  it('authenticates every per-client route', () => {
    expect(adsRouter.stack.some(l => l.name === 'authenticate')).toBe(true);
  });

  it('authenticates the client-agnostic queue routes', () => {
    expect(queueRouter.stack.some(l => l.name === 'authenticate')).toBe(true);
  });
});

describe('fact pack', () => {
  it('returns null for a client that does not exist', () => {
    expect(buildFactPack(999999)).toBeNull();
  });

  it('is deterministic — the same rows hash to the same pack', () => {
    const { withSpend } = pickClients();
    if (!withSpend) return;
    const a = buildFactPack(withSpend.id);
    const b = buildFactPack(withSpend.id);
    expect(a.hash).toBe(b.hash);
    // generated_at differs between the two, which is why only `sections` is
    // hashed — hashing the whole pack would make every build unique.
    expect(JSON.stringify(a.pack.sections)).toBe(JSON.stringify(b.pack.sections));
  });

  it('omits a section it cannot build, and says why', () => {
    const { withoutSpend } = pickClients();
    if (!withoutSpend) return;
    const { pack, available, gaps } = buildFactPack(withoutSpend.id);
    expect(available.has('spend')).toBe(false);
    expect(pack.sections.spend).toBeUndefined();
    const gap = gaps.find(g => g.section === 'spend');
    expect(gap).toBeDefined();
    expect(gap.reason.length).toBeGreaterThan(10);
  });

  it('never emits Infinity or NaN for a zero denominator', () => {
    const { withSpend } = pickClients();
    if (!withSpend) return;
    const json = JSON.stringify(buildFactPack(withSpend.id).pack);
    // JSON.stringify writes both as `null`, so the check is on the live values.
    const walk = (node) => {
      if (typeof node === 'number') expect(Number.isFinite(node)).toBe(true);
      else if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === 'object') Object.values(node).forEach(walk);
    };
    walk(JSON.parse(json));
    expect(json).not.toContain('Infinity');
  });

  it('derives account totals from totals, not from an average of ratios', () => {
    const { withSpend } = pickClients();
    if (!withSpend) return;
    const spend = buildFactPack(withSpend.id).pack.sections.spend;
    if (!spend || spend.account.impressions === 0) return;
    const expected = Math.round((spend.account.clicks / spend.account.impressions) * 100 * 100) / 100;
    expect(spend.account.ctr_pct).toBeCloseTo(expected, 2);
  });
});

describe('requirement gating', () => {
  const configs = db.prepare('SELECT * FROM ads_agent_config').all();

  it('ships a fleet whose requirements all parse', () => {
    expect(configs.length).toBeGreaterThan(0);
    for (const conf of configs) {
      expect(() => JSON.parse(conf.requires)).not.toThrow();
      expect(Array.isArray(JSON.parse(conf.requires))).toBe(true);
    }
  });

  it('blocks every spend-dependent agent for a client with no campaigns', () => {
    const { withoutSpend } = pickClients();
    if (!withoutSpend) return;
    const { available } = buildFactPack(withoutSpend.id);
    // Scoped to spend on purpose. Such a client may still have leads or posted
    // content, and the agents that read only those SHOULD stay runnable —
    // blocking them would be the mirror of the failure this gating prevents.
    const spendAgents = configs.filter(c => JSON.parse(c.requires).some(r => r.startsWith('spend')));
    expect(spendAgents.length).toBeGreaterThan(0);
    for (const conf of spendAgents) {
      const result = checkRequirements(conf, available);
      expect(result.ok).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
    }
  });

  it('leaves an agent runnable when the data it needs is present', () => {
    const { withSpend } = pickClients();
    if (!withSpend) return;
    const { available } = buildFactPack(withSpend.id);
    const performance = configs.find(c => c.agent_type === 'performance');
    expect(checkRequirements(performance, available).ok).toBe(true);
  });

  it('blocks rather than allows when `requires` is unreadable', () => {
    // The safe direction: a malformed row costs a disabled button, not an
    // agent running on data it was never given.
    const result = checkRequirements({ agent_type: 'x', requires: 'not json' }, new Set(['spend']));
    expect(result.ok).toBe(false);
  });
});

describe('per-agent pack trimming', () => {
  it('sends an agent only the sections it asked for', () => {
    const { withSpend } = pickClients();
    if (!withSpend) return;
    const { pack } = buildFactPack(withSpend.id);
    const pacing = db.prepare(`SELECT * FROM ads_agent_config WHERE agent_type = 'creative'`).get();
    const trimmed = packForAgent(pack, pacing);
    expect(trimmed.sections.spend).toBeUndefined();
    expect(Object.keys(trimmed.sections).length).toBeLessThanOrEqual(Object.keys(pack.sections).length);
  });

  it('gives the full audit everything', () => {
    const { withSpend } = pickClients();
    if (!withSpend) return;
    const { pack } = buildFactPack(withSpend.id);
    const full = db.prepare(`SELECT * FROM ads_agent_config WHERE agent_type = 'full'`).get();
    expect(Object.keys(packForAgent(pack, full).sections).sort())
      .toEqual(Object.keys(pack.sections).sort());
  });
});
