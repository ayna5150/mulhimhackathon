"use strict";
/**
 * Redis configuration and connection management
 *
 * This module handles Redis connections for:
 * - Caching model responses
 * - Rate limiting
 * - Session storage
 * - Throttling and queuing
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.session = exports.rateLimit = exports.cache = void 0;
exports.connectRedis = connectRedis;
exports.getRedisClient = getRedisClient;
exports.healthCheck = healthCheck;
exports.closeRedis = closeRedis;
const redis_1 = require("redis");
const config_1 = require("./config");
const logger_1 = require("./logger");
// Redis client instance
let redisClient = null;
/**
 * Connect to Redis server
 */
async function connectRedis() {
    try {
        redisClient = (0, redis_1.createClient)({
            url: config_1.config.redisUrl,
            socket: {
                reconnectStrategy: (retries) => {
                    if (retries > 10) {
                        logger_1.logger.error('Redis connection failed after 10 retries');
                        return false;
                    }
                    return Math.min(retries * 100, 3000);
                }
            }
        });
        redisClient.on('error', (error) => {
            logger_1.logger.error('Redis client error:', error);
        });
        redisClient.on('connect', () => {
            logger_1.logger.info('Redis client connected');
        });
        redisClient.on('reconnecting', () => {
            logger_1.logger.info('Redis client reconnecting...');
        });
        await redisClient.connect();
        logger_1.logger.info('Redis connected successfully');
    }
    catch (error) {
        logger_1.logger.error('Failed to connect to Redis:', error);
        throw error;
    }
}
/**
 * Get Redis client instance
 */
function getRedisClient() {
    if (!redisClient || !redisClient.isOpen) {
        throw new Error('Redis not connected. Call connectRedis() first.');
    }
    return redisClient;
}
/**
 * Cache utilities for model responses
 */
exports.cache = {
    /**
     * Get cached model response
     */
    async get(key) {
        try {
            const client = getRedisClient();
            const value = await client.get(key);
            return value ? JSON.parse(value) : null;
        }
        catch (error) {
            logger_1.logger.error('Cache get error:', error);
            return null;
        }
    },
    /**
     * Set cached model response with TTL
     */
    async set(key, value, ttlSeconds = 3600) {
        try {
            const client = getRedisClient();
            await client.setEx(key, ttlSeconds, JSON.stringify(value));
        }
        catch (error) {
            logger_1.logger.error('Cache set error:', error);
        }
    },
    /**
     * Delete cached entry
     */
    async delete(key) {
        try {
            const client = getRedisClient();
            await client.del(key);
        }
        catch (error) {
            logger_1.logger.error('Cache delete error:', error);
        }
    },
    /**
     * Generate cache key for model responses
     */
    generateKey(prefix, hash, model) {
        return `${prefix}:${hash}:${model}`;
    }
};
/**
 * Rate limiting utilities
 */
exports.rateLimit = {
    /**
     * Check if request is within rate limit
     */
    async checkLimit(identifier, limit, windowSeconds) {
        try {
            const client = getRedisClient();
            const key = `rate_limit:${identifier}`;
            const now = Date.now();
            const window = windowSeconds * 1000;
            // Use sliding window algorithm
            const pipeline = client.multi();
            // Remove expired entries
            pipeline.zRemRangeByScore(key, '-inf', now - window);
            // Count current requests
            pipeline.zCard(key);
            // Add current request
            pipeline.zAdd(key, { score: now, value: `${now}-${Math.random()}` });
            // Set expiry
            pipeline.expire(key, windowSeconds);
            const results = await pipeline.exec();
            if (!results || results.length < 2) {
                throw new Error('Pipeline execution failed');
            }
            const currentCount = results[1];
            const allowed = currentCount < limit;
            const remaining = Math.max(0, limit - currentCount);
            const resetTime = now + window;
            return { allowed, remaining, resetTime };
        }
        catch (error) {
            logger_1.logger.error('Rate limit check error:', error);
            // Fail open - allow request if Redis is down
            return { allowed: true, remaining: limit, resetTime: Date.now() + windowSeconds * 1000 };
        }
    },
    /**
     * Get rate limit info for identifier
     */
    async getLimitInfo(identifier, windowSeconds) {
        try {
            const client = getRedisClient();
            const key = `rate_limit:${identifier}`;
            const now = Date.now();
            const window = windowSeconds * 1000;
            // Remove expired entries and count
            await client.zRemRangeByScore(key, '-inf', now - window);
            const count = await client.zCard(key);
            return {
                count,
                resetTime: now + window
            };
        }
        catch (error) {
            logger_1.logger.error('Rate limit info error:', error);
            return { count: 0, resetTime: Date.now() + windowSeconds * 1000 };
        }
    }
};
/**
 * Session management utilities
 */
exports.session = {
    /**
     * Store session data
     */
    async set(sessionId, data, ttlSeconds = 86400) {
        try {
            const client = getRedisClient();
            await client.setEx(`session:${sessionId}`, ttlSeconds, JSON.stringify(data));
        }
        catch (error) {
            logger_1.logger.error('Session set error:', error);
        }
    },
    /**
     * Get session data
     */
    async get(sessionId) {
        try {
            const client = getRedisClient();
            const value = await client.get(`session:${sessionId}`);
            return value ? JSON.parse(value) : null;
        }
        catch (error) {
            logger_1.logger.error('Session get error:', error);
            return null;
        }
    },
    /**
     * Delete session
     */
    async delete(sessionId) {
        try {
            const client = getRedisClient();
            await client.del(`session:${sessionId}`);
        }
        catch (error) {
            logger_1.logger.error('Session delete error:', error);
        }
    }
};
/**
 * Health check for Redis connection
 */
async function healthCheck() {
    try {
        const client = getRedisClient();
        const start = Date.now();
        await client.ping();
        const latency = Date.now() - start;
        const info = await client.info('memory');
        const memoryInfo = info.split('\r\n').reduce((acc, line) => {
            const [key, value] = line.split(':');
            if (key && value) {
                acc[key] = value;
            }
            return acc;
        }, {});
        return {
            status: 'healthy',
            details: {
                latency: `${latency}ms`,
                memory: {
                    used: memoryInfo.used_memory_human,
                    peak: memoryInfo.used_memory_peak_human
                },
                connected: client.isOpen
            }
        };
    }
    catch (error) {
        return {
            status: 'unhealthy',
            details: {
                error: error instanceof Error ? error.message : 'Unknown error',
                connected: redisClient?.isOpen || false
            }
        };
    }
}
/**
 * Close Redis connection
 */
async function closeRedis() {
    if (redisClient && redisClient.isOpen) {
        await redisClient.quit();
        redisClient = null;
        logger_1.logger.info('Redis connection closed');
    }
}
//# sourceMappingURL=redis.js.map