"""
MCP endpoints for DeepStock-backed chat workflows.

Summary-first MCP endpoints and narrow write-back actions for external chat agents.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from starlette.requests import Request

from app.core.auth import get_current_user_id
from app.core.rate_limit import limiter
from app.schemas.mcp import (
    GlobalMarketContextResponse,
    InvestmentActivityResponse,
    NoteContentResponse,
    PortfolioContextResponse,
    PortfolioListResponse,
    PortfolioPerformanceResponse,
    ReportContentResponse,
    ResearchArchiveResponse,
    SaveStockJournalNoteRequest,
    SaveStockJournalNoteResponse,
    StockContextResponse,
    TechnicalHistoryResponse,
)
from app.services.market.stock_info import StockInfoUnavailableError
from app.services.research_context import research_context_service

router = APIRouter()


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
    user_id: str = Depends(get_current_user_id),
):
    del request
    try:
        return await research_context_service.get_portfolio_context(user_id, portfolio_id=portfolio_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/portfolio-performance", response_model=PortfolioPerformanceResponse)
@limiter.limit("30/minute")
async def get_portfolio_performance(
    request: Request,
    portfolio_id: Optional[str] = Query(None),
    period: str = Query("1Y"),
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
        raise HTTPException(status_code=404, detail=str(exc))


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


@router.get("/research-archive/{ticker}", response_model=ResearchArchiveResponse)
@limiter.limit("30/minute")
async def get_research_archive(
    request: Request,
    ticker: str,
    limit: int = Query(10, ge=1, le=50),
    user_id: str = Depends(get_current_user_id),
):
    del request
    return await research_context_service.get_research_archive(ticker, user_id, limit=limit)


@router.get("/report/{report_id}", response_model=ReportContentResponse)
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


@router.get("/note/{note_id}", response_model=NoteContentResponse)
@limiter.limit("30/minute")
async def get_note_content(
    request: Request,
    note_id: str,
    user_id: str = Depends(get_current_user_id),
):
    del request
    try:
        return await research_context_service.get_note_content(note_id, user_id)
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


@router.get("/investment-activity/{ticker}", response_model=InvestmentActivityResponse)
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
