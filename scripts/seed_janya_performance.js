import db from '../database.js';

console.log('-- Seeding Multi-Month Ad Performance for Janya Fertility (Client ID 2) --');

const clientId = 2;

// 1. Enable portal & set portal_token for Janya Fertility
db.prepare(`
  UPDATE crm_clients 
  SET portal_token = 'janya-portal-token-999', 
      portal_enabled = 1, 
      lead_alerts_enabled = 1,
      is_active = 1
  WHERE id = ?
`).run(clientId);
console.log('✓ Portal enabled with token: janya-portal-token-999');

// 2. Clear existing ad campaigns and campaign leads for Janya to avoid duplication
db.prepare('DELETE FROM marketing_ad_campaigns WHERE client_id = ?').run(clientId);
db.prepare('DELETE FROM campaign_leads WHERE client_id = ?').run(clientId);

// 3. Seed Ad Campaigns for July 2026 and August 2026
const insertCampaign = db.prepare(`
  INSERT INTO marketing_ad_campaigns (
    client_id, month, platform, ad_campaign_name, leads, total_ad_spend_inr,
    impressions, clicks, ctr_pct, cpc_inr, cpl_inr, revenue_generated, roas, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const campaigns = [
  // July 2026 (Previous Month)
  {
    month: '2026-07',
    platform: 'Meta',
    ad_campaign_name: 'Janya IVF - Meta Lead Gen (Jul)',
    leads: 32,
    total_ad_spend_inr: 12000,
    impressions: 42000,
    clicks: 890,
    ctr_pct: 2.12,
    cpc_inr: 13,
    cpl_inr: 375,
    revenue_generated: 96000,
    roas: 8.0,
    created_at: '2026-07-15 10:00:00'
  },
  {
    month: '2026-07',
    platform: 'Google',
    ad_campaign_name: 'Janya Fertility - Google Search (Jul)',
    leads: 18,
    total_ad_spend_inr: 9000,
    impressions: 11000,
    clicks: 450,
    ctr_pct: 4.09,
    cpc_inr: 20,
    cpl_inr: 500,
    revenue_generated: 54000,
    roas: 6.0,
    created_at: '2026-07-15 10:00:00'
  },
  // August 2026 (Current Month)
  {
    month: '2026-08',
    platform: 'Meta',
    ad_campaign_name: 'Janya IVF - Meta Lead Gen (Aug)',
    leads: 48,
    total_ad_spend_inr: 16800,
    impressions: 61000,
    clicks: 1420,
    ctr_pct: 2.33,
    cpc_inr: 12,
    cpl_inr: 350,
    revenue_generated: 144000,
    roas: 8.57,
    created_at: '2026-08-01 10:00:00'
  },
  {
    month: '2026-08',
    platform: 'Google',
    ad_campaign_name: 'Janya Fertility - Google Search (Aug)',
    leads: 29,
    total_ad_spend_inr: 12500,
    impressions: 15200,
    clicks: 710,
    ctr_pct: 4.67,
    cpc_inr: 18,
    cpl_inr: 431,
    revenue_generated: 87000,
    roas: 6.96,
    created_at: '2026-08-01 10:00:00'
  }
];

for (const c of campaigns) {
  insertCampaign.run(
    clientId, c.month, c.platform, c.ad_campaign_name, c.leads,
    c.total_ad_spend_inr, c.impressions, c.clicks, c.ctr_pct,
    c.cpc_inr, c.cpl_inr, c.revenue_generated, c.roas, c.created_at
  );
  console.log(`✓ Seeded Ad Campaign: ${c.ad_campaign_name} (${c.month})`);
}

// 4. Seed Campaign Leads for July and August
const insertLead = db.prepare(`
  INSERT INTO campaign_leads (
    client_id, name, email, phone, platform, source, campaign_name, treatment_type,
    qualification_status, call_outcome, appointment_status, lead_status, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const leadsData = [
  // July leads
  { name: 'Pooja Reddy', phone: '+919876543210', platform: 'Meta', campaign_name: 'Janya IVF - Meta Lead Gen (Jul)', treatment_type: 'IVF Consultation', qual: 'Qualified', appt: 'Booked', status: 'Appointment Booked', date: '2026-07-10 11:30:00' },
  { name: 'Ananya Rao', phone: '+919876543211', platform: 'Meta', campaign_name: 'Janya IVF - Meta Lead Gen (Jul)', treatment_type: 'PCOS Care', qual: 'Qualified', appt: 'Follow Up', status: 'Qualified', date: '2026-07-18 14:10:00' },
  { name: 'Suresh Kumar', phone: '+919876543212', platform: 'Google', campaign_name: 'Janya Fertility - Google Search (Jul)', treatment_type: 'Male Infertility', qual: 'Qualified', appt: 'Booked', status: 'Appointment Booked', date: '2026-07-22 09:45:00' },

  // August leads
  { name: 'Kavitha M', phone: '+919988776655', platform: 'Meta', campaign_name: 'Janya IVF - Meta Lead Gen (Aug)', treatment_type: 'IVF Treatment', qual: 'Qualified', appt: 'Booked', status: 'Appointment Booked', date: '2026-08-01 10:15:00' },
  { name: 'Rohan Sharma', phone: '+919988776656', platform: 'Google', campaign_name: 'Janya Fertility - Google Search (Aug)', treatment_type: 'IUI Evaluation', qual: 'Qualified', appt: 'Booked', status: 'Appointment Booked', date: '2026-08-02 12:00:00' },
  { name: 'Meena Nair', phone: '+919988776657', platform: 'Meta', campaign_name: 'Janya IVF - Meta Lead Gen (Aug)', treatment_type: 'Egg Freezing', qual: 'Pending', appt: 'Follow Up', status: 'Pending', date: '2026-08-03 09:30:00' }
];

for (const l of leadsData) {
  insertLead.run(
    clientId, l.name, `${l.name.toLowerCase().replace(' ', '.')}@example.com`, l.phone,
    l.platform, 'form', l.campaign_name, l.treatment_type,
    l.qual, 'Picked Up', l.appt, l.status, l.date
  );
  console.log(`✓ Seeded Campaign Lead: ${l.name} (${l.platform})`);
}

console.log('\n-- Successfully Seeded Janya Fertility Data! --');
