-- Add Marketaux entity match_score/sentiment_score to daily_news_source_items.
-- These were previously discarded by bounded_raw_payload's truncation depth
-- before ever reaching scoring or the prompt (see daily-briefing-fixes plan).

ALTER TABLE daily_news_source_items
    ADD COLUMN IF NOT EXISTS match_score NUMERIC,
    ADD COLUMN IF NOT EXISTS sentiment_score NUMERIC,
    ADD COLUMN IF NOT EXISTS sentiment_label TEXT CHECK (sentiment_label IN ('positive', 'negative', 'neutral'));
