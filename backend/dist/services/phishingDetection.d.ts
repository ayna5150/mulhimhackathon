/**
 * Phishing Detection Service
 *
 * This service provides local phishing detection using heuristics and rules:
 * - URL analysis and domain reputation
 * - Content pattern matching
 * - Email header analysis
 * - Social engineering indicators
 * - ML-based scoring (when available)
 *
 * Implements privacy-first approach with on-device processing before cloud analysis
 */
export interface DetectionRequest {
    url?: string;
    content: string;
    metadata?: {
        domain?: string;
        title?: string;
        headers?: Record<string, string>;
        timestamp?: string;
        userAgent?: string;
    };
}
export interface DetectionResult {
    score: number;
    label: 'clean' | 'suspicious' | 'phishing';
    reasons: string[];
    confidence: number;
    localAnalysis: boolean;
    requiresCloudAnalysis: boolean;
    metadata: {
        urlScore?: number;
        contentScore?: number;
        headerScore?: number;
        socialEngineeringScore?: number;
    };
}
export interface PhishingRule {
    name: string;
    description: string;
    weight: number;
    check: (request: DetectionRequest) => {
        matches: boolean;
        score: number;
        reason?: string;
    };
}
/**
 * Phishing detection rules and heuristics
 */
declare class PhishingDetector {
    private rules;
    constructor();
    /**
     * Initialize detection rules
     */
    private initializeRules;
    /**
     * Main detection method
     */
    detect(request: DetectionRequest): Promise<DetectionResult>;
    /**
     * Run local heuristic analysis
     */
    private runLocalAnalysis;
    /**
     * Run cloud model analysis
     */
    private runCloudAnalysis;
    /**
     * Determine if cloud analysis should be used
     */
    private shouldUseCloudAnalysis;
    /**
     * Merge local and cloud analysis results
     */
    private mergeResults;
    /**
     * Categorize scores by rule type
     */
    private categorizeScore;
    private checkSuspiciousDomain;
    private checkUrlShortener;
    private checkSubdomainSpoofing;
    private checkIpAddressUrl;
    private checkUrgentLanguage;
    private checkSensitiveInfoRequest;
    private checkPoorGrammar;
    private checkImpersonation;
    private checkSuspiciousAttachments;
    /**
     * Check if attachment context is suspicious (combines with archive files)
     */
    private hasSuspiciousAttachmentContext;
    private checkSuspiciousHeaders;
    private checkReplyToMismatch;
    /**
     * Calculate Levenshtein distance for typosquatting detection
     */
    private levenshteinDistance;
}
export declare const phishingDetector: PhishingDetector;
export {};
//# sourceMappingURL=phishingDetection.d.ts.map