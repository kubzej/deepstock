-- =====================================================
-- Price Alert Groups
-- Umožňuje propojit alerty do skupin (např. cenové pásmo)
-- =====================================================

-- Přidat group_id sloupec pro propojení alertů
ALTER TABLE price_alerts 
ADD COLUMN IF NOT EXISTS group_id UUID;

-- Index pro rychlé vyhledávání skupin
CREATE INDEX IF NOT EXISTS idx_price_alerts_group ON price_alerts(group_id) 
WHERE group_id IS NOT NULL;

-- Komentář
COMMENT ON COLUMN price_alerts.group_id IS 'UUID pro propojení alertů do skupiny (např. cenové pásmo nad+pod)';
