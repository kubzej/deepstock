-- =====================================================
-- Journal: Transaction & Option Trade entries
-- Propojení transakcí s journal záznamy
-- =====================================================

-- ============================================
-- 1. Rozšíření CHECK constraintu o nové typy
-- ============================================

ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_type_check;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_type_check
    CHECK (type IN ('note', 'ai_report', 'ext_ref', 'transaction', 'option_trade'));

-- ============================================
-- 2. Linking sloupce s CASCADE delete
-- ============================================

ALTER TABLE journal_entries
    ADD COLUMN IF NOT EXISTS linked_transaction_id UUID
        REFERENCES transactions(id) ON DELETE CASCADE;

ALTER TABLE journal_entries
    ADD COLUMN IF NOT EXISTS linked_option_transaction_id UUID
        REFERENCES option_transactions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_journal_entries_linked_tx
    ON journal_entries(linked_transaction_id)
    WHERE linked_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journal_entries_linked_option_tx
    ON journal_entries(linked_option_transaction_id)
    WHERE linked_option_transaction_id IS NOT NULL;

-- ============================================
-- 3. Backfill — existující stock transakce
-- Všechny transakce, notes = content (prázdný pokud NULL)
-- created_at = executed_at transakce
-- ============================================

INSERT INTO journal_entries (
    channel_id,
    type,
    content,
    metadata,
    linked_transaction_id,
    created_at
)
SELECT
    jc.id,
    'transaction',
    COALESCE(t.notes, ''),
    jsonb_build_object(
        'action',       t.type,
        'shares',       t.shares,
        'price',        t.price_per_share,
        'currency',     t.currency,
        'fees',         t.fees,
        'ticker',       s.ticker,
        'portfolio_id', t.portfolio_id
    ),
    t.id,
    t.executed_at
FROM transactions t
JOIN stocks s ON s.id = t.stock_id
JOIN journal_channels jc ON jc.stock_id = t.stock_id
ON CONFLICT DO NOTHING;

-- ============================================
-- 4. Backfill — existující option transakce
-- ============================================

INSERT INTO journal_entries (
    channel_id,
    type,
    content,
    metadata,
    linked_option_transaction_id,
    created_at
)
SELECT
    jc.id,
    'option_trade',
    COALESCE(ot.notes, ''),
    jsonb_build_object(
        'action',        ot.action,
        'option_type',   ot.option_type,
        'portfolio_id',  ot.portfolio_id,
        'strike',        ot.strike_price,
        'expiration',    ot.expiration_date,
        'contracts',     ot.contracts,
        'premium',       ot.premium,
        'option_symbol', ot.option_symbol,
        'ticker',        ot.symbol
    ),
    ot.id,
    ot.created_at
FROM option_transactions ot
JOIN stocks s ON s.ticker = ot.symbol
JOIN journal_channels jc ON jc.stock_id = s.id
ON CONFLICT DO NOTHING;
