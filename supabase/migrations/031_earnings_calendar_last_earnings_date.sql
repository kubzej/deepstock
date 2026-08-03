-- =====================================================
-- Earnings Calendar — last reported earnings date
-- Lets the UI show "earnings X days ago" for a window
-- after the report, instead of jumping straight to the
-- next future earnings date once it rolls over.
-- =====================================================

ALTER TABLE earnings_calendar
    ADD COLUMN IF NOT EXISTS last_earnings_date DATE;

COMMENT ON COLUMN earnings_calendar.last_earnings_date IS
    'Most recent past earnings_date, captured right before it rolled over to the next future date. Derived from our own previously-stored earnings_date (not a separate yfinance field) to stay consistent with the notification pipeline.';
