"""
AI Portfolio Advisor endpoint.

POST /api/ai/portfolio-advisor — generate a portfolio analysis and recommendations report
"""
import asyncio
import json
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from starlette.requests import Request

from app.core.auth import get_current_user_id
from app.core.rate_limit import limiter
from app.core.redis import get_redis
from app.services.market import market_service
from app.services.options import options_service
from app.services.portfolio import portfolio_service
from app.ai.search import tavily_client

logger = logging.getLogger(__name__)

router = APIRouter()


class PortfolioAdvisorRequest(BaseModel):
    portfolio_id: Optional[str] = None
    force_refresh: bool = False


class PortfolioAdvisorResponse(BaseModel):
    markdown: str
    cached: bool = False
    generated_at: str
    model_used: str = ""


async def _save_portfolio_report_to_journal(
    portfolio_id: str,
    portfolio_name: str,
    markdown: str,
    model_used: str,
    user_id: str,
) -> None:
    try:
        from app.services.journal import journal_service, EntryCreate

        channel = await journal_service.get_channel_by_portfolio_id(portfolio_id, user_id=user_id)
        if not channel:
            return

        await journal_service.create_entry(EntryCreate(
            channel_id=channel["id"],
            type="ai_report",
            content=markdown,
            metadata={
                "report_type": "portfolio_overview",
                "portfolio_id": portfolio_id,
                "portfolio_name": portfolio_name,
                "model": model_used,
            },
        ))
    except Exception as e:
        logger.warning(
            f"Failed to save portfolio advisor report to journal ({portfolio_id}): {e}"
        )


@router.get("/portfolio-advisor", response_model=PortfolioAdvisorResponse)
async def get_cached_portfolio_advisor(
    portfolio_id: Optional[str] = None,
    user_id: str = Depends(get_current_user_id),
):
    redis = get_redis()
    today = date.today().isoformat()
    scope = portfolio_id or "all"
    cache_key = f"ai_portfolio_advisor:{user_id}:{scope}:{today}"
    cached = await redis.get(cache_key)
    if not cached:
        raise HTTPException(status_code=404, detail="Žádný uložený report.")
    data = json.loads(cached)
    return PortfolioAdvisorResponse(**data, cached=True)


@router.post("/portfolio-advisor", response_model=PortfolioAdvisorResponse)
@limiter.limit("10/hour")
async def generate_portfolio_advisor(
    request: Request,
    payload: PortfolioAdvisorRequest = PortfolioAdvisorRequest(),
    user_id: str = Depends(get_current_user_id),
):
    """
    Generate an AI portfolio analysis and recommendations report.

    Optionally accepts portfolio_id to analyse a single portfolio.
    Fetches holdings, quotes, tech signals (parallel), last 50 transactions,
    and open option positions.
    Results are cached 24h per user+portfolio.
    """
    portfolio_id = payload.portfolio_id
    force_refresh = payload.force_refresh

    # Verify portfolio ownership if specific portfolio requested
    target_portfolio = None
    if portfolio_id:
        portfolios = await portfolio_service.get_user_portfolios(user_id)
        target_portfolio = next((p for p in portfolios if p["id"] == portfolio_id), None)
        if not target_portfolio:
            raise HTTPException(status_code=404, detail="Portfolio nenalezeno.")

    redis = get_redis()
    today = date.today().isoformat()
    scope = portfolio_id or "all"
    cache_key = f"ai_portfolio_advisor:{user_id}:{scope}:{today}"

    if not force_refresh:
        cached = await redis.get(cache_key)
        if cached:
            data = json.loads(cached)
            return PortfolioAdvisorResponse(**data, cached=True)

    # Fetch holdings + live portfolio snapshot
    if portfolio_id:
        holdings = await portfolio_service.get_holdings(portfolio_id)
        portfolio_snapshot = await portfolio_service.get_portfolio_snapshot(portfolio_id=portfolio_id, user_id=user_id)
    else:
        holdings = await portfolio_service.get_all_holdings(user_id)
        portfolio_snapshot = await portfolio_service.get_portfolio_snapshot(portfolio_id=None, user_id=user_id)

    if not holdings:
        raise HTTPException(
            status_code=404,
            detail="Žádné holdingy nenalezeny. Přidej nejprve akcie do portfolia.",
        )

    tickers = list({
        (h.get("stocks") or {}).get("ticker") or h.get("ticker")
        for h in holdings
        if (h.get("stocks") or {}).get("ticker") or h.get("ticker")
    })

    # Fetch quotes + tech indicators + macro context in parallel
    year = date.today().year
    quotes_task = market_service.get_quotes(tickers)
    tech_tasks = [market_service.get_technical_indicators(ticker, "3mo") for ticker in tickers]
    macro_task = tavily_client.search(
        f"Federal Reserve interest rates S&P 500 stock market outlook {year}", max_results=3, days=30
    )

    results = await asyncio.gather(quotes_task, *tech_tasks, macro_task, return_exceptions=True)
    quotes: dict = results[0] if not isinstance(results[0], Exception) else {}
    macro_results = results[-1] if not isinstance(results[-1], Exception) else []

    tech_data: dict[str, dict] = {}
    for ticker, result in zip(tickers, results[1:-1]):
        if isinstance(result, Exception) or not result:
            logger.warning(f"No tech data for {ticker}")
        else:
            tech_data[ticker] = result

    # Fetch last 50 stock transactions
    if portfolio_id:
        transactions = await portfolio_service.get_transactions(portfolio_id, limit=50)
    else:
        transactions = (await portfolio_service.get_all_transactions(user_id, limit=50)).get("data", [])

    # Fetch open option positions
    if portfolio_id:
        option_holdings = await options_service.get_holdings(portfolio_id=portfolio_id)
    else:
        option_holdings = await options_service.get_all_holdings_for_user(user_id)

    # Build prompt
    from app.ai.prompts.portfolio_advisor_prompt import (
        SYSTEM_PROMPT,
        build_user_prompt,
        format_portfolio_context,
        format_transactions_context,
        format_options_context,
    )

    portfolio_context = format_portfolio_context(holdings, quotes, tech_data, snapshot=portfolio_snapshot.model_dump())
    transactions_context = format_transactions_context(transactions or [])
    options_context = format_options_context(option_holdings or [])
    macro_context = tavily_client.format_results(macro_results) if macro_results else ""
    user_prompt = build_user_prompt(portfolio_context, transactions_context, options_context, macro_context)

    try:
        from app.ai.providers.litellm_client import call_llm
        from datetime import datetime, timezone

        content, model_used = await call_llm(SYSTEM_PROMPT, user_prompt)
        generated_at = datetime.now(timezone.utc).isoformat()

        result_data = {
            "markdown": content,
            "generated_at": generated_at,
            "model_used": model_used,
        }

        await redis.set(cache_key, json.dumps(result_data), ex=86400)

        if target_portfolio:
            await _save_portfolio_report_to_journal(
                portfolio_id=portfolio_id,
                portfolio_name=target_portfolio["name"],
                markdown=content,
                model_used=model_used,
                user_id=user_id,
            )

        return PortfolioAdvisorResponse(**result_data, cached=False)

    except ValueError as e:
        raise HTTPException(status_code=402, detail=str(e))
    except Exception as e:
        logger.error(f"Error generating portfolio advisor report: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Neočekávaná chyba při generování reportu.")
