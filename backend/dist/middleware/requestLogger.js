"use strict";
/**
 * Request Logging Middleware
 *
 * Provides structured request logging:
 * - Request/response timing
 * - Request correlation IDs
 * - Security event logging
 * - Performance monitoring
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = requestLogger;
exports.performanceMonitor = performanceMonitor;
exports.securityLogger = securityLogger;
exports.requestId = requestId;
const logger_1 = require("@/config/logger");
/**
 * Request logging middleware
 */
function requestLogger(req, res, next) {
    // Generate correlation ID if not present
    req.correlationId = req.get('X-Correlation-ID') || (0, logger_1.generateCorrelationId)();
    req.startTime = Date.now();
    // Log incoming request
    logRequest(req);
    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function (chunk, encoding) {
        logResponse(req, res);
        return originalEnd.call(this, chunk, encoding);
    };
    // Set correlation ID header for client
    res.setHeader('X-Correlation-ID', req.correlationId);
    next();
}
/**
 * Log incoming request
 */
function logRequest(req) {
    const requestInfo = {
        correlationId: req.correlationId,
        method: req.method,
        url: req.url,
        path: req.path,
        query: req.query,
        headers: sanitizeHeaders(req.headers),
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        contentLength: req.get('Content-Length'),
        contentType: req.get('Content-Type')
    };
    // Log at different levels based on endpoint sensitivity
    if (isSensitiveEndpoint(req.path)) {
        logger_1.logger.info('Sensitive request received', requestInfo);
    }
    else {
        logger_1.logger.debug('Request received', requestInfo);
    }
}
/**
 * Log outgoing response
 */
function logResponse(req, res) {
    const duration = req.startTime ? Date.now() - req.startTime : 0;
    const responseInfo = {
        correlationId: req.correlationId,
        method: req.method,
        url: req.url,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        contentLength: res.get('Content-Length'),
        contentType: res.get('Content-Type'),
        timestamp: new Date().toISOString(),
        userAgent: req.get('User-Agent'),
        ip: req.ip
    };
    // Log at different levels based on status code and endpoint
    if (res.statusCode >= 500) {
        logger_1.logger.error('Server error response', responseInfo);
    }
    else if (res.statusCode >= 400) {
        logger_1.logger.warn('Client error response', responseInfo);
    }
    else if (isSensitiveEndpoint(req.path)) {
        logger_1.logger.info('Sensitive response sent', responseInfo);
    }
    else {
        logger_1.logger.debug('Response sent', responseInfo);
    }
    // Log performance warnings for slow requests
    if (duration > 5000) { // 5 seconds
        logger_1.logger.warn('Slow request detected', {
            correlationId: req.correlationId,
            path: req.path,
            method: req.method,
            duration: `${duration}ms`,
            statusCode: res.statusCode
        });
    }
}
/**
 * Check if endpoint is sensitive (contains PII or security-related data)
 */
function isSensitiveEndpoint(path) {
    const sensitivePatterns = [
        '/api/auth',
        '/api/analytics',
        '/api/chat',
        '/api/scan'
    ];
    return sensitivePatterns.some(pattern => path.startsWith(pattern));
}
/**
 * Sanitize headers to remove sensitive information
 */
function sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    // Remove sensitive headers
    const sensitiveHeaders = [
        'authorization',
        'cookie',
        'x-api-key',
        'x-auth-token',
        'x-access-token'
    ];
    sensitiveHeaders.forEach(header => {
        if (sanitized[header]) {
            sanitized[header] = '[REDACTED]';
        }
    });
    return sanitized;
}
/**
 * Performance monitoring middleware
 */
function performanceMonitor(req, res, next) {
    if (!req.startTime) {
        req.startTime = Date.now();
    }
    const originalEnd = res.end;
    res.end = function (chunk, encoding) {
        const duration = Date.now() - req.startTime;
        // Record performance metrics
        recordPerformanceMetrics(req, res, duration);
        return originalEnd.call(this, chunk, encoding);
    };
    next();
}
/**
 * Record performance metrics
 */
function recordPerformanceMetrics(req, res, duration) {
    const metrics = {
        endpoint: req.path,
        method: req.method,
        statusCode: res.statusCode,
        duration: duration,
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
    };
    // Log performance metrics
    logger_1.logger.info('Performance metrics', metrics);
    // In a real application, you might send these to a metrics service
    // like Prometheus, DataDog, or New Relic
}
/**
 * Security event logging middleware
 */
function securityLogger(req, res, next) {
    const originalEnd = res.end;
    res.end = function (chunk, encoding) {
        // Log security-relevant events
        if (isSecurityEvent(req, res)) {
            logSecurityEvent(req, res);
        }
        return originalEnd.call(this, chunk, encoding);
    };
    next();
}
/**
 * Check if this is a security-relevant event
 */
function isSecurityEvent(req, res) {
    // Authentication endpoints
    if (req.path.startsWith('/api/auth')) {
        return true;
    }
    // Failed authentication attempts
    if (res.statusCode === 401 || res.statusCode === 403) {
        return true;
    }
    // Suspicious request patterns
    if (isSuspiciousRequest(req)) {
        return true;
    }
    return false;
}
/**
 * Check for suspicious request patterns
 */
function isSuspiciousRequest(req) {
    const suspiciousPatterns = [
        // SQL injection attempts
        /union.*select/i,
        /drop.*table/i,
        /insert.*into/i,
        // XSS attempts
        /<script/i,
        /javascript:/i,
        /on\w+\s*=/i,
        // Path traversal attempts
        /\.\.\//,
        /\.\.\\/,
        // Command injection attempts
        /;\s*(cat|ls|rm|wget|curl)/i,
        /\|\s*(cat|ls|rm|wget|curl)/i
    ];
    const requestString = `${req.method} ${req.url} ${JSON.stringify(req.body)}`;
    return suspiciousPatterns.some(pattern => pattern.test(requestString));
}
/**
 * Log security event
 */
function logSecurityEvent(req, res) {
    const securityEvent = {
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
        type: 'security_event',
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        headers: sanitizeHeaders(req.headers),
        body: sanitizeRequestBody(req.body),
        query: req.query
    };
    logger_1.logger.warn('Security event detected', securityEvent);
}
/**
 * Sanitize request body to remove sensitive information
 */
function sanitizeRequestBody(body) {
    if (!body || typeof body !== 'object') {
        return body;
    }
    const sanitized = { ...body };
    const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'authorization'];
    sensitiveFields.forEach(field => {
        if (sanitized[field]) {
            sanitized[field] = '[REDACTED]';
        }
    });
    return sanitized;
}
/**
 * Request ID middleware (simpler alternative to correlation ID)
 */
function requestId(req, res, next) {
    const requestId = req.get('X-Request-ID') || (0, logger_1.generateCorrelationId)();
    req.correlationId = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
}
//# sourceMappingURL=requestLogger.js.map