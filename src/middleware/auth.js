/**
 * Marketing Ops Center — Authentication Middleware
 * JWT verification and RBAC authorization.
 */

import jwt from 'jsonwebtoken';
import db from '../../database.js';

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

/**
 * Authenticate — verify access JWT from cookie, attach req.user
 */
export function authenticate(req, res, next) {
  const token = req.cookies?.access_token;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET);
    
    // Verify user still exists and is active
    const user = db.prepare('SELECT id, email, name, role, is_active FROM users WHERE id = ?').get(decoded.userId);
    
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'User account is deactivated or not found' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Authorize — check req.user.role against allowed roles.
 * super_admin is always implicitly authorized.
 * @param {string[]} roles - Array of allowed roles
 */
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // super_admin and admin bypass all role checks
    if (req.user.role === 'super_admin' || req.user.role === 'admin') {
      return next();
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}
