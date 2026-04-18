# DeepStock MCP Server

Exposes DeepStock research data as tools for Claude Code, Cursor, Claude.ai, or any MCP-compatible client.

## Tools

| Tool | Description |
|---|---|
| `list_portfolios` | List available portfolios and their snapshot summaries |
| `get_portfolio_context` | Current holdings/snapshot context for all portfolios or one selected portfolio |
| `get_portfolio_performance` | Historical stock/options performance for all portfolios or one selected portfolio |
| `get_market_context` | Fear & Greed, FX rates, and the macro tickers tracked in DeepStock market overview |
| `get_stock_context` | Default first call — lean ticker summary across journal, activity, watchlist, and market |
| `get_technical_history` | Detailed indicator history (RSI, MACD, Bollinger, ADX, Fibonacci, …) |
| `get_research_archive` | Report and note previews for a ticker |
| `get_report_content` | Full markdown content of a specific report by ID |
| `get_note_content` | Full content of a specific journal note by ID |
| `save_stock_journal_note` | Save a user-approved plain-text note into the stock journal for one ticker |
| `save_portfolio_journal_note` | Save a user-approved plain-text note into the journal for one portfolio |
| `get_investment_activity` | Transaction history, cost basis, open option positions |

See [CONTRACT.md](CONTRACT.md) for response shapes, field semantics, and tool-selection guidance.

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

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `SUPABASE_JWT_SECRET` | Supabase JWT secret |
| `DEEPSTOCK_API_URL` | Backend URL — `http://backend:8000` (Docker) or Railway backend URL (remote) |

---

## Troubleshooting

**Tools don't appear after config change** — MCP client loads at startup. Restart Claude Code / Cursor.

**`SUPABASE_SERVICE_ROLE_KEY and SUPABASE_JWT_SECRET must be set`** — env vars missing.

**`No users found in Supabase project`** — service role key doesn't match the Supabase URL.

**Connection refused on `http://localhost:8001`** — MCP container isn't running. Run `docker compose up deepstock-mcp`.
