-- SmartShield Database Initialization Script for Supabase
-- This script creates the initial database schema for the SmartShield phishing detection system
-- Run this in the Supabase SQL Editor

-- Create extensions (Supabase comes with these pre-installed)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create analytics table for storing scan results and user interactions
CREATE TABLE IF NOT EXISTS analytics (
    id BIGSERIAL PRIMARY KEY,
    org_id VARCHAR(255),
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB,
    metadata JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    org_id VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255),
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create scan results table for detailed analysis
CREATE TABLE IF NOT EXISTS scan_results (
    id BIGSERIAL PRIMARY KEY,
    snapshot_hash VARCHAR(255) UNIQUE NOT NULL,
    url TEXT,
    domain VARCHAR(255),
    score DECIMAL(3,2),
    label VARCHAR(50),
    reasons TEXT[],
    model_provider VARCHAR(50),
    org_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create chat sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    snapshot_hash VARCHAR(255),
    messages JSONB DEFAULT '[]',
    org_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics(timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_org_id ON analytics(org_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_org_timestamp ON analytics(org_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_scan_results_hash ON scan_results(snapshot_hash);
CREATE INDEX IF NOT EXISTS idx_scan_results_domain ON scan_results(domain);
CREATE INDEX IF NOT EXISTS idx_scan_results_score ON scan_results(score);
CREATE INDEX IF NOT EXISTS idx_scan_results_label ON scan_results(label);
CREATE INDEX IF NOT EXISTS idx_scan_results_org_id ON scan_results(org_id);
CREATE INDEX IF NOT EXISTS idx_scan_results_created_at ON scan_results(created_at);
CREATE INDEX IF NOT EXISTS idx_scan_results_domain_score ON scan_results(domain, score);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_session_id ON chat_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_snapshot_hash ON chat_sessions(snapshot_hash);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_org_id ON chat_sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON chat_sessions(created_at);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE INDEX IF NOT EXISTS idx_organizations_domain ON organizations(domain);
CREATE INDEX IF NOT EXISTS idx_organizations_name ON organizations(name);

-- Create GIN indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_analytics_event_data_gin ON analytics USING GIN(event_data);
CREATE INDEX IF NOT EXISTS idx_analytics_metadata_gin ON analytics USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_messages_gin ON chat_sessions USING GIN(messages);
CREATE INDEX IF NOT EXISTS idx_organizations_settings_gin ON organizations USING GIN(settings);

-- Create partial indexes for active records
CREATE INDEX IF NOT EXISTS idx_analytics_active ON analytics(timestamp) WHERE timestamp > NOW() - INTERVAL '30 days';
CREATE INDEX IF NOT EXISTS idx_users_active ON users(email) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_organizations_active ON organizations(domain) WHERE is_active = true;

-- Insert default organization
INSERT INTO organizations (name, domain, settings, is_active) 
VALUES ('Default Organization', 'localhost', '{"default": true}', true)
ON CONFLICT DO NOTHING;

-- Create a default admin user (password: admin123)
-- In production, this should be removed or the password should be changed
INSERT INTO users (email, password_hash, org_id, role, is_active)
SELECT 
    'admin@smartshield.local',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj7L2Mq.8XxK', -- admin123
    o.id::VARCHAR,
    'admin',
    true
FROM organizations o 
WHERE o.domain = 'localhost'
ON CONFLICT (email) DO NOTHING;

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_chat_sessions_updated_at ON chat_sessions;
CREATE TRIGGER update_chat_sessions_updated_at BEFORE UPDATE ON chat_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to clean up old analytics data
CREATE OR REPLACE FUNCTION cleanup_old_analytics(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM analytics 
    WHERE timestamp < NOW() - INTERVAL '1 day' * retention_days;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to get analytics summary
CREATE OR REPLACE FUNCTION get_analytics_summary(
    p_org_id VARCHAR DEFAULT NULL,
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    event_type VARCHAR,
    event_count BIGINT,
    latest_event TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.event_type,
        COUNT(*) as event_count,
        MAX(a.timestamp) as latest_event
    FROM analytics a
    WHERE (p_org_id IS NULL OR a.org_id = p_org_id)
        AND a.timestamp > NOW() - INTERVAL '1 day' * p_days
    GROUP BY a.event_type
    ORDER BY event_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function to get scan statistics
CREATE OR REPLACE FUNCTION get_scan_statistics(
    p_org_id VARCHAR DEFAULT NULL,
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    total_scans BIGINT,
    avg_score DECIMAL,
    phishing_count BIGINT,
    suspicious_count BIGINT,
    clean_count BIGINT,
    top_domains TEXT[]
) AS $$
DECLARE
    domain_list TEXT[];
BEGIN
    -- Get top 5 domains by scan count
    SELECT ARRAY_AGG(domain ORDER BY scan_count DESC)
    INTO domain_list
    FROM (
        SELECT domain, COUNT(*) as scan_count
        FROM scan_results
        WHERE (p_org_id IS NULL OR org_id = p_org_id)
            AND created_at > NOW() - INTERVAL '1 day' * p_days
            AND domain IS NOT NULL
        GROUP BY domain
        ORDER BY scan_count DESC
        LIMIT 5
    ) top_domains;
    
    RETURN QUERY
    SELECT 
        COUNT(*) as total_scans,
        ROUND(AVG(score::numeric), 3)::DECIMAL as avg_score,
        COUNT(*) FILTER (WHERE label = 'phishing') as phishing_count,
        COUNT(*) FILTER (WHERE label = 'suspicious') as suspicious_count,
        COUNT(*) FILTER (WHERE label = 'clean') as clean_count,
        COALESCE(domain_list, ARRAY[]::TEXT[]) as top_domains
    FROM scan_results
    WHERE (p_org_id IS NULL OR org_id = p_org_id)
        AND created_at > NOW() - INTERVAL '1 day' * p_days;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE analytics IS 'Stores analytics events from the SmartShield system';
COMMENT ON TABLE users IS 'User accounts for authentication and authorization';
COMMENT ON TABLE organizations IS 'Organizations using the SmartShield system';
COMMENT ON TABLE scan_results IS 'Detailed phishing detection scan results';
COMMENT ON TABLE chat_sessions IS 'Chat sessions for user interactions with the AI assistant';

COMMENT ON COLUMN analytics.event_data IS 'JSON data specific to the event type';
COMMENT ON COLUMN analytics.metadata IS 'Additional metadata about the event';
COMMENT ON COLUMN scan_results.snapshot_hash IS 'Unique hash identifying the content snapshot';
COMMENT ON COLUMN scan_results.reasons IS 'Array of reasons why content was flagged';
COMMENT ON COLUMN chat_sessions.messages IS 'Array of chat messages in the session';
