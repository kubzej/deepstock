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
from starlette.requests import Request
from starlette.responses import JSONResponse

API_URL = os.environ.get("DEEPSTOCK_API_URL", "http://localhost:8000")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")
PORT = int(os.environ.get("PORT", 8001))

mcp = FastMCP("deepstock", host="0.0.0.0", port=PORT)


@mcp.custom_route("/health", methods=["GET"])
async def health_check(request: Request) -> JSONResponse:
    return JSONResponse({"status": "ok"})

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


async def _api_post(path: str, payload: dict) -> dict:
    token = await _get_token()
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{API_URL}{path}",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        response.raise_for_status()
        return response.json()


@mcp.tool()
async def list_portfolios() -> dict:
    """
    List available portfolios for the authenticated DeepStock user.

    Use this when the user refers to a specific portfolio by name, or when
    you need to decide whether to talk about all portfolios or one of them.
    """
    return await _api_get("/api/mcp/portfolios")


@mcp.tool()
async def get_portfolio_context(portfolio_id: str = "") -> dict:
    """
    Get the current portfolio state: holdings, snapshot, sector exposure,
    recent transactions, and open-lot summary.

    Leave portfolio_id empty to aggregate across all portfolios.
    """
    params = {"portfolio_id": portfolio_id} if portfolio_id else None
    return await _api_get("/api/mcp/portfolio-context", params=params)


@mcp.tool()
async def get_portfolio_performance(period: str = "1Y", portfolio_id: str = "") -> dict:
    """
    Get historical portfolio performance over time.

    Returns stock and options performance for the requested period.
    Leave portfolio_id empty to aggregate across all portfolios.
    """
    params = {"period": period}
    if portfolio_id:
        params["portfolio_id"] = portfolio_id
    return await _api_get("/api/mcp/portfolio-performance", params=params)


@mcp.tool()
async def get_market_context() -> dict:
    """
    Get the current market backdrop used for portfolio conversations.

    Returns Fear & Greed sentiment, core FX rates to CZK, and quotes for the
    same macro tickers tracked in the DeepStock market overview.
    """
    return await _api_get("/api/mcp/market-context")


@mcp.tool()
async def get_stock_context(ticker: str) -> dict:
    """
    Get the default chat entry point for a ticker.

    Returns a lean cross-domain summary: company identity, journal previews,
    position/watchlist summary, and market context. Use this first when the
    user asks about a stock. If you need full detail, follow up with the
    drilldown tools below instead of expecting full transactions or full
    journal content inline.

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
    Get report and note previews for a ticker.

    Use for questions like "what did I think about this stock 6 months ago"
    or when comparing current state to historical research. This returns
    preview/index data; fetch the full body with get_report_content or
    get_note_content only when needed.

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


@mcp.tool()
async def get_note_content(note_id: str) -> dict:
    """
    Get full content of a specific journal note.

    Use after get_stock_context or get_research_archive when a note preview
    looks relevant and you need the full text.

    note_id: the UUID from journal_context.notes[].id or research_archive notes[].id
    """
    return await _api_get(f"/api/mcp/note/{note_id}")


@mcp.tool()
async def save_stock_journal_note(ticker: str, content: str) -> dict:
    """
    Save a plain-text journal note for a specific stock ticker.

    Use only after the user explicitly wants to save a stock-specific insight
    from the current conversation. This tool is intentionally narrow: the
    backend resolves the stock journal channel and stores the note as a normal
    `note` entry for that ticker.

    ticker: stock symbol for the current single-stock conversation
    content: final user-approved plain-text note to save
    """
    return await _api_post(
        "/api/mcp/stock-journal-note",
        {"ticker": ticker.upper(), "content": content},
    )


@mcp.tool()
async def save_portfolio_journal_note(portfolio_id: str, content: str) -> dict:
    """
    Save a plain-text journal note for a specific portfolio.

    Use only after the user explicitly wants to save a portfolio-specific
    takeaway from the current conversation. The backend resolves the
    portfolio journal channel and stores the note as a normal `note` entry.

    portfolio_id: target portfolio ID for the current single-portfolio conversation
    content: final user-approved plain-text note to save
    """
    return await _api_post(
        "/api/mcp/portfolio-journal-note",
        {"portfolio_id": portfolio_id, "content": content},
    )


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
