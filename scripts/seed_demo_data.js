/**
 * Seed Script — Populate CRM Client, Scripts, Content Tracker, and Ad Campaigns with Demo Data.
 * Usage: node scripts/seed_demo_data.js
 */

import db from '../database.js';

async function seed() {
  console.log('-- Starting Database Seeding of Marketing Demo Data --\n');

  // 1. Get or create a client
  let client = db.prepare('SELECT id, name FROM crm_clients LIMIT 1').get();
  if (!client) {
    console.log('No client found. Creating "Artisan Coffee Co."...');
    const insertClient = db.prepare(`
      INSERT INTO crm_clients (name, client_type, contact_person, contact_email)
      VALUES ('Artisan Coffee Co.', 'both', 'Rahul Sharma', 'rahul@artisancoffee.in')
    `);
    const clientResult = insertClient.run();
    client = { id: clientResult.lastInsertRowid, name: 'Artisan Coffee Co.' };
  }

  const clientId = client.id;
  console.log(`Using client: ${client.name} (ID: ${clientId})`);

  // 2. Clear existing demo data to prevent duplication
  db.prepare('DELETE FROM marketing_scripts WHERE client_id = ?').run(clientId);
  db.prepare('DELETE FROM marketing_content_tracker WHERE client_id = ?').run(clientId);
  db.prepare('DELETE FROM marketing_ad_campaigns WHERE client_id = ?').run(clientId);
  console.log('Cleared existing marketing scripts, content tracker, and ad campaigns for this client.');

  // 3. Seed Marketing Scripts
  const scripts = [
    {
      title: 'Best Coffee Brewing Tips',
      script_text: 'Here are the top 3 ways to brew your coffee like a barista. First, always grind your beans fresh. Second, check your water temperature. Third, weigh your coffee!',
      month: '2026-05',
      reference_video_link: 'https://youtube.com/shorts/ref1',
      reaction_video_link: 'https://youtube.com/shorts/react1'
    },
    {
      title: 'Behind the Scenes at Artisan',
      script_text: 'See how we roast our beans daily to give you the freshest cup. Our head roaster selects the finest single-origin coffee beans from around the world.',
      month: '2026-05',
      reference_video_link: 'https://youtube.com/shorts/ref2',
      reaction_video_link: ''
    },
    {
      title: 'Cold Brew Special Recipe',
      script_text: 'Looking for the perfect summer drink? Here is our secret cold brew recipe that you can make at home in under 12 hours. Smooth, bold, and refreshing!',
      month: '2026-05',
      reference_video_link: 'https://youtube.com/shorts/ref3',
      reaction_video_link: 'https://youtube.com/shorts/react3'
    },
    {
      title: 'April Cappuccino Special',
      script_text: 'Indulge in our smooth cappuccino with a touch of organic vanilla bean syrup. Hand-crafted and steamed to perfection by our baristas.',
      month: '2026-04',
      reference_video_link: 'https://youtube.com/shorts/ref4',
      reaction_video_link: ''
    }
  ];

  const scriptIds = [];
  const insertScript = db.prepare(`
    INSERT INTO marketing_scripts (client_id, month, title, script_text, reference_video_link, reaction_video_link)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const s of scripts) {
    const res = insertScript.run(clientId, s.month, s.title, s.script_text, s.reference_video_link, s.reaction_video_link);
    scriptIds.push({ title: s.title, id: res.lastInsertRowid });
    console.log(`✓ Seeded script: ${s.title}`);
  }

  // 4. Seed Content Tracker
  const contents = [
    {
      platform: 'instagram',
      media_id: 'ig_101',
      date: '2026-05-10',
      post_type: 'Reel',
      title: 'Best Coffee Brewing Tips',
      script: 'Here are the top 3 ways to brew your coffee like a barista...',
      status: 'Posted',
      link: 'https://instagram.com/reel/101',
      time: '10:00 AM',
      caption: 'Unlock the barista secrets! ☕️ #coffee #brewing',
      views: 15000,
      likes: 1200,
      comments: 90,
      shares: 250,
      saves: 400,
      avg_watch_time_pct: 75.0,
      boosted: 'No',
      follows: 85,
      engagement_rate_pct: 12.93,
      save_rate_pct: 2.67,
      content_score: 44.3,
      script_title: 'Best Coffee Brewing Tips'
    },
    {
      platform: 'instagram',
      media_id: 'ig_102',
      date: '2026-05-15',
      post_type: 'Carousel',
      title: 'Behind the Scenes at Artisan',
      script: 'See how we roast our beans daily...',
      status: 'Pending Client Approval',
      link: 'https://instagram.com/p/102',
      time: '02:00 PM',
      caption: 'Ever wondered where your morning coffee comes from? Take a look! 🔍 #behindthescenes',
      views: 8000,
      likes: 600,
      comments: 45,
      shares: 120,
      saves: 180,
      avg_watch_time_pct: 60.0,
      boosted: 'Yes',
      follows: 40,
      engagement_rate_pct: 11.81,
      save_rate_pct: 2.25,
      content_score: 36.2,
      script_title: 'Behind the Scenes at Artisan'
    },
    {
      platform: 'youtube',
      media_id: 'yt_201',
      date: '2026-05-20',
      post_type: 'Youtube',
      title: 'Cold Brew Special Recipe',
      script: 'Looking for the perfect summer drink? Here is our secret cold brew recipe...',
      status: 'Posted',
      link: 'https://youtube.com/watch?v=201',
      time: '09:00 AM',
      caption: 'The ultimate guide to making cold brew at home. 🧊 #coldbrew #recipe',
      views: 25000,
      likes: 1800,
      comments: 140,
      shares: 600,
      saves: 900,
      avg_watch_time_pct: 55.0,
      boosted: 'No',
      follows: 310,
      youtube_views: 25000,
      youtube_watch_time: 1250.5,
      youtube_avg_view_duration: '03:15',
      youtube_ctr: 8.5,
      engagement_rate_pct: 13.76,
      save_rate_pct: 3.6,
      content_score: 37.9,
      script_title: 'Cold Brew Special Recipe'
    },
    {
      platform: 'instagram',
      media_id: 'ig_104',
      date: '2026-04-05',
      post_type: 'Static',
      title: 'April Cappuccino Special',
      script: 'Indulge in our smooth cappuccino with a touch of organic vanilla bean syrup...',
      status: 'Posted',
      link: 'https://instagram.com/p/104',
      time: '11:30 AM',
      caption: 'Morning fuel sorted. ☕️ #cappuccino #special',
      views: 5000,
      likes: 350,
      comments: 20,
      shares: 30,
      saves: 50,
      avg_watch_time_pct: 40.0,
      boosted: 'No',
      follows: 15,
      engagement_rate_pct: 9.0,
      save_rate_pct: 1.0,
      content_score: 23.2,
      script_title: 'April Cappuccino Special'
    }
  ];

  const insertContent = db.prepare(`
    INSERT INTO marketing_content_tracker (
      client_id, platform, media_id, date, post_type, title, script, status, link, time, caption,
      views, likes, comments, shares, saves, avg_watch_time_pct, boosted, follows,
      youtube_views, youtube_watch_time, youtube_avg_view_duration, youtube_ctr,
      engagement_rate_pct, save_rate_pct, content_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRelation = db.prepare(`
    INSERT INTO marketing_content_script_relation (content_id, script_id)
    VALUES (?, ?)
  `);

  for (const c of contents) {
    const res = insertContent.run(
      clientId,
      c.platform,
      c.media_id,
      c.date,
      c.post_type,
      c.title,
      c.script,
      c.status,
      c.link,
      c.time,
      c.caption,
      c.views,
      c.likes,
      c.comments,
      c.shares,
      c.saves,
      c.avg_watch_time_pct,
      c.boosted,
      c.follows,
      c.youtube_views || 0,
      c.youtube_watch_time || 0.0,
      c.youtube_avg_view_duration || null,
      c.youtube_ctr || 0.0,
      c.engagement_rate_pct,
      c.save_rate_pct,
      c.content_score
    );

    const newContentId = res.lastInsertRowid;

    // Connect to script
    const matchedScript = scriptIds.find(s => s.title === c.script_title);
    if (matchedScript) {
      insertRelation.run(newContentId, matchedScript.id);
    }
    console.log(`✓ Seeded content tracker: ${c.title}`);
  }

  // 5. Seed Ad Campaigns
  const campaigns = [
    {
      platform: 'Meta',
      ad_campaign_name: 'Artisan Coffee Roasters - Lead Gen',
      leads: 150,
      total_ad_spend_inr: 12000,
      impressions: 55000,
      clicks: 1100,
      revenue_generated: 45000,
      ctr_pct: 2.0,
      cpc_inr: 11,
      cpl_inr: 80,
      roas: 3.75
    },
    {
      platform: 'Google',
      ad_campaign_name: 'Artisan Coffee Roasters - Search',
      leads: 85,
      total_ad_spend_inr: 8500,
      impressions: 22000,
      clicks: 880,
      revenue_generated: 28000,
      ctr_pct: 4.0,
      cpc_inr: 10,
      cpl_inr: 100,
      roas: 3.29
    },
    {
      platform: 'YouTube',
      ad_campaign_name: 'Brand Awareness - Video',
      leads: 30,
      total_ad_spend_inr: 6000,
      impressions: 120000,
      clicks: 1200,
      revenue_generated: 12000,
      ctr_pct: 1.0,
      cpc_inr: 5,
      cpl_inr: 200,
      roas: 2.0
    }
  ];

  const insertCampaign = db.prepare(`
    INSERT INTO marketing_ad_campaigns (
      client_id, platform, ad_campaign_name, leads, total_ad_spend_inr, impressions, clicks,
      ctr_pct, cpc_inr, cpl_inr, revenue_generated, roas
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const c of campaigns) {
    insertCampaign.run(
      clientId,
      c.platform,
      c.ad_campaign_name,
      c.leads,
      c.total_ad_spend_inr,
      c.impressions,
      c.clicks,
      c.ctr_pct,
      c.cpc_inr,
      c.cpl_inr,
      c.revenue_generated,
      c.roas
    );
    console.log(`✓ Seeded ad campaign: ${c.ad_campaign_name}`);
  }

  console.log('\n-- Seeding of Marketing Demo Data completed successfully --');
}

try {
  seed();
} catch (err) {
  console.error('Seeding failed:', err);
}
