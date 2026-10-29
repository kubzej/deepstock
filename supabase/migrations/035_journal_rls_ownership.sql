-- =====================================================
-- 035: Journal RLS — vynutit vlastnictví
--
-- 019 vytvořila "Authenticated users can read journal_*" (čtení všeho
-- pro jakéhokoliv přihlášeného). Policy se sčítají (OR), takže vlastnické
-- policy z 024 nad nimi nic neomezovaly. journal_entries nemá user_id,
-- vlastnictví se odvozuje přes kanál.
--
-- Backend používá service_role → RLS se na něj neaplikuje.
-- Idempotentní.
-- =====================================================

-- 1. Odstranit široké čtecí policy
DROP POLICY IF EXISTS "Authenticated users can read journal_sections" ON journal_sections;
DROP POLICY IF EXISTS "Authenticated users can read journal_channels" ON journal_channels;
DROP POLICY IF EXISTS "Authenticated users can read journal_entries" ON journal_entries;

-- 2. Vlastnictví záznamů přes jejich kanál
DROP POLICY IF EXISTS "Users can manage own journal_entries" ON journal_entries;
CREATE POLICY "Users can manage own journal_entries"
    ON journal_entries FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM journal_channels c
            WHERE c.id = journal_entries.channel_id
              AND c.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM journal_channels c
            WHERE c.id = journal_entries.channel_id
              AND c.user_id = auth.uid()
        )
    );
