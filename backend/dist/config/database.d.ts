/**
 * Database configuration and connection management
 *
 * This module handles PostgreSQL database connections and provides:
 * - Connection pooling
 * - Health checks
 * - Migration support
 * - Query utilities
 */
import { Pool, PoolClient } from 'pg';
import { SupabaseClient } from '@supabase/supabase-js';
/**
 * Create database connection pool
 */
export declare function connectDatabase(): Promise<void>;
/**
 * Get database pool instance
 */
export declare function getPool(): Pool;
/**
 * Execute a query with automatic connection management
 */
export declare function query(text: string, params?: any[]): Promise<any>;
/**
 * Execute a transaction
 */
export declare function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>;
/**
 * Health check for database connection
 */
export declare function healthCheck(): Promise<{
    status: string;
    details: any;
}>;
/**
 * Close database connection pool
 */
export declare function closeDatabase(): Promise<void>;
/**
 * Initialize Supabase client
 */
export declare function initializeSupabase(): SupabaseClient;
/**
 * Get Supabase client instance
 */
export declare function getSupabaseClient(): SupabaseClient;
/**
 * Check if using Supabase
 */
export declare function isUsingSupabase(): boolean;
/**
 * Database schema initialization
 */
export declare function initializeSchema(): Promise<void>;
/**
 * Clean up old analytics data based on retention policy
 */
export declare function cleanupOldData(): Promise<void>;
//# sourceMappingURL=database.d.ts.map