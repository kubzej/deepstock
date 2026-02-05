-- =====================================================
-- Watchlist Enhancements
-- Rozšíření watchlist schématu pro DeepStock
-- =====================================================

-- ============================================
-- 1. WATCHLISTS - přidat description a updated_at
-- ============================================

ALTER TABLE watchlists 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Trigger pro auto-update updated_at
CREATE OR REPLACE FUNCTION update_watchlist_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_watchlist_updated_at ON watchlists;
CREATE TRIGGER trigger_watchlist_updated_at
    BEFORE UPDATE ON watchlists
    FOR EACH ROW
    EXECUTE FUNCTION update_watchlist_timestamp();

-- ============================================
-- 2. WATCHLIST_ITEMS - rozšířit o targets a sector
-- ============================================

-- Přejmenovat target_price na target_sell_price
ALTER TABLE watchlist_items 
RENAME COLUMN target_price TO target_sell_price;

-- Přidat nové sloupce
ALTER TABLE watchlist_items
ADD COLUMN IF NOT EXISTS target_buy_price DECIMAL(18, 4),
ADD COLUMN IF NOT EXISTS sector TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Trigger pro auto-update updated_at
DROP TRIGGER IF EXISTS trigger_watchlist_item_updated_at ON watchlist_items;
CREATE TRIGGER trigger_watchlist_item_updated_at
    BEFORE UPDATE ON watchlist_items
    FOR EACH ROW
    EXECUTE FUNCTION update_watchlist_timestamp();

-- ============================================
-- 3. WATCHLIST_TAGS - uživatelské tagy
-- ============================================

CREATE TABLE IF NOT EXISTS watchlist_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6b7280',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_tags_user ON watchlist_tags(user_id);

-- ============================================
-- 4. WATCHLIST_ITEM_TAGS - M:N vztah
-- ============================================

CREATE TABLE IF NOT EXISTS watchlist_item_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES watchlist_items(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES watchlist_tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(item_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_item_tags_item ON watchlist_item_tags(item_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_item_tags_tag ON watchlist_item_tags(tag_id);

-- ============================================
-- 5. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE watchlist_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_item_tags ENABLE ROW LEVEL SECURITY;

-- Tags: users can manage their own
CREATE POLICY "Users can manage own watchlist tags" ON watchlist_tags
    FOR ALL USING (auth.uid() = user_id);

-- Item tags: via watchlist ownership
CREATE POLICY "Users can manage own watchlist item tags" ON watchlist_item_tags
    FOR ALL USING (
        item_id IN (
            SELECT wi.id FROM watchlist_items wi
            JOIN watchlists w ON wi.watchlist_id = w.id
            WHERE w.user_id = auth.uid()
        )
    );

-- ============================================
-- 6. VIEW: Watchlist Summary (počty položek)
-- ============================================

CREATE OR REPLACE VIEW watchlist_summary AS
SELECT 
    w.id,
    w.user_id,
    w.name,
    w.description,
    w.color,
    w.created_at,
    w.updated_at,
    COUNT(wi.id) AS item_count
FROM watchlists w
LEFT JOIN watchlist_items wi ON w.id = wi.watchlist_id
GROUP BY w.id, w.user_id, w.name, w.description, w.color, w.created_at, w.updated_at;

-- ============================================
-- GRANTS
-- ============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON watchlist_tags TO authenticated;
GRANT SELECT, INSERT, DELETE ON watchlist_item_tags TO authenticated;

