/**
 * Marketing Ops Center — CSV Export Service
 * Generates downloadable CSV for content tracker, ad campaigns, and monthly reports.
 */

import { Router } from 'express';
import db from '../../database.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

/**
 * Convert an array of objects to CSV string.
 */
function toCSV(rows, columns) {
  if (!rows || rows.length === 0) return columns.join(',') + '\n';

  const header = columns.join(',');
  const body = rows.map(row => {
    return columns.map(col => {
      const val = row[col];
      if (val === null || val === undefined) return '';
      const str = String(val);
      // Escape values containing commas, quotes, or newlines
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',');
  }).join('\n');

  return header + '\n' + body + '\n';
}

/**
 * GET /api/clients/:id/export/content
 * Export marketing content tracker as CSV.
 */
router.get('/:id/export/content', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const client = db.prepare('SELECT name FROM crm_clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const rows = db.prepare(`
      SELECT 
        date AS [Date],
        post_type AS [Post Type],
        script AS [Script],
        status AS [Status],
        link AS [Link],
        time AS [Time],
        caption AS [Caption],
        views AS [Insta Views],
        likes AS [Insta Likes],
        comments AS [Insta Comments],
        shares AS [Insta Shares],
        saves AS [Insta Saves],
        follows AS [Follows (from post)],
        avg_watch_time_pct AS [Avg Watch Time %],
        boosted AS [Boosted? (Yes/No + Spend ₹)],
        engagement_rate_pct AS [Engagement Rate % (auto)],
        save_rate_pct AS [Save Rate % (auto)],
        content_score AS [Content Score (auto)],
        youtube_views AS [Youtube Views],
        youtube_watch_time AS [Youtube Watch Time (hrs)],
        youtube_avg_view_duration AS [Youtube Avg View Duration],
        youtube_ctr AS [Youtube CTR%],
        facebook_post_id AS [Facebook Post ID],
        instagram_media_id AS [Instagram Media ID],
        youtube_video_id AS [Youtube Video ID]
      FROM marketing_content_tracker
      WHERE client_id = ? AND is_tracked = 1
      ORDER BY [Date] DESC
    `).all(req.params.id);

    const columns = [
      'Date', 'Post Type', 'Script', 'Status', 'Link', 'Time', 'Caption',
      'Insta Views', 'Insta Likes', 'Insta Comments', 'Insta Shares', 'Insta Saves', 'Follows (from post)', 'Avg Watch Time %', 'Boosted? (Yes/No + Spend ₹)',
      'Engagement Rate % (auto)', 'Save Rate % (auto)', 'Content Score (auto)',
      'Youtube Views', 'Youtube Watch Time (hrs)', 'Youtube Avg View Duration', 'Youtube CTR%',
      'Facebook Post ID', 'Instagram Media ID', 'Youtube Video ID'
    ];

    const csv = toCSV(rows, columns);
    const filename = `${client.name.replace(/[^a-zA-Z0-9]/g, '_')}_content_tracker.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('[CSV] Content export error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/clients/:id/export/ads
 * Export ad campaigns as CSV.
 */
router.get('/:id/export/ads', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const client = db.prepare('SELECT name FROM crm_clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const rows = db.prepare(`
      SELECT platform, ad_campaign_name, leads, total_ad_spend_inr, impressions, clicks,
        ctr_pct, cpc_inr, cpl_inr, revenue_generated, roas
      FROM marketing_ad_campaigns
      WHERE client_id = ?
      ORDER BY created_at DESC
    `).all(req.params.id);

    const columns = [
      'platform', 'ad_campaign_name', 'leads', 'total_ad_spend_inr', 'impressions',
      'clicks', 'ctr_pct', 'cpc_inr', 'cpl_inr', 'revenue_generated', 'roas'
    ];

    const csv = toCSV(rows, columns);
    const filename = `${client.name.replace(/[^a-zA-Z0-9]/g, '_')}_ad_campaigns.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('[CSV] Ads export error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/clients/:id/export/monthly
 * Export monthly reports as CSV.
 */
router.get('/:id/export/monthly', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const client = db.prepare('SELECT name FROM crm_clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const rows = db.prepare(`
      SELECT 
        month AS [Month],
        website_clicks AS [Website Clicks],
        website_traffic AS [Website Traffic],
        gmb_views AS [GMB Views],
        map_views AS [Map Views],
        gmb_clicks AS [GMB Clicks],
        on_page_score AS [On Page Score],
        off_page AS [Off Page],
        blogs AS [Blogs],
        calls AS [Calls],
        directions AS [Directions],
        reviews AS [Reviews],
        avg_rating AS [Avg. Rating],
        top_keywords AS [Top 3 Keywords],
        da AS [DA],
        CASE 
          WHEN mom_growth_sessions IS NOT NULL THEN ROUND(mom_growth_sessions * 100, 2) || '%' 
          ELSE '' 
        END AS [MoM Growth – Sessions],
        CASE 
          WHEN mom_growth_gmb_views IS NOT NULL THEN ROUND(mom_growth_gmb_views * 100, 2) || '%' 
          ELSE '' 
        END AS [MoM Growth – GMB Views],
        ai_overview_visible AS [AI Overview Visible?]
      FROM marketing_monthly_report
      WHERE client_id = ?
      ORDER BY month DESC
    `).all(req.params.id);

    const columns = [
      'Month', 'Website Clicks', 'Website Traffic', 'GMB Views', 'Map Views', 'GMB Clicks',
      'On Page Score', 'Off Page', 'Blogs', 'Calls', 'Directions', 'Reviews', 'Avg. Rating',
      'Top 3 Keywords', 'DA', 'MoM Growth – Sessions', 'MoM Growth – GMB Views', 'AI Overview Visible?'
    ];

    const csv = toCSV(rows, columns);
    const filename = `${client.name.replace(/[^a-zA-Z0-9]/g, '_')}_monthly_report.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('[CSV] Monthly export error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
