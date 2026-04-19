"""
MCP ticker-related schemas.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel

from .mcp_activity import ActivityContextSummaryResponse
from .mcp_journal import JournalContextSummaryResponse
from .mcp_market import MarketContextResponse
from .mcp_watchlist import WatchlistContextResponse


class TickerInfoResponse(BaseModel):
    symbol: Optional[str] = None
    name: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    country: Optional[str] = None
    exchange: Optional[str] = None
    currency: Optional[str] = None
    description: Optional[str] = None


class StockContextResponse(BaseModel):
    ticker: str
    generated_at: str
    ticker_info: TickerInfoResponse
    journal_context: JournalContextSummaryResponse
    activity_context: ActivityContextSummaryResponse
    watchlist_context: WatchlistContextResponse
    market_context: MarketContextResponse


__all__ = [
    "TickerInfoResponse",
    "StockContextResponse",
]
