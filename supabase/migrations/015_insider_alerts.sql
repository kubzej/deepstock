-- =====================================================
-- Migration 015: Insider Trade Alerts
-- =====================================================
-- Adds insider trade notification settings and tracking

-- 1. PROFILES - Add insider alert settings
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS alert_insider_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS insider_min_value INTEGER DEFAULT 100000,
ADD COLUMN IF NOT EXISTS last_insider_check_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.alert_insider_enabled IS 'Enable push notifications for insider trades';
COMMENT ON COLUMN profiles.insider_min_value IS 'Minimum trade value in USD to trigger notification';
COMMENT ON COLUMN profiles.last_insider_check_at IS 'Timestamp of last insider alert check for this user';
