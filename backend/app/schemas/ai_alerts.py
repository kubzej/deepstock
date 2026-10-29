"""API request and response models for ai alerts."""
from typing import Optional
from pydantic import BaseModel


class AlertSuggestionsRequest(BaseModel):
    tickers: list[str] = []
    watchlist_id: Optional[str] = None


class AlertSuggestion(BaseModel):
    ticker: str
    condition_type: str  # price_above | price_below
    price: float
    reason: str


class AlertSuggestionsResponse(BaseModel):
    suggestions: list[AlertSuggestion]
    cached: bool = False
