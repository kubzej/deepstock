"""
MCP watchlist-related schemas.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class WatchlistItemResponse(BaseModel):
    id: Optional[str] = None
    watchlist_id: Optional[str] = None
    watchlist_name: str = ""
    target_buy_price: Optional[float] = None
    target_sell_price: Optional[float] = None
    notes: Optional[str] = None
    sector: Optional[str] = None
    added_at: Optional[str] = None


class WatchlistContextResponse(BaseModel):
    count: int = 0
    items: list[WatchlistItemResponse] = Field(default_factory=list)


class WatchlistListItemResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    position: int = 0
    item_count: int = 0


class WatchlistListResponse(BaseModel):
    generated_at: str
    watchlist_count: int = 0
    watchlists: list[WatchlistListItemResponse] = Field(default_factory=list)


class WatchlistDetailItemResponse(BaseModel):
    id: str
    ticker: str
    stock_name: Optional[str] = None
    target_buy_price: Optional[float] = None
    target_sell_price: Optional[float] = None
    notes: Optional[str] = None
    sector: Optional[str] = None
    added_at: Optional[str] = None


class WatchlistItemsResponse(BaseModel):
    watchlist_id: str
    watchlist_name: str
    description: Optional[str] = None
    generated_at: str
    items: list[WatchlistDetailItemResponse] = Field(default_factory=list)


__all__ = [
    "WatchlistItemResponse",
    "WatchlistContextResponse",
    "WatchlistListItemResponse",
    "WatchlistListResponse",
    "WatchlistDetailItemResponse",
    "WatchlistItemsResponse",
]
