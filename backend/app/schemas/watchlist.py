"""API request and response models for watchlist."""
from typing import List, Optional
from pydantic import BaseModel


class WatchlistCreate(BaseModel):
    name: str
    description: Optional[str] = None


class WatchlistUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class WatchlistItemCreate(BaseModel):
    stock_id: Optional[str] = None  # If provided, use this
    ticker: Optional[str] = None     # If stock_id not provided, lookup/create by ticker
    stock_name: Optional[str] = None # For auto-creating stock
    target_buy_price: Optional[float] = None
    target_sell_price: Optional[float] = None
    notes: Optional[str] = None


class WatchlistItemUpdate(BaseModel):
    target_buy_price: Optional[float] = None
    target_sell_price: Optional[float] = None
    notes: Optional[str] = None


class TagCreate(BaseModel):
    name: str
    color: Optional[str] = None


class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


class ReorderRequest(BaseModel):
    watchlist_ids: List[str]


class MoveItemRequest(BaseModel):
    target_watchlist_id: str


class SetItemTagsRequest(BaseModel):
    tag_ids: List[str]
