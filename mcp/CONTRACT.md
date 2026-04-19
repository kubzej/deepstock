# DeepStock MCP Contract

Canonical contract and tool-selection guide for the DeepStock MCP surface.

Maintenance note:

- treat tool names in `mcp/deepstock_mcp.py` as canonical
- keep this document's `## Tool Selection` entries aligned with the README tools table
- if the tool surface changes, update the mirrored Felix invest prompts too

## Design

The MCP surface is intentionally two-layered:

- `get_stock_context` gives the agent a compact cross-domain map of the ticker
- `get_portfolio_context` gives the agent a compact cross-domain map of the portfolio state
- `get_market_context` gives the agent a compact market backdrop
- `list_watchlists` / `get_watchlist_items` give the agent a watchlist-first path
- `*_activity` drilldown tools return full-fidelity transaction detail for the one branch the agent
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
- recent mixed transactions
- open-lot summary

Important:

- leaving `portfolio_id` empty aggregates across all portfolios
- `recent_limit` defaults to 20 and lets the agent ask for a smaller/larger recent window without switching to the full activity drilldown
- holdings still keep `portfolio_id` and `portfolio_name` so the agent does not
  lose portfolio identity inside the aggregate view

### `get_portfolio_activity(portfolio_id?, period, from_date?, to_date?, limit, cursor?)`

Use for full transaction drilldown across stock and option activity after
`get_portfolio_context` is no longer enough.

Returns:

- scope (`all` or one portfolio ID)
- `portfolio_id` and `portfolio_name` when scoped to one portfolio
- mixed `transactions[]`
- paging metadata (`limit`, `cursor`, `next_cursor`, `has_more`)
- applied window metadata (`period`, `from_date`, `to_date`)

Important:

- leaving `portfolio_id` empty aggregates across all portfolios
- `from_date` / `to_date` use `YYYY-MM-DD` and override `period`
- `cursor` uses the previous response `next_cursor` to page older rows

### `get_portfolio_journal_archive(portfolio_id, limit)`

Use when the conversation is about one concrete portfolio and the agent needs
older portfolio-specific notes or AI reports.

Returns preview/index data only:

- resolved `portfolio_id`
- resolved `portfolio_name`
- `reports[]`: report metadata plus preview text
- `notes[]`: note metadata plus preview text

### `get_portfolio_performance(period, portfolio_id?)`

Use when the question is about return over time rather than current holdings.

Returns:

- stock performance time series
- options performance time series
- total return and total return percent

Valid periods:

- `1W`, `1M`, `3M`, `6M`, `MTD`, `YTD`, `1Y`, `ALL`

### `get_market_context()`

Use when the user asks about the broader market regime or wants context around
the portfolio.

Returns:

- Fear & Greed sentiment
- FX rates to CZK
- macro quotes for the same macro tickers tracked in the DeepStock frontend

### `list_watchlists()`

Use first when the user refers to a watchlist by name or wants to talk about
watchlists as collections.

Returns:

- available watchlist IDs
- names and descriptions
- position/order
- item counts

### `get_watchlist_items(watchlist_id)`

Use after `list_watchlists` once one concrete watchlist matters.

Returns:

- resolved `watchlist_id`
- resolved `watchlist_name`
- watchlist `description`
- `items[]` with:
  - `ticker`
  - `stock_name`
  - `target_buy_price`
  - `target_sell_price`
  - `notes`
  - `sector`
  - `added_at`

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
- For watchlist-first conversations, prefer `list_watchlists` and `get_watchlist_items`
  instead of trying to infer collections from this ticker-first payload
- It does not include full note bodies
- It does not include full report markdown
- It does not include full stock/option transaction lists

### `get_stock_journal_archive(ticker, limit)`

Use when the user asks about older ticker-specific thinking, notes, or AI reports.

Returns preview/index data only:

- `reports[]`: report metadata plus preview text
- `notes[]`: note metadata plus preview text

### `get_journal_report_content(report_id)`

Use when a specific AI report needs the full body.

Returns:

- report metadata
- full `content`
- explicit `content_format` (`markdown`)

### `get_journal_note_content(note_id)`

Use when a specific note preview looks relevant and the full note matters.

Returns:

- note metadata
- full `content`
- explicit `content_format` (`plain_text`)

Important:

- stored rich text is normalized to plain text for AI consumption
- this endpoint is for chat context, not UI rendering

### `save_stock_journal_note(ticker, content)`

Use only when the user explicitly wants to save a stock-specific takeaway from
the current single-ticker conversation.

Input:

- `ticker`: target stock symbol
- `content`: final user-approved plain-text note

Returns:

- created entry ID
- resolved stock ticker
- resolved journal channel ID
- saved plain-text `content`
- explicit `content_format` (`plain_text`)
- metadata for the created note

Important:

- This is one of the intentionally narrow MCP write-back tools
- Backend resolves the stock journal channel; the agent does not choose a channel ID
- Content is stored as a normal `note` entry, not as raw transcript
- This should be used only after explicit user approval

### `save_portfolio_journal_note(portfolio_id, content)`

Use only when the user explicitly wants to save a portfolio-specific takeaway
from the current single-portfolio conversation.

Input:

- `portfolio_id`: target portfolio ID
- `content`: final user-approved plain-text note

Returns:

- created entry ID
- resolved portfolio ID
- resolved portfolio name
- resolved journal channel ID
- saved plain-text `content`
- explicit `content_format` (`plain_text`)
- metadata for the created note

Important:

- This is a narrow write-back tool for one concrete portfolio
- Backend resolves the portfolio journal channel; the agent does not choose a channel ID
- Content is stored as a normal `note` entry, not as raw transcript
- This should be used only after explicit user approval

### `get_ticker_activity(ticker, period, from_date?, to_date?, limit, cursor?)`

Use for full trade history and option detail.

Returns:

- `position_summary`
- full mixed `transactions[]`
- `option_summary`
- paging metadata (`limit`, `cursor`, `next_cursor`, `has_more`)
- applied window metadata (`period`, `from_date`, `to_date`)

Each transaction item uses one shared shape with common fields:

- `asset_type`: `stock` or `option`
- `portfolio_id`
- `portfolio_name`
- `executed_at`
- `ticker`

Type-specific fields stay optional on the same item:

- stock rows may include `type`, `shares`, `price_per_share`, `remaining_shares`, `realized_pnl`, `realized_pnl_czk`, `source_transaction_id`
- option rows may include `action`, `option_symbol`, `option_type`, `strike`, `expiration`, `contracts`, `premium`, `position_after`

Important:

- `get_ticker_activity` is transaction-first and should remain available even if live market data are temporarily unavailable
- in that degraded case, `position_summary.market_value` and `position_summary.unrealized_pnl` may be `null`

### `get_technical_history(ticker, period, indicators)`

Use for technical-analysis follow-ups that need more than the compact summary
in `get_stock_context`.

Returns:

- technical summary
- indicator history for the requested period/indicator set

Valid periods:

- `1w`, `1mo`, `3mo`, `6mo`, `1y`, `2y`

Valid indicators:

- `price`, `rsi`, `macd`, `bollinger`, `volume`, `stochastic`, `atr`, `obv`, `adx`, `fibonacci`

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
  "recent_transactions": [
    {
      "asset_type": "stock",
      "portfolio_id": "uuid",
      "portfolio_name": "Main",
      "executed_at": "2026-04-16T10:00:00Z",
      "ticker": "NVDA",
      "type": "BUY",
      "shares": 2,
      "price_per_share": 105.0,
      "currency": "USD",
      "fees": 1.0
    }
  ],
  "open_lots_summary": {
    "count": 0,
    "tickers": []
  }
}
```

## `get_portfolio_activity`

```json
{
  "scope": "all",
  "generated_at": "2026-04-17T10:00:00Z",
  "portfolio_id": null,
  "portfolio_name": null,
  "portfolio_count": 2,
  "period": "custom",
  "from_date": "2026-01-01",
  "to_date": "2026-04-17",
  "limit": 25,
  "cursor": null,
  "next_cursor": "2026-03-28T14:30:00+00:00",
  "has_more": true,
  "transactions": []
}
```

## `get_portfolio_journal_archive`

```json
{
  "portfolio_id": "uuid",
  "portfolio_name": "Main",
  "generated_at": "2026-04-17T10:00:00Z",
  "reports": [
    {
      "id": "uuid",
      "created_at": "2026-04-10T09:00:00Z",
      "report_type": "portfolio_review",
      "model": "claude-sonnet",
      "preview": "Short preview...",
      "content_length": 2400
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

## `get_stock_journal_archive`

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

## `get_journal_report_content`

```json
{
  "id": "uuid",
  "created_at": "2026-04-10T09:00:00Z",
  "report_type": "full_analysis",
  "model": "claude-sonnet",
  "content": "# Full markdown...",
  "content_format": "markdown"
}
```

## `get_journal_note_content`

```json
{
  "id": "uuid",
  "created_at": "2026-04-09T08:00:00Z",
  "updated_at": null,
  "type": "note",
  "content": "Full note body...",
  "content_format": "plain_text",
  "metadata": {}
}
```

## `save_stock_journal_note`

```json
{
  "entry_id": "uuid",
  "ticker": "NVDA",
  "channel_id": "uuid",
  "created_at": "2026-04-17T10:00:00Z",
  "content": "Pulled back into support. Keep watching margins.",
  "content_format": "plain_text",
  "metadata": {
    "ticker": "NVDA",
    "source": "mcp_stock_note",
    "price_at_creation": 110.0
  }
}
```

## `save_portfolio_journal_note`

```json
{
  "entry_id": "uuid",
  "portfolio_id": "uuid",
  "portfolio_name": "Main",
  "channel_id": "uuid",
  "created_at": "2026-04-17T10:00:00Z",
  "content": "Still concentrated in semis. Next adds should improve diversification.",
  "content_format": "plain_text",
  "metadata": {
    "portfolio_id": "uuid",
    "portfolio_name": "Main",
    "source": "mcp_portfolio_note"
  }
}
```

## `get_ticker_activity`

```json
{
  "ticker": "NVDA",
  "generated_at": "2026-04-17T10:00:00Z",
  "period": "YTD",
  "from_date": "2026-01-01",
  "to_date": "2026-04-17",
  "limit": 50,
  "cursor": null,
  "next_cursor": "2026-04-12T10:00:00+00:00",
  "has_more": true,
  "position_summary": {},
  "transactions": [],
  "option_summary": {}
}
```

## Notes On Semantics

- `journal_context.notes[]` and archive `notes[]` are previews, not full note content
- `journal_context.reports[]` and archive `reports[]` are previews, not full report content
- `smart_analysis.valuation_label.tone` is semantic output for AI use, not a frontend class name
- `position_summary.total_cost` is the open-position cost basis in the instrument currency
- `*_context` tools are summary-first; `*_activity` tools are the transaction drilldowns
- `get_portfolio_activity` and `get_ticker_activity` both support `period`, `from_date`, `to_date`, `limit`, and `cursor`
- `get_portfolio_activity` includes `portfolio_id` and `portfolio_name` only for single-portfolio scope, so the response is self-describing in agent/chat flows
- when `from_date` or `to_date` is provided, the activity tools return `period: custom`
- `get_ticker_activity` is the full transaction detail endpoint for one ticker
- `get_portfolio_activity` is the full transaction detail endpoint for one portfolio or all portfolios
- `get_stock_journal_archive` and `get_portfolio_journal_archive` are the scoped journal preview/index tools
- `get_ticker_activity.transactions[]` and `get_portfolio_context.recent_transactions[]` share the same mixed item shape
- `get_ticker_activity` does not depend on live market data for the transaction feed; only live valuation fields inside `position_summary` may be `null`
- `get_journal_report_content` always returns `content_format: markdown`
- `get_journal_note_content` always returns `content_format: plain_text`
- `save_stock_journal_note` accepts plain text, and the backend converts it into stored rich-text HTML while echoing canonical plain text back to the agent
- `save_portfolio_journal_note` accepts plain text, and the backend converts it into stored rich-text HTML while echoing canonical plain text back to the agent
- `get_portfolio_context` defaults to aggregated multi-portfolio scope; holdings and transactions retain portfolio identity
- `get_portfolio_performance` is the analytical layer above transactions, not a raw transaction dump
- `get_market_context` intentionally stays compact: sentiment + FX + macro quotes only
- `market_context` remains richer than the other summary branches because there is no separate MCP market-detail endpoint yet

## Error Semantics

Common tool failures are normalized into descriptive MCP errors:

- not found: missing ticker, note, report, or portfolio in the authenticated user's scope
- invalid input: unsupported period or indicator selection
- authentication failed: MCP server or backend auth misconfiguration
- rate limit hit: retry later
- upstream provider unavailable: market data or backend dependency is temporarily down
- API unreachable or timed out: network or backend availability issue
