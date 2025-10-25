/**
 * Statistics API Routes
 * 
 * Provides analytics data for the dashboard:
 * - GET /api/stats - Get aggregated statistics
 * - GET /api/stats/scans - Get scan statistics
 * - GET /api/stats/detections - Get detection statistics
 * - GET /api/stats/engagement - Get user engagement statistics
 * - Supports filtering by organization, date range, etc.
 */

import { Router, Request, Response } from 'express';
import Joi from 'joi';

import { query } from '@/config/database';
import { logger, generateCorrelationId } from '@/config/logger';

const router = Router();

/**
 * Query validation schema
 */
const statsQuerySchema = Joi.object({
  orgId: Joi.string().optional(),
  from: Joi.string().isoDate().optional(),
  to: Joi.string().isoDate().optional(),
  granularity: Joi.string().valid('hour', 'day', 'week', 'month').default('day'),
  limit: Joi.number().min(1).max(1000).default(100)
});

/**
 * GET /api/stats
 * Get comprehensive statistics overview
 */
router.get('/', async (req: Request, res: Response) => {
  const correlationId = generateCorrelationId();

  try {
    // Validate query parameters
    const { error, value } = statsQuerySchema.validate(req.query);
    if (error) {
      logger.warn('Invalid stats request', { correlationId, error: error.details[0].message });
      return res.status(400).json({
        error: 'Invalid request',
        message: error.details[0].message,
        correlation_id: correlationId
      });
    }

    const { orgId, from, to, granularity } = value;

    // Build date filter
    const dateFilter = buildDateFilter(from, to);
    const orgFilter = orgId ? 'AND org_id = $1' : '';
    const params = orgId ? [orgId] : [];

    // Get overall statistics
    const overallStats = await query(`
      SELECT 
        COUNT(*) as total_scans,
        COUNT(CASE WHEN event_type = 'scan' THEN 1 END) as total_scan_events,
        COUNT(CASE WHEN event_type = 'warning_shown' THEN 1 END) as warnings_shown,
        COUNT(CASE WHEN event_type = 'user_report' THEN 1 END) as user_reports,
        COUNT(CASE WHEN event_type = 'chat_interaction' THEN 1 END) as chat_interactions,
        COUNT(DISTINCT org_id) as active_organizations
      FROM analytics 
      WHERE timestamp > ${dateFilter}
      ${orgFilter}
    `, params);

    // Get detection statistics
    const detectionStats = await query(`
      SELECT 
        COUNT(*) as total_detections,
        AVG(score) as avg_score,
        COUNT(CASE WHEN label = 'phishing' THEN 1 END) as phishing_count,
        COUNT(CASE WHEN label = 'suspicious' THEN 1 END) as suspicious_count,
        COUNT(CASE WHEN label = 'clean' THEN 1 END) as clean_count
      FROM scan_results 
      WHERE created_at > ${dateFilter}
      ${orgFilter}
    `, params);

    // Get recent activity
    const recentActivity = await query(`
      SELECT 
        DATE_TRUNC('${granularity}', timestamp) as period,
        COUNT(*) as event_count,
        COUNT(CASE WHEN event_type = 'scan' THEN 1 END) as scans,
        COUNT(CASE WHEN event_type = 'warning_shown' THEN 1 END) as warnings,
        COUNT(CASE WHEN event_type = 'user_report' THEN 1 END) as reports
      FROM analytics 
      WHERE timestamp > ${dateFilter}
      ${orgFilter}
      GROUP BY period
      ORDER BY period DESC
      LIMIT 30
    `, params);

    // Get top domains
    const topDomains = await query(`
      SELECT 
        domain,
        COUNT(*) as scan_count,
        AVG(score) as avg_score,
        COUNT(CASE WHEN label = 'phishing' THEN 1 END) as phishing_count
      FROM scan_results 
      WHERE created_at > ${dateFilter}
        AND domain IS NOT NULL
      ${orgFilter}
      GROUP BY domain
      ORDER BY scan_count DESC
      LIMIT 20
    `, params);

    const stats = {
      overview: overallStats.rows[0] || {},
      detections: detectionStats.rows[0] || {},
      recent_activity: recentActivity.rows,
      top_domains: topDomains.rows,
      filters: {
        org_id: orgId,
        from,
        to,
        granularity
      },
      generated_at: new Date().toISOString(),
      correlation_id: correlationId
    };

    res.json(stats);
    return;

  } catch (error) {
    logger.error('Stats request failed', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve statistics',
      correlation_id: correlationId
    });
    return;
  }
});

/**
 * GET /api/stats/scans
 * Get detailed scan statistics
 */
router.get('/scans', async (req: Request, res: Response) => {
  const correlationId = generateCorrelationId();

  try {
    const { error, value } = statsQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Invalid request',
        message: error.details[0].message,
        correlation_id: correlationId
      });
    }

    const { orgId, from, to, granularity, limit } = value;
    const dateFilter = buildDateFilter(from, to);
    const orgFilter = orgId ? 'AND org_id = $1' : '';
    const params = orgId ? [orgId] : [];

    // Get scan trends
    const scanTrends = await query(`
      SELECT 
        DATE_TRUNC('${granularity}', created_at) as period,
        COUNT(*) as total_scans,
        AVG(score) as avg_score,
        COUNT(CASE WHEN label = 'phishing' THEN 1 END) as phishing_scans,
        COUNT(CASE WHEN label = 'suspicious' THEN 1 END) as suspicious_scans,
        COUNT(CASE WHEN label = 'clean' THEN 1 END) as clean_scans
      FROM scan_results 
      WHERE created_at > ${dateFilter}
      ${orgFilter}
      GROUP BY period
      ORDER BY period DESC
      LIMIT ${limit}
    `, params);

    // Get score distribution
    const scoreDistribution = await query(`
      SELECT 
        CASE 
          WHEN score < 0.2 THEN '0.0-0.2'
          WHEN score < 0.4 THEN '0.2-0.4'
          WHEN score < 0.6 THEN '0.4-0.6'
          WHEN score < 0.8 THEN '0.6-0.8'
          ELSE '0.8-1.0'
        END as score_range,
        COUNT(*) as count,
        ROUND(AVG(score), 3) as avg_score
      FROM scan_results 
      WHERE created_at > ${dateFilter}
      ${orgFilter}
      GROUP BY score_range
      ORDER BY score_range
    `, params);

    // Get model performance
    const modelPerformance = await query(`
      SELECT 
        model_provider,
        COUNT(*) as total_scans,
        AVG(score) as avg_score,
        COUNT(CASE WHEN label = 'phishing' THEN 1 END) as phishing_detected,
        COUNT(CASE WHEN label = 'clean' THEN 1 END) as clean_detected
      FROM scan_results 
      WHERE created_at > ${dateFilter}
      ${orgFilter}
      GROUP BY model_provider
      ORDER BY total_scans DESC
    `, params);

    res.json({
      trends: scanTrends.rows,
      score_distribution: scoreDistribution.rows,
      model_performance: modelPerformance.rows,
      filters: { orgId, from, to, granularity, limit },
      generated_at: new Date().toISOString(),
      correlation_id: correlationId
    });
    return;

  } catch (error) {
    logger.error('Scan stats request failed', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve scan statistics',
      correlation_id: correlationId
    });
    return;
  }
});

/**
 * GET /api/stats/detections
 * Get detection and false positive statistics
 */
router.get('/detections', async (req: Request, res: Response) => {
  const correlationId = generateCorrelationId();

  try {
    const { error, value } = statsQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Invalid request',
        message: error.details[0].message,
        correlation_id: correlationId
      });
    }

    const { orgId, from, to, granularity, limit } = value;
    const dateFilter = buildDateFilter(from, to);
    const orgFilter = orgId ? 'AND org_id = $1' : '';
    const params = orgId ? [orgId] : [];

    // Get detection accuracy
    const detectionAccuracy = await query(`
      SELECT 
        DATE_TRUNC('${granularity}', timestamp) as period,
        COUNT(CASE WHEN event_data->>'true_positive' = 'true' THEN 1 END) as true_positives,
        COUNT(CASE WHEN event_data->>'false_positive' = 'true' THEN 1 END) as false_positives,
        COUNT(CASE WHEN event_type = 'user_report' THEN 1 END) as user_reports
      FROM analytics 
      WHERE timestamp > ${dateFilter}
        AND event_type IN ('true_positive_report', 'false_positive_report', 'user_report')
      ${orgFilter}
      GROUP BY period
      ORDER BY period DESC
      LIMIT ${limit}
    `, params);

    // Get most common detection reasons
    const commonReasons = await query(`
      SELECT 
        reason,
        COUNT(*) as count,
        ROUND(AVG(score), 3) as avg_score
      FROM scan_results,
           unnest(reasons) as reason
      WHERE created_at > ${dateFilter}
      ${orgFilter}
      GROUP BY reason
      ORDER BY count DESC
      LIMIT 20
    `, params);

    // Get false positive analysis
    const falsePositives = await query(`
      SELECT 
        domain,
        COUNT(*) as false_positive_count,
        ARRAY_AGG(DISTINCT reason) as reasons
      FROM scan_results sr
      JOIN analytics a ON sr.snapshot_hash = a.event_data->>'snapshot_hash'
      WHERE a.timestamp > ${dateFilter}
        AND a.event_data->>'false_positive' = 'true'
      ${orgFilter}
      GROUP BY domain
      ORDER BY false_positive_count DESC
      LIMIT 10
    `, params);

    res.json({
      accuracy: detectionAccuracy.rows,
      common_reasons: commonReasons.rows,
      false_positives: falsePositives.rows,
      filters: { orgId, from, to, granularity, limit },
      generated_at: new Date().toISOString(),
      correlation_id: correlationId
    });
    return;

  } catch (error) {
    logger.error('Detection stats request failed', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve detection statistics',
      correlation_id: correlationId
    });
    return;
  }
});

/**
 * GET /api/stats/engagement
 * Get user engagement statistics
 */
router.get('/engagement', async (req: Request, res: Response) => {
  const correlationId = generateCorrelationId();

  try {
    const { error, value } = statsQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Invalid request',
        message: error.details[0].message,
        correlation_id: correlationId
      });
    }

    const { orgId, from, to, granularity, limit } = value;
    const dateFilter = buildDateFilter(from, to);
    const orgFilter = orgId ? 'AND org_id = $1' : '';
    const params = orgId ? [orgId] : [];

    // Get engagement trends
    const engagementTrends = await query(`
      SELECT 
        DATE_TRUNC('${granularity}', timestamp) as period,
        COUNT(CASE WHEN event_type = 'warning_shown' THEN 1 END) as warnings_shown,
        COUNT(CASE WHEN event_type = 'chat_interaction' THEN 1 END) as chat_interactions,
        COUNT(CASE WHEN event_type = 'user_report' THEN 1 END) as user_reports,
        COUNT(DISTINCT event_data->>'session_id') as unique_sessions
      FROM analytics 
      WHERE timestamp > ${dateFilter}
        AND event_type IN ('warning_shown', 'chat_interaction', 'user_report')
      ${orgFilter}
      GROUP BY period
      ORDER BY period DESC
      LIMIT ${limit}
    `, params);

    // Get chat statistics
    const chatStats = await query(`
      SELECT 
        COUNT(*) as total_chat_sessions,
        AVG(jsonb_array_length(messages)) as avg_messages_per_session,
        COUNT(DISTINCT session_id) as unique_sessions
      FROM chat_sessions 
      WHERE created_at > ${dateFilter}
      ${orgFilter}
    `, params);

    // Get user feedback
    const userFeedback = await query(`
      SELECT 
        DATE_TRUNC('${granularity}', timestamp) as period,
        COUNT(CASE WHEN event_data->>'false_positive' = 'true' THEN 1 END) as false_positives,
        COUNT(CASE WHEN event_data->>'true_positive' = 'true' THEN 1 END) as true_positives,
        COUNT(CASE WHEN event_type = 'user_report' THEN 1 END) as general_reports
      FROM analytics 
      WHERE timestamp > ${dateFilter}
        AND event_type IN ('true_positive_report', 'false_positive_report', 'user_report')
      ${orgFilter}
      GROUP BY period
      ORDER BY period DESC
      LIMIT ${limit}
    `, params);

    res.json({
      trends: engagementTrends.rows,
      chat: chatStats.rows[0] || {},
      feedback: userFeedback.rows,
      filters: { orgId, from, to, granularity, limit },
      generated_at: new Date().toISOString(),
      correlation_id: correlationId
    });
    return;

  } catch (error) {
    logger.error('Engagement stats request failed', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve engagement statistics',
      correlation_id: correlationId
    });
    return;
  }
});

/**
 * GET /api/stats/export
 * Export statistics data as CSV
 */
router.get('/export', async (req: Request, res: Response) => {
  const correlationId = generateCorrelationId();

  try {
    const { error, value } = statsQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Invalid request',
        message: error.details[0].message,
        correlation_id: correlationId
      });
    }

    const { orgId, from, to } = value;
    const dateFilter = buildDateFilter(from, to);
    const orgFilter = orgId ? 'AND org_id = $1' : '';
    const params = orgId ? [orgId] : [];

    // Get data for export
    const exportData = await query(`
      SELECT 
        sr.created_at,
        sr.url,
        sr.domain,
        sr.score,
        sr.label,
        sr.reasons,
        sr.model_provider,
        a.event_type,
        a.timestamp as event_timestamp,
        a.event_data
      FROM scan_results sr
      LEFT JOIN analytics a ON sr.snapshot_hash = a.event_data->>'snapshot_hash'
      WHERE sr.created_at > ${dateFilter}
      ${orgFilter}
      ORDER BY sr.created_at DESC
      LIMIT 10000
    `, params);

    // Convert to CSV format
    const csvHeaders = [
      'Date',
      'URL',
      'Domain',
      'Score',
      'Label',
      'Reasons',
      'Model Provider',
      'Event Type',
      'Event Timestamp',
      'Event Data'
    ].join(',');

    const csvRows = exportData.rows.map((row: any) => [
      row.created_at,
      `"${row.url || ''}"`,
      `"${row.domain || ''}"`,
      row.score,
      `"${row.label || ''}"`,
      `"${(row.reasons || []).join('; ')}"`,
      `"${row.model_provider || ''}"`,
      `"${row.event_type || ''}"`,
      row.event_timestamp,
      `"${JSON.stringify(row.event_data || {}).replace(/"/g, '""')}"`
    ].join(','));

    const csvContent = [csvHeaders, ...csvRows].join('\n');

    // Set response headers for file download
    const filename = `smartshield-stats-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.send(csvContent);
    return;

  } catch (error) {
    logger.error('Export stats request failed', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to export statistics',
      correlation_id: correlationId
    });
    return;
  }
});

/**
 * Build date filter SQL for queries
 */
function buildDateFilter(from?: string, to?: string): string {
  if (from && to) {
    return `'${from}'::timestamp AND timestamp < '${to}'::timestamp`;
  } else if (from) {
    return `'${from}'::timestamp`;
  } else if (to) {
    return `timestamp < '${to}'::timestamp`;
  } else {
    return `NOW() - INTERVAL '30 days'`;
  }
}

export default router;
