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
  await sleep(1500);

  console.log(`[RESOLVING] Performing domain lookup & connection health check...`);
  await sleep(1000);
  console.log(`[RESOLVING] HTTP status: 200 OK | Protocol: HTTPS`);

  // Simulate process logs per agent type
  if (agentType === 'technical') {
    console.log(`[CRAWLING] Fetching robots.txt and sitemap...`);
    await sleep(1200);
    console.log(`[CWV] Executing headless Chrome rendering...`);
    await sleep(1500);
    console.log(`[CWV] Metric: Largest Contentful Paint (LCP) -> 1.8s (Good)`);
    console.log(`[CWV] Metric: Interaction to Next Paint (INP) -> 80ms (Good)`);
    console.log(`[CWV] Metric: Cumulative Layout Shift (CLS) -> 0.05 (Good)`);
    await sleep(1000);
    console.log(`[HTML] Validating tag structures, heading hierarchies, indexability tags...`);
    await sleep(1200);
    console.log(`[HTML] Warning: 3 images are missing alt tags. 1 broken redirect found on /about.`);
  } else if (agentType === 'backlinks') {
    console.log(`[GAP] Pulling backlink index from free-tier references...`);
    await sleep(1500);
    console.log(`[GAP] Analyzing referring domains, domain authority metrics, spam profiles...`);
    await sleep(1500);
    console.log(`[GAP] Identified 3 high-authority domains pointing to competitors but not this site.`);
    console.log(`[GAP] Targets queued for Outreach targets compilation...`);
  } else if (agentType === 'local') {
    console.log(`[GBP] Inspecting Google Business Profile (GBP) API state...`);
    await sleep(1500);
    console.log(`[GBP] Validating Name-Address-Phone (NAP) consistency across top directory indices...`);
    await sleep(1500);
    console.log(`[GBP] Status: GBP verified. NAP matches. Average review rating: 4.8 stars.`);
  } else {
    console.log(`[AUDIT] Crawling content index & validating semantic elements...`);
    await sleep(2000);
  }

  console.log(`[ANALYSIS] Synthesizing audit logs into recommended actionable recommendations...`);
  await sleep(1500);

  // Compile mock scores
  const healthScore = Math.floor(Math.random() * 20) + 75; // 75-95
  const mockRecommendations = getMockRecommendations(agentType);

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
      recommendations: mockRecommendations,
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
        duration_seconds: 8
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

function getMockRecommendations(type) {
  if (type === 'technical') {
    return [
      {
        priority: 'Critical',
        metric: 'Core Web Vitals',
        issue: 'Largest Contentful Paint (LCP) takes 4.2 seconds on mobile',
        action_required: 'Optimize and compress hero images on home route, delay third-party tag managers execution',
        observation: 'Home route takes too long to load due to uncompressed images',
        dependency: 'Frontend Developer resources',
        failure_check: 'LCP > 2.5 seconds',
        leading_indicator: 'Initial server response latency'
      },
      {
        priority: 'High',
        metric: 'Image Alt Tags',
        issue: '3 primary client portfolio images lack alternate accessibility text descriptions',
        action_required: 'Add alt attributes to all img tags under client detail routes',
        observation: 'Impacts image indexation and search indexing visibility'
      }
    ];
  } else if (type === 'backlinks') {
    return [
      {
        priority: 'High',
        metric: 'Backlink Authority Gap',
        issue: 'Competitor HealthLine Clinic holds backlinks from healthlineclinic.com which drives referral traffic',
        action_required: 'Prepare customized outreach pitch offering guest editorial posts',
        observation: 'Target has a DA of 65 and accepts topically aligned guest contributions'
      }
    ];
  } else {
    return [
      {
        priority: 'Medium',
        metric: `${type.toUpperCase()} Optimization`,
        issue: `Unoptimized metric fields identified during ${type} checks`,
        action_required: `Resolve tag formatting and structure errors flagged in ${type} reports`,
        observation: 'Improves SEO relevancy scores'
      }
    ];
  }
}

run();
