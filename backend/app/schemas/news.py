"""
News schemas - Pydantic models for news articles.
"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class NewsArticle(BaseModel):
    """Single news article."""
    id: str
    title: str
    summary: Optional[str] = None
    publisher: str
    published_at: datetime
    url: str
    thumbnail_url: Optional[str] = None
    related_tickers: List[str] = []


class NewsFeedResponse(BaseModel):
    """Response containing list of news articles."""
    articles: List[NewsArticle]
    tickers_requested: List[str]
    total: int
