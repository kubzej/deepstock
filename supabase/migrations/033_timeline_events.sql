-- =====================================================
-- Timeline events
-- Immutable, user-scoped event history for the Timeline screen.
-- =====================================================

CREATE TABLE IF NOT EXISTS timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (
        event_type IN ('daily_briefing', 'earnings', 'option_expiry')
    ),
    event_date DATE NOT NULL,
    sort_order SMALLINT NOT NULL DEFAULT 100,
    sort_key TEXT NOT NULL DEFAULT '',
    source_key TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    briefing_report_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT timeline_events_unique_source
        UNIQUE (user_id, event_type, source_key),

    CONSTRAINT timeline_events_briefing_report_fk
        FOREIGN KEY (briefing_report_id, user_id)
        REFERENCES daily_news_reports(id, user_id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_timeline_events_user_date
    ON timeline_events(user_id, event_date DESC, sort_order ASC, sort_key ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_timeline_events_user_type
    ON timeline_events(user_id, event_type, event_date DESC);

ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to timeline events"
    ON timeline_events;
CREATE POLICY "Service role full access to timeline events"
    ON timeline_events
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.timeline_events TO service_role;

COMMENT ON TABLE timeline_events IS
    'Immutable user-scoped event history displayed by the Timeline screen';
COMMENT ON COLUMN timeline_events.event_date IS
    'Calendar date on which the event is displayed in Timeline';
COMMENT ON COLUMN timeline_events.sort_order IS
    'Stable type ordering within one calendar day';
COMMENT ON COLUMN timeline_events.sort_key IS
    'Stable alphabetical ordering within one event type';
COMMENT ON COLUMN timeline_events.source_key IS
    'Stable source identity used to make event creation idempotent';
COMMENT ON COLUMN timeline_events.metadata IS
    'Type-specific event data needed for display or detail navigation';
