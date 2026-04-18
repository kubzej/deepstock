-- =====================================================
-- Journal — portfolio channels for portfolio-level history
-- =====================================================

ALTER TABLE journal_channels
    ADD COLUMN IF NOT EXISTS portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE;

ALTER TABLE journal_channels
    DROP CONSTRAINT IF EXISTS journal_channels_type_check;

ALTER TABLE journal_channels
    DROP CONSTRAINT IF EXISTS chk_stock_channel;

ALTER TABLE journal_channels
    DROP CONSTRAINT IF EXISTS chk_journal_channel_target;

ALTER TABLE journal_channels
    ADD CONSTRAINT journal_channels_type_check
    CHECK (type IN ('stock', 'portfolio', 'custom'));

ALTER TABLE journal_channels
    ADD CONSTRAINT chk_journal_channel_target
    CHECK (
        (type = 'stock' AND stock_id IS NOT NULL AND ticker IS NOT NULL AND portfolio_id IS NULL) OR
        (type = 'portfolio' AND portfolio_id IS NOT NULL AND stock_id IS NULL AND ticker IS NULL) OR
        (type = 'custom' AND stock_id IS NULL AND portfolio_id IS NULL)
    );

CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_channels_portfolio_id_unique
    ON journal_channels(portfolio_id)
    WHERE portfolio_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journal_channels_portfolio_id
    ON journal_channels(portfolio_id);

INSERT INTO journal_sections (name, is_system, sort_order)
SELECT 'Portfolia', TRUE, 0
WHERE NOT EXISTS (
    SELECT 1
    FROM journal_sections
    WHERE name = 'Portfolia' AND is_system = TRUE
);

INSERT INTO journal_channels (type, name, portfolio_id, sort_order, user_id)
SELECT
    'portfolio',
    p.name,
    p.id,
    0,
    p.user_id
FROM portfolios p
WHERE NOT EXISTS (
    SELECT 1
    FROM journal_channels jc
    WHERE jc.portfolio_id = p.id
);
