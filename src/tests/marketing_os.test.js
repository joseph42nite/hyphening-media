import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db from '../../database.js';
import * as brainSvc from '../services/clientBrain.js';
import * as ob from '../services/coldOutbound.js';
import * as growth from '../services/growth.js';
import { executeEvent, KNOWN_EVENTS } from '../routes/webhooks.js';
import { normalizeEvent } from '../routes/outboundEvents.js';
import { buildPrompt, checkResult, checkDomains, jobFacts } from '../../scripts/lib/growthPrompts.mjs';
import { runJob } from '../../scripts/growth_worker.mjs';

// One transaction, rolled back at the end: the local database is left as it was.
let saas; let clinic;
beforeAll(() => {
  db.exec('BEGIN');
  const add = db.prepare("INSERT INTO crm_clients (name, client_type, website_url, client_group, outbound_enabled) VALUES (?, 'marketing', ?, ?, ?)");
  saas = Number(add.run('Test Freight SaaS', 'https://www.testfreight.example', 'b2b_saas', 1).lastInsertRowid);
  clinic = Number(add.run('Test Clinic', 'https://clinic.example', 'healthcare', 1).lastInsertRowid);
  db.prepare("INSERT OR REPLACE INTO plugin_status (plugin, repo, installed_version) VALUES ('marketing-skills', 'coreyhaines31/marketingskills', '2.14.28')").run();
});
afterAll(() => db.exec('ROLLBACK'));

describe('Client Brain', () => {
  it('saves versions, merges sections, and restores an old one', () => {
    const a = brainSvc.saveBrain(saas, { sections: { product_overview: 'Freight ERP', pains: 'Retyping AWBs' }, claims: [{ claim: 'AWB draft in seconds', source: 'docs/LANDING_PAGE.md' }] }, { by: 'test' });
    expect(a.brain.version).toBe(1);
    const b = brainSvc.saveBrain(saas, { sections: { pains: '' , target_audience: 'Forwarders' } }, { by: 'test' });
    expect(b.brain.version).toBe(2);
    expect(b.brain.sections).toEqual({ product_overview: 'Freight ERP', target_audience: 'Forwarders' });
    expect(b.brain.claims).toHaveLength(1);
    expect(brainSvc.saveBrain(saas, { sections: { target_audience: 'Forwarders' } }).unchanged).toBe(true);
    const r = brainSvc.restoreBrainVersion(saas, 1, 'test');
    expect(r.brain.version).toBe(3);
    expect(r.brain.sections).toEqual({ product_overview: 'Freight ERP', pains: 'Retyping AWBs' });
    expect(brainSvc.listBrainVersions(saas).map((v) => v.version)).toEqual([3, 2, 1]);
  });

  it('renders the doc every skill reads, with claims and the healthcare rules', () => {
    const md = brainSvc.renderBrainMarkdown(saas);
    expect(md).toMatch(/^# Product marketing context: Test Freight SaaS/);
    expect(md).toMatch(/## Product or service\n\nFreight ERP/);
    expect(md).toMatch(/- AWB draft in seconds \(source: docs\/LANDING_PAGE\.md\)/);
    expect(brainSvc.renderBrainMarkdown(clinic)).toMatch(/No testimonials/);
    expect(brainSvc.renderBrainMarkdown(clinic)).toMatch(/None approved yet/);
  });
});

describe('outbound setup', () => {
  it('refuses the main website domain as a sending domain', () => {
    const r = ob.saveOutboundSettings(saas, { sending_domains: ['mail.testfreight.example'] });
    expect(r.status).toBe(400);
    expect(r.error).toMatch(/testfreight\.example/);
  });

  it('cleans and saves the setup, with the default excluded countries', () => {
    const r = ob.saveOutboundSettings(saas, {
      sender_name: 'Asha', sending_domains: 'https://www.getfreight.example/\ntryfreight.example', mailbox_provider: 'titan',
      daily_cap_per_mailbox: 500, target_countries: 'UAE, India', offer: 'Send one invoice, get the AWB draft back',
      booking_method: 'own_tool', reply_owner_email: 'Sales@TestFreight.example', postal_address: '1 Dock Road, Mumbai',
    }, 'test');
    expect(r.status).toBe(200);
    expect(r.settings.sending_domains).toEqual(['getfreight.example', 'tryfreight.example']);
    expect(r.settings.daily_cap_per_mailbox).toBe(50);
    expect(r.settings.reply_owner_email).toBe('sales@testfreight.example');
    expect(r.settings.excluded_countries).toEqual(['Germany', 'Austria', 'Italy']);
    expect(ob.saveOutboundSettings(saas, { reply_owner_email: 'nope' }).status).toBe(400);
    expect(ob.saveOutboundSettings(saas, { booking_method: 'booking_link', booking_url: 'cal.example/x' }).status).toBe(400);
  });

  it('keeps a do-not-contact list of emails and domains', () => {
    const r = ob.addSuppression(saas, 'customer@bigco.example\nhttps://www.existing.example\nnot an entry', { reason: 'customer' });
    expect(r.added).toBe(2);
    expect(r.rejected).toEqual(['not an entry']);
    expect(ob.isSuppressed(saas, 'anyone@existing.example')).toBe(true);
    expect(ob.isSuppressed(saas, 'Customer@BigCo.example')).toBe(true);
    expect(ob.isSuppressed(saas, 'x@fresh.example')).toBe(false);
    expect(ob.isSuppressed(clinic, 'anyone@existing.example')).toBe(false);
  });
});

describe('cards and what they need', () => {
  it('lists what is missing before outbound can run', () => {
    const cards = growth.cardsFor(saas, 'outbound');
    const prospects = cards.find((c) => c.key === 'outbound_prospects');
    expect(prospects.unavailable).toBeNull();
    expect(prospects.ready).toBe(false);
    const labels = prospects.missing.map((m) => m.label);
    expect(labels).toContain('Brain: Proof');
    expect(labels).not.toContain('Outbound setup: Who the emails come from');
    expect(growth.queueGrowthRun(saas, 'outbound_prospects').status).toBe(409);
  });

  it('never offers cold outbound to a healthcare client', () => {
    const p = growth.cardsFor(clinic, 'outbound').find((c) => c.key === 'outbound_prospects');
    expect(p.unavailable).toMatch(/healthcare/);
    expect(growth.cardsFor(clinic, 'brain').every((c) => !c.unavailable)).toBe(true);
  });

  it('queues once everything is there, never twice', () => {
    brainSvc.saveBrain(saas, { sections: { target_audience: 'Air freight forwarders, 10-200 staff', pains: 'Retyping', proof_points: 'Live with 3 forwarders' } });
    const r = growth.queueGrowthRun(saas, 'outbound_prospects', 'test');
    expect(r.status).toBe(200);
    expect(growth.queueGrowthRun(saas, 'outbound_prospects').status).toBe(409);
  });
});

describe('a prospects run, start to finish', () => {
  let job;
  it('hands the worker the Brain, the setup and what to avoid', () => {
    const r = executeEvent('claim_growth_runs', { worker: 'test', limit: 5 });
    job = r.data.runs.find((j) => j.client.id === saas && j.card_key === 'outbound_prospects');
    expect(job.brain_markdown).toMatch(/Air freight forwarders/);
    expect(job.suppression).toEqual(expect.arrayContaining(['customer@bigco.example', 'existing.example']));
    expect(job.wanted).toBe(30);
    expect(jobFacts(job).brain_markdown).toBeUndefined();
    expect(buildPrompt(job)).toMatch(/Never guess an address/);
    expect(buildPrompt(job)).toMatch(/UAE, India/);
  });

  it('stores leads that pass, and says why the others were dropped', () => {
    const seq = [{ day: 0, subject: 'awb drafts', body: 'Hi Ravi, ...' }];
    const r = executeEvent('submit_growth_result', { run_id: job.run_id, summary: 'found 4', result: { leads: [
      { company: 'Good Cargo', domain: 'goodcargo.example', country: 'UAE', contact_name: 'Ravi K', contact_email: 'ravi@goodcargo.example', score: 'hot', tier: 1, sequence: seq, source_urls: ['https://goodcargo.example/team', 'javascript:alert(1)'] },
      { company: 'Existing Co', contact_email: 'ops@existing.example', sequence: seq },
      { company: 'Berlin Freight', country: 'Germany', contact_email: 'a@berlin.example', sequence: seq },
      { company: 'No Draft Ltd', contact_email: 'a@nodraft.example', sequence: [] },
    ], recommendations: [{ title: 'Add a case study', priority: 'high' }] } });
    expect(r.success).toBe(true);
    const leads = ob.listLeads(saas);
    expect(leads).toHaveLength(1);
    expect(leads[0].source_urls).toEqual(['https://goodcargo.example/team']);
    const run = growth.getGrowthRun(saas, job.run_id);
    expect(run.result.skipped.map((s) => s.reason)).toEqual(['on the do-not-contact list', 'excluded country (Germany)', 'no email drafted']);
    expect(growth.listRecommendations(saas)).toHaveLength(1);
  });

  it('approves, exports for the sending tool, and follows events', () => {
    const lead = ob.listLeads(saas)[0];
    expect(ob.decideLead(saas, lead.id, 'approve', 'test').lead.status).toBe('approved');
    expect(ob.decideLead(saas, lead.id, 'approve').status).toBe(409);
    ob.updateLead(saas, lead.id, { company: '=HYPERLINK("x")' });
    const { csv, count } = ob.exportApprovedCsv(saas, { markInSequence: true });
    expect(count).toBe(1);
    expect(csv.split('\n')[0]).toMatch(/^email,first_name,last_name,company_name,website,title,country,step_1_day,step_1_subject,step_1_body/);
    expect(csv).toMatch(/'=HYPERLINK/); // never a live formula
    expect(csv).toMatch(/1 Dock Road, Mumbai/);
    expect(ob.getLead(saas, lead.id).status).toBe('in_sequence');

    ob.recordEvent(saas, { email: 'RAVI@goodcargo.example', type: 'meeting_booked', source: 'booking' });
    expect(ob.getLead(saas, lead.id).status).toBe('meeting_booked');
    ob.recordEvent(saas, { email: 'ravi@goodcargo.example', type: 'sent', source: 'sending_tool' });
    expect(ob.getLead(saas, lead.id).status).toBe('meeting_booked'); // a late "sent" doesn't undo a booking
    expect(ob.leadStats(saas).meetings).toBe(1);
  });

  it('puts bounces and unsubscribes on the do-not-contact list', () => {
    ob.recordEvent(saas, { email: 'stranger@other.example', type: 'unsubscribe', source: 'sending_tool' });
    expect(ob.isSuppressed(saas, 'stranger@other.example')).toBe(true);
  });
});

describe('events from sending and booking tools', () => {
  it('finds the client by its key, compared as a hash', () => {
    const { events_key } = ob.rotateEventsKey(saas);
    expect(events_key).toMatch(/^obk_[a-f0-9]{48}$/);
    expect(ob.clientForEventsKey(events_key)).toBe(saas);
    expect(ob.clientForEventsKey(`${events_key.slice(0, -1)}0`)).toBe(events_key.endsWith('0') ? saas : null);
    expect(ob.clientForEventsKey('obk_short')).toBeNull();
    expect(db.prepare('SELECT events_key FROM outbound_settings WHERE client_id = ?').get(saas).events_key).not.toBe(events_key);
    expect(ob.getOutboundSettings(saas).has_events_key).toBe(true);
  });

  it('reads the field names sending tools use', () => {
    expect(normalizeEvent({ event_type: 'email_bounced', lead_email: 'a@b.example', timestamp: '2026-11-26T10:00:00Z' }))
      .toMatchObject({ type: 'bounce', email: 'a@b.example', occurred_at: '2026-11-26T10:00:00Z' });
    expect(normalizeEvent({ type: 'lead_interested', email: 'a@b.example', reply_text: 'yes' })).toMatchObject({ type: 'positive_reply', detail: 'yes' });
    expect(normalizeEvent({ type: 'made_up' }).type).toBeNull();
  });
});

describe('Brain proposals', () => {
  it('applies only empty sections unless asked, and adds sourced claims', () => {
    const q = growth.queueGrowthRun(saas, 'brain_build', 'test');
    expect(q.status).toBe(200);
    executeEvent('claim_growth_runs', { worker: 'test' });
    executeEvent('submit_growth_result', { run_id: q.run.id, result: {
      sections: { product_overview: 'NEW overview', objections: 'Too new' },
      claims: [{ claim: 'One ledger for air and sea', source: 'https://testfreight.example/accounts' }, { claim: 'No source' }],
    } });
    const r = growth.applyGrowthRun(saas, q.run.id, {}, 'test');
    expect(r.applied.sections).toEqual(['objections']);
    expect(r.brain.sections.product_overview).toBe('Freight ERP');
    expect(r.brain.claims.map((c) => c.claim)).toContain('One ledger for air and sea');
    expect(r.brain.claims.map((c) => c.claim)).not.toContain('No source');
    const r2 = growth.applyGrowthRun(saas, q.run.id, { keys: ['product_overview'] }, 'test');
    expect(r2.brain.sections.product_overview).toBe('NEW overview');
  });
});

describe('the worker', () => {
  it('has a prompt for every AI card and checks answers', () => {
    for (const c of growth.CARDS.filter((x) => x.skills.length)) {
      expect(buildPrompt({ card_key: c.key, client: { name: 'X', website_url: 'https://x.example' }, outbound: {}, wanted: 5 })).toMatch(/result\.json/);
    }
    expect(checkResult('outbound_prospects', { leads: [] })).toBeNull();
    expect(checkResult('outbound_prospects', {})).toMatch(/leads/);
    expect(checkResult('outbound_retro', { health: 'great' })).toMatch(/health/);
  });

  it('checks sending domains with no AI', async () => {
    const fake = {
      mx: async (d) => (d === 'good.example' ? [{ exchange: 'mx1.titan.email' }] : []),
      txt: async (n) => (n === 'good.example' ? [['v=spf1 include:spf.titan.email ~all']] : n === '_dmarc.good.example' ? [['v=DMARC1; p=none']] : []),
    };
    const r = await checkDomains(['good.example', 'bad.example'], fake);
    expect(r.domains[0]).toMatchObject({ domain: 'good.example', dmarc_policy: 'none', problems: [] });
    expect(r.domains[1].problems).toHaveLength(3);
    expect(r.summary).toMatch(/1 of 2/);
    const sent = [];
    await runJob({ run_id: 1, card_key: 'outbound_deliverability', outbound: { sending_domains: ['good.example'] } }, {
      hookFn: async (e, p) => { sent.push([e, p]); return {}; }, domains: (d) => checkDomains(d, fake),
    });
    expect(sent[0][0]).toBe('submit_growth_result');
  });

  it('is registered on the signed webhook', () => {
    expect(KNOWN_EVENTS).toEqual(expect.arrayContaining(['claim_growth_runs', 'growth_run_log', 'submit_growth_result', 'fail_growth_run']));
  });
});
