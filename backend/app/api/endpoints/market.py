from fastapi import APIRouter
from app.services.market import market_service
from app.services.exchange import exchange_service
from pydantic import BaseModel
from typing import List

router = APIRouter()

class TickerRequest(BaseModel):
    tickers: List[str]

@router.post("/batch-quotes")
async def get_quotes(payload: TickerRequest):
    """
    Fetch price and change % for a list of tickers.
    Uses Redis caching + yfinance batch download.
    """
    return await market_service.get_quotes(payload.tickers)


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

