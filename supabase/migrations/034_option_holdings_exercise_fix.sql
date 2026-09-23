-- =====================================================
-- Migration 034: Correct long-option closing in option_holdings
-- =====================================================
-- EXERCISE closes a long option. It must not be counted as a new long
-- position, otherwise an exercised option remains visible as open.

CREATE OR REPLACE VIEW option_holdings
WITH (security_invoker = true) AS
WITH option_summary AS (
    SELECT
        ot.portfolio_id,
        ot.symbol,
        ot.option_symbol,
        ot.option_type,
        ot.strike_price,
        ot.expiration_date,

        CASE
            WHEN SUM(
                CASE
                    WHEN ot.action = 'BTO' THEN ot.contracts
                    WHEN ot.action IN ('STC', 'EXPIRATION', 'EXERCISE') THEN -ot.contracts
                    ELSE 0
                END
            ) > 0 THEN 'long'
            WHEN SUM(
                CASE
                    WHEN ot.action = 'STO' THEN ot.contracts
                    WHEN ot.action IN ('BTC', 'EXPIRATION', 'ASSIGNMENT') THEN -ot.contracts
                    ELSE 0
                END
            ) > 0 THEN 'short'
            ELSE NULL
        END AS position,

        SUM(
            CASE
                WHEN ot.action = 'BTO' THEN ot.contracts
                WHEN ot.action IN ('STC', 'EXPIRATION', 'EXERCISE') THEN -ot.contracts
                ELSE 0
            END
        ) AS long_contracts,

        SUM(
            CASE
                WHEN ot.action = 'STO' THEN ot.contracts
                WHEN ot.action IN ('BTC', 'EXPIRATION', 'ASSIGNMENT') THEN -ot.contracts
                ELSE 0
            END
        ) AS short_contracts,

        CASE
            WHEN SUM(CASE WHEN ot.action = 'BTO' THEN ot.contracts ELSE 0 END) > 0 THEN
                SUM(CASE WHEN ot.action = 'BTO' THEN ot.contracts * ot.premium ELSE 0 END) /
                NULLIF(SUM(CASE WHEN ot.action = 'BTO' THEN ot.contracts ELSE 0 END), 0)
            ELSE NULL
        END AS avg_premium_long,

        CASE
            WHEN SUM(CASE WHEN ot.action = 'STO' THEN ot.contracts ELSE 0 END) > 0 THEN
                SUM(CASE WHEN ot.action = 'STO' THEN ot.contracts * ot.premium ELSE 0 END) /
                NULLIF(SUM(CASE WHEN ot.action = 'STO' THEN ot.contracts ELSE 0 END), 0)
            ELSE NULL
        END AS avg_premium_short,

        SUM(
            CASE
                WHEN ot.action IN ('BTO', 'BTC') THEN -ot.total_premium
                WHEN ot.action IN ('STO', 'STC') THEN ot.total_premium
                ELSE 0
            END
        ) AS total_premium_flow,

        SUM(COALESCE(ot.fees, 0)) AS total_fees,
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
opening_notes AS (
    SELECT DISTINCT ON (portfolio_id, option_symbol)
        portfolio_id,
        option_symbol,
        notes,
        currency
    FROM option_transactions
    WHERE action IN ('BTO', 'STO')
    ORDER BY portfolio_id, option_symbol, date ASC
),
watchlist_prices AS (
    SELECT DISTINCT ON (s.ticker)
        s.ticker,
        wi.target_buy_price AS last_price,
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
    CASE
        WHEN os.position = 'long' THEN os.long_contracts
        WHEN os.position = 'short' THEN os.short_contracts
        ELSE 0
    END AS contracts,
    CASE
        WHEN os.position = 'long' THEN os.avg_premium_long
        WHEN os.position = 'short' THEN os.avg_premium_short
        ELSE NULL
    END AS avg_premium,
    CASE
        WHEN os.position = 'long' THEN os.long_contracts * 100 * COALESCE(os.avg_premium_long, 0)
        WHEN os.position = 'short' THEN os.short_contracts * 100 * COALESCE(os.avg_premium_short, 0)
        ELSE 0
    END AS total_cost,
    os.total_fees,
    os.first_transaction,
    os.last_transaction,
    os.expiration_date - CURRENT_DATE AS dte,
    onn.notes,
    COALESCE(onn.currency, 'USD') AS currency,
    op.price AS current_price,
    op.bid,
    op.ask,
    op.implied_volatility,
    op.delta,
    op.gamma,
    op.theta,
    op.vega,
    op.updated_at AS price_updated_at,
    wp.last_price AS underlying_price,
    wp.last_price_updated_at AS underlying_price_updated_at,
    CASE
        WHEN wp.last_price IS NOT NULL THEN 'watchlist'
        ELSE NULL
    END AS underlying_price_source,
    CASE
        WHEN wp.last_price IS NULL THEN NULL
        WHEN os.option_type = 'put' AND wp.last_price < os.strike_price THEN 'ITM'
        WHEN os.option_type = 'put' AND wp.last_price > os.strike_price THEN 'OTM'
        WHEN os.option_type = 'call' AND wp.last_price > os.strike_price THEN 'ITM'
        WHEN os.option_type = 'call' AND wp.last_price < os.strike_price THEN 'OTM'
        ELSE 'ATM'
    END AS moneyness,
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
LEFT JOIN opening_notes onn
    ON os.portfolio_id = onn.portfolio_id
   AND os.option_symbol = onn.option_symbol
WHERE
    (os.position = 'long' AND os.long_contracts > 0) OR
    (os.position = 'short' AND os.short_contracts > 0);

COMMENT ON VIEW option_holdings IS
    'Computed open option positions; EXERCISE is treated as a long-position close';
