/**
 * Seed SEO & GMB Monthly Reports Data with all columns from Spreadsheet
 * Run with: node scripts/seed_seo.js
 */

import db from '../database.js';

const reports = [
  {
    month: '2025-09',
    website_clicks: '7.61k',
    website_traffic: 15000,
    gmb_views: 3557,
    map_views: 33003,
    gmb_clicks: 249,
    on_page_score: '85%',
    off_page: 100,
    blogs: 12,
    calls: 1370,
    directions: 1738,
    reviews: null,
    avg_rating: 4.6,
    top_keywords: 'dermatologist near me , best dermatologist in marathahalli , best skin specialist in bangalore , skin care clinic in bangalore , dermatologist bangalore ',
    da: 19,
    momTraffic: null,
    momMap: null,
    aiVisible: 'Yes'
  },
  {
    month: '2025-10',
    website_clicks: '7.89k',
    website_traffic: 16000,
    gmb_views: 3485,
    map_views: 40470,
    gmb_clicks: 235,
    on_page_score: '86%',
    off_page: 100,
    blogs: 12,
    calls: 1448,
    directions: 1781,
    reviews: null,
    avg_rating: 4.6,
    top_keywords: 'dermatologist near me , best dermatologist in marathahalli , best skin specialist in bangalore , skin care clinic in bangalore  , dermatologist bangalore ',
    da: 19,
    momTraffic: 0.0667,
    momMap: 0.2263,
    aiVisible: 'No'
  },
  {
    month: '2025-11',
    website_clicks: '8.01k',
    website_traffic: 11000,
    gmb_views: 3683,
    map_views: 87031,
    gmb_clicks: 282,
    on_page_score: '86%',
    off_page: 100,
    blogs: 12,
    calls: 1477,
    directions: 1924,
    reviews: null,
    avg_rating: 4.5,
    top_keywords: 'dermatologist near me\ndermatologist bangalore\nbest dermatologist bangalore\ndermatologist',
    da: 19,
    momTraffic: -0.3125,
    momMap: 1.1505,
    aiVisible: 'No'
  },
  {
    month: '2025-12',
    website_clicks: '7.85K',
    website_traffic: 12000,
    gmb_views: 3216,
    map_views: 32019,
    gmb_clicks: 262,
    on_page_score: '86%',
    off_page: 100,
    blogs: 12,
    calls: 1316,
    directions: 1638,
    reviews: null,
    avg_rating: 4.5,
    top_keywords: 'dermatologist near me , dermatologist bangalore\nbest dermatologist bangalore',
    da: null,
    momTraffic: 0.0909,
    momMap: -0.6321,
    aiVisible: 'No'
  },
  {
    month: '2026-01',
    website_clicks: '7.89K',
    website_traffic: 11000,
    gmb_views: 3147,
    map_views: 27779,
    gmb_clicks: 209,
    on_page_score: '86%',
    off_page: 100,
    blogs: 12,
    calls: 1266,
    directions: 1672,
    reviews: null,
    avg_rating: 4.6,
    top_keywords: 'dermatologist near me\ndermatologist bangalore\nbest dermatologist bangalore\ndermatologist',
    da: null,
    momTraffic: -0.0833,
    momMap: -0.1324,
    aiVisible: 'No'
  },
  {
    month: '2026-02',
    website_clicks: '9.91k',
    website_traffic: 13000,
    gmb_views: 2837,
    map_views: 21899,
    gmb_clicks: 201,
    on_page_score: '86%',
    off_page: 100,
    blogs: 12,
    calls: 1070,
    directions: 1566,
    reviews: null,
    avg_rating: 4.6,
    top_keywords: 'dermatologist near me\ndermatologist bangalore\nbest dermatologist bangalore\ndermatologist',
    da: null,
    momTraffic: 0.1818,
    momMap: -0.2117,
    aiVisible: 'No'
  },
  {
    month: '2026-03',
    website_clicks: '9.48k',
    website_traffic: 11000,
    gmb_views: 2900,
    map_views: 21347,
    gmb_clicks: 237,
    on_page_score: '86%',
    off_page: 100,
    blogs: 12,
    calls: 1167,
    directions: 1496,
    reviews: null,
    avg_rating: 4.6,
    top_keywords: 'dermatologist near me\ndermatologist bangalore\nbest dermatologist bangalore\ndermatologist',
    da: null,
    momTraffic: -0.1538,
    momMap: -0.0252,
    aiVisible: 'No'
  },
  {
    month: '2026-04',
    website_clicks: '9.37k',
    website_traffic: 11000,
    gmb_views: 2907,
    map_views: 20089,
    gmb_clicks: 257,
    on_page_score: '86%',
    off_page: 100,
    blogs: 12,
    calls: 1265,
    directions: 1385,
    reviews: 1641,
    avg_rating: 4.6,
    top_keywords: 'dermatologist near me\ndermatologist bangalore\nbest dermatologist bangalore\ndermatologistbest dermatologist in Whitefield\nacne scar treatment Bangalore\nhair fall treatment Bangalore\nlaser hair removal Bangalore\nskin specialist near me\nPRP hair treatment Bangalore\npigmentation treatment Bangalore\nhydrafacial Bangalore\nanti aging treatment Bangalore\nmelasma treatment Bangalore',
    da: 18,
    momTraffic: 0.0000,
    momMap: -0.0589,
    aiVisible: 'No'
  },
  {
    month: '2026-05',
    website_clicks: '11k',
    website_traffic: 14000,
    gmb_views: 3188,
    map_views: 20757,
    gmb_clicks: 248,
    on_page_score: null,
    off_page: 100,
    blogs: 12,
    calls: 1297,
    directions: 1643,
    reviews: null,
    avg_rating: 4.6,
    top_keywords: 'https://www.drdivyasharma.com/blogs/',
    da: null,
    momTraffic: 0.2727,
    momMap: 0.0333,
    aiVisible: 'No'
  }
];

console.log('-- Seeding Complete SEO & GMB Monthly Reports for Client 1 --');

const stmt = db.prepare(`
  INSERT INTO marketing_monthly_report (
    client_id, month, website_clicks, website_traffic, gmb_views, map_views, gmb_clicks,
    on_page_score, off_page, blogs, calls, directions, reviews, avg_rating,
    top_keywords, da, mom_growth_sessions, mom_growth_gmb_views, ai_overview_visible
  )
  VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(client_id, month) DO UPDATE SET
    website_clicks = excluded.website_clicks,
    website_traffic = excluded.website_traffic,
    gmb_views = excluded.gmb_views,
    map_views = excluded.map_views,
    gmb_clicks = excluded.gmb_clicks,
    on_page_score = excluded.on_page_score,
    off_page = excluded.off_page,
    blogs = excluded.blogs,
    calls = excluded.calls,
    directions = excluded.directions,
    reviews = excluded.reviews,
    avg_rating = excluded.avg_rating,
    top_keywords = excluded.top_keywords,
    da = excluded.da,
    mom_growth_sessions = excluded.mom_growth_sessions,
    mom_growth_gmb_views = excluded.mom_growth_gmb_views,
    ai_overview_visible = excluded.ai_overview_visible
`);

const runSeeding = db.transaction(() => {
  for (const r of reports) {
    stmt.run(
      r.month,
      r.website_clicks,
      r.website_traffic,
      r.gmb_views,
      r.map_views,
      r.gmb_clicks,
      r.on_page_score,
      r.off_page,
      r.blogs,
      r.calls,
      r.directions,
      r.reviews,
      r.avg_rating,
      r.top_keywords,
      r.da,
      r.momTraffic,
      r.momMap,
      r.aiVisible
    );
    console.log(`✓ Seeded month: ${r.month}`);
  }
});

try {
  runSeeding();
  console.log('\n-- Seeding completed successfully --');
} catch (err) {
  console.error('Seeding failed:', err);
}
