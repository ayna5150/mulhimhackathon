"use strict";
/**
 * Authentication Middleware
 *
 * Provides JWT-based authentication and authorization:
 * - Token validation
 * - API key validation
 * - Role-based access control
 * - Request user context
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateApiKey = validateApiKey;
exports.authenticateToken = authenticateToken;
exports.requireRole = requireRole;
exports.requireAdmin = requireAdmin;
exports.requireOrgAccess = requireOrgAccess;
exports.optionalAuth = optionalAuth;
exports.rateLimitByUser = rateLimitByUser;
exports.generateApiKey = generateApiKey;
exports.validateOrgId = validateOrgId;
exports.auditLog = auditLog;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("@/config/config");
const logger_1 = require("@/config/logger");
/**
 * Validate API key from request headers
 */
function validateApiKey(req, res, next) {
    try {
        const apiKey = req.get('X-API-Key') || req.get('Authorization')?.replace('Bearer ', '');
        if (!apiKey) {
            logger_1.logger.warn('API key missing from request', {
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
            config_1.config.jwtSecret, // Use JWT secret as fallback API key
            'smartshield-extension-key' // Extension-specific key
        ];
        if (!validApiKeys.includes(apiKey)) {
            logger_1.securityLogger.logAuthEvent('invalid_api_key', undefined, req.ip);
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid API key',
                code: 'INVALID_API_KEY'
            });
        }
        // Log successful API key validation
        logger_1.securityLogger.logApiAccess(req.path, req.method, req.ip || 'unknown', req.get('User-Agent') || 'unknown');
        next();
        return;
    }
    catch (error) {
        logger_1.logger.error('API key validation error:', error);
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
function authenticateToken(req, res, next) {
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
        jsonwebtoken_1.default.verify(token, config_1.config.jwtSecret, (error, decoded) => {
            if (error) {
                logger_1.securityLogger.logAuthEvent('invalid_token', undefined, req.ip || 'unknown');
                res.status(403).json({
                    error: 'Forbidden',
                    message: 'Invalid or expired token',
                    code: 'INVALID_TOKEN'
                });
                return;
            }
            // Add user info to request
            req.user = decoded;
            logger_1.securityLogger.logAuthEvent('token_validated', req.user?.userId, req.ip || 'unknown');
            next();
            return;
        });
        return;
    }
    catch (error) {
        logger_1.logger.error('Token authentication error:', error);
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
function requireRole(roles) {
    return (req, res, next) => {
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
            logger_1.securityLogger.logAuthEvent('insufficient_permissions', req.user.userId, req.ip);
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
function requireAdmin(req, res, next) {
    return requireRole('admin')(req, res, next);
}
/**
 * Require organization access
 */
function requireOrgAccess(req, res, next) {
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
        logger_1.securityLogger.logAuthEvent('org_access_denied', req.user.userId, req.ip);
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
function optionalAuth(req, res, next) {
    try {
        const authHeader = req.get('Authorization');
        const token = authHeader && authHeader.split(' ')[1];
        if (token) {
            jsonwebtoken_1.default.verify(token, config_1.config.jwtSecret, (error, decoded) => {
                if (!error) {
                    req.user = decoded;
                }
                next();
            });
        }
        else {
            next();
        }
    }
    catch (error) {
        // Continue without authentication
        next();
    }
}
/**
 * Rate limiting middleware for authenticated users
 */
function rateLimitByUser(req, res, next) {
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
function generateApiKey() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `dev-${timestamp}-${random}`;
}
/**
 * Validate organization ID format
 */
function validateOrgId(req, res, next) {
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
function auditLog(operation) {
    return (req, res, next) => {
        const originalSend = res.send;
        res.send = function (data) {
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
                logger_1.securityLogger.logAuthEvent(`audit_${operation}_success`, req.user?.userId, req.ip);
            }
            else {
                logger_1.securityLogger.logAuthEvent(`audit_${operation}_failed`, req.user?.userId, req.ip);
            }
            logger_1.logger.info('Audit log', auditData);
            return originalSend.call(this, data);
        };
        next();
        return;
    };
}
//# sourceMappingURL=auth.js.map