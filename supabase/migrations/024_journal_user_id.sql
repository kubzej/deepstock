-- =====================================================
-- 024: Add user_id to journal tables + backfill
--
-- Bezpečné spuštění: všechny příkazy jsou idempotentní.
-- Backend používá service_role klíč → RLS se neaplikuje na backendu.
-- Endpoint filtruje .eq("user_id", user_id) — tento sloupec musí existovat.
-- =====================================================

-- 1. Přidat sloupce (IF NOT EXISTS = bezpečné opakování)
ALTER TABLE journal_sections
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE journal_channels
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Indexy pro rychlé filtrování
CREATE INDEX IF NOT EXISTS idx_journal_sections_user_id ON journal_sections(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_channels_user_id ON journal_channels(user_id);

-- 3. Backfill: přiřadit stávající záznamy vlastníkovi aplikace
UPDATE journal_sections
SET user_id = 'c5e00af6-13b1-42e4-b6e1-f3bf43fc2028'
WHERE user_id IS NULL;

UPDATE journal_channels
SET user_id = 'c5e00af6-13b1-42e4-b6e1-f3bf43fc2028'
WHERE user_id IS NULL;

-- 4. RLS policy: doplnit user-level přístup vedle stávající service_role policy
--    (019 už má "Service role full access" — ta zůstává beze změny)
DROP POLICY IF EXISTS "Authenticated users can manage journal_sections" ON journal_sections;
DROP POLICY IF EXISTS "Users can manage own journal_sections" ON journal_sections;
CREATE POLICY "Users can manage own journal_sections"
    ON journal_sections FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated users can manage journal_channels" ON journal_channels;
DROP POLICY IF EXISTS "Users can manage own journal_channels" ON journal_channels;
CREATE POLICY "Users can manage own journal_channels"
    ON journal_channels FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
