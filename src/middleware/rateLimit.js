/**
 * Marketing Ops Center — Rate Limiting
 * Separate limiters for global, auth, and portal endpoints.
 */

import rateLimit from 'express-rate-limit';

/**
 * Global rate limiter: 200 requests per 15 minutes per IP
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 200 : 10000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

/**
 * Auth rate limiter: 10 requests per 15 minutes per IP
 * Applied to /api/auth/login and /api/auth/refresh
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
});

/**
 * Portal rate limiter: 100 requests per 15 minutes per token
 */
export const portalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.params.token || req.ip,
  message: { error: 'Too many portal requests, please try again later.' },
});

/**
 * Webhook rate limiter: 60 requests per minute per IP
 */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many webhook requests.' },
});
