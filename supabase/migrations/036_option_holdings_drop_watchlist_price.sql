-- =====================================================
-- Migration 036: option_holdings no longer derives underlying price
-- =====================================================
-- The view used watchlist_items.target_buy_price (any user's) as the
-- underlying price. underlying_price, moneyness and buffer_percent are now
-- computed in the backend from cached market quotes; the columns stay in the
-- view as NULL to keep its shape. Column types differ from 034, so the view
-- is dropped and recreated.

DROP VIEW IF EXISTS option_holdings;

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
    NULL::numeric AS underlying_price,
    NULL::timestamptz AS underlying_price_updated_at,
    NULL::text AS underlying_price_source,
    NULL::text AS moneyness,
    NULL::numeric AS buffer_percent
FROM option_summary os
LEFT JOIN option_prices op ON os.option_symbol = op.option_symbol
LEFT JOIN opening_notes onn
    ON os.portfolio_id = onn.portfolio_id
   AND os.option_symbol = onn.option_symbol
WHERE
    (os.position = 'long' AND os.long_contracts > 0) OR
    (os.position = 'short' AND os.short_contracts > 0);

GRANT SELECT ON option_holdings TO authenticated;

COMMENT ON VIEW option_holdings IS
    'Computed open option positions; underlying_price, moneyness and buffer_percent are filled by the backend';
