"""
DeepStock MCP Server

Standalone MCP server that exposes DeepStock research data as tools
for use in Cursor, VS Code Copilot, or any MCP-compatible client.

Configuration (environment variables):
  DEEPSTOCK_API_URL              Backend URL, default: http://localhost:8000
  SUPABASE_URL                   Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY      Supabase service role key
  SUPABASE_JWT_SECRET            Supabase JWT secret
"""
import os
import time
import httpx
import jwt
from mcp.server.fastmcp import FastMCP

API_URL = os.environ.get("DEEPSTOCK_API_URL", "http://localhost:8000")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")

mcp = FastMCP("deepstock")

_cached_token: str = ""
_token_expires_at: float = 0.0


def _mint_token(user_id: str, ttl_seconds: int = 3600) -> str:
    now = int(time.time())
    payload = {
        "sub": user_id,
        "role": "authenticated",
        "aud": "authenticated",
        "iat": now,
        "exp": now + ttl_seconds,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


async def _get_user_id() -> str:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            headers={
                "apikey": SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            },
            params={"per_page": 1},
        )
        response.raise_for_status()
        users = response.json().get("users", [])
        if not users:
            raise RuntimeError("No users found in Supabase project")
        return users[0]["id"]


async def _get_token() -> str:
    global _cached_token, _token_expires_at

    if _cached_token and time.time() < _token_expires_at - 60:
        return _cached_token

    if not SERVICE_ROLE_KEY or not JWT_SECRET:
        raise RuntimeError(
            "SUPABASE_SERVICE_ROLE_KEY and SUPABASE_JWT_SECRET must be set in ~/.cursor/mcp.json"
        )

    user_id = await _get_user_id()
    ttl = 3600
    _cached_token = _mint_token(user_id, ttl_seconds=ttl)
    _token_expires_at = time.time() + ttl
    return _cached_token


async def _api_get(path: str, params: dict | None = None) -> dict:
    token = await _get_token()
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{API_URL}{path}",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
        )
        response.raise_for_status()
        return response.json()


@mcp.tool()
async def get_stock_context(ticker: str) -> dict:
    """
    Get full research dossier for a ticker.

    Returns ticker info, your journal notes and AI reports, investment activity
    (stock + options), watchlist targets, and current market context with
    fundamentals, valuation, smart analysis, and technical summary.

    Use this as the first call when the user asks about any stock.
    """
    return await _api_get(f"/api/mcp/stock-context/{ticker.upper()}")


@mcp.tool()
async def get_technical_history(
    ticker: str,
    period: str = "6mo",
    indicators: str = "price,rsi,macd,bollinger,volume",
) -> dict:
    """
    Get detailed technical indicator history for a ticker.

    Use for follow-up questions about momentum, trend, or price action
    when the compact technicals in get_stock_context aren't enough.

    period: 1w | 1mo | 3mo | 6mo | 1y | 2y
    indicators: comma-separated list from: price, rsi, macd, bollinger,
                volume, stochastic, atr, obv, adx, fibonacci
    """
    return await _api_get(
        f"/api/mcp/technical-history/{ticker.upper()}",
        params={"period": period, "indicators": indicators},
    )


@mcp.tool()
async def get_research_archive(ticker: str, limit: int = 10) -> dict:
    """
    Get older AI research reports and journal notes for a ticker.

    Use for questions like "what did I think about this stock 6 months ago"
    or when comparing current state to historical research.

    limit: number of reports/notes to return (1-50)
    """
    return await _api_get(
        f"/api/mcp/research-archive/{ticker.upper()}",
        params={"limit": limit},
    )


@mcp.tool()
async def get_investment_activity(ticker: str) -> dict:
    """
    Get detailed investment activity for a ticker.

    Returns full stock transaction history, option transactions,
    current position summary, and open option holdings.

    Use for deep-dive questions about trade history, cost basis,
    or option strategy breakdown.
    """
    return await _api_get(f"/api/mcp/investment-activity/{ticker.upper()}")


@mcp.tool()
async def get_report_content(report_id: str) -> dict:
    """
    Get full markdown content of a specific AI research report.

    Use after get_research_archive to fetch the full text of a specific report
    by its ID. Reports can be long — fetch only the one(s) you actually need.

    report_id: the UUID from get_research_archive reports[].id
    """
    return await _api_get(f"/api/mcp/report/{report_id}")


if __name__ == "__main__":
    mcp.run()
