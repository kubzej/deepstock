-- =====================================================
-- Earnings Calendar — precise release/call timestamps
-- Replaces the DATE-only earnings_date/last_earnings_date
-- with TIMESTAMPTZ columns so the UI can show exactly when
-- earnings dropped / the call happens, not just the day.
-- Adds earnings_call_timestamp (new).
--
-- This table is a refreshable cache (refreshed daily by the
-- earnings-alerts cron), not source-of-truth data, so old
-- values are dropped rather than backfilled — run
-- `python -m app.jobs.runner refresh-earnings-calendar-force`
-- after deploying this migration to repopulate all watchlist
-- tickers with real precise timestamps.
-- =====================================================

DROP INDEX IF EXISTS idx_earnings_calendar_date;

ALTER TABLE earnings_calendar
    DROP COLUMN IF EXISTS earnings_date,
    DROP COLUMN IF EXISTS last_earnings_date,
    ADD COLUMN IF NOT EXISTS earnings_timestamp TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS earnings_call_timestamp TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_earnings_timestamp TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_earnings_calendar_timestamp
    ON earnings_calendar(earnings_timestamp);

COMMENT ON COLUMN earnings_calendar.earnings_timestamp IS
    'Precise next earnings release timestamp (yfinance earningsTimestampStart). Nullable when provider omitted it. Date-only strings for the API/frontend are derived from this, not stored separately.';
COMMENT ON COLUMN earnings_calendar.earnings_call_timestamp IS
    'Precise earnings call start timestamp (yfinance earningsCallTimestampStart). Empirically only accurate within roughly +-2 days of the event; further out yfinance returns a generic placeholder unrelated to the real call time. Consumers must gate display by day-window, never trust this at any horizon.';
COMMENT ON COLUMN earnings_calendar.last_earnings_timestamp IS
    'Most recent past earnings_timestamp, captured right before it rolled over to the next future value. Derived from our own previously-stored earnings_timestamp (not a separate yfinance field) to stay consistent with the notification pipeline.';
