"""
AI Research endpoints.

GET  /api/ai/research/{ticker}     — return cached report (today) or 404
POST /api/ai/research/{ticker}     — generate report (markdown)
GET  /api/ai/research/{ticker}/pdf — download report as PDF
"""
import json
import logging
from datetime import date
from typing import Literal, Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.core.redis import get_redis
from app.services.market import market_service

logger = logging.getLogger(__name__)

router = APIRouter()


class GenerateReportRequest(BaseModel):
    current_price: float
    report_type: Literal["briefing", "full_analysis", "technical_analysis"] = "briefing"
    force_refresh: bool = False
    period: str = "3mo"  # used only for technical_analysis


@router.get("/research/{ticker}")
async def get_cached_research_report(
    ticker: str,
    report_type: Literal["briefing", "full_analysis", "technical_analysis"] = "full_analysis",
    period: str = "3mo",
):
    ticker = ticker.upper()
    today = date.today().isoformat()
    cache_suffix = f":{period}" if report_type == "technical_analysis" else ""
    cache_key = f"ai_research:{ticker}:{report_type}:{today}{cache_suffix}"
    redis = get_redis()
    cached = await redis.get(cache_key)
    if not cached:
        raise HTTPException(status_code=404, detail="Žádný uložený report.")
    result = json.loads(cached)
    result["cached"] = True
    return result


@router.post("/research/{ticker}")
async def generate_report(ticker: str, payload: GenerateReportRequest):
    """
    Generate an AI research report for the given ticker.

    - Fetches existing yfinance fundamentals from market service (cached)
    - Runs Tavily web searches for latest news, earnings, analyst reports
    - Calls LLM (Claude by default) to generate the report
    - Caches result for 24h in Redis

    Report types:
    - briefing: Focused quarterly briefing (snapshot, earnings, guidance, bull/bear)
    - full_analysis: Deep company analysis (business model, moat, management, market)
    """
    ticker = ticker.upper()

    # Fetch yfinance data (uses existing cache)
    redis = get_redis()
    stock_data = await market_service.get_stock_info(ticker)
    if not stock_data:
        raise HTTPException(status_code=404, detail=f"Ticker {ticker} not found")

    # Use provided price or fall back to yfinance price
    current_price = payload.current_price or stock_data.get("price", 0)

    try:
        from app.ai import research_service
        result = await research_service.generate_research_report(
            ticker=ticker,
            current_price=current_price,
            report_type=payload.report_type,
            stock_data=stock_data,
            force_refresh=payload.force_refresh,
            period=payload.period,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=402, detail=str(e))
    except Exception as e:
        logger.error(f"Error generating report for {ticker}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Neočekávaná chyba při generování reportu.")


@router.get("/research/{ticker}/pdf")
async def download_pdf(
    ticker: str,
    report_type: Literal["briefing", "full_analysis", "technical_analysis"] = "briefing",
    current_price: Optional[float] = None,
    period: str = "3mo",
):
    """
    Download the cached AI research report as PDF.

    If no cached report exists for today, generates a new one first
    (requires current_price parameter).
    """
    from datetime import date
    ticker = ticker.upper()
    today = date.today().isoformat()
    cache_suffix = f":{period}" if report_type == "technical_analysis" else ""
    cache_key = f"ai_research:{ticker}:{report_type}:{today}{cache_suffix}"

    redis = get_redis()
    cached = await redis.get(cache_key)

    if not cached:
        if current_price is None:
            raise HTTPException(
                status_code=400,
                detail="Report není v cache. Nejprve vygenerujte report nebo předejte current_price."
            )
        # Generate on-the-fly
        stock_data = await market_service.get_stock_info(ticker)
        if not stock_data:
            raise HTTPException(status_code=404, detail=f"Ticker {ticker} not found")

        from app.ai import research_service
        report = await research_service.generate_research_report(
            ticker=ticker,
            current_price=current_price,
            report_type=report_type,
            stock_data=stock_data,
            period=period,
        )
    else:
        report = json.loads(cached)

    try:
        from app.ai.pdf_generator import generate_pdf
        pdf_bytes = generate_pdf(report)
    except Exception as e:
        logger.error(f"PDF generation failed for {ticker}: {e}")
        raise HTTPException(status_code=500, detail="Chyba při generování PDF.")

    type_labels = {"briefing": "briefing", "full_analysis": "analyza", "technical_analysis": "technicka"}
    type_label = type_labels.get(report_type, report_type)
    filename = f"{ticker}_{type_label}_{today}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
