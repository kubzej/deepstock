-- =====================================================
-- Daily News Briefing
-- First-class daily briefing reports with source audit trail
-- =====================================================

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS alert_daily_news_enabled BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN profiles.alert_daily_news_enabled IS
    'Whether to send push notifications for daily news briefings';

CREATE TABLE IF NOT EXISTS daily_news_briefing_settings (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    include_market_context BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_news_briefing_scope_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('portfolio', 'watchlist')),
    source_id UUID NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, source_type, source_id)
);

CREATE TABLE IF NOT EXISTS daily_news_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'degraded', 'failed')),
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('scheduled', 'manual')),
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    title TEXT,
    summary TEXT,
    markdown TEXT,
    model_used TEXT,
    scope_snapshot JSONB NOT NULL DEFAULT '{}',
    source_counts JSONB NOT NULL DEFAULT '{}',
    warnings JSONB NOT NULL DEFAULT '[]',
    error TEXT,
    notification_status TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, user_id)
);

CREATE TABLE IF NOT EXISTS daily_news_source_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    report_id UUID NOT NULL REFERENCES daily_news_reports(id) ON DELETE CASCADE,
    ticker TEXT,
    scope_type TEXT NOT NULL CHECK (scope_type IN ('holding', 'watchlist', 'market', 'macro', 'sector')),
    scope_priority TEXT CHECK (scope_priority IN ('high', 'medium', 'low')),
    source_type TEXT NOT NULL CHECK (source_type IN ('marketaux', 'edgar', 'deepstock_market')),
    title TEXT NOT NULL,
    snippet TEXT,
    url TEXT,
    source_name TEXT,
    published_at TIMESTAMPTZ,
    relevance_score NUMERIC,
    importance TEXT NOT NULL DEFAULT 'low' CHECK (importance IN ('high', 'medium', 'low', 'noise')),
    used_in_prompt BOOLEAN NOT NULL DEFAULT FALSE,
    dedupe_key TEXT,
    raw_payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (report_id, user_id)
        REFERENCES daily_news_reports(id, user_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_daily_news_settings_enabled
    ON daily_news_briefing_settings(enabled)
    WHERE enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_daily_news_scope_user
    ON daily_news_briefing_scope_items(user_id);

CREATE INDEX IF NOT EXISTS idx_daily_news_reports_user_created
    ON daily_news_reports(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_daily_news_reports_user_status
    ON daily_news_reports(user_id, status);

CREATE INDEX IF NOT EXISTS idx_daily_news_reports_window
    ON daily_news_reports(user_id, window_start DESC, window_end DESC);

CREATE INDEX IF NOT EXISTS idx_daily_news_source_items_report
    ON daily_news_source_items(report_id);

CREATE INDEX IF NOT EXISTS idx_daily_news_source_items_ticker
    ON daily_news_source_items(ticker);

CREATE INDEX IF NOT EXISTS idx_daily_news_source_items_published
    ON daily_news_source_items(published_at DESC);

CREATE INDEX IF NOT EXISTS idx_daily_news_source_items_dedupe
    ON daily_news_source_items(dedupe_key);

CREATE OR REPLACE FUNCTION update_daily_news_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_daily_news_settings_updated_at
    ON daily_news_briefing_settings;
CREATE TRIGGER trigger_daily_news_settings_updated_at
    BEFORE UPDATE ON daily_news_briefing_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_daily_news_timestamp();

DROP TRIGGER IF EXISTS trigger_daily_news_scope_items_updated_at
    ON daily_news_briefing_scope_items;
CREATE TRIGGER trigger_daily_news_scope_items_updated_at
    BEFORE UPDATE ON daily_news_briefing_scope_items
    FOR EACH ROW
    EXECUTE FUNCTION update_daily_news_timestamp();

DROP TRIGGER IF EXISTS trigger_daily_news_reports_updated_at
    ON daily_news_reports;
CREATE TRIGGER trigger_daily_news_reports_updated_at
    BEFORE UPDATE ON daily_news_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_daily_news_timestamp();

DROP TRIGGER IF EXISTS trigger_daily_news_source_items_updated_at
    ON daily_news_source_items;
CREATE TRIGGER trigger_daily_news_source_items_updated_at
    BEFORE UPDATE ON daily_news_source_items
    FOR EACH ROW
    EXECUTE FUNCTION update_daily_news_timestamp();

ALTER TABLE daily_news_briefing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_news_briefing_scope_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_news_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_news_source_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own daily news settings"
    ON daily_news_briefing_settings;
CREATE POLICY "Users can manage own daily news settings"
    ON daily_news_briefing_settings
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to daily news settings"
    ON daily_news_briefing_settings;
CREATE POLICY "Service role full access to daily news settings"
    ON daily_news_briefing_settings
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can manage own daily news scope"
    ON daily_news_briefing_scope_items;
CREATE POLICY "Users can manage own daily news scope"
    ON daily_news_briefing_scope_items
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to daily news scope"
    ON daily_news_briefing_scope_items;
CREATE POLICY "Service role full access to daily news scope"
    ON daily_news_briefing_scope_items
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can manage own daily news reports"
    ON daily_news_reports;
CREATE POLICY "Users can manage own daily news reports"
    ON daily_news_reports
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to daily news reports"
    ON daily_news_reports;
CREATE POLICY "Service role full access to daily news reports"
    ON daily_news_reports
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can manage own daily news sources"
    ON daily_news_source_items;
CREATE POLICY "Users can manage own daily news sources"
    ON daily_news_source_items
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to daily news sources"
    ON daily_news_source_items;
CREATE POLICY "Service role full access to daily news sources"
    ON daily_news_source_items
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON daily_news_briefing_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON daily_news_briefing_scope_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON daily_news_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON daily_news_source_items TO authenticated;

COMMENT ON TABLE daily_news_briefing_settings IS
    'Per-user daily briefing generation settings';
COMMENT ON TABLE daily_news_briefing_scope_items IS
    'Configured portfolios and watchlists included in daily briefing scope';
COMMENT ON TABLE daily_news_reports IS
    'Generated daily briefing reports and lifecycle state';
COMMENT ON TABLE daily_news_source_items IS
    'Bounded source article/filing/market items considered for a daily briefing report';
