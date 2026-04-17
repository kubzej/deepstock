# DeepStock MCP Contract

Canonical contract and tool-selection guide for the DeepStock MCP surface.

## Design

The MCP surface is intentionally two-layered:

- `get_stock_context` gives the agent a compact cross-domain map of the ticker
- `get_portfolio_context` gives the agent a compact cross-domain map of the portfolio state
- `get_market_context` gives the agent a compact market backdrop
- drilldown tools return full-fidelity detail for the one branch the agent
  actually needs next

This keeps the first call usable in chat without throwing away access to full
data.

## Tool Selection

### `list_portfolios()`

Use when the user has multiple portfolios or refers to a portfolio by name.

Returns:

- available portfolio IDs
- names/descriptions
- per-portfolio snapshot summary

### `get_portfolio_context(portfolio_id?)`

Use first for conversations about holdings, allocation, exposure, or current
portfolio state.

Returns:

- scope (`all` or one portfolio ID)
- aggregate snapshot
- holdings with portfolio identity
- sector exposure
- recent transactions
- open-lot summary

Important:

- leaving `portfolio_id` empty aggregates across all portfolios
- holdings still keep `portfolio_id` and `portfolio_name` so the agent does not
  lose portfolio identity inside the aggregate view

### `get_portfolio_performance(period, portfolio_id?)`

Use when the question is about return over time rather than current holdings.

Returns:

- stock performance time series
- options performance time series
- total return and total return percent

### `get_market_context()`

Use when the user asks about the broader market regime or wants context around
the portfolio.

Returns:

- Fear & Greed sentiment
- FX rates to CZK
- macro quotes for the same macro tickers tracked in the DeepStock frontend

### `get_stock_context(ticker)`

Use first for almost every ticker conversation.

Returns:

- `ticker_info`: company identity and description
- `journal_context`: note/report counts plus recent previews
- `activity_context`: position summary plus transaction/activity counts
- `watchlist_context`: matching watchlist items
- `market_context`: market fundamentals, valuation, smart analysis, and compact technical summary

Important:

- This is a summary payload, not a full journal dump
- It does not include full note bodies
- It does not include full report markdown
- It does not include full stock/option transaction lists

### `get_research_archive(ticker, limit)`

Use when the user asks about older thinking, older notes, or older AI reports.

Returns preview/index data only:

- `reports[]`: report metadata plus preview text
- `notes[]`: note metadata plus preview text

### `get_report_content(report_id)`

Use when a specific AI report needs the full markdown body.

Returns:

- report metadata
- full `content`

### `get_note_content(note_id)`

Use when a specific note preview looks relevant and the full note matters.

Returns:

- note metadata
- full `content`

### `get_investment_activity(ticker)`

Use for full trade history and option detail.

Returns:

- `position_summary`
- full `stock_transactions[]`
- `option_summary`
- full `option_transactions[]`

### `get_technical_history(ticker, period, indicators)`

Use for technical-analysis follow-ups that need more than the compact summary
in `get_stock_context`.

Returns:

- technical summary
- indicator history for the requested period/indicator set

## Response Shape

## `list_portfolios`

```json
{
  "generated_at": "2026-04-17T10:00:00Z",
  "portfolio_count": 2,
  "portfolios": [
    {
      "id": "uuid",
      "name": "Main",
      "description": null,
      "snapshot": {
        "total_value_czk": 100000,
        "total_cost_czk": 90000,
        "total_pnl_czk": 10000,
        "total_pnl_percent": 11.11,
        "daily_change_czk": 500,
        "daily_change_percent": 0.5
      }
    }
  ]
}
```

## `get_portfolio_context`

```json
{
  "scope": "all",
  "generated_at": "2026-04-17T10:00:00Z",
  "portfolio_count": 2,
  "portfolios": [],
  "aggregate_snapshot": {},
  "holdings": [],
  "sector_exposure": [],
  "recent_transactions": [],
  "open_lots_summary": {
    "count": 0,
    "tickers": []
  }
}
```

## `get_portfolio_performance`

```json
{
  "scope": "all",
  "generated_at": "2026-04-17T10:00:00Z",
  "period": "1Y",
  "stock_performance": {
    "total_return": 12345.67,
    "total_return_pct": 14.2,
    "benchmark_return_pct": null,
    "data": []
  },
  "options_performance": {
    "total_return": 4500,
    "total_return_pct": 0,
    "benchmark_return_pct": null,
    "data": []
  }
}
```

## `get_market_context`

```json
{
  "generated_at": "2026-04-17T10:00:00Z",
  "sentiment": {
    "score": 68.2,
    "rating": "Greed",
    "previous_close": 64.1,
    "previous_week": 58.0,
    "previous_month": 47.5,
    "previous_year": 71.2
  },
  "fx": {
    "rates_to_czk": {
      "USD": 23.45,
      "EUR": 25.1,
      "GBP": 29.8,
      "CZK": 1.0
    }
  },
  "macro_quotes": []
}
```

## `get_stock_context`

```json
{
  "ticker": "NVDA",
  "generated_at": "2026-04-17T10:00:00Z",
  "ticker_info": {},
  "journal_context": {
    "note_count": 0,
    "report_count": 0,
    "latest_note_at": null,
    "latest_report_at": null,
    "has_more_notes": false,
    "has_more_reports": false,
    "notes": [],
    "reports": []
  },
  "activity_context": {
    "position_summary": {},
    "stock_transaction_count": 0,
    "latest_stock_transaction_at": null,
    "has_more_stock_transactions": false,
    "option_summary": {},
    "option_transaction_count": 0,
    "latest_option_transaction_at": null,
    "has_more_option_transactions": false
  },
  "watchlist_context": {
    "count": 0,
    "items": []
  },
  "market_context": {
    "fundamentals": {},
    "historical_financials": {},
    "valuation": {},
    "smart_analysis": {},
    "technicals": {
      "summary": {}
    }
  }
}
```

## `get_research_archive`

```json
{
  "ticker": "NVDA",
  "generated_at": "2026-04-17T10:00:00Z",
  "reports": [
    {
      "id": "uuid",
      "created_at": "2026-04-10T09:00:00Z",
      "report_type": "full_analysis",
      "model": "claude-sonnet",
      "preview": "Short preview...",
      "content_length": 8421
    }
  ],
  "notes": [
    {
      "id": "uuid",
      "created_at": "2026-04-09T08:00:00Z",
      "updated_at": null,
      "type": "note",
      "preview": "Short preview...",
      "metadata": {}
    }
  ]
}
```

## `get_report_content`

```json
{
  "id": "uuid",
  "created_at": "2026-04-10T09:00:00Z",
  "report_type": "full_analysis",
  "model": "claude-sonnet",
  "content": "# Full markdown..."
}
```

## `get_note_content`

```json
{
  "id": "uuid",
  "created_at": "2026-04-09T08:00:00Z",
  "updated_at": null,
  "type": "note",
  "content": "<p>Full note body...</p>",
  "metadata": {}
}
```

## `get_investment_activity`

```json
{
  "ticker": "NVDA",
  "generated_at": "2026-04-17T10:00:00Z",
  "position_summary": {},
  "stock_transactions": [],
  "option_summary": {},
  "option_transactions": []
}
```

## Notes On Semantics

- `journal_context.notes[]` and archive `notes[]` are previews, not full note content
- `journal_context.reports[]` and archive `reports[]` are previews, not full report content
- `position_summary.total_cost` is the open-position cost basis in the instrument currency
- `get_investment_activity` is the full transaction detail endpoint
- `get_portfolio_context` defaults to aggregated multi-portfolio scope; holdings and transactions retain portfolio identity
- `get_portfolio_performance` is the analytical layer above transactions, not a raw transaction dump
- `get_market_context` intentionally stays compact: sentiment + FX + macro quotes only
- `market_context` remains richer than the other summary branches because there is no separate MCP market-detail endpoint yet
