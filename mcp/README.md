# DeepStock MCP Server

Exposes DeepStock research data as tools for Claude Code, Cursor, Claude.ai, or any MCP-compatible client.

Primary use case: conversational investing chat with personal DeepStock data in online clients such as Claude.ai, ChatGPT, or Perplexity. This is not meant to be a broad app-integration surface. The write-back scope stays intentionally narrow: explicit note saves only.

## Tools

| Tool                            | Description                                                                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_portfolios`               | List available portfolios and their snapshot summaries                                                                                               |
| `get_portfolio_context`         | Current holdings/snapshot context for all portfolios or one selected portfolio, plus configurable recent mixed activity                              |
| `get_portfolio_activity`        | Full mixed stock/options transaction drilldown for all portfolios or one selected portfolio                                                          |
| `get_portfolio_journal_archive` | Portfolio-specific note/report previews for one selected portfolio                                                                                   |
| `get_portfolio_performance`     | Historical stock/options performance for all portfolios or one selected portfolio; period: `1W`, `1M`, `3M`, `6M`, `MTD`, `YTD`, `1Y`, `ALL`         |
| `get_market_context`            | Fear & Greed, FX rates, and the macro tickers tracked in DeepStock market overview                                                                   |
| `list_watchlists`               | List available watchlists with names, descriptions, ordering, and item counts                                                                        |
| `get_watchlist_items`           | Read one concrete watchlist with its stocks, buy/sell targets, notes, sector, and added date                                                        |
| `get_stock_context`             | Default first call — lean ticker summary across journal, activity, watchlist, and market                                                             |
| `get_technical_history`         | Detailed indicator history with AI-friendly typed inputs: period `1w`-`2y`, indicators as a list                                                     |
| `get_stock_journal_archive`     | Report and note previews for a ticker journal                                                                                                        |
| `get_journal_report_content`    | Full journal AI report content by ID, with explicit `content_format="markdown"`                                                                      |
| `get_journal_note_content`      | Full journal note content by ID, normalized to AI-friendly plain text with `content_format="plain_text"`                                             |
| `save_stock_journal_note`       | Save a user-approved plain-text note into the stock journal for one ticker; response echoes canonical plain-text content                             |
| `save_portfolio_journal_note`   | Save a user-approved plain-text note into the journal for one portfolio; response echoes canonical plain-text content                                |
| `get_ticker_activity`           | Full mixed stock/options transaction drilldown for one ticker, with period/custom-range filters and cursor paging; live valuation fields may be null |

See [CONTRACT.md](CONTRACT.md) for response shapes, field semantics, and tool-selection guidance.

## Maintenance

The MCP tool names in [deepstock_mcp.py](deepstock_mcp.py) are a public contract for external agents.

When you add, remove, rename, or significantly repurpose a tool, update these together in the same change:

- `backend/app/api/endpoints/mcp.py`
- `backend/app/services/research_context.py` and any split `research_context_*` domain services
- `backend/app/schemas/mcp.py` and any split `mcp_*` schema modules
- `mcp/deepstock_mcp.py`
- `mcp/CONTRACT.md`
- `mcp/README.md`
- `../felix/.agents/skills/felix-invest/SKILL.md`
- `../felix/.claude/commands/felix.invest.md`

Keep the tool inventory aligned in three places:

- function names decorated with `@mcp.tool()` in `deepstock_mcp.py`
- the tools table in this README
- the `## Tool Selection` sections in `CONTRACT.md`

---

## Setup: Local (Docker)

The MCP server runs as a Docker container alongside the backend.

```bash
docker compose up deepstock-mcp
```

Add to `.mcp.json` in your client project (e.g. the Felix repo):

```json
{
  "mcpServers": {
    "deepstock": {
      "url": "http://localhost:8001/mcp"
    }
  }
}
```

Restart your MCP client (Claude Code / Cursor). Verify: ask the client to call `get_stock_context("AAPL")`.

---

## Setup: Remote (Railway)

The MCP server is deployed as a Railway service. No local clone needed.

Add to `.mcp.json` in your client project:

```json
{
  "mcpServers": {
    "deepstock": {
      "url": "https://<your-mcp-service>.railway.app/mcp"
    }
  }
}
```

For Claude.ai (web or mobile): add the URL directly in Claude.ai Project settings → MCP servers.

---

## Environment variables

Set in Railway dashboard (remote) or `backend/.env` (local Docker — shared with backend):

| Variable                    | Description                                                                  |
| --------------------------- | ---------------------------------------------------------------------------- |
| `SUPABASE_URL`              | Supabase project URL                                                         |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key                                                    |
| `SUPABASE_JWT_SECRET`       | Supabase JWT secret                                                          |
| `DEEPSTOCK_API_URL`         | Backend URL — `http://backend:8000` (Docker) or Railway backend URL (remote) |

---

## Troubleshooting

**Tools don't appear after config change** — MCP client loads at startup. Restart Claude Code / Cursor.

**`SUPABASE_SERVICE_ROLE_KEY and SUPABASE_JWT_SECRET must be set`** — env vars missing.

**`No users found in Supabase project`** — service role key doesn't match the Supabase URL.

**Connection refused on `http://localhost:8001`** — MCP container isn't running. Run `docker compose up deepstock-mcp`.

## Error behavior

The MCP server normalizes backend and network failures into chat-friendly tool errors:

- not found: the requested ticker, note, report, or portfolio does not exist for the authenticated user
- invalid input: unsupported period or indicator selection
- auth failed: MCP server misconfiguration or invalid backend auth
- rate limit hit: retry later
- upstream provider unavailable: market data provider or backend dependency is temporarily down
- API unreachable / timed out: backend or network problem between MCP and DeepStock API

See [CONTRACT.md](CONTRACT.md) for field semantics and content-format rules.
