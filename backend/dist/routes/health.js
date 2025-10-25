"use strict";
/**
 * Health Check API Routes
 *
 * Provides health check endpoints for monitoring:
 * - GET /health - Basic health check
 * - GET /health/detailed - Detailed system health
 * - GET /health/ready - Readiness probe
 * - GET /health/live - Liveness probe
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("@/config/database");
const redis_1 = require("@/config/redis");
const modelBridge_1 = require("@/services/modelBridge");
const logger_1 = require("@/config/logger");
const config_1 = require("@/config/config");
const router = (0, express_1.Router)();
/**
 * GET /health
 * Basic health check endpoint
 */
router.get('/', async (req, res) => {
    const correlationId = (0, logger_1.generateCorrelationId)();
    const startTime = Date.now();
    try {
        const responseTime = Date.now() - startTime;
        res.json({
            status: 'healthy',
            service: 'smartshield-backend',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            response_time_ms: responseTime,
            environment: config_1.config.nodeEnv,
            correlation_id: correlationId
        });
    }
    catch (error) {
        logger_1.logger.error('Health check failed', {
            correlationId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({
            status: 'unhealthy',
            service: 'smartshield-backend',
            error: 'Health check failed',
            correlation_id: correlationId
        });
    }
});
/**
 * GET /health/detailed
 * Detailed system health check
 */
router.get('/detailed', async (req, res) => {
    const correlationId = (0, logger_1.generateCorrelationId)();
    const startTime = Date.now();
    try {
        // Check database health
        const dbHealth = await (0, database_1.healthCheck)();
        // Check Redis health
        const redisHealth = await (0, redis_1.healthCheck)();
        // Check model bridge health
        const modelHealth = await checkModelHealth();
        // Check system resources
        const systemHealth = checkSystemHealth();
        const responseTime = Date.now() - startTime;
        // Determine overall health status
        const isHealthy = dbHealth.status === 'healthy' &&
            redisHealth.status === 'healthy' &&
            modelHealth.status === 'healthy' &&
            systemHealth.status === 'healthy';
        const status = isHealthy ? 'healthy' : 'degraded';
        res.status(isHealthy ? 200 : 503).json({
            status,
            service: 'smartshield-backend',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            response_time_ms: responseTime,
            checks: {
                database: dbHealth,
                redis: redisHealth,
                model_bridge: modelHealth,
                system: systemHealth
            },
            configuration: {
                environment: config_1.config.nodeEnv,
                model_provider: config_1.config.modelProvider,
                privacy_mode: config_1.config.privacyMode,
                cors_origins: config_1.config.corsOrigins.length
            },
            correlation_id: correlationId
        });
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.logger.error('Detailed health check failed', {
            correlationId,
            error: error instanceof Error ? error.message : 'Unknown error',
            responseTime: `${responseTime}ms`
        });
        res.status(500).json({
            status: 'unhealthy',
            service: 'smartshield-backend',
            error: 'Detailed health check failed',
            response_time_ms: responseTime,
            correlation_id: correlationId
        });
    }
});
/**
 * GET /health/ready
 * Readiness probe for Kubernetes
 */
router.get('/ready', async (req, res) => {
    const correlationId = (0, logger_1.generateCorrelationId)();
    try {
        // Check critical dependencies
        const dbHealth = await (0, database_1.healthCheck)();
        const redisHealth = await (0, redis_1.healthCheck)();
        const isReady = dbHealth.status === 'healthy' && redisHealth.status === 'healthy';
        if (isReady) {
            res.json({
                status: 'ready',
                timestamp: new Date().toISOString(),
                correlation_id: correlationId
            });
        }
        else {
            res.status(503).json({
                status: 'not_ready',
                timestamp: new Date().toISOString(),
                checks: {
                    database: dbHealth.status,
                    redis: redisHealth.status
                },
                correlation_id: correlationId
            });
        }
    }
    catch (error) {
        logger_1.logger.error('Readiness check failed', {
            correlationId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(503).json({
            status: 'not_ready',
            error: 'Readiness check failed',
            correlation_id: correlationId
        });
    }
});
/**
 * GET /health/live
 * Liveness probe for Kubernetes
 */
router.get('/live', async (req, res) => {
    const correlationId = (0, logger_1.generateCorrelationId)();
    try {
        // Simple liveness check - just ensure the process is running
        const memoryUsage = process.memoryUsage();
        const uptime = process.uptime();
        // Check if process has been running for at least 30 seconds (startup time)
        const isAlive = uptime > 30 && memoryUsage.heapUsed > 0;
        if (isAlive) {
            res.json({
                status: 'alive',
                uptime: uptime,
                memory: {
                    heap_used_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                    heap_total_mb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                    external_mb: Math.round(memoryUsage.external / 1024 / 1024)
                },
                timestamp: new Date().toISOString(),
                correlation_id: correlationId
            });
        }
        else {
            res.status(503).json({
                status: 'not_alive',
                uptime: uptime,
                error: 'Process not ready or unhealthy',
                correlation_id: correlationId
            });
        }
    }
    catch (error) {
        logger_1.logger.error('Liveness check failed', {
            correlationId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(503).json({
            status: 'not_alive',
            error: 'Liveness check failed',
            correlation_id: correlationId
        });
    }
});
/**
 * GET /health/metrics
 * Prometheus-style metrics endpoint
 */
router.get('/metrics', async (req, res) => {
    const correlationId = (0, logger_1.generateCorrelationId)();
    try {
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        // Get basic metrics
        const metrics = {
            // Process metrics
            nodejs_memory_heap_used_bytes: memoryUsage.heapUsed,
            nodejs_memory_heap_total_bytes: memoryUsage.heapTotal,
            nodejs_memory_external_bytes: memoryUsage.external,
            nodejs_memory_rss_bytes: memoryUsage.rss,
            // Process info
            nodejs_process_uptime_seconds: process.uptime(),
            nodejs_process_pid: process.pid,
            // System metrics
            nodejs_version_info: process.version,
            nodejs_platform_info: process.platform,
            nodejs_arch_info: process.arch,
            // Application metrics
            smartshield_version_info: '1.0.0',
            smartshield_model_provider: config_1.config.modelProvider,
            smartshield_environment: config_1.config.nodeEnv,
            // Timestamp
            metrics_timestamp: Date.now()
        };
        // Convert to Prometheus format
        const prometheusMetrics = Object.entries(metrics)
            .map(([key, value]) => {
            if (typeof value === 'string') {
                return `${key}{value="${value}"} 1`;
            }
            else {
                return `${key} ${value}`;
            }
        })
            .join('\n');
        res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        res.send(prometheusMetrics + '\n');
    }
    catch (error) {
        logger_1.logger.error('Metrics endpoint failed', {
            correlationId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({
            error: 'Failed to generate metrics',
            correlation_id: correlationId
        });
    }
});
/**
 * Check model bridge health
 */
async function checkModelHealth() {
    try {
        const providerInfo = modelBridge_1.modelBridge.getProviderInfo();
        return {
            status: 'healthy',
            details: {
                primary_provider: providerInfo.primary,
                fallback_provider: providerInfo.fallback,
                available_providers: providerInfo.available,
                model_provider: config_1.config.modelProvider,
                model_name: config_1.config.modelName
            }
        };
    }
    catch (error) {
        return {
            status: 'unhealthy',
            details: {
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}
/**
 * Check system health
 */
function checkSystemHealth() {
    try {
        const memoryUsage = process.memoryUsage();
        const uptime = process.uptime();
        // Check memory usage (warn if over 80% of available)
        const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
        const isMemoryHealthy = memoryUsagePercent < 90;
        // Check uptime (warn if process has been running for more than 7 days without restart)
        const isUptimeHealthy = uptime < 604800; // 7 days in seconds
        const status = isMemoryHealthy && isUptimeHealthy ? 'healthy' : 'warning';
        return {
            status,
            details: {
                memory: {
                    heap_used_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                    heap_total_mb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                    usage_percent: Math.round(memoryUsagePercent * 100) / 100,
                    healthy: isMemoryHealthy
                },
                uptime: {
                    seconds: uptime,
                    days: Math.round(uptime / 86400),
                    healthy: isUptimeHealthy
                },
                platform: process.platform,
                node_version: process.version,
                pid: process.pid
            }
        };
    }
    catch (error) {
        return {
            status: 'unhealthy',
            details: {
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}
exports.default = router;
//# sourceMappingURL=health.js.map