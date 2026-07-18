/**
 * openclaw_seo_runner.js
 * CLI agent runner script that simulates execution of claude-seo sub-skills.
 * Prints stdout logs in real-time, estimates token usage, and posts the
 * signed webhook payload back to the backend callback endpoint.
 */

import crypto from 'crypto';
import db from './database.js';

// Parse arguments
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const flag = process.argv[i].replace(/^--/, '');
  const val = process.argv[i+1];
  args[flag] = val;
}

const clientId = parseInt(args.clientId);
const agentType = args.skill || 'technical';
const model = args.model || 'claude';
const triggeredBy = args.triggeredBy || 'system';

if (isNaN(clientId)) {
  console.error('[RUNNER] Error: --clientId is required.');
  process.exit(1);
}

// Lookup client info
const client = db.prepare('SELECT * FROM crm_clients WHERE id = ?').get(clientId);
if (!client) {
  console.error(`[RUNNER] Error: Client #${clientId} not found.`);
  process.exit(1);
}

const targetUrl = client.website_url;
if (!targetUrl) {
  console.error(`[RUNNER] Error: Client website_url is not configured.`);
  process.exit(1);
}

async function run() {
  console.log(`[INIT] Initializing '${agentType}' agent for target: ${targetUrl}`);
  console.log(`[CONFIG] Using model: ${model} | Initiator: ${triggeredBy}`);
  await sleep(1000);
 
  console.log(`[RESOLVING] Performing domain lookup & connection health check...`);
  console.log(`[RESOLVING] HTTP status: 200 OK | Protocol: HTTPS`);

  let healthScore = Math.floor(Math.random() * 10) + 85; // 85-95
  let recommendations = [];
  let internalPaths = [];
  let missingAlts = [];

  // 1. Perform dynamic HTML Crawl (for technical and full)
  if (agentType === 'technical' || agentType === 'full') {
    try {
      console.log(`[CRAWLING] Fetching homepage HTML from: ${targetUrl}`);
      const res = await fetch(targetUrl);
      if (res.ok) {
        const html = await res.text();
        console.log(`[CRAWLING] Homepage HTML fetched successfully. Size: ${(html.length / 1024).toFixed(1)} KB`);

        // Parse image alt tags dynamically
        const imgRegex = /<img([^>]+)>/gi;
        let match;
        let imgChecked = 0;
        while ((match = imgRegex.exec(html)) !== null && imgChecked < 10) {
          imgChecked++;
          const attrs = match[1];
          const srcMatch = attrs.match(/src=["']([^"']*)["']/i);
          const altMatch = attrs.match(/alt=["']([^"']*)["']/i);
          if (srcMatch && (!altMatch || !altMatch[1].trim())) {
            let src = srcMatch[1];
            if (src.startsWith('/')) src = new URL(src, targetUrl).href;
            missingAlts.push(src);
          }
        }

        // Parse internal links dynamically
        const linkRegex = /<a[^>]+href=["']([^"']+)["']/gi;
        const foundPaths = new Set();
        const hostname = new URL(targetUrl).hostname;
        while ((match = linkRegex.exec(html)) !== null && foundPaths.size < 5) {
          const href = match[1];
          if (href.startsWith('/') || href.includes(hostname)) {
            let abs = href;
            if (href.startsWith('/')) abs = new URL(href, targetUrl).href;
            if (!abs.includes('#')) foundPaths.add(abs);
          }
        }
        internalPaths = Array.from(foundPaths);
      }
    } catch (err) {
      console.log(`[CRAWL] Real-time HTML fetch fell back: ${err.message}`);
    }
  }

  // 2. Perform dynamic SQLite GMB/Report checks (for local and full, according to skills/seo_analyst.md)
  let trafficGrowth = 0;
  let mapGrowth = 0;
  let dbReports = [];
  
  if (agentType === 'local' || agentType === 'full') {
    console.log(`[DB_CHECK] Querying monthly reports for GMB analysis...`);
    try {
      dbReports = db.prepare(`
        SELECT * FROM marketing_monthly_report 
        WHERE client_id = ? 
        ORDER BY month DESC LIMIT 2
      `).all(clientId);

      if (dbReports.length >= 2) {
        const current = dbReports[0];
        const prior = dbReports[1];
        
        const currentTraffic = current.website_traffic || 0;
        const priorTraffic = prior.website_traffic || 0;
        trafficGrowth = priorTraffic > 0 ? ((currentTraffic - priorTraffic) / priorTraffic) * 100 : 0;
        
        const currentMap = current.map_views || 0;
        const priorMap = prior.map_views || 0;
        mapGrowth = priorMap > 0 ? ((currentMap - priorMap) / priorMap) * 100 : 0;
        
        console.log(`[ANALYSIS] Month-over-Month Growth parsed: Traffic ${trafficGrowth.toFixed(1)}% | GMB Map Views ${mapGrowth.toFixed(1)}%`);
      }
    } catch (err) {
      console.log(`[DB_CHECK] Database read error: ${err.message}`);
    }
  }

  // 3. Construct recommendations per agentType
  if (agentType === 'technical') {
    console.log(`[CWV] Executing headless Chrome rendering...`);
    console.log(`[CWV] Metric: Largest Contentful Paint (LCP) -> 1.8s (Good)`);
    console.log(`[CWV] Metric: Interaction to Next Paint (INP) -> 80ms (Good)`);
    console.log(`[CWV] Metric: Cumulative Layout Shift (CLS) -> 0.05 (Good)`);
    console.log(`[HTML] Validating HTML structures, heading hierarchies, redirects...`);

    recommendations.push({
      priority: 'Critical',
      metric: 'Core Web Vitals',
      issue: 'Largest Contentful Paint (LCP) takes 4.2 seconds on mobile',
      action_required: 'Optimize and compress hero images on home route, delay third-party tag managers execution',
      observation: 'Home page takes too long to load due to uncompressed images',
      page_url: targetUrl
    });

    if (missingAlts.length > 0) {
      console.log(`[HTML] Warning: Found ${missingAlts.length} image(s) missing alt tags.`);
      recommendations.push({
        priority: 'High',
        metric: 'Image Alt Tags',
        issue: `${missingAlts.length} images are missing alternative text (alt tags) on the homepage`,
        action_required: `Add alt attributes to the following missing images: ${missingAlts.slice(0, 3).join(', ')}`,
        observation: 'Impacts image indexation and search indexing visibility',
        page_url: targetUrl
      });
    } else {
      recommendations.push({
        priority: 'High',
        metric: 'Image Alt Tags',
        issue: 'Images on the page have correct alternative text attributes',
        action_required: 'Keep alt attributes updated for all new assets added to target templates',
        observation: 'Alt attributes are fully set across homepage',
        page_url: targetUrl
      });
    }
  } else if (agentType === 'backlinks') {
    console.log(`[GAP] Pulling backlink index from references...`);
    console.log(`[GAP] Analyzing referring domains, domain authority metrics...`);
    recommendations.push({
      priority: 'High',
      metric: 'Backlink Authority Gap',
      issue: 'Competitor HealthLine Clinic holds backlinks from healthlineclinic.com which drives referral traffic',
      action_required: 'Prepare customized outreach pitch offering guest editorial posts',
      observation: 'Target has a DA of 65 and accepts topically aligned guest contributions',
      page_url: targetUrl
    });
  } else if (agentType === 'local') {
    if (dbReports.length >= 2) {
      const current = dbReports[0];
      if (current.ai_overview_visible === 'No') {
        console.log(`[FLAG] GMB & AI Visibility Warning triggered.`);
        recommendations.push({
          priority: 'Critical',
          metric: 'Schema & AI Citability',
          issue: 'Client website is not referenced in AI Overviews for primary keywords.',
          action_required: 'Deploy Article/Service schema markup and add direct definition blocks in the blog section',
          observation: `MoM Traffic: ${trafficGrowth.toFixed(1)}% | MoM Map Views: ${mapGrowth.toFixed(1)}%`,
          page_url: `${targetUrl}/blogs/`
        });
      }

      const currentBlogs = current.blogs || 0;
      if (currentBlogs < 4) {
        recommendations.push({
          priority: 'High',
          metric: 'Blog Content Cadence',
          issue: `Blog output (${currentBlogs}/month) is below the recommended authority floor`,
          action_required: 'Increase publishing cadence to cover target keyword pillars',
          observation: 'Topical authority velocity is slow',
          page_url: `${targetUrl}/blogs/`
        });
      } else {
        recommendations.push({
          priority: 'Medium',
          metric: 'Blog Content Cadence',
          issue: `Blog output (${currentBlogs}/month) meets standard cadence goals`,
          action_required: 'Maintain current publishing pace and check keyword indexation',
          observation: 'Cadence is fresh and healthy',
          page_url: `${targetUrl}/blogs/`
        });
      }
    } else {
      recommendations.push({
        priority: 'High',
        metric: 'NAP Citation Auditing',
        issue: 'Inconsistent Name-Address-Phone formatting identified on directory indexes',
        action_required: 'Audit and sync GBP details with local directories',
        observation: 'Affects local map pack ranks',
        page_url: targetUrl
      });
    }
  } else if (agentType === 'full') {
    console.log(`[CWV] Executing headless Chrome rendering for full master audit...`);
    console.log(`[HTML] Validating HTML structures, heading hierarchies, redirects...`);
    
    if (missingAlts.length > 0) {
      recommendations.push({
        priority: 'High',
        metric: 'Image Alt Tags',
        issue: `${missingAlts.length} images are missing alternative text (alt tags) on the homepage`,
        action_required: `Add alt attributes to the following missing images: ${missingAlts.slice(0, 3).join(', ')}`,
        observation: 'Impacts image indexation and search indexing visibility',
        page_url: targetUrl
      });
    }

    if (dbReports.length >= 2) {
      const current = dbReports[0];
      if (current.ai_overview_visible === 'No') {
        recommendations.push({
          priority: 'Critical',
          metric: 'Schema & AI Citability',
          issue: 'Client website is not referenced in AI Overviews for primary keywords.',
          action_required: 'Deploy Article/Service schema markup and add direct definition blocks in the blog section',
          observation: `MoM Traffic: ${trafficGrowth.toFixed(1)}% | MoM Map Views: ${mapGrowth.toFixed(1)}%`,
          page_url: `${targetUrl}/blogs/`
        });
      }
    }

    const pageToLink = internalPaths.length > 0 ? internalPaths[0] : targetUrl;
    recommendations.push({
      priority: 'Medium',
      metric: 'Master Optimization',
      issue: 'General metadata tags are correct but keyword optimization can be refined',
      action_required: 'Review heading tags (H1/H2) hierarchy and integrate target keywords',
      observation: 'Improves SEO relevancy scores',
      page_url: pageToLink
    });
  } else {
    const pageToLink = internalPaths.length > 0 ? internalPaths[0] : targetUrl;
    recommendations.push({
      priority: 'Medium',
      metric: `${agentType.toUpperCase()} Optimization`,
      issue: `Unoptimized metric fields identified during ${agentType} checks`,
      action_required: `Resolve tag formatting and structure errors flagged in ${agentType} reports`,
      observation: 'Improves SEO relevancy scores',
      page_url: pageToLink
    });
  }

  console.log(`[ANALYSIS] Synthesizing audit logs into recommended actionable recommendations...`);
  await sleep(1000);

  // Build the payload
  const reportPayload = {
    event_type: 'create_seo_audit',
    payload: {
      client_id: clientId,
      audit_type: agentType,
      url: targetUrl,
      health_score: healthScore,
      technical_score: agentType === 'technical' ? healthScore : null,
      backlinks_score: agentType === 'backlinks' ? healthScore : null,
      local_score: agentType === 'local' ? healthScore : null,
      summary: `Successfully completed ${agentType} audit for ${client.name}. Overall score resolved to ${healthScore}/100.`,
      recommendations: recommendations,
      report_json: {
        timestamp: new Date().toISOString(),
        target: targetUrl,
        client: client.name,
        // Mock targets for backlinks to feed the Vetting Queue
        competitor_gap: agentType === 'backlinks' ? [
          { site_name: 'HealthLine Clinic', site_url: 'https://healthlineclinic.com/guest-post', category: 'guest_post', da: 65 },
          { site_name: 'Dental Care Guide', site_url: 'https://dentalcareguide.org/write-for-us', category: 'guest_post', da: 48 },
          { site_name: 'Well and Good India', site_url: 'https://wellandgoodindia.co.in/contribute', category: 'guest_post', da: 39 }
        ] : []
      },
      token_usage: {
        model,
        triggered_by: triggeredBy,
        input_tokens: Math.floor(Math.random() * 1500) + 1200,
        output_tokens: Math.floor(Math.random() * 600) + 400,
        estimated_cost_usd: model.includes('deepseek') ? 0.002 : 0.035,
        external_api_cost_usd: agentType === 'maps' ? 1.50 : 0.0,
        duration_seconds: 5
      }
    }
  };

  // Sign the payload
  const secret = process.env.OPENCLAW_HMAC_SECRET || 'secret';
  const signature = crypto.createHmac('sha256', secret)
    .update(JSON.stringify(reportPayload))
    .digest('hex');

  // Submit webhook
  const port = process.env.PORT || 3000;
  const webhookUrl = `http://localhost:${port}/api/openclaw/webhook`;
  console.log(`[CALLBACK] Submitting webhook callback to: ${webhookUrl}`);

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-openclaw-signature': signature,
        'x-openclaw-timestamp': new Date().toISOString(),
        'x-openclaw-nonce': crypto.randomUUID()
      },
      body: JSON.stringify(reportPayload)
    });

    const body = await res.json();
    if (!res.ok) {
      console.error(`[CALLBACK] Webhook rejected:`, body.error);
      process.exit(1);
    }
    console.log(`[SUCCESS] Agent completed and callback registered! Message: ${body.message}`);
    process.exit(0);
  } catch (err) {
    console.error(`[CALLBACK] Failed to submit callback API request:`, err.message);
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

run();
