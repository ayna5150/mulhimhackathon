"use strict";
/**
 * Logging configuration for SmartShield backend
 *
 * This module provides centralized logging using Winston with:
 * - Structured JSON logging
 * - Different log levels for different environments
 * - Request correlation IDs
 * - Security-aware logging (no sensitive data)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.securityLogger = void 0;
exports.generateCorrelationId = generateCorrelationId;
exports.withCorrelationId = withCorrelationId;
const winston_1 = __importDefault(require("winston"));
const config_1 = require("./config");
/**
 * Custom log format for security and readability
 */
const logFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json(), winston_1.default.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const logEntry = {
        timestamp,
        level,
        message,
        ...meta
    };
    if (stack) {
        logEntry.stack = stack;
    }
    // Remove sensitive data from logs
    const sanitized = sanitizeLogData(logEntry);
    return JSON.stringify(sanitized, null, 2);
}));
/**
 * Sanitize log data to remove sensitive information
 */
function sanitizeLogData(data) {
    if (typeof data !== 'object' || data === null) {
        return data;
    }
    const sensitiveKeys = [
        'password', 'token', 'apiKey', 'secret', 'authorization',
        'email', 'phone', 'ssn', 'creditCard', 'bankAccount'
    ];
    const sanitized = Array.isArray(data) ? [] : {};
    for (const [key, value] of Object.entries(data)) {
        const lowerKey = key.toLowerCase();
        if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
            sanitized[key] = '[REDACTED]';
        }
        else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeLogData(value);
        }
        else {
            sanitized[key] = value;
        }
    }
    return sanitized;
}
/**
 * Create logger instance based on environment
 */
const logger = winston_1.default.createLogger({
    level: config_1.config.nodeEnv === 'production' ? 'info' : 'debug',
    format: logFormat,
    defaultMeta: {
        service: 'smartshield-backend',
        environment: config_1.config.nodeEnv
    },
    transports: [
        // Console transport for development
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple())
        })
    ]
});
exports.logger = logger;
/**
 * Add file transport for production
 */
if (config_1.config.nodeEnv === 'production') {
    logger.add(new winston_1.default.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5
    }));
    logger.add(new winston_1.default.transports.File({
        filename: 'logs/combined.log',
        maxsize: 5242880, // 5MB
        maxFiles: 5
    }));
}
/**
 * Security logging utilities
 */
exports.securityLogger = {
    /**
     * Log security events (phishing detections, suspicious activity)
     */
    logSecurityEvent: (event, details) => {
        logger.warn('Security Event', {
            event,
            ...details,
            category: 'security'
        });
    },
    /**
     * Log authentication events
     */
    logAuthEvent: (event, userId, ip) => {
        logger.info('Authentication Event', {
            event,
            userId,
            ip,
            category: 'auth'
        });
    },
    /**
     * Log API access
     */
    logApiAccess: (endpoint, method, ip, userAgent) => {
        logger.info('API Access', {
            endpoint,
            method,
            ip,
            userAgent,
            category: 'api'
        });
    },
    /**
     * Log phishing detection results
     */
    logPhishingDetection: (score, url, reasons, orgId) => {
        logger.info('Phishing Detection', {
            score,
            url: sanitizeUrl(url),
            reasons,
            orgId,
            category: 'phishing'
        });
    }
};
/**
 * Sanitize URL for logging (remove sensitive query parameters)
 */
function sanitizeUrl(url) {
    try {
        const urlObj = new URL(url);
        const sensitiveParams = ['token', 'key', 'password', 'secret'];
        sensitiveParams.forEach(param => {
            if (urlObj.searchParams.has(param)) {
                urlObj.searchParams.set(param, '[REDACTED]');
            }
        });
        return urlObj.toString();
    }
    catch {
        return '[INVALID_URL]';
    }
}
/**
 * Request correlation ID management
 */
let correlationId = 0;
function generateCorrelationId() {
    return `req_${++correlationId}_${Date.now()}`;
}
function withCorrelationId(data, id) {
    return { ...data, correlationId: id };
}
//# sourceMappingURL=logger.js.map