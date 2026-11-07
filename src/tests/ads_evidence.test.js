import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import db from '../../database.js';
import { buildFactPack, currentMonth } from '../services/adsFacts.js';
import { supersedeOpenRecommendations } from '../services/recommendations.js';

// Every test writes inside a transaction that is rolled back afterwards, so the
// database the local dashboard reads is left exactly as it was.
const client = db.prepare("SELECT id FROM crm_clients WHERE client_type = 'marketing' LIMIT 1").get();
beforeEach(() => { db.exec('BEGIN'); });
afterEach(() => { db.exec('ROLLBACK'); });

const month = currentMonth();
const addCampaign = (fields = {}) => db.prepare(`
  INSERT INTO marketing_ad_campaigns (client_id, platform, ad_campaign_name, month, total_ad_spend_inr,
    impressions, clicks, leads, source, external_campaign_id, platform_lead_conversions,
    search_impression_share_pct, search_lost_to_budget_pct, bidding_strategy)
  VALUES (@client_id, 'Google', @name, @month, @spend, 1000, 100, 0, 'google_ads', @ext, @plc, @is, @lost, 'MAXIMIZE_CONVERSIONS')
`).run({ client_id: client.id, name: 'Test Search', month, spend: 9000, ext: '1111111111', plc: 12.4, is: 35.2, lost: 27.1, ...fields });

describe('Google evidence in the fact pack', () => {
  it("reports Google's lead conversions as leads_reported, not the 0 in `leads`", () => {
    if (!client) return;
    addCampaign();
    const { pack } = buildFactPack(client.id, { month });
    const c = pack.sections.spend.campaigns.find(x => x.campaign === 'Test Search');
    expect(c.leads_reported).toBe(12);
    expect(c.search_impression_share_pct).toBe(35.2);
    expect(c.search_lost_to_budget_pct).toBe(27.1);
    expect(c.bidding_strategy).toBe('MAXIMIZE_CONVERSIONS');
  });

  it('never adds unattributed CRM leads on top of the platform count', () => {
    if (!client) return;
    addCampaign({ plc: 26 });
    const lead = db.prepare(`INSERT INTO campaign_leads (client_id, name, phone, platform, source, campaign_name, created_at, is_test)
      VALUES (?, 'T', '1', 'Google', 'form', 'Some Landing Page', ?, 0)`);
    for (let i = 0; i < 18; i++) lead.run(client.id, `${month}-02 10:00:00`);
    const account = buildFactPack(client.id, { month }).pack.sections.spend.account;
    expect(account.leads_unattributed).toBe(18);
    // Larger of 26 reported and 18 captured, not 44.
    expect(account.leads).toBe(26 + account.walk_in_leads);
    expect(account.cpl_excluding_walk_ins_inr).toBe(Math.round((9000 / 26) * 100) / 100);
  });

  it('builds google_evidence from the synced tables', () => {
    if (!client) return;
    addCampaign();
    db.prepare(`INSERT INTO ads_conversion_actions (client_id, action_id, name, status, category, in_conversions) VALUES (?, '1', 'Clicks to call', 'ENABLED', 'CONTACT', 0)`).run(client.id);
    db.prepare(`INSERT INTO ads_conversion_months (client_id, external_campaign_id, month, action_name, category, conversions, all_conversions) VALUES (?, '1111111111', ?, 'Clicks to call', 'CONTACT', 0, 32)`).run(client.id, month);
    const term = db.prepare(`INSERT INTO ads_search_terms (client_id, external_campaign_id, month, term, impressions, clicks, spend, conversions) VALUES (?, '1111111111', ?, ?, 10, ?, ?, ?)`);
    term.run(client.id, month, 'dentist near me', 20, 2400, 3);
    term.run(client.id, month, 'dental assistant jobs', 5, 600, 0);
    db.prepare(`INSERT INTO ads_negative_keywords (client_id, level, external_campaign_id, text, match_type) VALUES (?, 'campaign', '1111111111', 'free', 'BROAD')`).run(client.id);

    const g = buildFactPack(client.id, { month }).pack.sections.google_evidence;
    expect(g.conversion_actions[0]).toMatchObject({ name: 'Clicks to call', counted_in_conversions: false });
    expect(g.conversions_by_action[0]).toMatchObject({ counted: 0, recorded: 32 });
    expect(g.search_terms.terms).toBe(2);
    expect(g.search_terms.spend_on_zero_conversion_terms_inr).toBe(600);
    expect(g.search_terms.top_by_spend[0]).toMatchObject({ term: 'dentist near me', campaign: 'Test Search' });
    expect(g.negative_keywords[0]).toMatchObject({ level: 'campaign', negatives: 1, campaign: 'Test Search' });
  });

  it('paces against the agreed budget when one is set', () => {
    if (!client) return;
    addCampaign();
    db.prepare('UPDATE crm_clients SET monthly_ad_budget_inr = 90000, target_cost_per_booking_inr = 3000 WHERE id = ?').run(client.id);
    const { pack } = buildFactPack(client.id, { month });
    expect(pack.sections.pacing.budget_inr).toBe(90000);
    expect(pack.sections.pacing.spent_of_budget_pct).toBe(10);
    expect(pack.sections.pacing.note).toMatch(/agreed monthly budget/);
  });

  it('says plainly when no budget is set', () => {
    if (!client) return;
    addCampaign();
    db.prepare('UPDATE crm_clients SET monthly_ad_budget_inr = NULL WHERE id = ?').run(client.id);
    const { pack } = buildFactPack(client.id, { month });
    expect(pack.sections.pacing.budget_inr).toBeUndefined();
    expect(pack.sections.pacing.note).toMatch(/No monthly budget is set/);
  });

  it('notes when GA4 tracks other hosts but not the landing page', () => {
    if (!client) return;
    db.prepare("UPDATE crm_clients SET website_url = 'https://ads.example.in' WHERE id = ?").run(client.id);
    db.prepare(`INSERT INTO ga4_session_months (client_id, month, host, channel, sessions) VALUES (?, ?, 'example.in', 'Paid Search', 8)`).run(client.id, month);
    const landing = buildFactPack(client.id, { month }).pack.sections.landing;
    expect(landing.ga4_sessions).toBeUndefined();
    expect(landing.ga4_note).toMatch(/tracks example\.in, not ads\.example\.in/);
  });
});

describe('superseding recommendations', () => {
  const audit = (agentType) => db.prepare(`INSERT INTO ads_audits (client_id, agent_type, period_month) VALUES (?, ?, ?)`).run(client.id, agentType, month).lastInsertRowid;
  const rec = (auditId, status = 'open', kanban = null) => db.prepare(`
    INSERT INTO ads_recommendations (audit_id, client_id, priority, metric, issue, action_required, status, kanban_task_id)
    VALUES (?, ?, 'High', 'CPL', 'issue', 'action', ?, ?)`).run(auditId, client.id, status, kanban).lastInsertRowid;
  const statusOf = (id) => db.prepare('SELECT status, superseded_by_audit_id AS by FROM ads_recommendations WHERE id = ?').get(id);

  it("retires the same card's earlier open items and nothing else", () => {
    if (!client) return;
    const old = audit('monitor');
    const openOld = rec(old);
    const inProgress = rec(old, 'in_progress');
    const asTask = rec(old, 'open', 42);
    const otherCard = rec(audit('google'));
    const fresh = audit('monitor');
    const openNew = rec(fresh);

    const n = supersedeOpenRecommendations('ads', { clientId: client.id, newAuditId: fresh, params: ['monitor'] });
    expect(n).toBe(1);
    expect(statusOf(openOld)).toEqual({ status: 'ignored', by: fresh });
    expect(statusOf(inProgress).status).toBe('in_progress');
    expect(statusOf(asTask).status).toBe('open');
    expect(statusOf(otherCard).status).toBe('open');
    expect(statusOf(openNew).status).toBe('open');
  });
});
