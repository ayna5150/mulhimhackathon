"use strict";
/**
 * Data Sanitization Utilities
 *
 * Provides privacy-first data sanitization:
 * - PII detection and redaction
 * - Content sanitization for model processing
 * - URL sanitization
 * - Hash generation for content tracking
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeText = sanitizeText;
exports.sanitizeUrl = sanitizeUrl;
exports.generateSnapshotHash = generateSnapshotHash;
exports.extractDomain = extractDomain;
exports.isSuspiciousDomain = isSuspiciousDomain;
exports.extractEmails = extractEmails;
exports.extractUrls = extractUrls;
exports.containsSensitiveInfo = containsSensitiveInfo;
exports.redactSensitiveInfo = redactSensitiveInfo;
exports.validateAndSanitizeInput = validateAndSanitizeInput;
/**
 * Sanitize text content by removing or replacing PII
 */
function sanitizeText(text) {
    if (!text || typeof text !== 'string') {
        return text;
    }
    let sanitized = text;
    // Email addresses
    sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]');
    // Phone numbers (various formats)
    sanitized = sanitized.replace(/(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g, '[PHONE_REDACTED]');
    sanitized = sanitized.replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE_REDACTED]');
    // Credit card numbers (basic patterns)
    sanitized = sanitized.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD_REDACTED]');
    sanitized = sanitized.replace(/\b\d{13,19}\b/g, '[CARD_REDACTED]');
    // SSN (US format)
    sanitized = sanitized.replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, '[SSN_REDACTED]');
    // Bank account numbers (common patterns)
    sanitized = sanitized.replace(/\b\d{8,17}\b/g, (match) => {
        // Only replace if it looks like a bank account (8-17 digits)
        return match.length >= 8 && match.length <= 17 ? '[ACCOUNT_REDACTED]' : match;
    });
    // IP addresses
    sanitized = sanitized.replace(/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g, '[IP_REDACTED]');
    // MAC addresses
    sanitized = sanitized.replace(/\b(?:[0-9A-Fa-f]{2}[:-]){5}(?:[0-9A-Fa-f]{2})\b/g, '[MAC_REDACTED]');
    // URLs with credentials
    sanitized = sanitized.replace(/https?:\/\/[^:\/]+:[^@\/]+@[^\s]+/g, '[URL_WITH_CREDS_REDACTED]');
    // API keys (common patterns)
    sanitized = sanitized.replace(/\b[A-Za-z0-9]{20,}\b/g, (match) => {
        // Replace long alphanumeric strings that might be API keys
        if (match.length >= 20 && /^[A-Za-z0-9]+$/.test(match)) {
            return '[API_KEY_REDACTED]';
        }
        return match;
    });
    // JWT tokens (basic pattern)
    sanitized = sanitized.replace(/\b[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\b/g, '[JWT_REDACTED]');
    return sanitized;
}
/**
 * Sanitize URL by removing sensitive query parameters
 */
function sanitizeUrl(url) {
    if (!url || typeof url !== 'string') {
        return url;
    }
    try {
        const urlObj = new URL(url);
        // List of sensitive query parameters to remove
        const sensitiveParams = [
            'password', 'passwd', 'pwd',
            'token', 'key', 'secret', 'auth',
            'session', 'sessionid', 'sid',
            'api_key', 'apikey', 'access_token',
            'refresh_token', 'jwt', 'bearer',
            'credit_card', 'cc', 'card_number',
            'ssn', 'social_security',
            'phone', 'mobile', 'telephone',
            'email', 'mail', 'username'
        ];
        // Remove sensitive parameters
        sensitiveParams.forEach(param => {
            urlObj.searchParams.delete(param);
            urlObj.searchParams.delete(param.toLowerCase());
            urlObj.searchParams.delete(param.toUpperCase());
        });
        // Replace sensitive values in remaining parameters
        for (const [key, value] of urlObj.searchParams.entries()) {
            if (isSensitiveValue(value)) {
                urlObj.searchParams.set(key, '[REDACTED]');
            }
        }
        return urlObj.toString();
    }
    catch {
        // If URL parsing fails, return a generic redacted URL
        return '[URL_REDACTED]';
    }
}
/**
 * Check if a value looks sensitive
 */
function isSensitiveValue(value) {
    const sensitivePatterns = [
        /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/, // Email
        /^\d{3}-?\d{2}-?\d{4}$/, // SSN
        /^\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}$/, // Credit card
        /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/, // IP address
        /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/, // JWT
        /^[A-Za-z0-9]{20,}$/ // Long alphanumeric (potential API key)
    ];
    return sensitivePatterns.some(pattern => pattern.test(value));
}
/**
 * Generate a secure hash for content tracking
 */
function generateSnapshotHash(content, url) {
    const crypto = require('crypto');
    // Create a normalized version of the content for hashing
    const normalizedContent = normalizeContent(content);
    const normalizedUrl = url ? sanitizeUrl(url) : '';
    // Combine content and URL for hash
    const combined = `${normalizedContent}:${normalizedUrl}`;
    // Generate SHA-256 hash
    return crypto.createHash('sha256').update(combined).digest('hex');
}
/**
 * Normalize content for consistent hashing
 */
function normalizeContent(content) {
    if (!content)
        return '';
    return content
        .toLowerCase()
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .trim();
}
/**
 * Extract domain from URL safely
 */
function extractDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.toLowerCase();
    }
    catch {
        return null;
    }
}
/**
 * Check if domain is suspicious
 */
function isSuspiciousDomain(domain) {
    if (!domain)
        return false;
    const suspiciousPatterns = [
        // Typosquatting patterns
        /gooogle\.com$/i,
        /micosoft\.com$/i,
        /amazom\.com$/i,
        /paypall\.com$/i,
        // Suspicious TLDs
        /\.tk$/i,
        /\.ml$/i,
        /\.ga$/i,
        /\.cf$/i,
        /\.click$/i,
        /\.download$/i,
        /\.exe$/i,
        // IP addresses
        /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
        // Subdomain spoofing
        /^[a-zA-Z0-9-]+-(security|verify|account|login|support|microsoft|google|apple|amazon|paypal)\./i
    ];
    return suspiciousPatterns.some(pattern => pattern.test(domain));
}
/**
 * Extract email addresses from text
 */
function extractEmails(text) {
    if (!text)
        return [];
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    return text.match(emailPattern) || [];
}
/**
 * Extract URLs from text
 */
function extractUrls(text) {
    if (!text)
        return [];
    const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
    return text.match(urlPattern) || [];
}
/**
 * Check if content contains sensitive information
 */
function containsSensitiveInfo(text) {
    if (!text)
        return false;
    const sensitivePatterns = [
        // Email addresses
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
        // Phone numbers
        /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/,
        // Credit cards
        /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
        // SSN
        /\b\d{3}-?\d{2}-?\d{4}\b/,
        // Bank account numbers
        /\b\d{8,17}\b/,
        // API keys
        /\b[A-Za-z0-9]{20,}\b/
    ];
    return sensitivePatterns.some(pattern => pattern.test(text));
}
/**
 * Redact sensitive information with configurable replacement
 */
function redactSensitiveInfo(text, replacement = '[REDACTED]') {
    if (!text)
        return { text, redactedCount: 0 };
    let redactedCount = 0;
    let sanitized = text;
    // Count and replace sensitive patterns
    const patterns = [
        { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, type: 'email' },
        { regex: /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g, type: 'phone' },
        { regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, type: 'card' },
        { regex: /\b\d{3}-?\d{2}-?\d{4}\b/g, type: 'ssn' }
    ];
    patterns.forEach(({ regex, type }) => {
        const matches = sanitized.match(regex);
        if (matches) {
            redactedCount += matches.length;
            sanitized = sanitized.replace(regex, replacement);
        }
    });
    return { text: sanitized, redactedCount };
}
/**
 * Validate and sanitize user input
 */
function validateAndSanitizeInput(input, maxLength = 10000) {
    const errors = [];
    let sanitized = '';
    if (typeof input !== 'string') {
        errors.push('Input must be a string');
        return { isValid: false, sanitized, errors };
    }
    if (input.length > maxLength) {
        errors.push(`Input exceeds maximum length of ${maxLength} characters`);
        return { isValid: false, sanitized, errors };
    }
    // Basic XSS prevention
    sanitized = input
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
    // Check for suspicious patterns
    const suspiciousPatterns = [
        /<script/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /data:/i
    ];
    const hasSuspiciousPattern = suspiciousPatterns.some(pattern => pattern.test(input));
    if (hasSuspiciousPattern) {
        errors.push('Input contains potentially malicious content');
    }
    return {
        isValid: errors.length === 0,
        sanitized,
        errors
    };
}
//# sourceMappingURL=sanitization.js.map