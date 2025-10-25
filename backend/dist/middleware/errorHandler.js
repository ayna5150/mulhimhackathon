"use strict";
/**
 * Error Handling Middleware
 *
 * Centralized error handling for the application:
 * - Structured error responses
 * - Error logging and monitoring
 * - Security-aware error messages
 * - Request correlation tracking
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceUnavailableError = exports.RateLimitError = exports.ConflictError = exports.NotFoundError = exports.AuthorizationError = exports.AuthenticationError = exports.ValidationError = void 0;
exports.errorHandler = errorHandler;
exports.notFoundHandler = notFoundHandler;
exports.asyncHandler = asyncHandler;
exports.handleJoiError = handleJoiError;
exports.handleDatabaseError = handleDatabaseError;
exports.handleModelError = handleModelError;
exports.setupGlobalErrorHandlers = setupGlobalErrorHandlers;
const logger_1 = require("@/config/logger");
const config_1 = require("@/config/config");
/**
 * Custom error classes
 */
class ValidationError extends Error {
    constructor(message, details) {
        super(message);
        this.details = details;
        this.statusCode = 400;
        this.code = 'VALIDATION_ERROR';
        this.isOperational = true;
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
class AuthenticationError extends Error {
    constructor(message = 'Authentication failed') {
        super(message);
        this.statusCode = 401;
        this.code = 'AUTHENTICATION_ERROR';
        this.isOperational = true;
        this.name = 'AuthenticationError';
    }
}
exports.AuthenticationError = AuthenticationError;
class AuthorizationError extends Error {
    constructor(message = 'Access denied') {
        super(message);
        this.statusCode = 403;
        this.code = 'AUTHORIZATION_ERROR';
        this.isOperational = true;
        this.name = 'AuthorizationError';
    }
}
exports.AuthorizationError = AuthorizationError;
class NotFoundError extends Error {
    constructor(message = 'Resource not found') {
        super(message);
        this.statusCode = 404;
        this.code = 'NOT_FOUND';
        this.isOperational = true;
        this.name = 'NotFoundError';
    }
}
exports.NotFoundError = NotFoundError;
class ConflictError extends Error {
    constructor(message = 'Resource conflict') {
        super(message);
        this.statusCode = 409;
        this.code = 'CONFLICT';
        this.isOperational = true;
        this.name = 'ConflictError';
    }
}
exports.ConflictError = ConflictError;
class RateLimitError extends Error {
    constructor(message = 'Rate limit exceeded') {
        super(message);
        this.statusCode = 429;
        this.code = 'RATE_LIMIT_EXCEEDED';
        this.isOperational = true;
        this.name = 'RateLimitError';
    }
}
exports.RateLimitError = RateLimitError;
class ServiceUnavailableError extends Error {
    constructor(message = 'Service temporarily unavailable') {
        super(message);
        this.statusCode = 503;
        this.code = 'SERVICE_UNAVAILABLE';
        this.isOperational = true;
        this.name = 'ServiceUnavailableError';
    }
}
exports.ServiceUnavailableError = ServiceUnavailableError;
/**
 * Main error handling middleware
 */
function errorHandler(error, req, res, next) {
    // Generate correlation ID if not present
    const correlationId = error.correlationId || (0, logger_1.generateCorrelationId)();
    // Determine if this is an operational error
    const isOperational = error.isOperational || false;
    // Get status code
    const statusCode = error.statusCode || 500;
    // Prepare error response
    const errorResponse = {
        error: getErrorTitle(statusCode),
        message: getErrorMessage(error, statusCode),
        correlation_id: correlationId
    };
    // Add additional fields based on error type
    if (error.code) {
        errorResponse.code = error.code;
    }
    if (error instanceof ValidationError && error.details) {
        errorResponse.details = error.details;
    }
    // Add request information for debugging (only in development)
    if (config_1.config.nodeEnv === 'development') {
        errorResponse.debug = {
            stack: error.stack,
            endpoint: req.path,
            method: req.method,
            timestamp: new Date().toISOString()
        };
    }
    // Log the error
    logError(error, req, correlationId, statusCode, isOperational);
    // Send response
    res.status(statusCode).json(errorResponse);
}
/**
 * 404 handler for undefined routes
 */
function notFoundHandler(req, res) {
    const correlationId = (0, logger_1.generateCorrelationId)();
    logger_1.logger.warn('Route not found', {
        correlationId,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.path} not found`,
        correlation_id: correlationId
    });
}
/**
 * Async error wrapper for route handlers
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
/**
 * Validation error handler for Joi
 */
function handleJoiError(error) {
    const details = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
    }));
    return new ValidationError('Validation failed', details);
}
/**
 * Database error handler
 */
function handleDatabaseError(error) {
    // PostgreSQL error codes
    const pgErrors = {
        '23505': { statusCode: 409, message: 'Resource already exists' },
        '23503': { statusCode: 400, message: 'Referenced resource not found' },
        '23502': { statusCode: 400, message: 'Required field missing' },
        '23514': { statusCode: 400, message: 'Constraint violation' },
        '42P01': { statusCode: 500, message: 'Database table not found' },
        'ECONNREFUSED': { statusCode: 503, message: 'Database connection failed' },
        'ETIMEDOUT': { statusCode: 503, message: 'Database connection timeout' }
    };
    const errorCode = error.code || error.errno || 'UNKNOWN';
    const pgError = pgErrors[errorCode];
    if (pgError) {
        const appError = new Error(pgError.message);
        appError.statusCode = pgError.statusCode;
        appError.code = errorCode;
        appError.isOperational = true;
        return appError;
    }
    // Default database error
    const dbError = new Error('Database operation failed');
    dbError.statusCode = 500;
    dbError.code = 'DATABASE_ERROR';
    dbError.isOperational = false;
    return dbError;
}
/**
 * Model API error handler
 */
function handleModelError(error) {
    if (error.response) {
        // HTTP error from model API
        const statusCode = error.response.status;
        if (statusCode === 401) {
            return new AuthenticationError('Model API authentication failed');
        }
        else if (statusCode === 429) {
            return new RateLimitError('Model API rate limit exceeded');
        }
        else if (statusCode >= 500) {
            return new ServiceUnavailableError('Model service temporarily unavailable');
        }
        else {
            const modelError = new Error('Model API error');
            modelError.statusCode = 502;
            modelError.code = 'MODEL_API_ERROR';
            modelError.isOperational = true;
            return modelError;
        }
    }
    else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        return new ServiceUnavailableError('Model service connection failed');
    }
    // Default model error
    const modelError = new Error('Model processing failed');
    modelError.statusCode = 500;
    modelError.code = 'MODEL_ERROR';
    modelError.isOperational = false;
    return modelError;
}
/**
 * Get error title based on status code
 */
function getErrorTitle(statusCode) {
    const titles = {
        400: 'Bad Request',
        401: 'Unauthorized',
        403: 'Forbidden',
        404: 'Not Found',
        409: 'Conflict',
        422: 'Unprocessable Entity',
        429: 'Too Many Requests',
        500: 'Internal Server Error',
        502: 'Bad Gateway',
        503: 'Service Unavailable',
        504: 'Gateway Timeout'
    };
    return titles[statusCode] || 'Error';
}
/**
 * Get safe error message for client
 */
function getErrorMessage(error, statusCode) {
    // In production, don't expose internal error details
    if (config_1.config.nodeEnv === 'production' && statusCode >= 500) {
        return 'An internal error occurred';
    }
    // For operational errors, use the error message
    if (error.isOperational) {
        return error.message;
    }
    // For non-operational errors, use generic messages
    if (statusCode >= 500) {
        return 'An internal server error occurred';
    }
    return error.message || 'An error occurred';
}
/**
 * Log error with appropriate level and context
 */
function logError(error, req, correlationId, statusCode, isOperational) {
    const logContext = {
        correlationId,
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack
        },
        request: {
            method: req.method,
            path: req.path,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            userId: req.user?.userId
        },
        response: {
            statusCode
        }
    };
    if (statusCode >= 500 && !isOperational) {
        // Log system errors as errors
        logger_1.logger.error('System error occurred', logContext);
    }
    else if (statusCode >= 400) {
        // Log client errors as warnings
        logger_1.logger.warn('Client error occurred', logContext);
    }
    else {
        // Log other errors as info
        logger_1.logger.info('Error occurred', logContext);
    }
}
/**
 * Global unhandled rejection handler
 */
function setupGlobalErrorHandlers() {
    process.on('uncaughtException', (error) => {
        logger_1.logger.error('Uncaught Exception:', {
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            }
        });
        // Exit process after logging
        setTimeout(() => {
            process.exit(1);
        }, 1000);
    });
    process.on('unhandledRejection', (reason, promise) => {
        logger_1.logger.error('Unhandled Rejection:', {
            reason: reason instanceof Error ? {
                name: reason.name,
                message: reason.message,
                stack: reason.stack
            } : reason,
            promise: promise.toString()
        });
    });
    process.on('warning', (warning) => {
        logger_1.logger.warn('Node.js Warning:', {
            warning: {
                name: warning.name,
                message: warning.message,
                stack: warning.stack
            }
        });
    });
}
//# sourceMappingURL=errorHandler.js.map