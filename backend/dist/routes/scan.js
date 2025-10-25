"use strict";
/**
 * Scan API Routes
 *
 * Handles phishing detection requests from the Chrome extension:
 * - POST /api/scan - Analyze content for phishing indicators
 * - Provides sanitization and privacy controls
 * - Returns structured analysis results
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const phishingDetection_1 = require("@/services/phishingDetection");
const database_1 = require("@/config/database");
const logger_1 = require("@/config/logger");
const sanitization_1 = require("@/utils/sanitization");
const config_1 = require("@/config/config");
const router = (0, express_1.Router)();
/**
 * Request validation schema
 */
const scanRequestSchema = joi_1.default.object({
    snapshot_hash: joi_1.default.string().optional(),
    sanitized_text: joi_1.default.string().required().min(1).max(50000),
    metadata: joi_1.default.object({
        url: joi_1.default.string().uri().optional(),
        timestamp: joi_1.default.string().isoDate().optional(),
        domain: joi_1.default.string().optional(),
        orgId: joi_1.default.string().optional(),
        title: joi_1.default.string().optional(),
        userAgent: joi_1.default.string().optional()
    }).optional()
});
/**
 * POST /api/scan
 * Analyze content for phishing indicators
 */
router.post('/', async (req, res) => {
    const correlationId = (0, logger_1.generateCorrelationId)();
    const startTime = Date.now();
    try {
        // Validate request
        const { error, value } = scanRequestSchema.validate(req.body);
        if (error) {
            logger_1.logger.warn('Invalid scan request', { correlationId, error: error.details[0].message });
            return res.status(400).json({
                error: 'Invalid request',
                message: error.details[0].message,
                correlationId
            });
        }
        const { snapshot_hash, sanitized_text, metadata } = value;
        // Generate snapshot hash if not provided
        const finalSnapshotHash = snapshot_hash || (0, sanitization_1.generateSnapshotHash)(sanitized_text, metadata?.url);
        // Additional sanitization for privacy
        const sanitizedContent = config_1.config.piiRedaction ? (0, sanitization_1.sanitizeText)(sanitized_text) : sanitized_text;
        logger_1.logger.info('Processing scan request', {
            correlationId,
            snapshotHash: finalSnapshotHash,
            contentLength: sanitizedContent.length,
            hasUrl: !!metadata?.url,
            orgId: metadata?.orgId
        });
        // Run phishing detection
        const detectionResult = await phishingDetection_1.phishingDetector.detect({
            url: metadata?.url,
            content: sanitizedContent,
            metadata: {
                domain: metadata?.domain,
                title: metadata?.title,
                timestamp: metadata?.timestamp,
                userAgent: metadata?.userAgent
            }
        });
        // Log security event if suspicious or phishing
        if (detectionResult.label !== 'clean') {
            logger_1.securityLogger.logPhishingDetection(detectionResult.score, metadata?.url || 'unknown', detectionResult.reasons, metadata?.orgId);
        }
        // Store scan result in database (async, don't wait)
        storeScanResult(finalSnapshotHash, {
            url: metadata?.url,
            domain: metadata?.domain,
            score: detectionResult.score,
            label: detectionResult.label,
            reasons: detectionResult.reasons,
            orgId: metadata?.orgId
        }).catch(error => {
            logger_1.logger.error('Failed to store scan result', { correlationId, error });
        });
        // Record analytics event
        recordAnalyticsEvent('scan', {
            snapshot_hash: finalSnapshotHash,
            score: detectionResult.score,
            label: detectionResult.label,
            local_analysis: detectionResult.localAnalysis,
            cloud_analysis: detectionResult.requiresCloudAnalysis,
            org_id: metadata?.orgId
        }).catch(error => {
            logger_1.logger.error('Failed to record analytics event', { correlationId, error });
        });
        const responseTime = Date.now() - startTime;
        // Prepare response
        const response = {
            score: Math.round(detectionResult.score * 100) / 100,
            label: detectionResult.label,
            reasons: detectionResult.reasons,
            explain: generateExplanation(detectionResult),
            confidence: Math.round(detectionResult.confidence * 100) / 100,
            snapshot_hash: finalSnapshotHash,
            analysis_type: detectionResult.localAnalysis ? 'local' : 'hybrid',
            response_time_ms: responseTime,
            correlation_id: correlationId
        };
        logger_1.logger.info('Scan completed', {
            correlationId,
            score: detectionResult.score,
            label: detectionResult.label,
            responseTime: `${responseTime}ms`,
            localAnalysis: detectionResult.localAnalysis
        });
        res.json(response);
        return;
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.logger.error('Scan request failed', {
            correlationId,
            error: error instanceof Error ? error.message : 'Unknown error',
            responseTime: `${responseTime}ms`
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to process scan request',
            correlation_id: correlationId
        });
        return;
    }
});
/**
 * GET /api/scan/:snapshotHash
 * Retrieve previous scan result by snapshot hash
 */
router.get('/:snapshotHash', async (req, res) => {
    const { snapshotHash } = req.params;
    const correlationId = (0, logger_1.generateCorrelationId)();
    try {
        const result = await (0, database_1.query)('SELECT * FROM scan_results WHERE snapshot_hash = $1 ORDER BY created_at DESC LIMIT 1', [snapshotHash]);
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Scan result not found',
                correlation_id: correlationId
            });
        }
        const scanResult = result.rows[0];
        res.json({
            snapshot_hash: scanResult.snapshot_hash,
            score: scanResult.score,
            label: scanResult.label,
            reasons: scanResult.reasons,
            url: scanResult.url,
            domain: scanResult.domain,
            created_at: scanResult.created_at,
            correlation_id: correlationId
        });
        return;
    }
    catch (error) {
        logger_1.logger.error('Failed to retrieve scan result', {
            correlationId,
            snapshotHash,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to retrieve scan result',
            correlation_id: correlationId
        });
        return;
    }
});
/**
 * Store scan result in database
 */
async function storeScanResult(snapshotHash, data) {
    try {
        await (0, database_1.query)(`INSERT INTO scan_results (snapshot_hash, url, domain, score, label, reasons, model_provider, org_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (snapshot_hash) DO UPDATE SET
         score = EXCLUDED.score,
         label = EXCLUDED.label,
         reasons = EXCLUDED.reasons,
         model_provider = EXCLUDED.model_provider,
         org_id = EXCLUDED.org_id`, [
            snapshotHash,
            data.url,
            data.domain,
            data.score,
            data.label,
            data.reasons,
            config_1.config.modelProvider,
            data.orgId
        ]);
    }
    catch (error) {
        logger_1.logger.error('Failed to store scan result', { error });
        throw error;
    }
}
/**
 * Record analytics event
 */
async function recordAnalyticsEvent(eventType, eventData) {
    try {
        await (0, database_1.query)('INSERT INTO analytics (event_type, event_data, metadata, timestamp) VALUES ($1, $2, $3, NOW())', [
            eventType,
            eventData,
            {
                service: 'scan-api',
                version: '1.0.0'
            }
        ]);
    }
    catch (error) {
        logger_1.logger.error('Failed to record analytics event', { error });
        throw error;
    }
}
/**
 * Generate human-readable explanation of detection result
 */
function generateExplanation(result) {
    if (result.label === 'clean') {
        return 'This content appears to be legitimate and safe.';
    }
    if (result.label === 'suspicious') {
        return `This content shows some suspicious characteristics: ${result.reasons.slice(0, 2).join(', ')}. Please exercise caution.`;
    }
    if (result.label === 'phishing') {
        return `This content has been flagged as a potential phishing attempt due to: ${result.reasons.slice(0, 3).join(', ')}. Do not provide any personal information.`;
    }
    return 'Unable to determine the safety of this content.';
}
exports.default = router;
//# sourceMappingURL=scan.js.map