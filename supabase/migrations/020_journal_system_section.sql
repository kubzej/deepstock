-- =====================================================
-- Journal — přidání systémové sekce "Akcie"
-- is_system = true chrání sekci před smazáním/přejmenováním (frontend enforcement)
-- =====================================================

ALTER TABLE journal_sections
    ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

-- Vložit systémovou sekci "Akcie" (sort_order = -1 → vždy první defaultně)
INSERT INTO journal_sections (name, is_system, sort_order)
VALUES ('Akcie', TRUE, -1)
ON CONFLICT DO NOTHING;
