/**
 * Authentication API Routes
 * 
 * Handles user authentication and authorization:
 * - POST /api/auth/login - User login
 * - POST /api/auth/register - User registration
 * - POST /api/auth/logout - User logout
 * - GET /api/auth/me - Get current user info
 * - JWT-based authentication
 */

import { Router, Request, Response } from 'express';
import Joi from 'joi';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { query } from '@/config/database';
import { logger, securityLogger, generateCorrelationId } from '@/config/logger';
import { config } from '@/config/config';
import { authenticateToken } from '@/middleware/auth';

const router = Router();

/**
 * Request validation schemas
 */
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required()
});

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])')).required(),
  orgId: Joi.string().optional(),
  role: Joi.string().valid('user', 'admin', 'viewer').default('user')
});

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
router.post('/login', async (req: Request, res: Response) => {
  const correlationId = generateCorrelationId();
  const startTime = Date.now();

  try {
    // Validate request
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      logger.warn('Invalid login request', { correlationId, error: error.details[0].message });
      return res.status(400).json({
        error: 'Invalid request',
        message: error.details[0].message,
        correlation_id: correlationId
      });
    }

    const { email, password } = value;

    // Find user by email
    const userResult = await query(
      'SELECT id, email, password_hash, org_id, role, is_active FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      securityLogger.logAuthEvent('login_failed', undefined, req.ip);
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password',
        correlation_id: correlationId
      });
    }

    const user = userResult.rows[0];

    // Check if user is active
    if (!user.is_active) {
      securityLogger.logAuthEvent('login_failed_inactive', user.id, req.ip);
      return res.status(401).json({
        error: 'Account disabled',
        message: 'Your account has been disabled. Please contact support.',
        correlation_id: correlationId
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      securityLogger.logAuthEvent('login_failed', user.id, req.ip);
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password',
        correlation_id: correlationId
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        orgId: user.org_id,
        role: user.role
      },
      config.jwtSecret,
      { expiresIn: '24h' }
    );

    // Update last login
    await query(
      'UPDATE users SET updated_at = NOW() WHERE id = $1',
      [user.id]
    );

    securityLogger.logAuthEvent('login_success', user.id, req.ip);

    const responseTime = Date.now() - startTime;

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        org_id: user.org_id,
        role: user.role
      },
      expires_in: 86400, // 24 hours
      response_time_ms: responseTime,
      correlation_id: correlationId
    });
    return;

  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Login request failed', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime: `${responseTime}ms`
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process login request',
      correlation_id: correlationId
    });
    return;
  }
});

/**
 * POST /api/auth/register
 * Register new user
 */
router.post('/register', async (req: Request, res: Response) => {
  const correlationId = generateCorrelationId();
  const startTime = Date.now();

  try {
    // Validate request
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      logger.warn('Invalid registration request', { correlationId, error: error.details[0].message });
      return res.status(400).json({
        error: 'Invalid request',
        message: error.details[0].message,
        correlation_id: correlationId
      });
    }

    const { email, password, orgId, role } = value;

    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: 'User exists',
        message: 'A user with this email already exists',
        correlation_id: correlationId
      });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const userResult = await query(
      'INSERT INTO users (email, password_hash, org_id, role, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, org_id, role',
      [email.toLowerCase(), passwordHash, orgId, role, true]
    );

    const user = userResult.rows[0];

    securityLogger.logAuthEvent('user_registered', user.id, req.ip);

    const responseTime = Date.now() - startTime;

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        org_id: user.org_id,
        role: user.role
      },
      response_time_ms: responseTime,
      correlation_id: correlationId
    });
    return;

  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Registration request failed', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime: `${responseTime}ms`
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process registration request',
      correlation_id: correlationId
    });
    return;
  }
});

/**
 * POST /api/auth/logout
 * Logout user (client-side token invalidation)
 */
router.post('/logout', authenticateToken, async (req: Request, res: Response) => {
  const correlationId = generateCorrelationId();
  const userId = (req as any).user?.userId;

  try {
    securityLogger.logAuthEvent('logout', userId, req.ip);

    res.json({
      message: 'Logged out successfully',
      correlation_id: correlationId
    });

  } catch (error) {
    logger.error('Logout request failed', {
      correlationId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process logout request',
      correlation_id: correlationId
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user information
 */
router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  const correlationId = generateCorrelationId();
  const userId = (req as any).user?.userId;

  try {
    const userResult = await query(
      'SELECT id, email, org_id, role, is_active, created_at, updated_at FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account not found',
        correlation_id: correlationId
      });
    }

    const user = userResult.rows[0];

    res.json({
      user: {
        id: user.id,
        email: user.email,
        org_id: user.org_id,
        role: user.role,
        is_active: user.is_active,
        created_at: user.created_at,
        updated_at: user.updated_at
      },
      correlation_id: correlationId
    });
    return;

  } catch (error) {
    logger.error('Get user info request failed', {
      correlationId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve user information',
      correlation_id: correlationId
    });
    return;
  }
});

/**
 * POST /api/auth/change-password
 * Change user password
 */
router.post('/change-password', authenticateToken, async (req: Request, res: Response) => {
  const correlationId = generateCorrelationId();
  const userId = (req as any).user?.userId;

  const changePasswordSchema = Joi.object({
    current_password: Joi.string().required(),
    new_password: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])')).required()
  });

  try {
    // Validate request
    const { error, value } = changePasswordSchema.validate(req.body);
    if (error) {
      logger.warn('Invalid change password request', { correlationId, error: error.details[0].message });
      return res.status(400).json({
        error: 'Invalid request',
        message: error.details[0].message,
        correlation_id: correlationId
      });
    }

    const { current_password, new_password } = value;

    // Get current password hash
    const userResult = await query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account not found',
        correlation_id: correlationId
      });
    }

    const currentHash = userResult.rows[0].password_hash;

    // Verify current password
    const isValidPassword = await bcrypt.compare(current_password, currentHash);
    if (!isValidPassword) {
      securityLogger.logAuthEvent('password_change_failed', userId, req.ip);
      return res.status(401).json({
        error: 'Invalid password',
        message: 'Current password is incorrect',
        correlation_id: correlationId
      });
    }

    // Hash new password
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(new_password, saltRounds);

    // Update password
    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newPasswordHash, userId]
    );

    securityLogger.logAuthEvent('password_changed', userId, req.ip);

    res.json({
      message: 'Password changed successfully',
      correlation_id: correlationId
    });
    return;

  } catch (error) {
    logger.error('Change password request failed', {
      correlationId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to change password',
      correlation_id: correlationId
    });
  }
  return;
});

/**
 * GET /api/auth/organizations
 * Get available organizations (for registration)
 */
router.get('/organizations', async (req: Request, res: Response) => {
  const correlationId = generateCorrelationId();

  try {
    const orgResult = await query(
      'SELECT id, name, domain FROM organizations WHERE is_active = true ORDER BY name'
    );

    res.json({
      organizations: orgResult.rows,
      correlation_id: correlationId
    });

  } catch (error) {
    logger.error('Get organizations request failed', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve organizations',
      correlation_id: correlationId
    });
  }
});

export default router;
