"""
News API endpoints.
"""
from fastapi import APIRouter, Query
from typing import List
from app.services.news import news_service
from app.schemas.news import NewsFeedResponse

router = APIRouter()


@router.get("/feed", response_model=NewsFeedResponse)
async def get_news_feed(
    tickers: str = Query(..., description="Comma-separated list of tickers"),
    limit: int = Query(30, ge=1, le=100, description="Max articles to return")
):
    """
    Get aggregated news feed for a list of tickers.
    
    - Fetches news from Yahoo Finance for each ticker
    - Deduplicates articles that appear for multiple tickers
    - Sorts by date (newest first)
    - Caches results in Redis (15 min TTL)
    
    Example: /api/news/feed?tickers=AAPL,MSFT,GOOGL&limit=20
    """
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    
    if not ticker_list:
        return NewsFeedResponse(articles=[], tickers_requested=[], total=0)
    
    return await news_service.get_feed(ticker_list, limit)


@router.get("/ticker/{ticker}", response_model=NewsFeedResponse)
async def get_ticker_news(
    ticker: str,
    limit: int = Query(10, ge=1, le=50)
):
    """
    Get news for a single ticker.
    
    Example: /api/news/ticker/AAPL
    """
    return await news_service.get_feed([ticker.upper()], limit)
