/**
 * Marketing Ops Center — Main Server
 * Express application with full middleware stack, route mounts, and SSE support.
 */

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Validate required environment variables
const REQUIRED_ENV = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
const missing = REQUIRED_ENV.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill in the values.');
  process.exit(1);
}

// Import database (runs migrations on import)
import db from './database.js';

// Import middleware
import { globalLimiter } from './src/middleware/rateLimit.js';

// Import routes
import authRoutes from './src/routes/auth.js';
import clientRoutes from './src/routes/clients.js';
import freelancerRoutes from './src/routes/freelancers.js';
import taskRoutes from './src/routes/tasks.js';
import leadRoutes from './src/routes/leads.js';
import csvExportRoutes from './src/routes/csvExport.js';
import marketingRoutes from './src/routes/marketing.js';
import portalRoutes from './src/routes/portal.js';
import artistRoutes from './src/routes/artists.js';
import webhookRoutes from './src/routes/webhooks.js';
import blogRoutes from './src/routes/blog.js';
import caseStudiesRoutes from './src/routes/caseStudies.js';
import integrationsRoutes from './src/routes/integrations.js';
import { publicGigConfirmRoute } from './src/routes/artists.js';
import seoRoutes, { queueRouter as seoQueueRoutes } from './src/routes/seo.js';
import adsRoutes, { queueRouter as adsQueueRoutes } from './src/routes/ads.js';
import approvalRoutes from './src/routes/approval.js';
import usageRoutes from './src/routes/usage.js';
import notificationRoutes from './src/routes/notifications.js';
import sitemapRoutes from './src/routes/sitemap.js';

// Import services
import { initScheduler } from './src/services/scheduler.js';
import { attachMacConnector } from './src/services/macConnector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);
app.set('broadcastEvent', broadcastEvent);
const PORT = process.env.PORT || 3000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const IS_PROD = process.env.NODE_ENV === 'production';

// ============================================================
// MIDDLEWARE STACK (ordered as per spec)
// ============================================================

// 0. Compression — gzip/brotli every text response.
//
// The landing page ships ~900 KB of text (HTML + three.js + a base64 font
// sheet). Uncompressed that is what stalled the preloader on mobile links;
// compressed it is roughly a quarter of that. Runs first so it wraps
// express.static and the SPA fallback alike.
app.use(compression({ threshold: 1024 }));

// 1. Helmet — security headers
app.use(helmet({
  contentSecurityPolicy: IS_PROD ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://www.googletagmanager.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      // The landing page's font sheet inlines its woff2 files as base64
      // data: URIs, so data: has to be allowed or every face is blocked.
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "http://localhost", "capacitor://localhost", "https://*.google-analytics.com", "https://*.analytics.google.com", "https://*.googletagmanager.com"],
      frameSrc: [
        "'self'",
        "https://www.youtube.com",
        "https://www.youtube-nocookie.com",
        "https://player.vimeo.com",
        "https://www.loom.com",
      ],
    },
  } : false,
  hsts: IS_PROD ? { maxAge: 31536000, includeSubDomains: true } : false,
}));

// Helmet 8 dropped its Permissions-Policy helper (the feature list kept
// changing upstream), so the header is set directly. Nothing on this site
// uses camera/mic/geolocation/payment/usb, and interest-cohort=() opts out
// of FLoC-style tracking.
app.use((req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
  );
  next();
});

// 2. CORS — allow frontend origin
const CAPACITOR_ORIGINS = ['http://localhost', 'capacitor://localhost'];
app.use(cors({
  origin: IS_PROD 
    ? [FRONTEND_ORIGIN, ...CAPACITOR_ORIGINS] 
    : [FRONTEND_ORIGIN, 'http://localhost:3000', 'http://localhost:5173', ...CAPACITOR_ORIGINS],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// 3. Cookie parser
app.use(cookieParser());

// 4. JSON body parser
//
// The verify hook keeps the raw bytes on the request so HMAC verification can
// hash exactly what was sent. Without it the OpenClaw webhook had to hash a
// re-serialisation of the parsed body, which made the signature depend on
// matching Node's JSON formatting — a sender emitting 0.0 rather than 0 failed
// with an unexplained 401. See verifySignature in src/routes/webhooks.js.
app.use(express.json({
  limit: '5mb',
  verify: (req, res, buf) => { req.rawBody = buf; },
}));

// 5. Disable caching for all API responses.
//
// Without this, browsers (especially mobile Safari and Chromium) silently
// serve stale 200s from their HTTP cache for GET /api/* requests. That made
// script edits appear not to save until a hard refresh, and portal logins
// showed outdated content. `no-store` tells the browser to never cache, and
// disabling ETag prevents Express from returning 304 Not Modified on JSON
// responses whose bytes haven't changed between two rapid fetches.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  // Disable ETag for API responses so Express never sends 304.
  req.app.set('etag', false);
  res.removeHeader('ETag');
  next();
});

// 6. Global rate limiter (only applied to API endpoints)
app.use('/api', globalLimiter);

// 6. Request logging (dev only)
if (!IS_PROD) {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      if (!req.path.includes('/health')) {
        console.log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
      }
    });
    next();
  });
}

// ============================================================
// SSE SUPPORT — Server-Sent Events for live dashboard updates
// ============================================================

const sseClients = new Set();

// Send SSE keep-alive ping comment every 15 seconds to prevent HTTP/2 proxy (Caddy/Nginx) timeouts
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(': keep-alive ping\n\n');
    } catch (e) {
      sseClients.delete(client);
    }
  }
}, 15000);

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write('data: {"type":"connected"}\n\n');

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

/**
 * Broadcast an event to all connected SSE clients.
 * @param {string} eventType - e.g. 'task_updated', 'content_approved'
 * @param {Object} data - The event payload
 */
export function broadcastEvent(eventType, data) {
  const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(message);
  }
}

// ============================================================
// ROUTE MOUNTS
// ============================================================

// Health check
app.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({
      status: 'ok',
      db: 'connected',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      env: IS_PROD ? 'production' : 'development',
    });
  } catch (err) {
    res.status(500).json({ status: 'error', db: 'disconnected' });
  }
});

// Auth
app.use('/api/auth', authRoutes);

// Core data
app.use('/api/clients', clientRoutes);
app.use('/api/clients', csvExportRoutes);
app.use('/api/clients', marketingRoutes);
app.use('/api/freelancers', freelancerRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/leads', leadRoutes);

// Portal (no auth middleware — uses token-based auth)
app.use('/api/portal', portalRoutes);

// Artist curation
app.use('/api/artists', artistRoutes);

// Public gig confirmation endpoint (no auth)
app.get('/api/public/gigs/confirm/:token', publicGigConfirmRoute);

// Signed webhook for automation clients and agent workers
app.use('/api/webhooks', webhookRoutes);
app.use('/api/openclaw', webhookRoutes); // Backward-compatible alias

// SEO & Audit integration routes
app.use('/api/clients', seoRoutes);
app.use('/api/seo', seoQueueRoutes);

// Ads Monitor — the paid-media fleet. Same two mount points as SEO: the
// per-client routes hang off /api/clients, the queue is client-agnostic.
app.use('/api/clients', adsRoutes);
app.use('/api/ads', adsQueueRoutes);
app.use('/api/approval', approvalRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/notifications', notificationRoutes);

// Blog (public + admin)
app.use('/api/blog', blogRoutes);
app.use('/api/case-studies', caseStudiesRoutes);

// Composio Social Integrations
app.use('/api', integrationsRoutes);

// Sitemap & Robots.txt routes
app.use('/', sitemapRoutes);

// Audit logs (admin only)
app.get('/api/audit-logs', (req, res) => {
  const token = req.cookies?.access_token;
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(decoded.userId);
    
    if (!user || !['admin', 'super_admin'].includes(user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { entity_type, entity_id, limit = 50, offset = 0 } = req.query;
    
    // Construct base query and params for count & select
    let filterQuery = ' FROM audit_logs WHERE 1=1';
    const params = [];

    if (entity_type) { 
      filterQuery += ' AND entity_type = ?'; 
      params.push(entity_type); 
    }
    if (entity_id) { 
      filterQuery += ' AND entity_id = ?'; 
      params.push(parseInt(entity_id)); 
    }

    // Get total matching logs count
    const countQuery = `SELECT COUNT(*) as total${filterQuery}`;
    const total = db.prepare(countQuery).get(...params).total;

    // Get paginated logs
    const selectQuery = `SELECT *${filterQuery} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`;
    const logsParams = [...params, parseInt(limit), parseInt(offset)];
    const logs = db.prepare(selectQuery).all(...logsParams);

    res.json({ 
      logs, 
      total, 
      limit: parseInt(limit), 
      offset: parseInt(offset) 
    });
  } catch (err) {
    console.error('[AUDIT_API] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// STATIC FILES — blog narration audio
// ============================================================
// Lives outside frontend/dist so `npm run build` (which wipes dist) never
// takes it out. Referenced by blog_posts.audio_url, e.g. /audio/<file>.mp3.
app.use('/audio', express.static(path.join(__dirname, 'public', 'audio'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'),
}));

// ============================================================
// STATIC FILES — admin-uploaded cover images (case studies, etc.)
// ============================================================
// Same rationale as /audio above: lives outside frontend/dist so a rebuild
// never wipes it. Filenames are content-hashed on upload, so immutable
// caching is safe.
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'),
}));

// ============================================================
// STATIC FILES (Production — serve frontend build)
// ============================================================

const frontendPath = path.join(__dirname, 'frontend', 'dist');
if (IS_PROD || fs.existsSync(frontendPath)) {
  // Static assets.
  //
  // A year is only safe for files whose name changes when their contents do:
  // Vite's content-hashed bundles, binary media, and the pinned three.js
  // build. The landing page's own hand-written HTML/CSS/JS carry stable
  // names, so they revalidate instead — an ETag 304 costs one small round
  // trip and guarantees a deploy is never half-applied in someone's cache.
  const IMMUTABLE = /\.(webp|avif|png|jpe?g|gif|svg|ico|woff2?|mp4|webm)$/i;
  const VENDOR = /three\.min\.js$/i;
  app.use(express.static(frontendPath, {
    // "/" must not be answered with dist/index.html straight off disk: that
    // short-circuits the SPA fallback below, and with it the canonical tag it
    // injects, so the homepage — the one page that most needs one — shipped
    // without any. Letting "/" fall through gives every route the same tag.
    index: false,
    setHeaders: (res, filePath) => {
      const hashed = filePath.includes(`${path.sep}assets${path.sep}`);
      if (hashed || VENDOR.test(filePath) || IMMUTABLE.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));
  
  // Escapes text pulled from the DB (blog titles) before it goes into the
  // server-rendered homepage HTML below.
  const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  // Service copy for the H2 sections below. Sourced from Vesper's verified
  // copy pack (seo-audit-304-homepage-copy.md) — no invented facts or stats.
  const SERVICES = [
    ['Content Strategy and Creation', 'Most brands have a content calendar. Few have a content engine. A calendar says what posts when. An engine documents what works, turns it into scripts and hooks, and feeds the result back into the next month. We build monthly plans with scripts, hooks and posting schedules, then produce short-form and long-form video from script to final edit.'],
    ['Healthcare Marketing', "Clinics, dental practices and wellness brands can't say what other advertisers say. Outcome claims, testimonials, before-and-after images and superlatives are restricted for doctors and dentists in India. We write educational, factual content, source every claim, and keep qualifications on the page only when a real registration number is supplied. The goal is a patient who understands the treatment, not one who was promised a result."],
    ['Lead Generation and Campaign Management', 'Reach is not revenue. We run organic and paid campaigns with audience targeting, A/B testing and conversion-focused funnels, and we measure them against enquiries, bookings and cost per acquisition. If a campaign produces views and no leads, the report says so.'],
    ['Social Media Operations', 'Daily management across Instagram, YouTube and LinkedIn: posting, engagement, creator and influencer collaborations, and a weekly view of what is moving. Brands that need a single owner for the channel get one.'],
    ['Web and App Development', "A booking page that loads fast and converts is worth more than another post. We build custom websites and web apps, and mobile apps, for brands whose Instagram traffic has nowhere useful to land."],
    ['Performance Analytics and Client Portal', "Every client gets a secure portal to review scripts, track video and design tasks, and see platform-level performance in near real time. Monthly PDFs arrive too late to change a campaign. A live dashboard doesn't."],
    ['Brand Development and PR', 'Visual identity systems, positioning and tone-of-voice guides, plus news-media placements that build authority. A brand identity is a system for making decisions, not a logo.'],
  ];

  const FAQS = [
    ['What is Hyphening Media?', 'Hyphening Media is a creative operations and marketing agency that scales D2C, B2B, F&B, and healthcare brands through data-driven content strategy, video production, social media operations, and full-stack web and app development.'],
    ['What services does Hyphening Media offer?', 'Hyphening Media offers comprehensive services including content strategy, short and long form video production, multi-platform social media operations, custom high-performance web development, mobile app development, performance analytics, conversion-optimized campaign management, visual brand identity development, and news media PR.'],
    ['How does Hyphening Media scale D2C and F&B brands?', 'Hyphening Media scales brands using a data-driven content engine, creator and influencer collaborations, and operational automation dashboards. We focus on real performance metrics like 2X+ ROAS, CTR, conversions, and organic views rather than vanity metrics.'],
    ['Does Hyphening Media provide custom analytics and client portals?', 'Yes, Hyphening Media provides all client partners with an automated secure Client Portal where they can review marketing scripts, track active video and design tasks in real-time, view platform-specific performance analytics, and manage creative campaigns.'],
    ['Do you work with healthcare brands, and how do you handle advertising rules?', 'Yes. For clinics and dental practices we publish educational content only: no testimonials, no before-and-after images, no outcome promises, and no superlatives. Every claim is tied to a source, and qualifications appear only with a real registration number.'],
    ['How is a content engine different from a content calendar?', "A calendar lists what will be posted and when. A content engine documents what performs, converts it into scripts and hooks, and uses each month's results to plan the next. We build the second one."],
  ];

  // Server-rendered homepage content for non-JS clients and crawlers. The 3D
  // "Kage" experience (frontend/public/landing-pages/kage.html) carries this
  // same copy for JS users; wrapping it in <noscript> means it never shows to
  // a browser that already ran the experience, only to a crawler or non-JS
  // client reading the raw HTML — same facts, same wording as the live site.
  function buildHomepageNoscript() {
    let blogLinks = [];
    try {
      blogLinks = db.prepare(
        `SELECT slug, title FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 5`
      ).all();
    } catch (e) {
      console.error('[SSR noscript] blog_posts query failed:', e.message);
    }
    const blogLinksHtml = blogLinks.length
      ? blogLinks.map(p => `<li><a href="/blog/${encodeURIComponent(p.slug)}">${escapeHtml(p.title)}</a></li>`).join('\n          ')
      : '';

    const servicesHtml = SERVICES.map(([name, desc]) =>
      `<h2>${escapeHtml(name)}</h2>\n          <p>${escapeHtml(desc)}</p>`
    ).join('\n          ');

    const faqItemsHtml = FAQS.map(([q, a]) =>
      `<div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
            <h3 itemprop="name">${escapeHtml(q)}</h3>
            <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
              <p itemprop="text">${escapeHtml(a)}</p>
            </div>
          </div>`
    ).join('\n          ');

    return `<noscript>
      <main>
        <h1>Hyphening Media: Creative Operations and Marketing Performance for D2C, B2B, F&amp;B and Healthcare Brands</h1>
        <p class="lead">Hyphening Media is a creative operations agency for ambitious D2C, B2B, F&B, and healthcare brands that want content to produce customers, not just views. We script, shoot, produce and measure the work ourselves, so a campaign and its numbers sit under one roof. For healthcare brands, every piece is built inside advertising rules, not around them.</p>
        <p>A follower count and a bank balance have one thing in common: neither tells you why it changed. We report CTR, conversions and organic reach, and we leave out the numbers that only look good.</p>

        ${servicesHtml}

        <h2>How We Work</h2>
        <p>Every engagement starts with the number you want to move, not the platform you want to post on. We document the brand's audience and voice once, plan the month's scripts and hooks, produce the content, and review the results with you in the portal. What performed gets repeated. What did not gets dropped. There are no surprise invoices for vanity reach, because the report leads with the metrics tied to your business.</p>

        <h2>Leadership</h2>
        <p><strong>Joseph George, CEO.</strong> Joseph founded Hyphening Media and leads its strategy, client partnerships and technology. He runs the agency's content, healthcare marketing and lead generation work, with a background in artist curation.</p>
        <p><strong>Deepanjan Sarkar, COO.</strong> Deepanjan is a computer engineer with an MBA in marketing and finance from IIM. He runs day-to-day operations and client delivery, bringing an engineer's process discipline and a finance-minded view of campaign returns.</p>

        <h2>Trusted By</h2>
        <p>Client partners including Dr. Divya Sharma Skin and Hair Solutions, DentAlchemy Dental Clinic, TBC HSR Layout, TBC Kadubesanahalli, Zaffran Fine Dine, Jango Cafe and Brewery, F16s E-Freight Solutions, Ventura Capitals, and Muse-ing.</p>

        <h2>From the Blog</h2>
        <ul>
          ${blogLinksHtml}
          <li><a href="/blog">All articles</a></li>
          <li><a href="/case-studies">Case studies</a></li>
        </ul>

        <h2>Frequently Asked Questions</h2>
        <div itemscope itemtype="https://schema.org/FAQPage">
          ${faqItemsHtml}
        </div>

        <h2>D2C Content Operations</h2>
        <p><strong>Why do D2C brands need a content engine, not a content calendar?</strong> Because a calendar schedules output and an engine learns from it. A brand posting on a calendar repeats what it planned. A brand running an engine repeats what worked, and drops what did not. The difference shows up in cost per acquisition, not in post counts.</p>
        <p><strong>What should D2C founders track instead of likes?</strong> Track the metrics that sit next to revenue: click-through rate, conversion rate, cost per acquisition and repeat purchase. Likes and views describe attention. They do not say whether attention turned into a customer, which is why we report both and lead with the second set.</p>
        <p><strong>Why does retention matter more than acquisition spend?</strong> Keeping a customer you already paid to win usually costs less than winning a new one, so brands that only fund acquisition keep re-buying the same customers. See our <a href="/blog/retention-economics-why-d2c-brands-keep-paying-to-re-acquire-customers-they-already-have">retention economics breakdown</a> for the sourced numbers.</p>

        <h2>Start a Conversation</h2>
        <p>Tell us the brand, the channel that is underperforming, and the number you want to move.</p>
        <address>
          Nikoo, Bharatiya City, Bengaluru 560064<br>
          <a href="mailto:deepanjan@hypheningmedia.com">deepanjan@hypheningmedia.com</a><br>
          <a href="tel:+917278178402">+91 72781 78402</a><br>
          <a href="https://www.instagram.com/hypheningmedia/">Instagram</a> ·
          <a href="https://www.linkedin.com/company/are-you-hyphening/">LinkedIn</a>
        </address>
      </main>
    </noscript>`;
  }

  // SPA fallback — serve index.html for all non-API routes with dynamic canonical injection & 301 trailing slash normalization
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Not found', path: req.path });
    }

    // 301 Redirect trailing slashes on non-root paths (prevents "Page with redirect" & duplicate URL issues)
    if (req.path.length > 1 && req.path.endsWith('/')) {
      const query = req.url.slice(req.path.length);
      const cleanPath = req.path.slice(0, -1) + query;
      return res.redirect(301, cleanPath);
    }

    const indexPath = path.join(frontendPath, 'index.html');
    if (!fs.existsSync(indexPath)) {
      return res.status(404).send('Index file not found');
    }

    // Dynamically inject exact single canonical tag for requested path
    const cleanPath = req.path === '/' ? '/' : req.path.replace(/\/$/, '');
    const canonicalUrl = `https://hypheningmedia.com${cleanPath}`;

    fs.readFile(indexPath, 'utf8', (err, html) => {
      if (err) {
        return res.sendFile(indexPath);
      }
      const canonicalTag = `<link rel="canonical" href="${canonicalUrl}" />`;
      let updatedHtml = html.replace('</head>', `  ${canonicalTag}\n</head>`);
      if (cleanPath === '/') {
        updatedHtml = updatedHtml.replace('</body>', `  ${buildHomepageNoscript()}\n  </body>`);
      }
      res.header('Content-Type', 'text/html');
      res.send(updatedHtml);
    });
  });
}

// ============================================================
// ERROR HANDLING
// ============================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(err.status || 500).json({
    error: IS_PROD ? 'Internal server error' : err.message,
    ...(IS_PROD ? {} : { stack: err.stack }),
  });
});

// ============================================================
// START SERVER
// ============================================================

const httpServer = app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Marketing Ops Center — Server Running      ║');
  console.log(`║   Port: ${PORT}                                  ║`);
  console.log(`║   Mode: ${IS_PROD ? 'PRODUCTION' : 'DEVELOPMENT'}                        ║`);
  console.log('║   Health: /api/health                        ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  // Initialize cron scheduler
  initScheduler();

  // Audit-timeout timers live in memory, so a restart would strand every
  // in-flight SEO run as permanently "running" — and a stranded run holds the
  // dedupe slot, blocking that agent from ever being triggered again.
  import('./src/services/agentRuns.js')
    .then(({ recoverInFlightRuns }) => recoverInFlightRuns())
    .catch(err => console.error('[SERVER] SEO run recovery failed:', err));

  // Same hazard, same fix, separate table.
  import('./src/services/adsRuns.js')
    .then(({ recoverInFlightRuns }) => recoverInFlightRuns())
    .catch(err => console.error('[SERVER] Ads run recovery failed:', err));
});

// Push channel to the Mac connector — see src/services/macConnector.js.
attachMacConnector(httpServer);

export default app;
