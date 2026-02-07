-- =====================================================
-- Migration 013: Push Notifications & Price Alerts
-- =====================================================
-- Adds push subscription storage and price alert tracking

-- ============================================
-- 1. PUSH_SUBSCRIPTIONS - Device push endpoints
-- ============================================
CREATE TABLE push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);

-- ============================================
-- 2. PROFILES - Add notification settings
-- ============================================
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS alert_buy_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS alert_sell_enabled BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN profiles.notifications_enabled IS 'Master toggle for push notifications';
COMMENT ON COLUMN profiles.alert_buy_enabled IS 'Enable alerts when price hits buy target';
COMMENT ON COLUMN profiles.alert_sell_enabled IS 'Enable alerts when price hits sell target';

-- ============================================
-- 3. WATCHLIST_ITEMS - Add alert tracking
-- ============================================
ALTER TABLE watchlist_items
ADD COLUMN IF NOT EXISTS last_buy_alert_price DECIMAL(18, 4),
ADD COLUMN IF NOT EXISTS last_buy_alert_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_sell_alert_price DECIMAL(18, 4),
ADD COLUMN IF NOT EXISTS last_sell_alert_at TIMESTAMPTZ;

COMMENT ON COLUMN watchlist_items.last_buy_alert_price IS 'Target price when last buy alert was sent';
COMMENT ON COLUMN watchlist_items.last_buy_alert_at IS 'When last buy alert was sent';
COMMENT ON COLUMN watchlist_items.last_sell_alert_price IS 'Target price when last sell alert was sent';
COMMENT ON COLUMN watchlist_items.last_sell_alert_at IS 'When last sell alert was sent';

-- ============================================
-- 4. ROW LEVEL SECURITY
-- ============================================
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can manage their own push subscriptions
CREATE POLICY "Users can manage own push subscriptions" ON push_subscriptions
    FOR ALL USING (user_id = auth.uid());

-- Service role can manage all (for sending notifications)
CREATE POLICY "Service role can manage all push subscriptions" ON push_subscriptions
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 5. GRANTS
-- ============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO authenticated;

-- ============================================
-- DONE
-- ============================================
COMMENT ON TABLE push_subscriptions IS 'Web Push API subscription endpoints per device';
