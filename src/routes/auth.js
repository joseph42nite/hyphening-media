/**
 * Marketing Ops Center — Authentication Routes
 * POST /api/auth/login, /api/auth/refresh, /api/auth/logout
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import db from '../../database.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { authenticate } from '../middleware/auth.js';
import { logAction } from '../services/auditLogger.js';

const router = Router();

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const IS_PROD = process.env.NODE_ENV === 'production';

// Origins used by Capacitor on Android
const CAPACITOR_ORIGINS = ['http://localhost', 'capacitor://localhost'];

// Detect if a request originates from the mobile app
function isMobileRequest(req) {
  const origin = req.get('origin') || '';
  return CAPACITOR_ORIGINS.some(o => origin.startsWith(o));
}

// Cookie options
const cookieOptions = (maxAge) => ({
  httpOnly: true,
  secure: IS_PROD,
  sameSite: IS_PROD ? 'lax' : 'lax',
  maxAge,
  path: '/',
});

/**
 * POST /api/auth/login
 * Authenticate user with email + password, issue JWT tokens as HttpOnly cookies.
 */
router.post('/login', authLimiter, (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Look up user
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email.toLowerCase().trim());

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Mobile gets 90-day session; web gets 7-day session
    const isMobile = isMobileRequest(req);
    const refreshExpiry = isMobile ? '90d' : REFRESH_TOKEN_EXPIRY;
    const refreshMaxAge = isMobile
      ? 90 * 24 * 60 * 60 * 1000   // 90 days
      : 7 * 24 * 60 * 60 * 1000;   // 7 days

    // Generate tokens
    const accessToken = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_ACCESS_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, tokenType: 'refresh' },
      JWT_REFRESH_SECRET,
      { expiresIn: refreshExpiry }
    );

    // Store hashed refresh token in sessions table
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + refreshMaxAge).toISOString();

    db.prepare('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(
      user.id, tokenHash, expiresAt
    );

    // Set HttpOnly cookies
    res.cookie('access_token', accessToken, cookieOptions(15 * 60 * 1000)); // 15 min
    res.cookie('refresh_token', refreshToken, cookieOptions(refreshMaxAge));

    // Audit log
    logAction({
      actorId: user.id,
      actorEmail: user.email,
      action: 'login',
      entityType: 'session',
      ip: req.ip,
    });

    res.json({
      id: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
    });
  } catch (err) {
    console.error('[AUTH] Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/refresh
 * Issue new access + refresh tokens. Revoke the old refresh token.
 */
router.post('/refresh', authLimiter, (req, res) => {
  try {
    const oldRefreshToken = req.cookies?.refresh_token;

    if (!oldRefreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    // Verify the refresh JWT
    let decoded;
    try {
      decoded = jwt.verify(oldRefreshToken, JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Check the token hash exists in sessions and is not revoked
    const oldTokenHash = crypto.createHash('sha256').update(oldRefreshToken).digest('hex');
    const session = db.prepare(
      'SELECT * FROM sessions WHERE token_hash = ? AND user_id = ? AND revoked = 0'
    ).get(oldTokenHash, decoded.userId);

    if (!session) {
      // Possible replay attack — revoke ALL sessions for this user
      db.prepare('UPDATE sessions SET revoked = 1 WHERE user_id = ?').run(decoded.userId);
      return res.status(401).json({ error: 'Refresh token reuse detected. All sessions revoked.' });
    }

    // Revoke old token
    db.prepare('UPDATE sessions SET revoked = 1 WHERE id = ?').run(session.id);

    // Verify user still active
    const user = db.prepare('SELECT id, email, name, role, is_active FROM users WHERE id = ? AND is_active = 1').get(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'User account deactivated' });
    }

    // Mobile gets 90-day session; web gets 7-day session
    const isMobile = isMobileRequest(req);
    const refreshExpiry = isMobile ? '90d' : REFRESH_TOKEN_EXPIRY;
    const refreshMaxAge = isMobile
      ? 90 * 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;

    // Issue new tokens
    const newAccessToken = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_ACCESS_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    const newRefreshToken = jwt.sign(
      { userId: user.id, tokenType: 'refresh' },
      JWT_REFRESH_SECRET,
      { expiresIn: refreshExpiry }
    );

    const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + refreshMaxAge).toISOString();

    db.prepare('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(
      user.id, newTokenHash, expiresAt
    );

    res.cookie('access_token', newAccessToken, cookieOptions(15 * 60 * 1000));
    res.cookie('refresh_token', newRefreshToken, cookieOptions(refreshMaxAge));

    res.json({ role: user.role, name: user.name });
  } catch (err) {
    console.error('[AUTH] Refresh error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/logout
 * Clear cookies and revoke the refresh token.
 */
router.post('/logout', authenticate, (req, res) => {
  try {
    const refreshToken = req.cookies?.refresh_token;
    
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      db.prepare('UPDATE sessions SET revoked = 1 WHERE token_hash = ?').run(tokenHash);
    }

    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'logout',
      entityType: 'session',
      ip: req.ip,
    });

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('[AUTH] Logout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/me
 * Return current authenticated user info.
 */
router.get('/me', authenticate, (req, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
    name: req.user.name,
    role: req.user.role,
  });
});

/**
 * GET /api/auth/users
 * List all active staff users.
 */
router.get('/users', authenticate, (req, res) => {
  try {
    const staff = db.prepare('SELECT id, name, role, email FROM users WHERE is_active = 1 ORDER BY name ASC').all();
    res.json({ users: staff });
  } catch (err) {
    console.error('[AUTH] List users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
