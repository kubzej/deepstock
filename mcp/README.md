# DeepStock MCP Server

Exposes DeepStock research data as tools for Claude Code, Cursor, Claude.ai, or any MCP-compatible client.

Primary use case: conversational investing chat with personal DeepStock data in online clients such as Claude.ai, ChatGPT, or Perplexity. This is not meant to be a broad app-integration surface. The write-back scope stays intentionally narrow: explicit note saves only.

## Tools

| Tool                            | Description                                                                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_portfolios`               | List available portfolios and their snapshot summaries                                                                                               |
| `get_portfolio_context`         | Current holdings/snapshot context for all portfolios or one selected portfolio, plus recent mixed activity; `recent_limit` defaults to 20 and is capped at 50 |
| `get_portfolio_activity`        | Full mixed stock/options transaction drilldown for all portfolios or one selected portfolio                                                          |
| `get_portfolio_journal_archive` | Portfolio-specific note/report previews for one selected portfolio                                                                                   |
| `get_portfolio_performance`     | Historical stock/options performance for all portfolios or one selected portfolio; period: `1W`, `1M`, `3M`, `6M`, `MTD`, `YTD`, `1Y`, `ALL`         |
| `get_market_context`            | Fear & Greed, FX rates, and the macro tickers tracked in DeepStock market overview                                                                   |
| `list_daily_briefings`          | Recent daily briefing reports with status, window, summary, and source counts                                                                        |
| `get_latest_daily_briefing`     | Full latest daily briefing markdown and metadata                                                                                                     |
| `get_daily_briefing`            | Full daily briefing markdown and metadata by report ID                                                                                               |
| `get_daily_briefing_sources`    | Source articles, filings, and market context items behind one briefing, optionally filtered by ticker or importance                                  |
| `list_watchlists`               | List available watchlists with names, descriptions, ordering, and item counts                                                                        |
| `get_watchlist_items`           | Read one concrete watchlist with its stocks, buy/sell targets, notes, sector, industry, and added date                                              |
| `get_stock_context`             | Default first call — lean ticker summary across journal, activity, watchlist, and market; use `journal_context.reports[]` with `get_journal_report_content` and `journal_context.notes[]` with `get_journal_note_content` |
| `get_technical_history`         | Detailed indicator history with AI-friendly typed inputs: period `1w`-`2y`, indicators as a list                                                     |
| `get_stock_journal_archive`     | Report and note previews for a ticker journal; route `reports[].id` to `get_journal_report_content` and `notes[].id` to `get_journal_note_content` |
| `get_journal_report_content`    | Full journal AI report content by ID from preview payloads such as `journal_context.reports[]` or archive `reports[]`, with explicit `content_format="markdown"` |
| `get_journal_note_content`      | Full journal note content by ID from preview payloads such as `journal_context.notes[]` or archive `notes[]`, normalized to AI-friendly plain text with `content_format="plain_text"` |
| `save_stock_journal_note`       | Save a user-approved plain-text note into the stock journal for one ticker; response echoes canonical plain-text content                             |
| `save_portfolio_journal_note`   | Save a user-approved plain-text note into the journal for one portfolio; response echoes canonical plain-text content                                |
| `get_ticker_activity`           | Full mixed stock/options transaction drilldown for one ticker, with period/custom-range filters and cursor paging; live valuation fields may be null |

See [CONTRACT.md](CONTRACT.md) for response shapes, field semantics, and tool-selection guidance.

## Maintenance

The MCP tool names in [deepstock_mcp.py](deepstock_mcp.py) are a public contract for external agents.

When you add, remove, rename, or significantly repurpose a tool, update these together in the same change:

- `backend/app/api/endpoints/mcp.py`
- `backend/app/services/research_context.py` and any split `research_context_*` domain services
- `backend/app/services/daily_news.py` for daily briefing report/source MCP data
- `backend/app/schemas/mcp.py` and any split `mcp_*` schema modules
- `mcp/deepstock_mcp.py`
- `mcp/CONTRACT.md`
- `mcp/README.md`
- `../alethea/alethea-core/agents/shared/specs/investing.md`
- `../alethea/alethea-knowledge/personal/wiki/projects/deepstock/knowledge.md`

Keep the tool inventory aligned in three places:

- function names decorated with `@mcp.tool()` in `deepstock_mcp.py`
- the tools table in this README
- the `## Tool Selection` sections in `CONTRACT.md`

---

## Authentication

This server has no user login of its own: it resolves the (single) DeepStock user via the
Supabase admin API and mints a backend token on their behalf for every request it receives.
Without a gate in front of that, anyone who finds the URL can call any tool — including the
write-back note tools — as you. **`MCP_AUTH_TOKEN` is required** and the server refuses to
start without it.

Generate one once:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Set it as `MCP_AUTH_TOKEN` alongside the other env vars below, then pass it on every request:

- **Claude Code / Cursor (`.mcp.json`)** — send it as a header:

  ```json
  {
    "mcpServers": {
      "deepstock": {
        "url": "http://localhost:8001/mcp",
        "headers": {
          "Authorization": "Bearer <your-token>"
        }
      }
    }
  }
  ```

- **Claude.ai custom connector** — the "Add custom connector" dialog only offers OAuth
  client ID/secret fields here, not a static header, so pass the token as a query param on
  the URL itself instead:

  ```
  https://<your-mcp-service>.railway.app/mcp?token=<your-token>
  ```

  Leave the OAuth fields blank. Treat this URL as a credential (don't paste it anywhere public) —
  rotate `MCP_AUTH_TOKEN` if it ever leaks.

`/health` is exempt (used by Railway's health check) and needs no token.

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
      "url": "http://localhost:8001/mcp",
      "headers": {
        "Authorization": "Bearer <your-token>"
      }
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
      "url": "https://<your-mcp-service>.railway.app/mcp",
      "headers": {
        "Authorization": "Bearer <your-token>"
      }
    }
  }
}
```

For Claude.ai (web or mobile): add the URL directly in Claude.ai Project settings → MCP servers,
with the token baked into the URL as `?token=<your-token>` (see Authentication above).

---

## Environment variables

Set in Railway dashboard (remote) or `backend/.env` (local Docker — shared with backend):

| Variable                    | Description                                                                  |
| --------------------------- | ---------------------------------------------------------------------------- |
| `SUPABASE_URL`              | Supabase project URL                                                         |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key                                                    |
| `SUPABASE_JWT_SECRET`       | Supabase JWT secret                                                          |
| `DEEPSTOCK_API_URL`         | Backend URL — `http://backend:8000` (Docker) or Railway backend URL (remote) |
| `MCP_AUTH_TOKEN`            | Shared secret required on every request (see Authentication above)          |

---

## Troubleshooting

**Tools don't appear after config change** — MCP client loads at startup. Restart Claude Code / Cursor.

**`MCP_AUTH_TOKEN must be set`** — the server refuses to start without it; generate one (see Authentication above).

**`401 Unauthorized` calling a tool** — missing or wrong token: check the `Authorization` header or `?token=` query param matches `MCP_AUTH_TOKEN` exactly.

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
