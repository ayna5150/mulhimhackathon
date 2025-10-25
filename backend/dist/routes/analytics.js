"use strict";
/**
 * Analytics API Routes
 *
 * Handles analytics data collection from the Chrome extension:
 * - POST /api/analytics - Record analytics events
 * - Tracks user interactions, detection results, and system metrics
 * - Provides anonymized data for dashboard analytics
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const database_1 = require("@/config/database");
const logger_1 = require("@/config/logger");
const router = (0, express_1.Router)();
/**
 * Request validation schema
 */
const analyticsRequestSchema = joi_1.default.object({
    event: joi_1.default.string().valid('scan', 'warning_shown', 'user_report', 'chat_interaction', 'extension_install', 'extension_uninstall', 'settings_change', 'false_positive_report', 'true_positive_report').required(),
    orgId: joi_1.default.string().optional(),
    timestamp: joi_1.default.string().isoDate().optional(),
    meta: joi_1.default.object({
        url: joi_1.default.string().uri().optional(),
        domain: joi_1.default.string().optional(),
        score: joi_1.default.number().min(0).max(1).optional(),
        label: joi_1.default.string().optional(),
        user_action: joi_1.default.string().optional(),
        session_id: joi_1.default.string().optional(),
        extension_version: joi_1.default.string().optional(),
        browser_version: joi_1.default.string().optional(),
        os: joi_1.default.string().optional(),
        response_time_ms: joi_1.default.number().optional(),
        detection_method: joi_1.default.string().optional(),
        false_positive: joi_1.default.boolean().optional(),
        true_positive: joi_1.default.boolean().optional()
    }).optional()
});
/**
 * POST /api/analytics
 * Record analytics event
 */
router.post('/', async (req, res) => {
    const correlationId = (0, logger_1.generateCorrelationId)();
    const startTime = Date.now();
    try {
        // Validate request
        const { error, value } = analyticsRequestSchema.validate(req.body);
        if (error) {
            logger_1.logger.warn('Invalid analytics request', { correlationId, error: error.details[0].message });
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
        await (0, database_1.query)('INSERT INTO analytics (event_type, event_data, metadata, timestamp, org_id) VALUES ($1, $2, $3, $4, $5)', [
            analyticsData.event_type,
            analyticsData.event_data,
            analyticsData.metadata,
            analyticsData.metadata.timestamp,
            orgId
        ]);
        // Log important events
        if (['user_report', 'false_positive_report', 'true_positive_report'].includes(event)) {
            logger_1.logger.info('Important analytics event recorded', {
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
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.logger.error('Analytics request failed', {
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
router.post('/batch', async (req, res) => {
    const correlationId = (0, logger_1.generateCorrelationId)();
    const startTime = Date.now();
    try {
        // Validate batch request
        const batchSchema = joi_1.default.object({
            events: joi_1.default.array().items(analyticsRequestSchema).min(1).max(100).required(),
            orgId: joi_1.default.string().optional()
        });
        const { error, value } = batchSchema.validate(req.body);
        if (error) {
            logger_1.logger.warn('Invalid batch analytics request', { correlationId, error: error.details[0].message });
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
                await (0, database_1.query)('INSERT INTO analytics (event_type, event_data, metadata, timestamp, org_id) VALUES ($1, $2, $3, $4, $5)', [
                    analyticsData.event_type,
                    analyticsData.event_data,
                    analyticsData.metadata,
                    analyticsData.metadata.timestamp,
                    orgId || eventData.orgId
                ]);
                results.push({
                    event: eventData.event,
                    status: 'recorded',
                    timestamp: analyticsData.metadata.timestamp
                });
            }
            catch (eventError) {
                logger_1.logger.error('Failed to record individual event', { correlationId, event: eventData.event, error: eventError });
                results.push({
                    event: eventData.event,
                    status: 'failed',
                    error: 'Failed to record event'
                });
            }
        }
        const responseTime = Date.now() - startTime;
        const successCount = results.filter(r => r.status === 'recorded').length;
        logger_1.logger.info('Batch analytics processed', {
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
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.logger.error('Batch analytics request failed', {
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
router.get('/health', async (req, res) => {
    const correlationId = (0, logger_1.generateCorrelationId)();
    try {
        // Get recent activity counts
        const recentActivity = await (0, database_1.query)(`
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
        const orgStats = await (0, database_1.query)(`
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
        const systemMetrics = await (0, database_1.query)(`
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
    }
    catch (error) {
        logger_1.logger.error('Analytics health check failed', {
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
router.delete('/cleanup', async (req, res) => {
    const correlationId = (0, logger_1.generateCorrelationId)();
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
        const days = parseInt(retentionDays, 10);
        if (isNaN(days) || days < 1 || days > 365) {
            return res.status(400).json({
                error: 'Invalid retention period',
                message: 'Retention days must be between 1 and 365',
                correlation_id: correlationId
            });
        }
        const result = await (0, database_1.query)('DELETE FROM analytics WHERE timestamp < NOW() - INTERVAL \'${days} days\'', [days]);
        logger_1.logger.info('Analytics cleanup completed', {
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
    }
    catch (error) {
        logger_1.logger.error('Analytics cleanup failed', {
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
exports.default = router;
//# sourceMappingURL=analytics.js.map