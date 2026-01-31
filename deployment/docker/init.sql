-- PostgreSQL initialization script for SHOOTER notification system
-- Creates necessary tables and indexes for optimal performance

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create storage table for key-value data
CREATE TABLE IF NOT EXISTS storage (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at BIGINT NOT NULL,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

-- Create index on updated_at for cleanup operations
CREATE INDEX IF NOT EXISTS idx_storage_updated_at ON storage (updated_at);
CREATE INDEX IF NOT EXISTS idx_storage_created_at ON storage (created_at);

-- Create users table for device management
CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(255) PRIMARY KEY,
    created BIGINT NOT NULL,
    updated BIGINT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create device_tokens table
CREATE TABLE IF NOT EXISTS device_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token VARCHAR(500) NOT NULL UNIQUE,
    user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    registered BIGINT NOT NULL,
    last_seen BIGINT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    platform VARCHAR(50),
    app_version VARCHAR(50),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for device_tokens
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_active ON device_tokens (active);
CREATE INDEX IF NOT EXISTS idx_device_tokens_last_seen ON device_tokens (last_seen);
CREATE INDEX IF NOT EXISTS idx_device_tokens_platform ON device_tokens (platform);

-- Create notifications table for audit trail
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    device_id UUID REFERENCES device_tokens(id) ON DELETE SET NULL,
    title VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,
    sent_at BIGINT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    response_data JSONB DEFAULT '{}'::jsonb,
    retry_count INTEGER DEFAULT 0
);

-- Create indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_sent_at ON notifications (sent_at);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications (status);
CREATE INDEX IF NOT EXISTS idx_notifications_device_id ON notifications (device_id);

-- Create performance_metrics table
CREATE TABLE IF NOT EXISTS performance_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operation VARCHAR(100) NOT NULL,
    storage_name VARCHAR(100) NOT NULL,
    duration INTEGER NOT NULL,
    timestamp BIGINT NOT NULL,
    success BOOLEAN NOT NULL,
    key_size INTEGER,
    value_size INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for performance_metrics
CREATE INDEX IF NOT EXISTS idx_perf_metrics_timestamp ON performance_metrics (timestamp);
CREATE INDEX IF NOT EXISTS idx_perf_metrics_operation ON performance_metrics (operation);
CREATE INDEX IF NOT EXISTS idx_perf_metrics_storage ON performance_metrics (storage_name);
CREATE INDEX IF NOT EXISTS idx_perf_metrics_success ON performance_metrics (success);

-- Create system_logs table
CREATE TABLE IF NOT EXISTS system_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp BIGINT NOT NULL,
    level VARCHAR(20) NOT NULL,
    category VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    context JSONB DEFAULT '{}'::jsonb,
    storage_name VARCHAR(100),
    operation VARCHAR(100),
    duration INTEGER,
    error_data JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for system_logs
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON system_logs (timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs (level);
CREATE INDEX IF NOT EXISTS idx_logs_category ON system_logs (category);
CREATE INDEX IF NOT EXISTS idx_logs_storage ON system_logs (storage_name);

-- Create health_checks table
CREATE TABLE IF NOT EXISTS health_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    storage_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL,
    timestamp BIGINT NOT NULL,
    latency INTEGER,
    error_count INTEGER DEFAULT 0,
    error_rate REAL DEFAULT 0.0,
    details JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for health_checks
CREATE INDEX IF NOT EXISTS idx_health_timestamp ON health_checks (timestamp);
CREATE INDEX IF NOT EXISTS idx_health_storage ON health_checks (storage_name);
CREATE INDEX IF NOT EXISTS idx_health_status ON health_checks (status);

-- Create cleanup function for old data
CREATE OR REPLACE FUNCTION cleanup_old_data() RETURNS void AS $$
BEGIN
    -- Clean up old performance metrics (older than 7 days)
    DELETE FROM performance_metrics 
    WHERE timestamp < EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days') * 1000;
    
    -- Clean up old system logs (older than 30 days)
    DELETE FROM system_logs 
    WHERE timestamp < EXTRACT(EPOCH FROM NOW() - INTERVAL '30 days') * 1000;
    
    -- Clean up old health checks (older than 3 days)
    DELETE FROM health_checks 
    WHERE timestamp < EXTRACT(EPOCH FROM NOW() - INTERVAL '3 days') * 1000;
    
    -- Clean up old notifications (older than 90 days)
    DELETE FROM notifications 
    WHERE sent_at < EXTRACT(EPOCH FROM NOW() - INTERVAL '90 days') * 1000;
    
    -- Update statistics
    ANALYZE performance_metrics;
    ANALYZE system_logs;
    ANALYZE health_checks;
    ANALYZE notifications;
END;
$$ LANGUAGE plpgsql;

-- Create cleanup job (requires pg_cron extension in production)
-- This is commented out as pg_cron is not available in all environments
-- SELECT cron.schedule('cleanup-old-data', '0 2 * * *', 'SELECT cleanup_old_data();');

-- Grant permissions to the application user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO shooter;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO shooter;
GRANT EXECUTE ON FUNCTION cleanup_old_data() TO shooter;

-- Insert initial system health data
INSERT INTO health_checks (storage_name, status, timestamp, latency, details) 
VALUES ('system', 'healthy', EXTRACT(EPOCH FROM NOW()) * 1000, 0, '{"message": "Database initialized successfully"}');

-- Create view for active devices summary
CREATE OR REPLACE VIEW active_devices_summary AS
SELECT 
    user_id,
    COUNT(*) as total_devices,
    COUNT(*) FILTER (WHERE active = true) as active_devices,
    COUNT(*) FILTER (WHERE platform = 'ios') as ios_devices,
    COUNT(*) FILTER (WHERE platform = 'android') as android_devices,
    MAX(last_seen) as last_activity
FROM device_tokens 
GROUP BY user_id;

-- Create view for performance summary
CREATE OR REPLACE VIEW performance_summary AS
SELECT 
    operation,
    storage_name,
    COUNT(*) as total_operations,
    AVG(duration) as avg_duration,
    MIN(duration) as min_duration,
    MAX(duration) as max_duration,
    COUNT(*) FILTER (WHERE success = true) * 100.0 / COUNT(*) as success_rate,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration) as p50_duration,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration) as p95_duration,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration) as p99_duration
FROM performance_metrics 
WHERE timestamp > EXTRACT(EPOCH FROM NOW() - INTERVAL '1 hour') * 1000
GROUP BY operation, storage_name
ORDER BY total_operations DESC;

-- Grant access to views
GRANT SELECT ON active_devices_summary TO shooter;
GRANT SELECT ON performance_summary TO shooter;