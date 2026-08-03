import db from '../database.js';

const clientId = 2;
const query = `
  SELECT DISTINCT COALESCE(NULLIF(month, ''), SUBSTR(created_at, 1, 7)) as month 
  FROM marketing_ad_campaigns 
  WHERE client_id = ? 
  UNION 
  SELECT DISTINCT SUBSTR(created_at, 1, 7) as month 
  FROM campaign_leads 
  WHERE client_id = ? AND created_at IS NOT NULL 
  ORDER BY month DESC
`;

let months = db.prepare(query).all(clientId, clientId).map(r => r.month).filter(m => m && m.length === 7);
const currentMonth = new Date().toISOString().slice(0, 7);
if (!months.includes(currentMonth)) {
  months.unshift(currentMonth);
}

// Remove duplicates and sort descending
months = Array.from(new Set(months)).sort().reverse();

console.log("Extracted Available Months:", months);
