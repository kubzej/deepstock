"""Insider trading API endpoints — SEC Form 4 data."""

from fastapi import APIRouter

from app.core.redis import get_redis
from app.schemas.insider import InsiderTrade, InsiderTradesResponse
from app.services.insider import get_insider_trades

router = APIRouter()


@router.get("/{ticker}", response_model=InsiderTradesResponse)
async def insider_trades(ticker: str, months: int = 12):
    """
    Get insider (Form 4) buy/sell transactions for a US-listed stock.

    Returns empty trades list for non-US tickers (no SEC filing).
    Results are cached in Redis for 12 hours.
    """
    r = get_redis()
    trades_raw = await get_insider_trades(r, ticker, months=months)
    trades = [InsiderTrade(**t) for t in trades_raw]
    return InsiderTradesResponse(ticker=ticker.upper(), trades=trades)
