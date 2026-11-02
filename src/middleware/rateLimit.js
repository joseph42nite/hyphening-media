/**
 * Marketing Ops Center — Rate Limiting
 * Separate limiters for global, auth, portal, and webhook endpoints.
 */

import rateLimit from 'express-rate-limit';

/**
 * Global rate limiter: 2000 requests per 15 minutes per IP
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  message: { error: 'Too many requests, please try again later.' },
});

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
