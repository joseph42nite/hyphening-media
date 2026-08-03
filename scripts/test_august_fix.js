import db from '../database.js';

const clientId = 2;
const month = '2026-08';

const leadCampaigns = db.prepare(`
  SELECT 
    COALESCE(NULLIF(TRIM(platform), ''), 'Other') as platform,
    COALESCE(NULLIF(TRIM(campaign_name), ''), 'Manual Entry') as ad_campaign_name,
    COUNT(id) as actual_leads,
    SUM(CASE WHEN 
      LOWER(TRIM(COALESCE(qualification_status, ''))) = 'qualified' 
      OR LOWER(TRIM(COALESCE(lead_status, ''))) IN ('qualified', 'appointment booked', 'hot', 'converted') 
      OR LOWER(TRIM(COALESCE(appointment_status, ''))) IN ('booked', 'confirmed')
    THEN 1 ELSE 0 END) as actual_qualified_leads,
    SUM(CASE WHEN 
      LOWER(TRIM(COALESCE(appointment_status, ''))) IN ('booked', 'confirmed') 
      OR LOWER(TRIM(COALESCE(lead_status, ''))) = 'appointment booked'
    THEN 1 ELSE 0 END) as actual_confirmed_bookings
  FROM campaign_leads
  WHERE client_id = ? AND SUBSTR(created_at, 1, 7) = ?
  GROUP BY platform, ad_campaign_name
  ORDER BY actual_leads DESC
`).all(clientId, month);

console.log("=== AUGUST 2026 LEAD CAMPAIGN BREAKDOWN ===");
console.table(leadCampaigns);

const totalAugLeads = db.prepare("SELECT COUNT(*) as c FROM campaign_leads WHERE client_id = ? AND SUBSTR(created_at, 1, 7) = ?").get(clientId, month).c;
console.log("Total August 2026 Leads:", totalAugLeads);
