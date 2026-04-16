# DeepStock MCP Server

Exposes DeepStock research data as tools for Claude Code, Cursor, or any MCP-compatible client.

## Tools

| Tool | Description |
|---|---|
| `get_stock_context` | Full research dossier — fundamentals, valuation, technicals, journal, activity |
| `get_technical_history` | Detailed indicator history (RSI, MACD, Bollinger, ADX, Fibonacci, …) |
| `get_research_archive` | Older AI reports and journal notes for a ticker |
| `get_report_content` | Full markdown content of a specific report by ID |
| `get_investment_activity` | Transaction history, cost basis, open option positions |

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
