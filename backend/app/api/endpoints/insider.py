"""Insider trading API endpoints — SEC Form 4 data."""

from fastapi import APIRouter, Depends
from starlette.requests import Request

from app.core.auth import get_current_user_id
from app.core.rate_limit import limiter
from app.core.redis import get_redis
from app.schemas.insider import InsiderTrade, InsiderTradesResponse
from app.services.insider import get_insider_trades

router = APIRouter()


@router.get("/{ticker}", response_model=InsiderTradesResponse)
@limiter.limit("30/hour")
async def insider_trades(request: Request, ticker: str, months: int = 12, user_id: str = Depends(get_current_user_id)):
    """
    Get insider (Form 4) buy/sell transactions for a US-listed stock.

    Returns empty trades list for non-US tickers (no SEC filing).
    Results are cached in Redis for 12 hours.
    """
    r = get_redis()
    trades_raw = await get_insider_trades(r, ticker, months=months)
    trades = [InsiderTrade(**t) for t in trades_raw]
    return InsiderTradesResponse(ticker=ticker.upper(), trades=trades)
