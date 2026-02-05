from fastapi import APIRouter
from app.services.market import market_service
from app.services.exchange import exchange_service
from pydantic import BaseModel
from typing import List

router = APIRouter()

class TickerRequest(BaseModel):
    tickers: List[str]

class OptionSymbolsRequest(BaseModel):
    symbols: List[str]

@router.post("/batch-quotes")
async def get_quotes(payload: TickerRequest):
    """
    Fetch price and change % for a list of tickers.
    Uses Redis caching + yfinance batch download.
    """
    return await market_service.get_quotes(payload.tickers)


@router.post("/option-quotes")
async def get_option_quotes(payload: OptionSymbolsRequest):
    """
    Fetch price and Greeks for option OCC symbols.
    Uses Redis caching + yfinance.
    Example symbols: AAPL250117C00150000, SOFI260320P00028000
    """
    return await market_service.get_option_quotes(payload.symbols)


@router.get("/exchange-rates")
async def get_exchange_rates():
    """
    Get current exchange rates to CZK.
    Returns: {'USD': 23.45, 'EUR': 25.10, 'GBP': 29.80, 'CZK': 1.0}
    """
    return await exchange_service.get_rates()


@router.get("/history/{ticker}")
async def get_price_history(ticker: str, period: str = "1mo"):
    """
    Get historical price data for charting.
    Periods: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, max
    """
    return await market_service.get_price_history(ticker.upper(), period)


@router.get("/stock-info/{ticker}")
async def get_stock_info(ticker: str):
    """
    Get detailed stock info including fundamentals and valuation.
    Returns price, valuation ratios, margins, growth metrics, analyst targets.
    """
    result = await market_service.get_stock_info(ticker.upper())
    if result is None:
        return {"error": "Ticker not found"}
    return result


@router.get("/technical/{ticker}")
async def get_technical_indicators(ticker: str, period: str = "1y"):
    """
    Get technical analysis indicators for a stock.
    
    Periods: 1mo, 3mo, 6mo, 1y, 2y
    
    Returns current values and historical data for:
    - SMA (50, 200)
    - RSI (14)
    - MACD (12, 26, 9)
    - Bollinger Bands (20, 2)
    - Stochastic (14, 3, 3)
    - ATR (14)
    - OBV
    - ADX (14)
    """
    result = await market_service.get_technical_indicators(ticker.upper(), period)
    if result is None:
        return {"error": "Unable to calculate technical indicators for this ticker"}
    return result

