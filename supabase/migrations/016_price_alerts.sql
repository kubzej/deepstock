-- =====================================================
-- Price Alerts
-- Uživatelské cenové alerty s push notifikacemi
-- =====================================================

-- ============================================
-- 1. PRICE_ALERTS - hlavní tabulka
-- ============================================

CREATE TABLE IF NOT EXISTS price_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    
    -- Typ podmínky: price_above, price_below, percent_change_day
    condition_type TEXT NOT NULL CHECK (condition_type IN ('price_above', 'price_below', 'percent_change_day')),
    
    -- Hodnota podmínky (cena nebo procenta)
    condition_value DECIMAL(18, 4) NOT NULL,
    
    -- Stav alertu
    is_enabled BOOLEAN DEFAULT TRUE,
    is_triggered BOOLEAN DEFAULT FALSE,
    triggered_at TIMESTAMPTZ,
    
    -- Opakování po spuštění (false = jednorázový)
    repeat_after_trigger BOOLEAN DEFAULT FALSE,
    
    -- Poznámka uživatele
    notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexy pro rychlé vyhledávání
CREATE INDEX IF NOT EXISTS idx_price_alerts_user ON price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_stock ON price_alerts(stock_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_enabled ON price_alerts(is_enabled) WHERE is_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_price_alerts_active ON price_alerts(user_id, is_enabled, is_triggered) 
    WHERE is_enabled = TRUE AND is_triggered = FALSE;

-- ============================================
-- 2. TRIGGER pro updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_price_alert_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_price_alert_updated_at ON price_alerts;
CREATE TRIGGER trigger_price_alert_updated_at
    BEFORE UPDATE ON price_alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_price_alert_timestamp();

-- ============================================
-- 3. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own alerts
CREATE POLICY "Users can view own price alerts" ON price_alerts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own price alerts" ON price_alerts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own price alerts" ON price_alerts
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own price alerts" ON price_alerts
    FOR DELETE USING (auth.uid() = user_id);

-- Service role can do everything (for cron job)
CREATE POLICY "Service role full access" ON price_alerts
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 4. KOMENTÁŘE
-- ============================================

COMMENT ON TABLE price_alerts IS 'Uživatelské cenové alerty pro push notifikace';
COMMENT ON COLUMN price_alerts.condition_type IS 'price_above = překročí cenu, price_below = klesne pod, percent_change_day = denní změna ±%';
COMMENT ON COLUMN price_alerts.condition_value IS 'Cena v měně akcie nebo procenta (např. 5.0 = 5%)';
COMMENT ON COLUMN price_alerts.repeat_after_trigger IS 'TRUE = opakovat alert po resetu, FALSE = jednorázový';
