/**
 * Redis configuration and connection management
 *
 * This module handles Redis connections for:
 * - Caching model responses
 * - Rate limiting
 * - Session storage
 * - Throttling and queuing
 */
import { RedisClientType } from 'redis';
/**
 * Connect to Redis server
 */
export declare function connectRedis(): Promise<void>;
/**
 * Get Redis client instance
 */
export declare function getRedisClient(): RedisClientType;
/**
 * Cache utilities for model responses
 */
export declare const cache: {
    /**
     * Get cached model response
     */
    get(key: string): Promise<any | null>;
    /**
     * Set cached model response with TTL
     */
    set(key: string, value: any, ttlSeconds?: number): Promise<void>;
    /**
     * Delete cached entry
     */
    delete(key: string): Promise<void>;
    /**
     * Generate cache key for model responses
     */
    generateKey(prefix: string, hash: string, model: string): string;
};
/**
 * Rate limiting utilities
 */
export declare const rateLimit: {
    /**
     * Check if request is within rate limit
     */
    checkLimit(identifier: string, limit: number, windowSeconds: number): Promise<{
        allowed: boolean;
        remaining: number;
        resetTime: number;
    }>;
    /**
     * Get rate limit info for identifier
     */
    getLimitInfo(identifier: string, windowSeconds: number): Promise<{
        count: number;
        resetTime: number;
    }>;
};
/**
 * Session management utilities
 */
export declare const session: {
    /**
     * Store session data
     */
    set(sessionId: string, data: any, ttlSeconds?: number): Promise<void>;
    /**
     * Get session data
     */
    get(sessionId: string): Promise<any | null>;
    /**
     * Delete session
     */
    delete(sessionId: string): Promise<void>;
};
/**
 * Health check for Redis connection
 */
export declare function healthCheck(): Promise<{
    status: string;
    details: any;
}>;
/**
 * Close Redis connection
 */
export declare function closeRedis(): Promise<void>;
//# sourceMappingURL=redis.d.ts.map