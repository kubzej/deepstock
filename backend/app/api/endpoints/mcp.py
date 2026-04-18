"""
MCP endpoints for DeepStock-backed chat workflows.

Summary-first MCP endpoints and narrow write-back actions for external chat agents.
"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from starlette.requests import Request

from app.core.auth import get_current_user_id
from app.core.rate_limit import limiter
from app.schemas.mcp import (
    GlobalMarketContextResponse,
    JournalNoteContentResponse,
    JournalReportContentResponse,
    PortfolioActivityResponse,
    PortfolioContextResponse,
    PortfolioJournalArchiveResponse,
    PortfolioListResponse,
    PortfolioPerformanceResponse,
    SavePortfolioJournalNoteRequest,
    SavePortfolioJournalNoteResponse,
    SaveStockJournalNoteRequest,
    SaveStockJournalNoteResponse,
    StockJournalArchiveResponse,
    StockContextResponse,
    TickerActivityResponse,
    TechnicalHistoryResponse,
)
from app.services.market.stock_info import StockInfoUnavailableError
from app.services.research_context import (
    ActivityFilterError,
    VALID_TECHNICAL_INDICATORS,
    research_context_service,
)

router = APIRouter()

PortfolioPerformancePeriod = Literal["1W", "1M", "3M", "6M", "MTD", "YTD", "1Y", "ALL"]
ActivityPeriod = Literal["1W", "1M", "3M", "6M", "MTD", "YTD", "1Y", "ALL"]
TechnicalPeriod = Literal["1w", "1mo", "3mo", "6mo", "1y", "2y"]


@router.get("/portfolios", response_model=PortfolioListResponse)
@limiter.limit("30/minute")
async def list_portfolios(
    request: Request,
    user_id: str = Depends(get_current_user_id),
):
    del request
    return await research_context_service.list_portfolios(user_id)


@router.get("/portfolio-context", response_model=PortfolioContextResponse)
@limiter.limit("30/minute")
async def get_portfolio_context(
    request: Request,
    portfolio_id: Optional[str] = Query(None),
    recent_limit: int = Query(20, ge=1, le=50),
    user_id: str = Depends(get_current_user_id),
):
    del request
    try:
        return await research_context_service.get_portfolio_context(
            user_id,
            portfolio_id=portfolio_id,
            recent_limit=recent_limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/portfolio-performance", response_model=PortfolioPerformanceResponse)
@limiter.limit("30/minute")
async def get_portfolio_performance(
    request: Request,
    portfolio_id: Optional[str] = Query(None),
    period: PortfolioPerformancePeriod = Query("1Y"),
    user_id: str = Depends(get_current_user_id),
):
    del request
    try:
        return await research_context_service.get_portfolio_performance(
            user_id=user_id,
            portfolio_id=portfolio_id,
            period=period,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/market-context", response_model=GlobalMarketContextResponse)
@limiter.limit("30/minute")
async def get_market_context(
    request: Request,
    user_id: str = Depends(get_current_user_id),
):
    del request
    return await research_context_service.get_market_context(user_id)


@router.get("/stock-context/{ticker}", response_model=StockContextResponse)
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


@router.get("/technical-history/{ticker}", response_model=TechnicalHistoryResponse)
@limiter.limit("30/minute")
async def get_technical_history(
    request: Request,
    ticker: str,
    period: TechnicalPeriod = Query("6mo"),
    indicators: Optional[str] = Query(
        None,
        description="Comma-separated indicator names: price,rsi,macd,bollinger,volume,stochastic,atr,obv,adx,fibonacci",
    ),
    user_id: str = Depends(get_current_user_id),
):
    del request
    indicator_list = indicators.split(",") if indicators else None
    if indicator_list:
        normalized_indicators = [item.strip() for item in indicator_list if item.strip()]
        invalid_indicators = sorted(set(normalized_indicators) - VALID_TECHNICAL_INDICATORS)
        if invalid_indicators:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Unsupported technical indicators: "
                    + ", ".join(invalid_indicators)
                    + ". Expected a subset of: "
                    + ", ".join(sorted(VALID_TECHNICAL_INDICATORS))
                ),
            )
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
        detail = str(exc)
        status_code = 404 if detail.startswith("Ticker ") and detail.endswith(" not found") else 400
        raise HTTPException(status_code=status_code, detail=detail)


@router.get("/stock-journal-archive/{ticker}", response_model=StockJournalArchiveResponse)
@limiter.limit("30/minute")
async def get_stock_journal_archive(
    request: Request,
    ticker: str,
    limit: int = Query(10, ge=1, le=50),
    user_id: str = Depends(get_current_user_id),
):
    del request
    return await research_context_service.get_stock_journal_archive(ticker, user_id, limit=limit)


@router.get("/portfolio-journal-archive/{portfolio_id}", response_model=PortfolioJournalArchiveResponse)
@limiter.limit("30/minute")
async def get_portfolio_journal_archive(
    request: Request,
    portfolio_id: str,
    limit: int = Query(10, ge=1, le=50),
    user_id: str = Depends(get_current_user_id),
):
    del request
    try:
        return await research_context_service.get_portfolio_journal_archive(
            portfolio_id=portfolio_id,
            user_id=user_id,
            limit=limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/journal-report/{report_id}", response_model=JournalReportContentResponse)
@limiter.limit("30/minute")
async def get_journal_report_content(
    request: Request,
    report_id: str,
    user_id: str = Depends(get_current_user_id),
):
    del request
    try:
        return await research_context_service.get_journal_report_content(report_id, user_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/journal-note/{note_id}", response_model=JournalNoteContentResponse)
@limiter.limit("30/minute")
async def get_journal_note_content(
    request: Request,
    note_id: str,
    user_id: str = Depends(get_current_user_id),
):
    del request
    try:
        return await research_context_service.get_journal_note_content(note_id, user_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/stock-journal-note", response_model=SaveStockJournalNoteResponse)
@limiter.limit("10/minute")
async def save_stock_journal_note(
    request: Request,
    payload: SaveStockJournalNoteRequest,
    user_id: str = Depends(get_current_user_id),
):
    del request
    try:
        return await research_context_service.save_stock_journal_note(
            ticker=payload.ticker,
            content=payload.content,
            user_id=user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/portfolio-journal-note", response_model=SavePortfolioJournalNoteResponse)
@limiter.limit("10/minute")
async def save_portfolio_journal_note(
    request: Request,
    payload: SavePortfolioJournalNoteRequest,
    user_id: str = Depends(get_current_user_id),
):
    del request
    try:
        return await research_context_service.save_portfolio_journal_note(
            portfolio_id=payload.portfolio_id,
            content=payload.content,
            user_id=user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/ticker-activity/{ticker}", response_model=TickerActivityResponse)
@limiter.limit("30/minute")
async def get_ticker_activity(
    request: Request,
    ticker: str,
    period: ActivityPeriod = Query("ALL"),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    cursor: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user_id),
):
    del request
    try:
        return await research_context_service.get_ticker_activity(
            ticker=ticker,
            user_id=user_id,
            period=period,
            from_date=from_date,
            to_date=to_date,
            limit=limit,
            cursor=cursor,
        )
    except ActivityFilterError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/portfolio-activity", response_model=PortfolioActivityResponse)
@limiter.limit("30/minute")
async def get_portfolio_activity(
    request: Request,
    portfolio_id: Optional[str] = Query(None),
    period: ActivityPeriod = Query("ALL"),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    cursor: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user_id),
):
    del request
    try:
        return await research_context_service.get_portfolio_activity(
            user_id=user_id,
            portfolio_id=portfolio_id,
            period=period,
            from_date=from_date,
            to_date=to_date,
            limit=limit,
            cursor=cursor,
        )
    except ActivityFilterError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
