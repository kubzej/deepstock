"""
MCP endpoints for DeepStock-backed chat workflows.

Read-only endpoints that expose ticker-specific context for external chat agents.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from starlette.requests import Request

from app.core.auth import get_current_user_id
from app.core.rate_limit import limiter
from app.services.market.stock_info import StockInfoUnavailableError
from app.services.research_context import research_context_service

router = APIRouter()


@router.get("/stock-context/{ticker}")
@limiter.limit("30/minute")
async def get_stock_context(
    request: Request,
    ticker: str,
    user_id: str = Depends(get_current_user_id),
):
    del request
    try:
        return await research_context_service.get_stock_context(ticker, user_id)
    except StockInfoUnavailableError:
        raise HTTPException(
            status_code=502,
            detail=f"Stock data provider is temporarily unavailable for {ticker.upper()}",
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/technical-history/{ticker}")
@limiter.limit("30/minute")
async def get_technical_history(
    request: Request,
    ticker: str,
    period: str = Query("6mo"),
    indicators: Optional[str] = Query(
        None,
        description="Comma-separated indicator names: price,rsi,macd,bollinger,volume,stochastic,atr,obv,adx,fibonacci",
    ),
    user_id: str = Depends(get_current_user_id),
):
    del request
    indicator_list = indicators.split(",") if indicators else None
    try:
        return await research_context_service.get_technical_history(
            ticker=ticker,
            user_id=user_id,
            period=period,  # type: ignore[arg-type]
            indicators=indicator_list,
        )
    except StockInfoUnavailableError:
        raise HTTPException(
            status_code=502,
            detail=f"Stock data provider is temporarily unavailable for {ticker.upper()}",
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/research-archive/{ticker}")
@limiter.limit("30/minute")
async def get_research_archive(
    request: Request,
    ticker: str,
    limit: int = Query(10, ge=1, le=50),
    user_id: str = Depends(get_current_user_id),
):
    del request
    return await research_context_service.get_research_archive(ticker, user_id, limit=limit)


@router.get("/report/{report_id}")
@limiter.limit("30/minute")
async def get_report_content(
    request: Request,
    report_id: str,
    user_id: str = Depends(get_current_user_id),
):
    del request
    try:
        return await research_context_service.get_report_content(report_id, user_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/investment-activity/{ticker}")
@limiter.limit("30/minute")
async def get_investment_activity(
    request: Request,
    ticker: str,
    user_id: str = Depends(get_current_user_id),
):
    del request
    try:
        return await research_context_service.get_investment_activity(ticker, user_id)
    except StockInfoUnavailableError:
        raise HTTPException(
            status_code=502,
            detail=f"Stock data provider is temporarily unavailable for {ticker.upper()}",
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
