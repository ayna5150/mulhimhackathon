"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.phishingDetector = void 0;
const logger_1 = require("@/config/logger");
const config_1 = require("@/config/config");
const modelBridge_1 = require("./modelBridge");
/**
 * Phishing detection rules and heuristics
 */
class PhishingDetector {
    constructor() {
        this.rules = [];
        // Rule implementations
        this.checkSuspiciousDomain = (request) => {
            if (!request.url)
                return { matches: false, score: 0 };
            try {
                const url = new URL(request.url);
                const domain = url.hostname.toLowerCase();
                // Check for suspicious TLDs (excluding .com as it's legitimate for major sites)
                const suspiciousTlds = ['.tk', '.ml', '.ga', '.cf', '.click', '.download', '.exe', '.zip', '.rar'];
                const hasSuspiciousTld = suspiciousTlds.some(tld => domain.endsWith(tld));
                if (hasSuspiciousTld) {
                    return { matches: true, score: 0.8, reason: `Suspicious top-level domain: ${domain}` };
                }
                // Whitelist of trusted .com domains that should not be flagged
                const trustedComDomains = [
                    'google.com', 'youtube.com', 'facebook.com', 'instagram.com', 'twitter.com', 'linkedin.com',
                    'microsoft.com', 'apple.com', 'amazon.com', 'netflix.com', 'spotify.com', 'github.com',
                    'stackoverflow.com', 'reddit.com', 'wikipedia.org', 'yahoo.com', 'bing.com', 'duckduckgo.com',
                    'paypal.com', 'stripe.com', 'visa.com', 'mastercard.com', 'ebay.com', 'shopify.com',
                    'dropbox.com', 'onedrive.com', 'google-drive.com', 'adobe.com', 'salesforce.com',
                    'zoom.us', 'teams.microsoft.com', 'slack.com', 'discord.com', 'twitch.tv'
                ];
                // If it's a trusted .com domain, don't flag it
                if (domain.endsWith('.com') && trustedComDomains.includes(domain)) {
                    return { matches: false, score: 0 };
                }
                // Check for typosquatting patterns (but be more lenient with .com domains)
                const commonDomains = ['google.com', 'microsoft.com', 'apple.com', 'amazon.com', 'paypal.com'];
                const isTyposquatting = commonDomains.some(common => {
                    const distance = this.levenshteinDistance(domain, common);
                    // For .com domains, require closer match (distance <= 1)
                    // For other domains, allow distance <= 2
                    const maxDistance = domain.endsWith('.com') ? 1 : 2;
                    return distance <= maxDistance && distance > 0;
                });
                if (isTyposquatting) {
                    return { matches: true, score: 0.9, reason: `Potential typosquatting: ${domain}` };
                }
                // Check for subdomain spoofing of trusted domains
                const isSubdomainSpoofing = trustedComDomains.some(trusted => {
                    return domain.includes(trusted) && domain !== trusted && !domain.endsWith('.' + trusted);
                });
                if (isSubdomainSpoofing) {
                    return { matches: true, score: 0.7, reason: `Suspicious subdomain of trusted domain: ${domain}` };
                }
                return { matches: false, score: 0 };
            }
            catch {
                return { matches: true, score: 0.6, reason: 'Invalid URL format' };
            }
        };
        this.checkUrlShortener = (request) => {
            if (!request.url)
                return { matches: false, score: 0 };
            const shorteners = [
                'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd',
                'short.link', 'cutt.ly', 'rebrand.ly', 'linktr.ee'
            ];
            try {
                const url = new URL(request.url);
                const domain = url.hostname.toLowerCase();
                const isShortener = shorteners.some(shortener => domain.includes(shortener));
                if (isShortener) {
                    return { matches: true, score: 0.3, reason: `URL shortener detected: ${domain}` };
                }
                return { matches: false, score: 0 };
            }
            catch {
                return { matches: false, score: 0 };
            }
        };
        this.checkSubdomainSpoofing = (request) => {
            if (!request.url)
                return { matches: false, score: 0 };
            try {
                const url = new URL(request.url);
                const hostname = url.hostname.toLowerCase();
                // Check for suspicious subdomain patterns
                const suspiciousPatterns = [
                    /security-/, /verify-/, /account-/, /login-/, /support-/,
                    /microsoft-/, /google-/, /apple-/, /amazon-/, /paypal-/
                ];
                for (const pattern of suspiciousPatterns) {
                    if (pattern.test(hostname)) {
                        return { matches: true, score: 0.7, reason: `Suspicious subdomain pattern: ${hostname}` };
                    }
                }
                return { matches: false, score: 0 };
            }
            catch {
                return { matches: false, score: 0 };
            }
        };
        this.checkIpAddressUrl = (request) => {
            if (!request.url)
                return { matches: false, score: 0 };
            try {
                const url = new URL(request.url);
                const hostname = url.hostname;
                // Check if hostname is an IP address
                const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
                if (ipPattern.test(hostname)) {
                    return { matches: true, score: 0.6, reason: `Direct IP address URL: ${hostname}` };
                }
                return { matches: false, score: 0 };
            }
            catch {
                return { matches: false, score: 0 };
            }
        };
        this.checkUrgentLanguage = (request) => {
            const urgentPhrases = [
                'urgent', 'immediate action required', 'act now', 'limited time',
                'expires soon', 'last chance', 'final notice', 'account suspended',
                'verify immediately', 'confirm now', 'security alert', 'unauthorized access'
            ];
            const content = request.content.toLowerCase();
            const matches = urgentPhrases.filter(phrase => content.includes(phrase));
            if (matches.length > 0) {
                return {
                    matches: true,
                    score: Math.min(0.8, matches.length * 0.2),
                    reason: `Urgent language detected: ${matches.join(', ')}`
                };
            }
            return { matches: false, score: 0 };
        };
        this.checkSensitiveInfoRequest = (request) => {
            const sensitivePhrases = [
                'password', 'credit card', 'social security', 'ssn', 'bank account',
                'routing number', 'pin', 'cvv', 'security code', 'login credentials',
                'username', 'account number', 'date of birth', 'mother maiden name'
            ];
            const content = request.content.toLowerCase();
            const matches = sensitivePhrases.filter(phrase => content.includes(phrase));
            if (matches.length > 0) {
                return {
                    matches: true,
                    score: Math.min(0.9, matches.length * 0.3),
                    reason: `Request for sensitive information: ${matches.join(', ')}`
                };
            }
            return { matches: false, score: 0 };
        };
        this.checkPoorGrammar = (request) => {
            const content = request.content;
            // Simple grammar checks
            const grammarErrors = [
                /youre\b/g, // missing apostrophe
                /dont\b/g, // missing apostrophe
                /wont\b/g, // missing apostrophe
                /cant\b/g, // missing apostrophe
                /\b([A-Z][a-z]+)\s+\1\b/g, // repeated words
            ];
            let errorCount = 0;
            for (const pattern of grammarErrors) {
                const matches = content.match(pattern);
                if (matches) {
                    errorCount += matches.length;
                }
            }
            // Check for excessive capitalization
            const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
            if (capsRatio > 0.3) {
                errorCount += 3;
            }
            if (errorCount > 2) {
                return { matches: true, score: Math.min(0.4, errorCount * 0.1), reason: `Poor grammar/spelling detected` };
            }
            return { matches: false, score: 0 };
        };
        this.checkImpersonation = (request) => {
            const brands = [
                'microsoft', 'google', 'apple', 'amazon', 'paypal', 'netflix',
                'facebook', 'instagram', 'twitter', 'linkedin', 'dropbox'
            ];
            const content = request.content.toLowerCase();
            const url = request.url?.toLowerCase() || '';
            const brandMatches = brands.filter(brand => content.includes(brand));
            if (brandMatches.length > 0) {
                // Check if URL domain doesn't match the brand
                const brandInUrl = brandMatches.some(brand => url.includes(brand));
                if (!brandInUrl) {
                    return {
                        matches: true,
                        score: 0.8,
                        reason: `Brand impersonation detected: ${brandMatches.join(', ')}`
                    };
                }
            }
            return { matches: false, score: 0 };
        };
        this.checkSuspiciousAttachments = (request) => {
            // Highly suspicious executable extensions
            const highlySuspiciousExtensions = ['.exe', '.scr', '.bat', '.cmd', '.pif', '.vbs', '.js', '.jar', '.app'];
            // Moderately suspicious extensions (require additional context)
            const moderatelySuspiciousExtensions = ['.zip', '.rar', '.7z', '.tar', '.gz'];
            // Common legitimate file extensions that should not be flagged
            const legitimateExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf', '.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mp3', '.wav', '.avi', '.mov'];
            const content = request.content.toLowerCase();
            // Check for highly suspicious extensions first
            const highlySuspiciousMatches = highlySuspiciousExtensions.filter(ext => content.includes(ext));
            if (highlySuspiciousMatches.length > 0) {
                return {
                    matches: true,
                    score: 0.9,
                    reason: `Highly suspicious executable attachments: ${highlySuspiciousMatches.join(', ')}`
                };
            }
            // Check for moderately suspicious extensions
            const moderatelySuspiciousMatches = moderatelySuspiciousExtensions.filter(ext => content.includes(ext));
            // Only flag archive files if there's additional suspicious context
            if (moderatelySuspiciousMatches.length > 0) {
                const hasSuspiciousContext = this.hasSuspiciousAttachmentContext(content);
                if (hasSuspiciousContext) {
                    return {
                        matches: true,
                        score: 0.6,
                        reason: `Suspicious archive attachments with suspicious context: ${moderatelySuspiciousMatches.join(', ')}`
                    };
                }
            }
            return { matches: false, score: 0 };
        };
        this.checkSuspiciousHeaders = (request) => {
            const headers = request.metadata?.headers || {};
            // Check for suspicious email headers
            const suspiciousHeaders = [
                'x-priority: 1',
                'x-msmail-priority: high',
                'x-mailer:',
                'x-originating-ip:'
            ];
            const headerString = Object.entries(headers)
                .map(([key, value]) => `${key}: ${value}`)
                .join('\n')
                .toLowerCase();
            const matches = suspiciousHeaders.filter(header => headerString.includes(header));
            if (matches.length > 0) {
                return {
                    matches: true,
                    score: 0.4,
                    reason: `Suspicious email headers: ${matches.join(', ')}`
                };
            }
            return { matches: false, score: 0 };
        };
        this.checkReplyToMismatch = (request) => {
            const headers = request.metadata?.headers || {};
            const fromHeader = headers['from'] || '';
            const replyToHeader = headers['reply-to'] || '';
            if (replyToHeader && fromHeader && replyToHeader !== fromHeader) {
                return {
                    matches: true,
                    score: 0.5,
                    reason: 'Reply-to address differs from sender address'
                };
            }
            return { matches: false, score: 0 };
        };
        this.initializeRules();
    }
    /**
     * Initialize detection rules
     */
    initializeRules() {
        // URL-based rules
        this.rules.push({
            name: 'suspicious_domain',
            description: 'Check for suspicious or newly registered domains',
            weight: 0.3,
            check: this.checkSuspiciousDomain
        });
        this.rules.push({
            name: 'url_shortener',
            description: 'Detect URL shorteners that may hide malicious links',
            weight: 0.2,
            check: this.checkUrlShortener
        });
        this.rules.push({
            name: 'subdomain_spoofing',
            description: 'Detect subdomain spoofing attempts',
            weight: 0.4,
            check: this.checkSubdomainSpoofing
        });
        this.rules.push({
            name: 'ip_address_url',
            description: 'Detect direct IP address URLs',
            weight: 0.3,
            check: this.checkIpAddressUrl
        });
        // Content-based rules
        this.rules.push({
            name: 'urgent_language',
            description: 'Detect urgent or threatening language',
            weight: 0.3,
            check: this.checkUrgentLanguage
        });
        this.rules.push({
            name: 'sensitive_info_request',
            description: 'Detect requests for sensitive information',
            weight: 0.5,
            check: this.checkSensitiveInfoRequest
        });
        this.rules.push({
            name: 'poor_grammar_spelling',
            description: 'Detect poor grammar and spelling',
            weight: 0.2,
            check: this.checkPoorGrammar
        });
        this.rules.push({
            name: 'impersonation_indicators',
            description: 'Detect brand impersonation attempts',
            weight: 0.4,
            check: this.checkImpersonation
        });
        this.rules.push({
            name: 'suspicious_attachments',
            description: 'Detect suspicious file attachments',
            weight: 0.3,
            check: this.checkSuspiciousAttachments
        });
        // Email-specific rules
        this.rules.push({
            name: 'suspicious_headers',
            description: 'Analyze email headers for spoofing indicators',
            weight: 0.3,
            check: this.checkSuspiciousHeaders
        });
        this.rules.push({
            name: 'reply_to_mismatch',
            description: 'Check for reply-to address mismatches',
            weight: 0.2,
            check: this.checkReplyToMismatch
        });
        logger_1.logger.info(`Initialized ${this.rules.length} phishing detection rules`);
    }
    /**
     * Main detection method
     */
    async detect(request) {
        const startTime = Date.now();
        try {
            // Run local analysis first
            const localResult = this.runLocalAnalysis(request);
            // Determine if cloud analysis is needed
            const requiresCloudAnalysis = this.shouldUseCloudAnalysis(localResult);
            let finalResult = localResult;
            if (requiresCloudAnalysis) {
                logger_1.logger.info('Local analysis uncertain, using cloud model for analysis');
                try {
                    const cloudResult = await this.runCloudAnalysis(request);
                    finalResult = this.mergeResults(localResult, cloudResult);
                }
                catch (error) {
                    logger_1.logger.warn('Cloud analysis failed, using local result:', error);
                    finalResult = {
                        ...localResult,
                        confidence: Math.max(0.3, localResult.confidence - 0.2)
                    };
                }
            }
            const duration = Date.now() - startTime;
            logger_1.logger.debug(`Phishing detection completed in ${duration}ms`, {
                score: finalResult.score,
                label: finalResult.label,
                localAnalysis: finalResult.localAnalysis,
                cloudAnalysis: requiresCloudAnalysis
            });
            return finalResult;
        }
        catch (error) {
            logger_1.logger.error('Phishing detection failed:', error);
            // Return safe fallback
            return {
                score: 0.5,
                label: 'suspicious',
                reasons: ['Detection analysis failed'],
                confidence: 0.1,
                localAnalysis: true,
                requiresCloudAnalysis: false,
                metadata: {}
            };
        }
    }
    /**
     * Run local heuristic analysis
     */
    runLocalAnalysis(request) {
        let totalScore = 0;
        let totalWeight = 0;
        const reasons = [];
        const metadata = {};
        // Run each rule
        for (const rule of this.rules) {
            try {
                const result = rule.check(request);
                if (result.matches) {
                    const weightedScore = result.score * rule.weight;
                    totalScore += weightedScore;
                    totalWeight += rule.weight;
                    if (result.reason) {
                        reasons.push(result.reason);
                    }
                    // Categorize scores for metadata
                    this.categorizeScore(rule.name, result.score, metadata);
                }
            }
            catch (error) {
                logger_1.logger.warn(`Rule ${rule.name} failed:`, error);
            }
        }
        // Calculate final score
        const finalScore = totalWeight > 0 ? Math.min(1, totalScore / totalWeight) : 0;
        // Determine label based on thresholds
        let label;
        if (finalScore >= config_1.config.reportThreshold) {
            label = 'phishing';
        }
        else if (finalScore >= config_1.config.highThreshold) {
            label = 'suspicious';
        }
        else {
            label = 'clean';
        }
        // Calculate confidence based on number of matching rules
        const confidence = Math.min(0.9, 0.3 + (reasons.length * 0.1));
        return {
            score: finalScore,
            label,
            reasons,
            confidence,
            localAnalysis: true,
            requiresCloudAnalysis: this.shouldUseCloudAnalysis({ score: finalScore, confidence, label }),
            metadata
        };
    }
    /**
     * Run cloud model analysis
     */
    async runCloudAnalysis(request) {
        try {
            const analysis = await modelBridge_1.modelBridge.analyzeText({
                text: request.content,
                url: request.url,
                metadata: request.metadata
            });
            return {
                score: analysis.score,
                label: analysis.label === 'clean' ? 'clean' :
                    analysis.label === 'suspicious' ? 'suspicious' : 'phishing',
                reasons: analysis.reasons,
                confidence: analysis.confidence,
                localAnalysis: false,
                requiresCloudAnalysis: false,
                metadata: {
                    urlScore: analysis.score * 0.3,
                    contentScore: analysis.score * 0.7
                }
            };
        }
        catch (error) {
            logger_1.logger.error('Cloud analysis failed:', error);
            throw error;
        }
    }
    /**
     * Determine if cloud analysis should be used
     */
    shouldUseCloudAnalysis(result) {
        // Use cloud analysis if:
        // 1. Score is in uncertain range (between low and high thresholds)
        // 2. Confidence is low
        // 3. Privacy mode is disabled
        return (!config_1.config.privacyMode &&
            result.score >= config_1.config.lowThreshold &&
            result.score <= config_1.config.highThreshold &&
            result.confidence < 0.7);
    }
    /**
     * Merge local and cloud analysis results
     */
    mergeResults(local, cloud) {
        // Weight the results (70% cloud, 30% local for better accuracy)
        const mergedScore = (cloud.score * 0.7) + (local.score * 0.3);
        const mergedConfidence = Math.max(local.confidence, cloud.confidence);
        // Combine reasons
        const allReasons = [...new Set([...local.reasons, ...cloud.reasons])];
        // Determine final label
        let label;
        if (mergedScore >= config_1.config.reportThreshold) {
            label = 'phishing';
        }
        else if (mergedScore >= config_1.config.highThreshold) {
            label = 'suspicious';
        }
        else {
            label = 'clean';
        }
        return {
            score: mergedScore,
            label,
            reasons: allReasons,
            confidence: mergedConfidence,
            localAnalysis: false,
            requiresCloudAnalysis: false,
            metadata: {
                ...local.metadata,
                ...cloud.metadata
            }
        };
    }
    /**
     * Categorize scores by rule type
     */
    categorizeScore(ruleName, score, metadata) {
        if (ruleName.includes('url') || ruleName.includes('domain')) {
            metadata.urlScore = (metadata.urlScore || 0) + score;
        }
        else if (ruleName.includes('content') || ruleName.includes('language') || ruleName.includes('grammar')) {
            metadata.contentScore = (metadata.contentScore || 0) + score;
        }
        else if (ruleName.includes('header') || ruleName.includes('email')) {
            metadata.headerScore = (metadata.headerScore || 0) + score;
        }
        else {
            metadata.socialEngineeringScore = (metadata.socialEngineeringScore || 0) + score;
        }
    }
    /**
     * Check if attachment context is suspicious (combines with archive files)
     */
    hasSuspiciousAttachmentContext(content) {
        const suspiciousAttachmentPhrases = [
            'click to download', 'download now', 'install software', 'run as administrator',
            'enable macros', 'security update', 'critical update', 'system update',
            'antivirus update', 'flash player update', 'java update', 'browser update'
        ];
        return suspiciousAttachmentPhrases.some(phrase => content.includes(phrase));
    }
    /**
     * Calculate Levenshtein distance for typosquatting detection
     */
    levenshteinDistance(str1, str2) {
        const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
        for (let i = 0; i <= str1.length; i++) {
            matrix[0][i] = i;
        }
        for (let j = 0; j <= str2.length; j++) {
            matrix[j][0] = j;
        }
        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(matrix[j][i - 1] + 1, // deletion
                matrix[j - 1][i] + 1, // insertion
                matrix[j - 1][i - 1] + indicator // substitution
                );
            }
        }
        return matrix[str2.length][str1.length];
    }
}
// Export singleton instance
exports.phishingDetector = new PhishingDetector();
//# sourceMappingURL=phishingDetection.js.map