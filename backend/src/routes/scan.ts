/**
 * Scan API Routes
 * 
 * Handles phishing detection requests from the Chrome extension:
 * - POST /api/scan - Analyze content for phishing indicators
 * - Provides sanitization and privacy controls
 * - Returns structured analysis results
 */

import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';

import { phishingDetector } from '@/services/phishingDetection';
import { query } from '@/config/database';
import { logger, securityLogger, generateCorrelationId } from '@/config/logger';
import { sanitizeText, generateSnapshotHash } from '@/utils/sanitization';
import { config } from '@/config/config';

const router = Router();

/**
 * Request validation schema
 */
const scanRequestSchema = Joi.object({
  snapshot_hash: Joi.string().optional(),
  sanitized_text: Joi.string().required().min(1).max(50000),
  metadata: Joi.object({
    url: Joi.string().uri().optional(),
    timestamp: Joi.string().isoDate().optional(),
    domain: Joi.string().optional(),
    orgId: Joi.string().optional(),
    title: Joi.string().optional(),
    userAgent: Joi.string().optional()
  }).optional()
});

/**
 * POST /api/scan
 * Analyze content for phishing indicators
 */
router.post('/', async (req: Request, res: Response) => {
  const correlationId = generateCorrelationId();
  const startTime = Date.now();

  try {
    // Validate request
    const { error, value } = scanRequestSchema.validate(req.body);
    if (error) {
      logger.warn('Invalid scan request', { correlationId, error: error.details[0].message });
      return res.status(400).json({
        error: 'Invalid request',
        message: error.details[0].message,
        correlationId
      });
    }

    const { snapshot_hash, sanitized_text, metadata } = value;

    // Generate snapshot hash if not provided
    const finalSnapshotHash = snapshot_hash || generateSnapshotHash(sanitized_text, metadata?.url);

    // Additional sanitization for privacy
    const sanitizedContent = config.piiRedaction ? sanitizeText(sanitized_text) : sanitized_text;

    logger.info('Processing scan request', {
      correlationId,
      snapshotHash: finalSnapshotHash,
      contentLength: sanitizedContent.length,
      hasUrl: !!metadata?.url,
      orgId: metadata?.orgId
    });

    // Run phishing detection
    const detectionResult = await phishingDetector.detect({
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
      securityLogger.logPhishingDetection(
        detectionResult.score,
        metadata?.url || 'unknown',
        detectionResult.reasons,
        metadata?.orgId
      );
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
      logger.error('Failed to store scan result', { correlationId, error });
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
      logger.error('Failed to record analytics event', { correlationId, error });
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

    logger.info('Scan completed', {
      correlationId,
      score: detectionResult.score,
      label: detectionResult.label,
      responseTime: `${responseTime}ms`,
      localAnalysis: detectionResult.localAnalysis
    });

    res.json(response);
    return;

  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Scan request failed', {
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
router.get('/:snapshotHash', async (req: Request, res: Response) => {
  const { snapshotHash } = req.params;
  const correlationId = generateCorrelationId();

  try {
    const result = await query(
      'SELECT * FROM scan_results WHERE snapshot_hash = $1 ORDER BY created_at DESC LIMIT 1',
      [snapshotHash]
    );

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

  } catch (error) {
    logger.error('Failed to retrieve scan result', {
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
async function storeScanResult(
  snapshotHash: string,
  data: {
    url?: string;
    domain?: string;
    score: number;
    label: string;
    reasons: string[];
    orgId?: string;
  }
): Promise<void> {
  try {
    await query(
      `INSERT INTO scan_results (snapshot_hash, url, domain, score, label, reasons, model_provider, org_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (snapshot_hash) DO UPDATE SET
         score = EXCLUDED.score,
         label = EXCLUDED.label,
         reasons = EXCLUDED.reasons,
         model_provider = EXCLUDED.model_provider,
         org_id = EXCLUDED.org_id`,
      [
        snapshotHash,
        data.url,
        data.domain,
        data.score,
        data.label,
        data.reasons,
        config.modelProvider,
        data.orgId
      ]
    );
  } catch (error) {
    logger.error('Failed to store scan result', { error });
    throw error;
  }
}

/**
 * Record analytics event
 */
async function recordAnalyticsEvent(
  eventType: string,
  eventData: Record<string, any>
): Promise<void> {
  try {
    await query(
      'INSERT INTO analytics (event_type, event_data, metadata, timestamp) VALUES ($1, $2, $3, NOW())',
      [
        eventType,
        eventData,
        {
          service: 'scan-api',
          version: '1.0.0'
        }
      ]
    );
  } catch (error) {
    logger.error('Failed to record analytics event', { error });
    throw error;
  }
}

/**
 * Generate human-readable explanation of detection result
 */
function generateExplanation(result: any): string {
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

export default router;
