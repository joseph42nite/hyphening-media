/**
 * Marketing Ops Center — Rate Limiting
 * Separate limiters for global, auth, portal, and webhook endpoints.
 */

import rateLimit from 'express-rate-limit';

/**
 * Global rate limiter: 2000 requests per 15 minutes per IP
 *
 * Login, refresh, logout and health skip it: auth has its own limiter, and a
 * runaway dashboard tab on the same network must not lock anyone out of login.
 * The first time an IP is blocked in a window, its busiest paths are logged so
 * the flood can be traced (there is no request log in production).
 */
const GLOBAL_EXEMPT = /^\/(auth\/|health$)/;

// Hide ids and portal tokens so the log groups by route and leaks nothing.
const routeOf = (req) => (req.baseUrl + req.path)
  .split('/')
  .map(seg => (/^\d+$/.test(seg) || seg.length >= 20 ? ':id' : seg))
  .join('/');

export function createGlobalLimiter({ windowMs = 15 * 60 * 1000, max = 2000, log = console.warn } = {}) {
  const tallies = new Map(); // ip -> { paths: Map<route, count>, logged }
  setInterval(() => tallies.clear(), windowMs).unref();

  const limiter = rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
      const tally = tallies.get(req.ip);
      if (tally && !tally.logged) {
        tally.logged = true;
        const top = [...tally.paths].sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([route, n]) => `${route} x${n}`).join(', ');
        log(`[RATE-LIMIT] ${req.ip} blocked after ${max} requests. Busiest: ${top}`);
      }
      res.status(options.statusCode).json(options.message);
    },
    message: { error: 'Too many requests, please try again later.' },
  });

  return (req, res, next) => {
    if (req.method === 'OPTIONS' || GLOBAL_EXEMPT.test(req.path)) return next();
    let tally = tallies.get(req.ip);
    if (!tally) tallies.set(req.ip, tally = { paths: new Map(), logged: false });
    const route = `${req.method} ${routeOf(req)}`;
    tally.paths.set(route, (tally.paths.get(route) || 0) + 1);
    return limiter(req, res, next);
  };
}

export const globalLimiter = createGlobalLimiter();

/**
 * Auth rate limiter: 300 requests per 15 minutes per IP
 * Applied to /api/auth/login and /api/auth/refresh
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  message: { error: "Too many authentication attempts, please try again later." },
});

/**
 * Portal rate limiter: 500 requests per 15 minutes per token
 */
export const portalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => req.params.token || req.ip,
  message: { error: 'Too many portal requests, please try again later.' },
});

/**
 * Public lead form limiter: 5 submissions per hour per IP.
 * A real visitor sends one enquiry; anything past a handful is a bot or a loop.
 * Only POSTs count, so fetching the form token never uses up the allowance.
 */
export const leadFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method !== 'POST',
  message: { error: 'Too many submissions. Please email us directly at deepanjan@hypheningmedia.com.' },
});

/**
 * Webhook rate limiter: 300 requests per minute per IP
 */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  message: { error: 'Too many webhook requests.' },
});
