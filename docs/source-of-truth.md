# DeepStock — Source-of-Truth Map

Where authoritative domain truths live. If you need to read or change logic for a given domain, start here.

---

## Holdings (stocks)

**File:** `backend/app/services/portfolio.py`
**Functions:** `get_holdings(portfolio_id)`, `get_all_holdings(user_id)`
**DB table:** `holdings`

A holding is the aggregated state of a position for one ticker in one portfolio: share count, total cost, amount invested in CZK, realized P/L. Values are recalculated after every transaction via `_recalculate_holding()`. The frontend never assembles holding data — it reads it directly from the backend.

---

## Portfolio snapshot

**File:** `backend/app/services/portfolio.py`
**Model:** `PortfolioSnapshot` (line 53)
**Function:** `get_portfolio_snapshot(portfolio_id, user_id)`

Live portfolio overview in CZK: total value, total cost, unrealized P/L, daily change. Computed from holdings + live quotes + exchange rates — always on demand, not cached. `portfolio_id=None` returns an aggregate across all user portfolios.

Fields: `total_value_czk`, `total_cost_czk`, `total_pnl_czk`, `total_pnl_percent`, `daily_change_czk`, `daily_change_percent`.

---

## Stock accounting (cost basis, realized P/L)

**File:** `backend/app/services/portfolio_accounting.py`
**Function:** `calculate_stock_holding_totals(transactions)`

Lot-based accounting for stocks. Defines canonical rules:
- **BUY**: cost basis = gross amount + fees (fee-inclusive)
- **SELL**: consumes buy lots FIFO (or via `source_transaction_id` for direct lot matching); realized P/L = proceeds − cost basis of the matched lot

This layer is the source of truth for cost basis and realized P/L. Other layers (holdings, performance) must respect it, not reimplement it.

---

## Options accounting

**File:** `backend/app/services/options_accounting.py`
**Function:** `calculate_option_accounting(transactions)`
**Output:** `OptionAccountingResult` — holding snapshot + realized events + open lots

Lot-based accounting for options. Analogous structure to stock accounting but different economic semantics (premium, contracts, LONG/SHORT positions). Realized events are in `OptionRealizedEvent`. Canonical layer for option cost basis and realized P/L.

---

## Performance (historical)

**File:** `backend/app/services/performance.py`
**Functions:** `get_stock_performance(user_id, portfolio_id, period)`, `get_options_performance(...)`
**Model:** `PerformanceResult` → list of `PerformancePoint(date, value, invested)`

Reconstructs daily portfolio value from transactions and historical prices (yfinance). Cached in Redis. **Note:** the performance layer has its own invested/value reconstruction logic — must be monitored for drift against `portfolio_accounting.py`. When accounting semantics change, check both places.

---

## Transactions

**DB table:** `transactions`
**File:** `backend/app/api/endpoints/portfolio.py`
**Endpoints:** `GET /portfolios/all/transactions`, `GET /portfolios/{id}/transactions`, `POST /portfolios/{id}/transactions`, `PUT /portfolios/{id}/transactions/{tx_id}`, `DELETE /portfolios/{id}/transactions/{tx_id}`

Transactions are the primary input data — holdings and performance are derived from them. Every transaction belongs to a portfolio and must be filtered by `user_id` (backend uses service role, RLS is not active).

---

## What's not here

- **Settlement (stock-option)** — no clearly defined domain layer yet; intentionally omitted
- **Market data (quotes, technical indicators)** — not a project domain truth; authoritative source is yfinance via `backend/app/services/market/`
