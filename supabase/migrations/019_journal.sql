-- =====================================================
-- Journal
-- Deník/zápisník pro poznámky k akciím a vlastní kanály
-- =====================================================

-- ============================================
-- 1. JOURNAL_SECTIONS - custom sekce (uživatelsky definované)
-- Sekce "Akcie" je pevná — nevzniká v DB
-- ============================================

CREATE TABLE IF NOT EXISTS journal_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6b7280',
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. JOURNAL_CHANNELS - kanály (stock nebo custom)
-- ============================================

CREATE TABLE IF NOT EXISTS journal_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('stock', 'custom')),
    name TEXT NOT NULL,
    stock_id UUID REFERENCES stocks(id) ON DELETE CASCADE,
    ticker TEXT,
    section_id UUID REFERENCES journal_sections(id) ON DELETE SET NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- stock kanál musí mít stock_id, custom kanál nesmí
    CONSTRAINT chk_stock_channel CHECK (
        (type = 'stock' AND stock_id IS NOT NULL AND ticker IS NOT NULL) OR
        (type = 'custom' AND stock_id IS NULL)
    ),
    -- jeden kanál per stock
    UNIQUE (stock_id)
);

CREATE INDEX IF NOT EXISTS idx_journal_channels_type ON journal_channels(type);
CREATE INDEX IF NOT EXISTS idx_journal_channels_ticker ON journal_channels(ticker);
CREATE INDEX IF NOT EXISTS idx_journal_channels_section ON journal_channels(section_id);

-- ============================================
-- 3. JOURNAL_ENTRIES - záznamy
-- ============================================

CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES journal_channels(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('note', 'ai_report', 'ext_ref')),
    content TEXT NOT NULL DEFAULT '',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_channel ON journal_entries(channel_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_created ON journal_entries(channel_id, created_at DESC);

-- Trigger pro updated_at
CREATE OR REPLACE FUNCTION update_journal_entry_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_journal_entry_updated_at ON journal_entries;
CREATE TRIGGER trigger_journal_entry_updated_at
    BEFORE UPDATE ON journal_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_journal_entry_timestamp();

-- ============================================
-- 4. ROW LEVEL SECURITY
-- Aplikace je single-user, ale RLS zachováme konzistentně
-- journal_sections a journal_channels nemají user_id —
-- přístup řídíme přes service role (backend používá service key)
-- ============================================

ALTER TABLE journal_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

-- Service role má plný přístup (backend)
CREATE POLICY "Service role full access to journal_sections" ON journal_sections
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to journal_channels" ON journal_channels
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to journal_entries" ON journal_entries
    FOR ALL USING (auth.role() = 'service_role');

-- Authenticated users mohou číst (pro případ přímého přístupu)
CREATE POLICY "Authenticated users can read journal_sections" ON journal_sections
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read journal_channels" ON journal_channels
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read journal_entries" ON journal_entries
    FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================
-- 5. GRANTS
-- ============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON journal_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON journal_channels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON journal_entries TO authenticated;

-- ============================================
-- 6. BACKFILL — kanály pro existující akcie
-- ============================================

INSERT INTO journal_channels (type, name, stock_id, ticker, sort_order)
SELECT
    'stock',
    ticker,
    id,
    ticker,
    ROW_NUMBER() OVER (ORDER BY ticker) - 1
FROM stocks
ON CONFLICT (stock_id) DO NOTHING;
