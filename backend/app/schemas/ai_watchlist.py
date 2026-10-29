"""API request and response models for ai watchlist."""
from typing import Optional
from pydantic import BaseModel


class WatchlistTargetsRequest(BaseModel):
    ticker: str
    avg_cost: Optional[float] = None   # User's average purchase price (if holding)
    shares: Optional[float] = None     # Number of shares held


class WatchlistTargetsResponse(BaseModel):
    ticker: str
    buy_target: Optional[float] = None
    sell_target: Optional[float] = None
    comment: str
    cached: bool = False
