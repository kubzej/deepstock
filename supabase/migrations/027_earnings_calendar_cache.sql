-- =====================================================
-- Earnings Calendar
-- Persisted next earnings dates per stock ticker
-- =====================================================

CREATE TABLE IF NOT EXISTS earnings_calendar (
    stock_id UUID PRIMARY KEY REFERENCES stocks(id) ON DELETE CASCADE,
    earnings_date DATE,
    source TEXT NOT NULL DEFAULT 'yfinance_info',
    source_payload JSONB,
    last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_earnings_calendar_date
    ON earnings_calendar(earnings_date);

CREATE INDEX IF NOT EXISTS idx_earnings_calendar_checked
    ON earnings_calendar(last_checked_at);

CREATE OR REPLACE FUNCTION update_earnings_calendar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_earnings_calendar_updated_at
    ON earnings_calendar;

CREATE TRIGGER trigger_earnings_calendar_updated_at
    BEFORE UPDATE ON earnings_calendar
    FOR EACH ROW
    EXECUTE FUNCTION update_earnings_calendar_timestamp();

ALTER TABLE earnings_calendar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view earnings calendar" ON earnings_calendar
    FOR SELECT USING (TRUE);

CREATE POLICY "Service role full access on earnings calendar" ON earnings_calendar
    FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE earnings_calendar IS
    'Next earnings dates per stock, refreshed by backend jobs';
COMMENT ON COLUMN earnings_calendar.earnings_date IS
    'Next known earnings date for the stock, nullable when unavailable';
COMMENT ON COLUMN earnings_calendar.source IS
    'Upstream source used for the latest refresh';
COMMENT ON COLUMN earnings_calendar.source_payload IS
    'Optional raw provider payload or metadata for debugging future source changes';
