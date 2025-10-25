/**
 * Logging configuration for SmartShield backend
 *
 * This module provides centralized logging using Winston with:
 * - Structured JSON logging
 * - Different log levels for different environments
 * - Request correlation IDs
 * - Security-aware logging (no sensitive data)
 */
import winston from 'winston';
/**
 * Create logger instance based on environment
 */
declare const logger: winston.Logger;
/**
 * Security logging utilities
 */
export declare const securityLogger: {
    /**
     * Log security events (phishing detections, suspicious activity)
     */
    logSecurityEvent: (event: string, details: any) => void;
    /**
     * Log authentication events
     */
    logAuthEvent: (event: string, userId?: string, ip?: string) => void;
    /**
     * Log API access
     */
    logApiAccess: (endpoint: string, method: string, ip: string, userAgent?: string) => void;
    /**
     * Log phishing detection results
     */
    logPhishingDetection: (score: number, url: string, reasons: string[], orgId?: string) => void;
};
export declare function generateCorrelationId(): string;
export declare function withCorrelationId<T extends object>(data: T, id: string): T & {
    correlationId: string;
};
export { logger };
//# sourceMappingURL=logger.d.ts.map