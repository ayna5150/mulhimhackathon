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
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';
import { logger } from './logger';

// Database connection pool
let pool: Pool | null = null;
let supabaseClient: SupabaseClient | null = null;

/**
 * Create database connection pool
 */
export async function connectDatabase(): Promise<void> {
  try {
    // Check if using Supabase
    if (config.databaseUrl.includes('supabase.co')) {
      // Initialize Supabase client
      supabaseClient = createClient(
        config.supabaseUrl!,
        config.supabaseServiceKey!
      );
      
      // Test Supabase connection
      const { data, error } = await supabaseClient
        .from('organizations')
        .select('count')
        .limit(1);
      
      if (error) {
        throw new Error(`Supabase connection failed: ${error.message}`);
      }
      
      logger.info('Supabase client connected successfully');
    } else {
      pool = new Pool({
        connectionString: config.databaseUrl,
        max: 20, // Maximum number of clients in the pool
        idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
        connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
        ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: false } : false
      });

      // Test the connection
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      logger.info('Database connection pool created successfully');

      // Handle pool errors
      pool.on('error', (err) => {
        logger.error('Unexpected error on idle client', err);
      });
    }

  } catch (error) {
    logger.error('Failed to connect to database:', error);
    throw error;
  }
}

/**
 * Get database pool instance
 */
export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database not connected. Call connectDatabase() first.');
  }
  return pool;
}

/**
 * Execute a query with automatic connection management
 */
export async function query(text: string, params?: any[]): Promise<any> {
  const start = Date.now();
  
  try {
    if (isUsingSupabase()) {
      // For Supabase, we need to use the RPC function for raw SQL
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc('execute_sql', {
        query: text,
        params: params || []
      });
      
      if (error) {
        throw error;
      }
      
      const duration = Date.now() - start;
      logger.debug('Supabase query executed', {
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        duration: `${duration}ms`,
        rows: data?.length || 0
      });
      
      return { rows: data || [], rowCount: data?.length || 0 };
    } else {
      // PostgreSQL pool query
      const pool = getPool();
      const result = await pool.query(text, params);
      const duration = Date.now() - start;
      
      logger.debug('Database query executed', {
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        duration: `${duration}ms`,
        rows: result.rowCount
      });
      
      return result;
    }
  } catch (error) {
    const duration = Date.now() - start;
    logger.error('Database query failed', {
      query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      duration: `${duration}ms`,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Execute a transaction
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Health check for database connection
 */
export async function healthCheck(): Promise<{ status: string; details: any }> {
  try {
    if (isUsingSupabase()) {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('organizations')
        .select('count')
        .limit(1);
      
      if (error) {
        throw error;
      }
      
      return {
        status: 'healthy',
        details: {
          provider: 'supabase',
          timestamp: new Date().toISOString(),
          connection: 'active'
        }
      };
    } else {
      const result = await query('SELECT NOW() as timestamp, version() as version');
      
      return {
        status: 'healthy',
        details: {
          timestamp: result.rows[0].timestamp,
          version: result.rows[0].version,
          pool: {
            totalCount: pool?.totalCount || 0,
            idleCount: pool?.idleCount || 0,
            waitingCount: pool?.waitingCount || 0
          }
        }
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      details: {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

/**
 * Close database connection pool
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection pool closed');
  }
  if (supabaseClient) {
    // Supabase client doesn't need explicit closing
    supabaseClient = null;
    logger.info('Supabase client closed');
  }
}

/**
 * Initialize Supabase client
 */
export function initializeSupabase(): SupabaseClient {
  if (!config.useSupabase) {
    throw new Error('Supabase is not enabled. Set USE_SUPABASE=true in environment variables.');
  }

  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Supabase configuration missing. Provide SUPABASE_URL and SUPABASE_ANON_KEY.');
  }

  supabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey);
  logger.info('Supabase client initialized successfully');
  return supabaseClient;
}

/**
 * Get Supabase client instance
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    return initializeSupabase();
  }
  return supabaseClient;
}

/**
 * Check if using Supabase
 */
export function isUsingSupabase(): boolean {
  return config.databaseUrl.includes('supabase.co');
}

/**
 * Database schema initialization
 */
export async function initializeSchema(): Promise<void> {
  const tables = [
    // Analytics table for storing scan results and user interactions
    `
    CREATE TABLE IF NOT EXISTS analytics (
      id SERIAL PRIMARY KEY,
      org_id VARCHAR(255),
      event_type VARCHAR(50) NOT NULL,
      event_data JSONB,
      metadata JSONB,
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
    `,
    
    // Users table for authentication
    `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      org_id VARCHAR(255),
      role VARCHAR(50) DEFAULT 'user',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
    `,
    
    // Organizations table
    `
    CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      domain VARCHAR(255),
      settings JSONB DEFAULT '{}',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
    `,
    
    // Scan results table for detailed analysis
    `
    CREATE TABLE IF NOT EXISTS scan_results (
      id SERIAL PRIMARY KEY,
      snapshot_hash VARCHAR(255) UNIQUE NOT NULL,
      url TEXT,
      domain VARCHAR(255),
      score DECIMAL(3,2),
      label VARCHAR(50),
      reasons TEXT[],
      model_provider VARCHAR(50),
      org_id VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
    `,
    
    // Chat sessions table
    `
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id SERIAL PRIMARY KEY,
      session_id VARCHAR(255) UNIQUE NOT NULL,
      snapshot_hash VARCHAR(255),
      messages JSONB DEFAULT '[]',
      org_id VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
    `
  ];

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics(timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_analytics_org_id ON analytics(org_id)',
    'CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics(event_type)',
    'CREATE INDEX IF NOT EXISTS idx_scan_results_hash ON scan_results(snapshot_hash)',
    'CREATE INDEX IF NOT EXISTS idx_scan_results_domain ON scan_results(domain)',
    'CREATE INDEX IF NOT EXISTS idx_scan_results_score ON scan_results(score)',
    'CREATE INDEX IF NOT EXISTS idx_chat_sessions_session_id ON chat_sessions(session_id)',
    'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
    'CREATE INDEX IF NOT EXISTS idx_organizations_domain ON organizations(domain)'
  ];

  try {
    // Create tables
    for (const table of tables) {
      await query(table);
    }

    // Create indexes
    for (const index of indexes) {
      await query(index);
    }

    logger.info('Database schema initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize database schema:', error);
    throw error;
  }
}

/**
 * Clean up old analytics data based on retention policy
 */
export async function cleanupOldData(): Promise<void> {
  try {
    const result = await query(
      'DELETE FROM analytics WHERE timestamp < NOW() - INTERVAL \'${retentionDays} days\'',
      [config.retentionDays]
    );
    
    logger.info(`Cleaned up ${result.rowCount} old analytics records`);
  } catch (error) {
    logger.error('Failed to cleanup old data:', error);
    throw error;
  }
}
