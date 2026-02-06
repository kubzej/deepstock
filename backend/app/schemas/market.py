"""
Market Response Schemas

Pydantic models for market data API responses (quotes, exchange rates, etc.).
"""
from pydantic import BaseModel
from typing import Optional, Dict, List
from datetime import datetime


class QuoteResponse(BaseModel):
    """Real-time stock quote."""
    ticker: str
    price: float
    change: float
    change_percent: float
    volume: Optional[int] = None
    market_cap: Optional[float] = None
    pe_ratio: Optional[float] = None
    dividend_yield: Optional[float] = None
    week_52_high: Optional[float] = None
    week_52_low: Optional[float] = None
    timestamp: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class BatchQuotesResponse(BaseModel):
    """Response for batch quote requests."""
    quotes: Dict[str, QuoteResponse]
    
    class Config:
        from_attributes = True


class ExchangeRatesResponse(BaseModel):
    """Currency exchange rates to CZK."""
    USD: float
    EUR: float
    GBP: Optional[float] = None
    CHF: Optional[float] = None
    CAD: Optional[float] = None
    AUD: Optional[float] = None
    JPY: Optional[float] = None
    timestamp: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class PriceHistoryPoint(BaseModel):
    """Single point in price history."""
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int
    
    class Config:
        from_attributes = True


class PriceHistoryResponse(BaseModel):
    """Historical price data."""
    ticker: str
    period: str
    data: List[PriceHistoryPoint]
    
    class Config:
        from_attributes = True


class StockInfoResponse(BaseModel):
    """Detailed stock information from external API."""
    ticker: str
    name: str
    sector: Optional[str] = None
    industry: Optional[str] = None
    country: Optional[str] = None
    currency: str
    exchange: Optional[str] = None
    description: Optional[str] = None
    website: Optional[str] = None
    market_cap: Optional[float] = None
    pe_ratio: Optional[float] = None
    forward_pe: Optional[float] = None
    eps: Optional[float] = None
    dividend_yield: Optional[float] = None
    beta: Optional[float] = None
    week_52_high: Optional[float] = None
    week_52_low: Optional[float] = None
    avg_volume: Optional[int] = None
    
    class Config:
        from_attributes = True


class OptionQuoteResponse(BaseModel):
    """Real-time option quote."""
    symbol: str
    last_price: Optional[float] = None
    bid: Optional[float] = None
    ask: Optional[float] = None
    volume: Optional[int] = None
    open_interest: Optional[int] = None
    implied_volatility: Optional[float] = None
    delta: Optional[float] = None
    gamma: Optional[float] = None
    theta: Optional[float] = None
    vega: Optional[float] = None
    
    class Config:
        from_attributes = True
