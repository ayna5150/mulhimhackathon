/**
 * Data Sanitization Utilities
 *
 * Provides privacy-first data sanitization:
 * - PII detection and redaction
 * - Content sanitization for model processing
 * - URL sanitization
 * - Hash generation for content tracking
 */
/**
 * Sanitize text content by removing or replacing PII
 */
export declare function sanitizeText(text: string): string;
/**
 * Sanitize URL by removing sensitive query parameters
 */
export declare function sanitizeUrl(url: string): string;
/**
 * Generate a secure hash for content tracking
 */
export declare function generateSnapshotHash(content: string, url?: string): string;
/**
 * Extract domain from URL safely
 */
export declare function extractDomain(url: string): string | null;
/**
 * Check if domain is suspicious
 */
export declare function isSuspiciousDomain(domain: string): boolean;
/**
 * Extract email addresses from text
 */
export declare function extractEmails(text: string): string[];
/**
 * Extract URLs from text
 */
export declare function extractUrls(text: string): string[];
/**
 * Check if content contains sensitive information
 */
export declare function containsSensitiveInfo(text: string): boolean;
/**
 * Redact sensitive information with configurable replacement
 */
export declare function redactSensitiveInfo(text: string, replacement?: string): {
    text: string;
    redactedCount: number;
};
/**
 * Validate and sanitize user input
 */
export declare function validateAndSanitizeInput(input: any, maxLength?: number): {
    isValid: boolean;
    sanitized: string;
    errors: string[];
};
//# sourceMappingURL=sanitization.d.ts.map