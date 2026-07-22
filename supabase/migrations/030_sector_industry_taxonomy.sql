-- Sector/industry classification cleanup (see alethea plans/deepstock/2026-07-22-sector-industry-classification).
-- 1. Add stocks.industry — companion field to sector for finer-grained diversification.
-- 2. Drop watchlist_items.sector — was a separate duplicate TEXT column (006_watchlist_enhancements.sql)
--    that silently drifted out of sync with stocks.sector. watchlist_items.stock_id is NOT NULL
--    REFERENCES stocks(id), so every watchlist item always has a backing stocks row — sector/industry
--    are now always read via join to stocks, never stored locally on watchlist_items.

ALTER TABLE stocks
    ADD COLUMN IF NOT EXISTS industry TEXT;

ALTER TABLE watchlist_items
    DROP COLUMN IF EXISTS sector;
