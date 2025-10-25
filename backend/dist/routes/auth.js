"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("@/config/database");
const logger_1 = require("@/config/logger");
const config_1 = require("@/config/config");
const auth_1 = require("@/middleware/auth");
const router = (0, express_1.Router)();
/**
 * Request validation schemas
 */
const loginSchema = joi_1.default.object({
    email: joi_1.default.string().email().required(),
    password: joi_1.default.string().min(6).required()
});
const registerSchema = joi_1.default.object({
    email: joi_1.default.string().email().required(),
    password: joi_1.default.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])')).required(),
    orgId: joi_1.default.string().optional(),
    role: joi_1.default.string().valid('user', 'admin', 'viewer').default('user')
});
/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
router.post('/login', async (req, res) => {
    const correlationId = (0, logger_1.generateCorrelationId)();
    const startTime = Date.now();
    try {
        // Validate request
        const { error, value } = loginSchema.validate(req.body);
        if (error) {
            logger_1.logger.warn('Invalid login request', { correlationId, error: error.details[0].message });
            return res.status(400).json({
                error: 'Invalid request',
                message: error.details[0].message,
                correlation_id: correlationId
            });
        }
        const { email, password } = value;
        // Find user by email
        const userResult = await (0, database_1.query)('SELECT id, email, password_hash, org_id, role, is_active FROM users WHERE email = $1', [email.toLowerCase()]);
        if (userResult.rows.length === 0) {
            logger_1.securityLogger.logAuthEvent('login_failed', undefined, req.ip);
            return res.status(401).json({
                error: 'Authentication failed',
                message: 'Invalid email or password',
                correlation_id: correlationId
            });
        }
        const user = userResult.rows[0];
        // Check if user is active
        if (!user.is_active) {
            logger_1.securityLogger.logAuthEvent('login_failed_inactive', user.id, req.ip);
            return res.status(401).json({
                error: 'Account disabled',
                message: 'Your account has been disabled. Please contact support.',
                correlation_id: correlationId
            });
        }
        // Verify password
        const isValidPassword = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!isValidPassword) {
            logger_1.securityLogger.logAuthEvent('login_failed', user.id, req.ip);
            return res.status(401).json({
                error: 'Authentication failed',
                message: 'Invalid email or password',
                correlation_id: correlationId
            });
        }
        // Generate JWT token
        const token = jsonwebtoken_1.default.sign({
            userId: user.id,
            email: user.email,
            orgId: user.org_id,
            role: user.role
        }, config_1.config.jwtSecret, { expiresIn: '24h' });
        // Update last login
        await (0, database_1.query)('UPDATE users SET updated_at = NOW() WHERE id = $1', [user.id]);
        logger_1.securityLogger.logAuthEvent('login_success', user.id, req.ip);
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
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.logger.error('Login request failed', {
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
router.post('/register', async (req, res) => {
    const correlationId = (0, logger_1.generateCorrelationId)();
    const startTime = Date.now();
    try {
        // Validate request
        const { error, value } = registerSchema.validate(req.body);
        if (error) {
            logger_1.logger.warn('Invalid registration request', { correlationId, error: error.details[0].message });
            return res.status(400).json({
                error: 'Invalid request',
                message: error.details[0].message,
                correlation_id: correlationId
            });
        }
        const { email, password, orgId, role } = value;
        // Check if user already exists
        const existingUser = await (0, database_1.query)('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                error: 'User exists',
                message: 'A user with this email already exists',
                correlation_id: correlationId
            });
        }
        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcryptjs_1.default.hash(password, saltRounds);
        // Create user
        const userResult = await (0, database_1.query)('INSERT INTO users (email, password_hash, org_id, role, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, org_id, role', [email.toLowerCase(), passwordHash, orgId, role, true]);
        const user = userResult.rows[0];
        logger_1.securityLogger.logAuthEvent('user_registered', user.id, req.ip);
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
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.logger.error('Registration request failed', {
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
router.post('/logout', auth_1.authenticateToken, async (req, res) => {
    const correlationId = (0, logger_1.generateCorrelationId)();
    const userId = req.user?.userId;
    try {
        logger_1.securityLogger.logAuthEvent('logout', userId, req.ip);
        res.json({
            message: 'Logged out successfully',
            correlation_id: correlationId
        });
    }
    catch (error) {
        logger_1.logger.error('Logout request failed', {
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
router.get('/me', auth_1.authenticateToken, async (req, res) => {
    const correlationId = (0, logger_1.generateCorrelationId)();
    const userId = req.user?.userId;
    try {
        const userResult = await (0, database_1.query)('SELECT id, email, org_id, role, is_active, created_at, updated_at FROM users WHERE id = $1', [userId]);
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
    }
    catch (error) {
        logger_1.logger.error('Get user info request failed', {
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
router.post('/change-password', auth_1.authenticateToken, async (req, res) => {
    const correlationId = (0, logger_1.generateCorrelationId)();
    const userId = req.user?.userId;
    const changePasswordSchema = joi_1.default.object({
        current_password: joi_1.default.string().required(),
        new_password: joi_1.default.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])')).required()
    });
    try {
        // Validate request
        const { error, value } = changePasswordSchema.validate(req.body);
        if (error) {
            logger_1.logger.warn('Invalid change password request', { correlationId, error: error.details[0].message });
            return res.status(400).json({
                error: 'Invalid request',
                message: error.details[0].message,
                correlation_id: correlationId
            });
        }
        const { current_password, new_password } = value;
        // Get current password hash
        const userResult = await (0, database_1.query)('SELECT password_hash FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                error: 'User not found',
                message: 'User account not found',
                correlation_id: correlationId
            });
        }
        const currentHash = userResult.rows[0].password_hash;
        // Verify current password
        const isValidPassword = await bcryptjs_1.default.compare(current_password, currentHash);
        if (!isValidPassword) {
            logger_1.securityLogger.logAuthEvent('password_change_failed', userId, req.ip);
            return res.status(401).json({
                error: 'Invalid password',
                message: 'Current password is incorrect',
                correlation_id: correlationId
            });
        }
        // Hash new password
        const saltRounds = 12;
        const newPasswordHash = await bcryptjs_1.default.hash(new_password, saltRounds);
        // Update password
        await (0, database_1.query)('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newPasswordHash, userId]);
        logger_1.securityLogger.logAuthEvent('password_changed', userId, req.ip);
        res.json({
            message: 'Password changed successfully',
            correlation_id: correlationId
        });
        return;
    }
    catch (error) {
        logger_1.logger.error('Change password request failed', {
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
router.get('/organizations', async (req, res) => {
    const correlationId = (0, logger_1.generateCorrelationId)();
    try {
        const orgResult = await (0, database_1.query)('SELECT id, name, domain FROM organizations WHERE is_active = true ORDER BY name');
        res.json({
            organizations: orgResult.rows,
            correlation_id: correlationId
        });
    }
    catch (error) {
        logger_1.logger.error('Get organizations request failed', {
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
exports.default = router;
//# sourceMappingURL=auth.js.map