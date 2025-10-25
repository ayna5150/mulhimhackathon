/**
 * Analytics API Routes
 * 
 * Handles analytics data collection from the Chrome extension:
 * - POST /api/analytics - Record analytics events
 * - Tracks user interactions, detection results, and system metrics
 * - Provides anonymized data for dashboard analytics
 */

import { Router, Request, Response } from 'express';
import Joi from 'joi';

import { query } from '@/config/database';
import { logger, generateCorrelationId } from '@/config/logger';

const router = Router();

/**
 * Request validation schema
 */
const analyticsRequestSchema = Joi.object({
  event: Joi.string().valid(
    'scan',
    'warning_shown',
    'user_report',
    'chat_interaction',
    'extension_install',
    'extension_uninstall',
    'settings_change',
    'false_positive_report',
    'true_positive_report'
  ).required(),
  orgId: Joi.string().optional(),
  timestamp: Joi.string().isoDate().optional(),
  meta: Joi.object({
    url: Joi.string().uri().optional(),
    domain: Joi.string().optional(),
    score: Joi.number().min(0).max(1).optional(),
    label: Joi.string().optional(),
    user_action: Joi.string().optional(),
    session_id: Joi.string().optional(),
    extension_version: Joi.string().optional(),
    browser_version: Joi.string().optional(),
    os: Joi.string().optional(),
    response_time_ms: Joi.number().optional(),
    detection_method: Joi.string().optional(),
    false_positive: Joi.boolean().optional(),
    true_positive: Joi.boolean().optional()
  }).optional()
});

/**
 * POST /api/analytics
 * Record analytics event
 */
router.post('/', async (req: Request, res: Response) => {
  const correlationId = generateCorrelationId();
  const startTime = Date.now();

  try {
    // Validate request
    const { error, value } = analyticsRequestSchema.validate(req.body);
    if (error) {
      logger.warn('Invalid analytics request', { correlationId, error: error.details[0].message });
      return res.status(400).json({
        error: 'Invalid request',
        message: error.details[0].message,
        correlation_id: correlationId
      });
    }

    const { event, orgId, timestamp, meta } = value;

    // Prepare analytics data
    const analyticsData = {
      event_type: event,
      event_data: {
        ...meta,
        correlation_id: correlationId,
        client_timestamp: timestamp || new Date().toISOString()
      },
      metadata: {
        org_id: orgId,
        service: 'analytics-api',
        version: '1.0.0',
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      }
    };

    // Store in database
    await query(
      'INSERT INTO analytics (event_type, event_data, metadata, timestamp, org_id) VALUES ($1, $2, $3, $4, $5)',
      [
        analyticsData.event_type,
        analyticsData.event_data,
        analyticsData.metadata,
        analyticsData.metadata.timestamp,
        orgId
      ]
    );

    // Log important events
    if (['user_report', 'false_positive_report', 'true_positive_report'].includes(event)) {
      logger.info('Important analytics event recorded', {
        correlationId,
        event,
        orgId,
        meta: meta ? Object.keys(meta) : []
      });
    }

    const responseTime = Date.now() - startTime;

    res.json({
      ok: true,
      event_id: correlationId,
      timestamp: analyticsData.metadata.timestamp,
      response_time_ms: responseTime,
      correlation_id: correlationId
    });
    return;

  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Analytics request failed', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime: `${responseTime}ms`
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to record analytics event',
      correlation_id: correlationId
    });
    return;
  }
});

/**
 * POST /api/analytics/batch
 * Record multiple analytics events in a single request
 */
router.post('/batch', async (req: Request, res: Response) => {
  const correlationId = generateCorrelationId();
  const startTime = Date.now();

  try {
    // Validate batch request
    const batchSchema = Joi.object({
      events: Joi.array().items(analyticsRequestSchema).min(1).max(100).required(),
      orgId: Joi.string().optional()
    });

    const { error, value } = batchSchema.validate(req.body);
    if (error) {
      logger.warn('Invalid batch analytics request', { correlationId, error: error.details[0].message });
      return res.status(400).json({
        error: 'Invalid request',
        message: error.details[0].message,
        correlation_id: correlationId
      });
    }

    const { events, orgId } = value;
    const results = [];

    // Process each event
    for (const eventData of events) {
      try {
        const analyticsData = {
          event_type: eventData.event,
          event_data: {
            ...eventData.meta,
            correlation_id: correlationId,
            client_timestamp: eventData.timestamp || new Date().toISOString()
          },
          metadata: {
            org_id: orgId || eventData.orgId,
            service: 'analytics-api',
            version: '1.0.0',
            ip_address: req.ip,
            user_agent: req.get('User-Agent'),
            timestamp: new Date().toISOString()
          }
        };

        await query(
          'INSERT INTO analytics (event_type, event_data, metadata, timestamp, org_id) VALUES ($1, $2, $3, $4, $5)',
          [
            analyticsData.event_type,
            analyticsData.event_data,
            analyticsData.metadata,
            analyticsData.metadata.timestamp,
            orgId || eventData.orgId
          ]
        );

        results.push({
          event: eventData.event,
          status: 'recorded',
          timestamp: analyticsData.metadata.timestamp
        });

      } catch (eventError) {
        logger.error('Failed to record individual event', { correlationId, event: eventData.event, error: eventError });
        results.push({
          event: eventData.event,
          status: 'failed',
          error: 'Failed to record event'
        });
      }
    }

    const responseTime = Date.now() - startTime;
    const successCount = results.filter(r => r.status === 'recorded').length;

    logger.info('Batch analytics processed', {
      correlationId,
      totalEvents: events.length,
      successCount,
      responseTime: `${responseTime}ms`
    });

    res.json({
      ok: true,
      batch_id: correlationId,
      total_events: events.length,
      successful_events: successCount,
      failed_events: events.length - successCount,
      results,
      response_time_ms: responseTime,
      correlation_id: correlationId
    });
    return;

  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Batch analytics request failed', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime: `${responseTime}ms`
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process batch analytics',
      correlation_id: correlationId
    });
    return;
  }
});

/**
 * GET /api/analytics/health
 * Get analytics system health and recent activity
 */
router.get('/health', async (req: Request, res: Response) => {
  const correlationId = generateCorrelationId();

  try {
    // Get recent activity counts
    const recentActivity = await query(`
      SELECT 
        event_type,
        COUNT(*) as count,
        MAX(timestamp) as latest_event
      FROM analytics 
      WHERE timestamp > NOW() - INTERVAL '1 hour'
      GROUP BY event_type
      ORDER BY count DESC
    `);

    // Get total counts by organization
    const orgStats = await query(`
      SELECT 
        org_id,
        COUNT(*) as total_events,
        COUNT(DISTINCT event_type) as event_types
      FROM analytics 
      WHERE timestamp > NOW() - INTERVAL '24 hours'
      GROUP BY org_id
      ORDER BY total_events DESC
      LIMIT 10
    `);

    // Get system health metrics
    const systemMetrics = await query(`
      SELECT 
        COUNT(*) as total_events,
        COUNT(DISTINCT org_id) as active_orgs,
        MIN(timestamp) as oldest_event,
        MAX(timestamp) as newest_event
      FROM analytics 
      WHERE timestamp > NOW() - INTERVAL '24 hours'
    `);

    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: {
        recent_activity: recentActivity.rows,
        organization_stats: orgStats.rows,
        system_overview: systemMetrics.rows[0] || {}
      },
      correlation_id: correlationId
    };

    res.json(healthData);

  } catch (error) {
    logger.error('Analytics health check failed', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      status: 'unhealthy',
      error: 'Failed to retrieve analytics health data',
      correlation_id: correlationId
    });
  }
});

/**
 * DELETE /api/analytics/cleanup
 * Clean up old analytics data (admin endpoint)
 */
router.delete('/cleanup', async (req: Request, res: Response) => {
  const correlationId = generateCorrelationId();

  try {
    // Only allow cleanup in development or with proper auth
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cleanup not allowed in production',
        correlation_id: correlationId
      });
    }

    const { retentionDays = 30 } = req.query;
    const days = parseInt(retentionDays as string, 10);

    if (isNaN(days) || days < 1 || days > 365) {
      return res.status(400).json({
        error: 'Invalid retention period',
        message: 'Retention days must be between 1 and 365',
        correlation_id: correlationId
      });
    }

    const result = await query(
      'DELETE FROM analytics WHERE timestamp < NOW() - INTERVAL \'${days} days\'',
      [days]
    );

    logger.info('Analytics cleanup completed', {
      correlationId,
      deletedRecords: result.rowCount,
      retentionDays: days
    });

    res.json({
      message: 'Analytics cleanup completed',
      deleted_records: result.rowCount,
      retention_days: days,
      correlation_id: correlationId
    });
    return;

  } catch (error) {
    logger.error('Analytics cleanup failed', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to cleanup analytics data',
      correlation_id: correlationId
    });
    return;
  }
});

export default router;
