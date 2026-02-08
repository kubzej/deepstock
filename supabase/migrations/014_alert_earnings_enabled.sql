-- Add earnings alerts toggle to profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS alert_earnings_enabled boolean DEFAULT true;

COMMENT ON COLUMN profiles.alert_earnings_enabled IS 'Whether to send push notifications for earnings announcements';
