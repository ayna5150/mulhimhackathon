/**
 * Authentication Middleware
 * 
 * Provides JWT-based authentication and authorization:
 * - Token validation
 * - API key validation
 * - Role-based access control
 * - Request user context
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@/config/config';
import { logger, securityLogger } from '@/config/logger';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        orgId?: string;
        role: string;
      };
    }
  }
}

/**
 * Validate API key from request headers
 */
export function validateApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    const apiKey = req.get('X-API-Key') || req.get('Authorization')?.replace('Bearer ', '');
    
    if (!apiKey) {
      logger.warn('API key missing from request', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path
      });
      
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'API key required',
        code: 'MISSING_API_KEY'
      });
    }

    // For development, accept a simple API key
    // In production, this should validate against a database of valid API keys
    const validApiKeys = [
      'dev-api-key-12345', // Development key
      config.jwtSecret, // Use JWT secret as fallback API key
      'smartshield-extension-key' // Extension-specific key
    ];

    if (!validApiKeys.includes(apiKey)) {
      securityLogger.logAuthEvent('invalid_api_key', undefined, req.ip);
      
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key',
        code: 'INVALID_API_KEY'
      });
    }

    // Log successful API key validation
    securityLogger.logApiAccess(req.path, req.method, req.ip || 'unknown', req.get('User-Agent') || 'unknown');

    next();
    return;
  } catch (error) {
    logger.error('API key validation error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication validation failed'
    });
    return;
  }
}

/**
 * Authenticate JWT token
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.get('Authorization');
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Access token required',
        code: 'MISSING_TOKEN'
      });
    }

    jwt.verify(token, config.jwtSecret, (error, decoded) => {
      if (error) {
        securityLogger.logAuthEvent('invalid_token', undefined, req.ip || 'unknown');
        
        res.status(403).json({
          error: 'Forbidden',
          message: 'Invalid or expired token',
          code: 'INVALID_TOKEN'
        });
        return;
      }

      // Add user info to request
      req.user = decoded as any;
      securityLogger.logAuthEvent('token_validated', req.user?.userId, req.ip || 'unknown');
      
      next();
      return;
    });
    return;
  } catch (error) {
    logger.error('Token authentication error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Token validation failed'
    });
    return;
  }
}

/**
 * Require specific role(s)
 */
export function requireRole(roles: string | string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED'
      });
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      securityLogger.logAuthEvent('insufficient_permissions', req.user.userId, req.ip);
      
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        required_roles: allowedRoles,
        user_role: userRole
      });
    }

    next();
    return;
  };
}

/**
 * Require admin role
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  return requireRole('admin')(req, res, next);
}

/**
 * Require organization access
 */
export function requireOrgAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
      code: 'AUTHENTICATION_REQUIRED'
    });
  }

  // Admin users can access all organizations
  if (req.user.role === 'admin') {
    return next();
  }

  // Get organization ID from request
  const requestedOrgId = req.params.orgId || req.query.orgId || req.body.orgId;

  if (!requestedOrgId) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Organization ID required',
      code: 'ORG_ID_REQUIRED'
    });
  }

  // Check if user belongs to the requested organization
  if (req.user.orgId !== requestedOrgId) {
    securityLogger.logAuthEvent('org_access_denied', req.user.userId, req.ip);
    
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied to this organization',
      code: 'ORG_ACCESS_DENIED',
      user_org: req.user.orgId,
      requested_org: requestedOrgId
    });
  }

  next();
}

/**
 * Optional authentication (doesn't fail if no token provided)
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.get('Authorization');
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      jwt.verify(token, config.jwtSecret, (error, decoded) => {
        if (!error) {
          req.user = decoded as any;
        }
        next();
      });
    } else {
      next();
    }
  } catch (error) {
    // Continue without authentication
    next();
  }
}

/**
 * Rate limiting middleware for authenticated users
 */
export function rateLimitByUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    return next(); // Skip rate limiting for unauthenticated requests
  }

  // This would integrate with Redis-based rate limiting
  // For now, we'll just pass through
  next();
}

/**
 * Generate API key for development/testing
 */
export function generateApiKey(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2);
  return `dev-${timestamp}-${random}`;
}

/**
 * Validate organization ID format
 */
export function validateOrgId(req: Request, res: Response, next: NextFunction) {
  const orgId = req.params.orgId || req.query.orgId || req.body.orgId;
  
  if (orgId && typeof orgId === 'string') {
    // Basic validation - alphanumeric with hyphens and underscores
    const orgIdPattern = /^[a-zA-Z0-9_-]{3,50}$/;
    
    if (!orgIdPattern.test(orgId)) {
      return res.status(400).json({
        error: 'Invalid Organization ID',
        message: 'Organization ID must be 3-50 characters, alphanumeric with hyphens and underscores only',
        code: 'INVALID_ORG_ID'
      });
    }
  }

  next();
  return;
}

/**
 * Audit log middleware for sensitive operations
 */
export function auditLog(operation: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      // Log the operation after response is sent
      const auditData = {
        operation,
        user_id: req.user?.userId,
        org_id: req.user?.orgId,
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        endpoint: req.path,
        method: req.method,
        status_code: res.statusCode,
        timestamp: new Date().toISOString()
      };

      if (res.statusCode >= 200 && res.statusCode < 300) {
        securityLogger.logAuthEvent(`audit_${operation}_success`, req.user?.userId, req.ip);
      } else {
        securityLogger.logAuthEvent(`audit_${operation}_failed`, req.user?.userId, req.ip);
      }

      logger.info('Audit log', auditData);
      
      return originalSend.call(this, data);
    };

    next();
    return;
  };
}
