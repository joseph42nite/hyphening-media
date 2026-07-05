/**
 * Marketing Ops Center — Main Server
 * Express application with full middleware stack, route mounts, and SSE support.
 */

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
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
import csvExportRoutes from './src/routes/csvExport.js';
import marketingRoutes from './src/routes/marketing.js';
import portalRoutes from './src/routes/portal.js';
import artistRoutes from './src/routes/artists.js';
import openclawRoutes from './src/routes/openclaw.js';
import blogRoutes from './src/routes/blog.js';
import integrationsRoutes from './src/routes/integrations.js';
import { publicGigConfirmRoute } from './src/routes/artists.js';

// Import services
import { initScheduler } from './src/services/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const IS_PROD = process.env.NODE_ENV === 'production';

// ============================================================
// MIDDLEWARE STACK (ordered as per spec)
// ============================================================

// 1. Helmet — security headers
app.use(helmet({
  contentSecurityPolicy: IS_PROD ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "http://localhost", "capacitor://localhost"],
    },
  } : false,
  hsts: IS_PROD ? { maxAge: 31536000, includeSubDomains: true } : false,
}));

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
app.use(express.json({ limit: '5mb' }));

// 5. Global rate limiter (only applied to API endpoints)
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

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
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

// Portal (no auth middleware — uses token-based auth)
app.use('/api/portal', portalRoutes);

// Artist curation
app.use('/api/artists', artistRoutes);

// Public gig confirmation endpoint (no auth)
app.get('/api/public/gigs/confirm/:token', publicGigConfirmRoute);

// OpenClaw webhook
app.use('/api/openclaw', openclawRoutes);

// Blog (public + admin)
app.use('/api/blog', blogRoutes);

// Composio Social Integrations
app.use('/api', integrationsRoutes);

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
// STATIC FILES (Production — serve frontend build)
// ============================================================

const frontendPath = path.join(__dirname, 'frontend', 'dist');
if (IS_PROD || fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  
  // SPA fallback — serve index.html for all non-API routes
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(frontendPath, 'index.html'));
    }
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

app.listen(PORT, () => {
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
});

export default app;
