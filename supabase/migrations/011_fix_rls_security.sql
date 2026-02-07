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
-- 2. WATCHLIST_SUMMARY - Fix security definer issue
-- ============================================

-- Původní view zobrazovala data VŠECH uživatelů
-- Musíme ji přepsat tak, aby respektovala auth.uid()

DROP VIEW IF EXISTS watchlist_summary;

CREATE OR REPLACE VIEW watchlist_summary 
WITH (security_invoker = true) AS
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
WHERE w.user_id = auth.uid()  -- CRITICAL: Filter by current user
GROUP BY w.id, w.user_id, w.name, w.description, w.color, w.created_at, w.updated_at;

-- Grant access
GRANT SELECT ON watchlist_summary TO authenticated;

-- ============================================
-- 3. ADD COMMENTS pro dokumentaci
-- ============================================

COMMENT ON TABLE stocks IS 'Master data tabulka pro akciové tickery. RLS zapnutá, ale veřejně čitelná pro všechny authenticated uživatele.';
COMMENT ON VIEW watchlist_summary IS 'Agregovaný view watchlistů s počtem položek. Filtrováno podle auth.uid() pro bezpečnost.';
