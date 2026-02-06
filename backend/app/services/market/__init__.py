"""
Market data service - composite service using modular components.

This module provides the main MarketDataService class that composes:
- quotes.py: Stock quotes and price history
- options_quotes.py: Option quote fetching
- stock_info.py: Stock fundamentals and insights
- technical.py: Technical indicators and signals
"""
from typing import List, Dict, Optional
import pandas as pd

from app.core.redis import get_redis

# Import modular functions
from .quotes import get_quotes, get_price_history
from .options_quotes import get_option_quotes
from .stock_info import get_stock_info
from .technical import get_technical_indicators


class MarketDataService:
    """
    Unified market data service that provides access to all market data functions.
    Uses a shared Redis connection pool for caching.
    """
    
    def __init__(self):
        self.redis = get_redis()
    
    async def get_quotes(self, tickers: List[str]) -> Dict[str, dict]:
        """Get batch stock quotes with caching."""
        return await get_quotes(self.redis, tickers)
    
    async def get_price_history(self, ticker: str, period: str = "1mo") -> List[dict]:
        """Get historical price data for charting."""
        return await get_price_history(self.redis, ticker, period)
    
    async def get_option_quotes(self, occ_symbols: List[str]) -> Dict[str, dict]:
        """Get option quotes for OCC symbols."""
        return await get_option_quotes(self.redis, occ_symbols)
    
    async def get_stock_info(self, ticker: str) -> Optional[dict]:
        """Get detailed stock info including fundamentals and insights."""
        return await get_stock_info(self.redis, ticker)
    
    async def get_technical_indicators(self, ticker: str, period: str = "1y") -> Optional[dict]:
        """Calculate technical indicators for a stock."""
        return await get_technical_indicators(self.redis, ticker, period)


# Singleton instance using shared Redis pool
market_service = MarketDataService()
