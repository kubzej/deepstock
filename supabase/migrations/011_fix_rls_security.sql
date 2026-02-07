-- =====================================================
-- Fix RLS Security Issues
-- Oprava bezpečnostních problémů s RLS
-- =====================================================

-- ============================================
-- 1. STOCKS - Enable RLS with public read
-- ============================================

-- Stocks tabulka obsahuje pouze master data (AAPL, MSFT, atd.)
-- bez uživatelských dat, takže je v pořádku být veřejně čitelná
-- ALE musíme explicitně nastavit RLS aby to bylo jasné

ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can read stocks" ON stocks;
DROP POLICY IF EXISTS "No public insert on stocks" ON stocks;
DROP POLICY IF EXISTS "No public update on stocks" ON stocks;
DROP POLICY IF EXISTS "No public delete on stocks" ON stocks;

-- Všichni authenticated uživatelé můžou číst stocks
CREATE POLICY "Anyone can read stocks" ON stocks
    FOR SELECT 
    USING (true);

-- Pouze admin může upravovat stocks (můžete upravit podle potřeby)
-- Pro teď zakážeme všechny write operace pro běžné uživatele
CREATE POLICY "No public insert on stocks" ON stocks
    FOR INSERT 
    WITH CHECK (false);

CREATE POLICY "No public update on stocks" ON stocks
    FOR UPDATE 
    USING (false);

CREATE POLICY "No public delete on stocks" ON stocks
    FOR DELETE 
    USING (false);

-- ============================================
-- 2. WATCHLIST_SUMMARY - Add missing position column
-- ============================================

-- View for aggregated watchlist data with item counts
-- Note: Security is handled by backend which filters by user_id explicitly
-- Backend uses service_role_key, so auth.uid() would be NULL in view

DROP VIEW IF EXISTS watchlist_summary;

CREATE OR REPLACE VIEW watchlist_summary AS
SELECT 
    w.id,
    w.user_id,
    w.name,
    w.description,
    w.color,
    w.position,
    w.created_at,
    w.updated_at,
    COUNT(wi.id) AS item_count
FROM watchlists w
LEFT JOIN watchlist_items wi ON w.id = wi.watchlist_id
GROUP BY w.id, w.user_id, w.name, w.description, w.color, w.position, w.created_at, w.updated_at;

-- Grant access
GRANT SELECT ON watchlist_summary TO authenticated;

-- ============================================
-- 3. ADD COMMENTS pro dokumentaci
-- ============================================

COMMENT ON TABLE stocks IS 'Master data tabulka pro akciové tickery. RLS zapnutá, ale veřejně čitelná pro všechny authenticated uživatele.';
COMMENT ON VIEW watchlist_summary IS 'Agregovaný view watchlistů s počtem položek. Backend explicitně filtruje podle user_id z auth middleware.';
