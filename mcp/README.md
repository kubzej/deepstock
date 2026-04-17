# DeepStock MCP Server

Exposes DeepStock research data as tools for Claude Code, Cursor, or any MCP-compatible client.

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
| `get_investment_activity` | Transaction history, cost basis, open option positions |

See [CONTRACT.md](CONTRACT.md) for the response shapes, field semantics, and
tool-selection guidance.

## How To Use The Surface

Recommended call flow:

1. If the conversation is portfolio-level, start with `list_portfolios()` and/or `get_portfolio_context()`
2. If the conversation is market-level, start with `get_market_context()`
3. If the conversation is ticker-level, start with `get_stock_context("NVDA")`
4. Then only fetch the branch you actually need:
   - `get_portfolio_performance` for historical portfolio performance
   - `get_investment_activity` for full trade history
   - `get_research_archive` to browse older notes/reports
   - `get_report_content` for one specific full report
   - `get_note_content` for one specific full note
   - `get_technical_history` for technical follow-up

This is intentional:

- `get_stock_context` is summary-first so the first chat turn stays readable
- full-fidelity data are still available via the drilldown tools

## Prerequisites

- Python 3.12+
- DeepStock backend running (default: `http://localhost:8000`)
- Supabase credentials (from your project dashboard)

## Install dependencies

```bash
cd mcp
pip install mcp httpx pyjwt
```

Or if the project uses uv:

```bash
cd mcp
uv pip install mcp httpx pyjwt
```

## Environment variables

The server needs 3 variables from your Supabase project (**Settings → API**):

| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` | Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → service_role key |
| `SUPABASE_JWT_SECRET` | Settings → API → JWT Settings → JWT Secret |

Optional:

| Variable | Default | Description |
|---|---|---|
| `DEEPSTOCK_API_URL` | `http://localhost:8000` | Backend URL (change for remote deploy) |

---

## Setup: Claude Code

MCP config lives in `.mcp.json` at the root of the **client project** (e.g. the Felix repo, not deepstock).
This file is gitignored in that project — create it manually on each machine.

```json
{
  "mcpServers": {
    "deepstock": {
      "command": "/opt/homebrew/bin/python3.13",
      "args": ["/absolute/path/to/deepstock/mcp/deepstock_mcp.py"],
      "env": {
        "DEEPSTOCK_API_URL": "http://localhost:8000",
        "SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key",
        "SUPABASE_JWT_SECRET": "your-jwt-secret"
      }
    }
  }
}
```

Replace `/absolute/path/to/deepstock` and the Python path (`which python3`) with the actual values on your machine.

After saving, restart Claude Code — MCP subprocess loads at session start.

---

## New machine checklist

1. Clone the repo
2. Start the backend: `docker compose up -d`
3. Get Supabase credentials from the dashboard
4. Create the config file for your client (see above)
5. Restart the client (Claude Code / Cursor / VS Code)
6. Verify: ask the client to call `get_stock_context("AAPL")` — should return data

## Troubleshooting

**Tools don't appear after config change** — MCP subprocess loads at client startup. Restart the IDE/Claude Code window.

**`SUPABASE_SERVICE_ROLE_KEY and SUPABASE_JWT_SECRET must be set`** — env vars missing or not passed correctly in the config file.

**`No users found in Supabase project`** — the service role key doesn't match the `SUPABASE_URL` project.

**Connection refused on `http://localhost:8000`** — backend isn't running. Run `docker compose up -d` first.
