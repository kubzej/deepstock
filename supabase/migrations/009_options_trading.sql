-- =====================================================
-- Migration: Options Trading Support for DeepStock
-- =====================================================
-- REPLACES old option_trades with portfolio-tracker compatible schema
-- Supports: BTO, STC, STO, BTC, EXPIRATION, ASSIGNMENT, EXERCISE
-- =====================================================

-- 1. DROP OLD SCHEMA (DeepStock had different structure)
-- =====================================================
DROP TABLE IF EXISTS option_trades CASCADE;
DROP TYPE IF EXISTS option_action CASCADE;
DROP TYPE IF EXISTS option_type CASCADE;

-- 2. CREATE ENUMs (portfolio-tracker compatible - lowercase)
-- =====================================================
CREATE TYPE option_type AS ENUM ('call', 'put');

CREATE TYPE option_action AS ENUM (
    'BTO',        -- Buy to Open (Long)
    'STC',        -- Sell to Close
    'STO',        -- Sell to Open (Short)
    'BTC',        -- Buy to Close
    'EXPIRATION', -- Opce vypršela bezcenná
    'ASSIGNMENT', -- Přiřazení (ITM) - short byl assigned
    'EXERCISE'    -- Vlastník využil právo - long exercised
);

-- 3. OPTION_TRANSACTIONS TABLE
-- =====================================================
CREATE TABLE option_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    
    -- Identifikace opce
    symbol VARCHAR(20) NOT NULL,                    -- Ticker podkladu (AAPL, TSLA)
    option_symbol VARCHAR(30) NOT NULL,             -- OCC formát (AAPL250117C00150000)
    option_type option_type NOT NULL,               -- call / put
    strike_price DECIMAL(15, 4) NOT NULL,           -- Realizační cena
    expiration_date DATE NOT NULL,                  -- Datum expirace
    
    -- Transakce
    action option_action NOT NULL,                  -- BTO, STC, STO, BTC, EXPIRATION, ASSIGNMENT, EXERCISE
    contracts INTEGER NOT NULL CHECK (contracts > 0), -- Počet kontraktů (vždy kladné)
    premium DECIMAL(15, 4),                         -- Cena za akcii (může být NULL u EXPIRATION)
    total_premium DECIMAL(15, 4),                   -- contracts × 100 × premium (auto-calculated)
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    exchange_rate_to_czk DECIMAL(10, 4),            -- USD/CZK rate at transaction time
    fees DECIMAL(15, 4) DEFAULT 0,
    date DATE NOT NULL,                             -- Datum provedení
    notes TEXT,
    
    -- Propojení s akciovou transakcí (při ASSIGNMENT/EXERCISE)
    linked_stock_tx_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. OPTION_PRICES TABLE (cache for Greeks + prices)
-- =====================================================
CREATE TABLE option_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    option_symbol VARCHAR(30) NOT NULL UNIQUE,      -- OCC formát
    
    -- Ceny
    price DECIMAL(15, 4),                           -- Aktuální cena (mid)
    bid DECIMAL(15, 4),
    ask DECIMAL(15, 4),
    
    -- Objem
    volume INTEGER,
    open_interest INTEGER,
    
    -- Volatilita a Greeks
    implied_volatility DECIMAL(10, 4),
    delta DECIMAL(10, 6),
    gamma DECIMAL(10, 6),
    theta DECIMAL(10, 6),
    vega DECIMAL(10, 6),
    
    -- Metadata
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. INDEXES
-- =====================================================
CREATE INDEX idx_option_tx_portfolio ON option_transactions(portfolio_id);
CREATE INDEX idx_option_tx_symbol ON option_transactions(symbol);
CREATE INDEX idx_option_tx_option_symbol ON option_transactions(option_symbol);
CREATE INDEX idx_option_tx_date ON option_transactions(date DESC);
CREATE INDEX idx_option_tx_expiration ON option_transactions(expiration_date);
CREATE INDEX idx_option_prices_symbol ON option_prices(option_symbol);

-- 6. TRIGGER pro auto-výpočet total_premium
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_option_total_premium()
RETURNS TRIGGER AS $$
BEGIN
    -- total_premium = contracts × 100 × premium
    IF NEW.premium IS NOT NULL THEN
        NEW.total_premium := NEW.contracts * 100 * NEW.premium;
    ELSE
        NEW.total_premium := NULL;
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_option_premium
    BEFORE INSERT OR UPDATE ON option_transactions
    FOR EACH ROW
    EXECUTE FUNCTION calculate_option_total_premium();

-- 7. OPTION_HOLDINGS VIEW
-- =====================================================
-- Vypočítaný pohled aktuálních opčních pozic s Greeks a moneyness
CREATE VIEW option_holdings
WITH (security_invoker = true) AS
WITH option_summary AS (
    SELECT 
        ot.portfolio_id,
        ot.symbol,
        ot.option_symbol,
        ot.option_type,
        ot.strike_price,
        ot.expiration_date,
        
        -- Určení pozice (Long vs Short)
        CASE 
            WHEN SUM(
                CASE 
                    WHEN ot.action IN ('BTO', 'EXERCISE') THEN ot.contracts
                    WHEN ot.action IN ('STC', 'EXPIRATION', 'ASSIGNMENT') THEN -ot.contracts
                    ELSE 0
                END
            ) > 0 THEN 'long'
            WHEN SUM(
                CASE 
                    WHEN ot.action IN ('STO') THEN ot.contracts
                    WHEN ot.action IN ('BTC', 'EXPIRATION', 'ASSIGNMENT') THEN -ot.contracts
                    ELSE 0
                END
            ) > 0 THEN 'short'
            ELSE NULL
        END AS position,
        
        -- Long contracts count
        SUM(
            CASE 
                WHEN ot.action IN ('BTO', 'EXERCISE') THEN ot.contracts
                WHEN ot.action IN ('STC', 'EXPIRATION', 'ASSIGNMENT') AND 
                     EXISTS (SELECT 1 FROM option_transactions ot2 
                             WHERE ot2.option_symbol = ot.option_symbol 
                             AND ot2.portfolio_id = ot.portfolio_id
                             AND ot2.action IN ('BTO', 'EXERCISE')) THEN -ot.contracts
                ELSE 0
            END
        ) AS long_contracts,
        
        -- Short contracts count
        SUM(
            CASE 
                WHEN ot.action = 'STO' THEN ot.contracts
                WHEN ot.action IN ('BTC', 'EXPIRATION', 'ASSIGNMENT') AND
                     EXISTS (SELECT 1 FROM option_transactions ot2 
                             WHERE ot2.option_symbol = ot.option_symbol 
                             AND ot2.portfolio_id = ot.portfolio_id
                             AND ot2.action = 'STO') THEN -ot.contracts
                ELSE 0
            END
        ) AS short_contracts,
        
        -- Průměrná cena pro Long pozice (BTO)
        CASE 
            WHEN SUM(CASE WHEN ot.action = 'BTO' THEN ot.contracts ELSE 0 END) > 0 THEN
                SUM(CASE WHEN ot.action = 'BTO' THEN ot.contracts * ot.premium ELSE 0 END) /
                NULLIF(SUM(CASE WHEN ot.action = 'BTO' THEN ot.contracts ELSE 0 END), 0)
            ELSE NULL
        END AS avg_premium_long,
        
        -- Průměrná cena pro Short pozice (STO)
        CASE 
            WHEN SUM(CASE WHEN ot.action = 'STO' THEN ot.contracts ELSE 0 END) > 0 THEN
                SUM(CASE WHEN ot.action = 'STO' THEN ot.contracts * ot.premium ELSE 0 END) /
                NULLIF(SUM(CASE WHEN ot.action = 'STO' THEN ot.contracts ELSE 0 END), 0)
            ELSE NULL
        END AS avg_premium_short,
        
        -- Celkové náklady/příjmy (cash flow)
        SUM(
            CASE 
                WHEN ot.action IN ('BTO', 'BTC') THEN -ot.total_premium  -- Platím
                WHEN ot.action IN ('STO', 'STC') THEN ot.total_premium   -- Inkasuju
                ELSE 0
            END
        ) AS total_premium_flow,
        
        -- Celkové poplatky
        SUM(COALESCE(ot.fees, 0)) AS total_fees,
        
        -- První a poslední transakce
        MIN(ot.date) AS first_transaction,
        MAX(ot.date) AS last_transaction
        
    FROM option_transactions ot
    GROUP BY 
        ot.portfolio_id,
        ot.symbol,
        ot.option_symbol,
        ot.option_type,
        ot.strike_price,
        ot.expiration_date
),
-- Watchlist prices fallback (if underlying not in portfolio)
watchlist_prices AS (
    SELECT DISTINCT ON (s.ticker)
        s.ticker,
        wi.target_buy_price AS last_price,  -- Use target as fallback
        wi.updated_at AS last_price_updated_at
    FROM watchlist_items wi
    JOIN stocks s ON wi.stock_id = s.id
    WHERE wi.target_buy_price IS NOT NULL
    ORDER BY s.ticker, wi.updated_at DESC NULLS LAST
)
SELECT 
    os.portfolio_id,
    os.symbol,
    os.option_symbol,
    os.option_type,
    os.strike_price,
    os.expiration_date,
    os.position,
    -- Aktuální počet kontraktů
    CASE 
        WHEN os.position = 'long' THEN os.long_contracts
        WHEN os.position = 'short' THEN os.short_contracts
        ELSE 0
    END AS contracts,
    -- Průměrná cena
    CASE 
        WHEN os.position = 'long' THEN os.avg_premium_long
        WHEN os.position = 'short' THEN os.avg_premium_short
        ELSE NULL
    END AS avg_premium,
    -- Celková hodnota pozice (cost basis)
    CASE 
        WHEN os.position = 'long' THEN os.long_contracts * 100 * COALESCE(os.avg_premium_long, 0)
        WHEN os.position = 'short' THEN os.short_contracts * 100 * COALESCE(os.avg_premium_short, 0)
        ELSE 0
    END AS total_cost,
    os.total_fees,
    os.first_transaction,
    os.last_transaction,
    -- Days to Expiration
    os.expiration_date - CURRENT_DATE AS dte,
    -- Aktuální cena opce a Greeks z cache
    op.price AS current_price,
    op.bid,
    op.ask,
    op.implied_volatility,
    op.delta,
    op.gamma,
    op.theta,
    op.vega,
    op.updated_at AS price_updated_at,
    -- Underlying stock price (from holdings or watchlist fallback)
    -- Note: In DeepStock we'll fetch this from API, not from current_prices table
    wp.last_price AS underlying_price,
    wp.last_price_updated_at AS underlying_price_updated_at,
    -- Source of underlying price
    CASE
        WHEN wp.last_price IS NOT NULL THEN 'watchlist'
        ELSE NULL
    END AS underlying_price_source,
    -- Moneyness calculation
    CASE
        WHEN wp.last_price IS NULL THEN NULL
        WHEN os.option_type = 'put' AND wp.last_price < os.strike_price THEN 'ITM'
        WHEN os.option_type = 'put' AND wp.last_price > os.strike_price THEN 'OTM'
        WHEN os.option_type = 'call' AND wp.last_price > os.strike_price THEN 'ITM'
        WHEN os.option_type = 'call' AND wp.last_price < os.strike_price THEN 'OTM'
        ELSE 'ATM'
    END AS moneyness,
    -- Buffer percentage (distance from strike)
    CASE
        WHEN wp.last_price IS NULL OR os.strike_price IS NULL THEN NULL
        WHEN os.option_type = 'put' THEN 
            ROUND(((wp.last_price - os.strike_price) / wp.last_price * 100)::numeric, 2)
        WHEN os.option_type = 'call' THEN 
            ROUND(((os.strike_price - wp.last_price) / wp.last_price * 100)::numeric, 2)
        ELSE NULL
    END AS buffer_percent
FROM option_summary os
LEFT JOIN option_prices op ON os.option_symbol = op.option_symbol
LEFT JOIN watchlist_prices wp ON os.symbol = wp.ticker
WHERE 
    -- Zobrazit pouze otevřené pozice
    (os.position = 'long' AND os.long_contracts > 0) OR
    (os.position = 'short' AND os.short_contracts > 0);

-- 8. ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE option_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE option_prices ENABLE ROW LEVEL SECURITY;

-- Policies pro option_transactions
CREATE POLICY "Users can view own option transactions" ON option_transactions
    FOR SELECT USING (
        portfolio_id IN (
            SELECT id FROM portfolios WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own option transactions" ON option_transactions
    FOR INSERT WITH CHECK (
        portfolio_id IN (
            SELECT id FROM portfolios WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own option transactions" ON option_transactions
    FOR UPDATE USING (
        portfolio_id IN (
            SELECT id FROM portfolios WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own option transactions" ON option_transactions
    FOR DELETE USING (
        portfolio_id IN (
            SELECT id FROM portfolios WHERE user_id = auth.uid()
        )
    );

-- Policies pro option_prices (všichni mohou číst, service role může zapisovat)
CREATE POLICY "Anyone can read option prices" ON option_prices
    FOR SELECT USING (true);

CREATE POLICY "Service role can manage option prices" ON option_prices
    FOR ALL USING (auth.role() = 'service_role');

-- 9. GRANTS
-- =====================================================
GRANT SELECT ON option_holdings TO authenticated;

-- 10. COMMENTS
-- =====================================================
COMMENT ON TABLE option_transactions IS 'Historie všech opčních transakcí (BTO, STC, STO, BTC, EXPIRATION, ASSIGNMENT, EXERCISE)';
COMMENT ON TABLE option_prices IS 'Cache aktuálních cen opcí a Greeks z yfinance';
COMMENT ON VIEW option_holdings IS 'Vypočítané aktuální opční pozice s Greeks, moneyness a buffer';
COMMENT ON COLUMN option_transactions.premium IS 'Cena za jednu akcii (ne za kontrakt). Total = premium × contracts × 100';
COMMENT ON COLUMN option_transactions.linked_stock_tx_id IS 'Reference na akciovou transakci vytvořenou při ASSIGNMENT/EXERCISE';
COMMENT ON COLUMN option_transactions.exchange_rate_to_czk IS 'USD to CZK exchange rate at transaction time for CZK calculations';

-- =====================================================
-- DONE: Options trading schema ready for DeepStock
-- Compatible with portfolio-tracker data structure
-- =====================================================
