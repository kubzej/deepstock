"""
Watchlist Response Schemas

Pydantic models for watchlist-related API responses.
"""
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class WatchlistTagResponse(BaseModel):
    """Watchlist tag for categorizing items."""
    id: str
    name: str
    color: str
    
    class Config:
        from_attributes = True


class WatchlistItemResponse(BaseModel):
    """Item in a watchlist (a stock to watch)."""
    id: str
    watchlist_id: str
    stock_id: str
    ticker: str
    stock_name: str
    target_price: Optional[float] = None
    alert_enabled: bool = False
    notes: Optional[str] = None
    position: int = 0
    created_at: datetime
    updated_at: datetime
    # Tags attached to this item
    tags: List[WatchlistTagResponse] = []
    
    class Config:
        from_attributes = True


class WatchlistResponse(BaseModel):
    """Watchlist entity response."""
    id: str
    user_id: str
    name: str
    description: Optional[str] = None
    position: int = 0
    color: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    # Item count (for list views)
    item_count: Optional[int] = None
    
    class Config:
        from_attributes = True


class WatchlistWithItemsResponse(BaseModel):
    """Watchlist with all its items."""
    id: str
    user_id: str
    name: str
    description: Optional[str] = None
    position: int = 0
    color: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    items: List[WatchlistItemResponse] = []
    
    class Config:
        from_attributes = True


class WatchlistCreateRequest(BaseModel):
    """Request body for creating a watchlist."""
    name: str
    description: Optional[str] = None
    color: Optional[str] = None


class WatchlistUpdateRequest(BaseModel):
    """Request body for updating a watchlist."""
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    position: Optional[int] = None


class WatchlistItemCreateRequest(BaseModel):
    """Request body for adding item to watchlist."""
    stock_id: str
    target_price: Optional[float] = None
    alert_enabled: bool = False
    notes: Optional[str] = None


class WatchlistItemUpdateRequest(BaseModel):
    """Request body for updating watchlist item."""
    target_price: Optional[float] = None
    alert_enabled: Optional[bool] = None
    notes: Optional[str] = None
    position: Optional[int] = None


class TagCreateRequest(BaseModel):
    """Request body for creating a tag."""
    name: str
    color: str = "#3b82f6"  # Default blue


class TagUpdateRequest(BaseModel):
    """Request body for updating a tag."""
    name: Optional[str] = None
    color: Optional[str] = None


class SetItemTagsRequest(BaseModel):
    """Request body for setting tags on an item."""
    tag_ids: List[str]
