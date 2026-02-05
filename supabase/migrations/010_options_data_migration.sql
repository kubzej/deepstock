-- =====================================================
-- DATA MIGRATION: Portfolio-Tracker → DeepStock Options
-- =====================================================
-- Run this AFTER the schema migration (009_options_trading.sql)
-- 
-- INSTRUCTIONS:
-- 1. Export from Portfolio-Tracker Supabase:
--    SELECT * FROM option_transactions;
--    SELECT * FROM option_prices;
--
-- 2. Adjust portfolio_id mapping (different UUIDs between DBs)
--
-- 3. Insert data using this template
-- =====================================================

-- Sample INSERT for option_transactions
-- Replace with actual data from portfolio-tracker export

/*
INSERT INTO option_transactions (
    id,
    portfolio_id,
    symbol,
    option_symbol,
    option_type,
    strike_price,
    expiration_date,
    action,
    contracts,
    premium,
    currency,
    exchange_rate_to_czk,
    fees,
    date,
    notes,
    linked_stock_tx_id,
    created_at,
    updated_at
) VALUES
-- Example row (adjust values):
(
    'original-uuid-from-pt',           -- Keep original ID or generate new
    'deepstock-portfolio-uuid',        -- Map to correct DeepStock portfolio
    'NU',                              -- symbol
    'NU270115C00017000',               -- option_symbol
    'call',                            -- option_type (lowercase!)
    17.0000,                           -- strike_price
    '2027-01-15',                      -- expiration_date
    'BTO',                             -- action (same format)
    1,                                 -- contracts
    2.8300,                            -- premium
    'USD',                             -- currency
    23.50,                             -- exchange_rate_to_czk
    0,                                 -- fees
    '2025-12-18',                      -- date
    NULL,                              -- notes
    NULL,                              -- linked_stock_tx_id
    NOW(),                             -- created_at
    NOW()                              -- updated_at
);
*/

-- =====================================================
-- PORTFOLIO ID MAPPING
-- =====================================================
-- Find portfolio IDs in both databases:
--
-- Portfolio-Tracker:
-- SELECT id, name FROM portfolios WHERE user_id = '<your-user-id>';
--
-- DeepStock:
-- SELECT id, name FROM portfolios WHERE user_id = '<your-user-id>';
--
-- Create mapping:
-- PT Portfolio ID          → DeepStock Portfolio ID
-- xxxxxxxx-xxxx-xxxx-xxxx → yyyyyyyy-yyyy-yyyy-yyyy
-- =====================================================

-- =====================================================
-- VALIDATION QUERIES (run after migration)
-- =====================================================

-- Check record counts match
-- SELECT 'option_transactions' as table_name, COUNT(*) as count FROM option_transactions;
-- SELECT 'option_prices' as table_name, COUNT(*) as count FROM option_prices;

-- Verify option types are lowercase
-- SELECT DISTINCT option_type FROM option_transactions;

-- Verify actions are correct format
-- SELECT DISTINCT action FROM option_transactions;

-- Check total_premium was calculated correctly
-- SELECT option_symbol, contracts, premium, total_premium, 
--        (contracts * 100 * premium) as expected_total
-- FROM option_transactions
-- WHERE premium IS NOT NULL;

-- Verify holdings view works
-- SELECT * FROM option_holdings;

-- =====================================================
-- ROLLBACK (if needed)
-- =====================================================
-- DELETE FROM option_transactions;
-- DELETE FROM option_prices;
