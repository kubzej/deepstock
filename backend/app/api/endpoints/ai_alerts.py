"""
AI Alert Suggestions endpoint.

POST /api/ai/alert-suggestions — generate technical price alert suggestions
"""
import asyncio
import json
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import get_current_user_id
from app.core.redis import get_redis
from app.core.supabase import supabase
from app.services.market import market_service

logger = logging.getLogger(__name__)

router = APIRouter()


class AlertSuggestionsRequest(BaseModel):
    tickers: list[str] = []
    watchlist_id: Optional[str] = None


class AlertSuggestion(BaseModel):
    ticker: str
    condition_type: str  # price_above | price_below
    price: float
    reason: str


class AlertSuggestionsResponse(BaseModel):
    suggestions: list[AlertSuggestion]
    cached: bool = False


@router.post("/alert-suggestions", response_model=AlertSuggestionsResponse)
async def generate_alert_suggestions(
    payload: AlertSuggestionsRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Generate AI-powered price alert suggestions based on technical analysis.

    Accepts either a list of tickers or a watchlist_id.
    Returns 2–3 key technical levels per ticker with one-sentence Czech reasoning.
    Results are cached for 6 hours.
    """
    tickers = [t.upper() for t in payload.tickers]

    if payload.watchlist_id:
        # Verify watchlist belongs to user
        wl_check = supabase.table("watchlists") \
            .select("id") \
            .eq("id", payload.watchlist_id) \
            .eq("user_id", user_id) \
            .execute()
        if not wl_check.data:
            raise HTTPException(status_code=404, detail="Watchlist nenalezen.")

        # Fetch tickers from watchlist
        resp = supabase.table("watchlist_items") \
            .select("stocks(ticker)") \
            .eq("watchlist_id", payload.watchlist_id) \
            .execute()
        for item in (resp.data or []):
            stock = item.get("stocks") or {}
            ticker = stock.get("ticker")
            if ticker and ticker.upper() not in tickers:
                tickers.append(ticker.upper())

    if not tickers:
        raise HTTPException(status_code=400, detail="Žádné tickery nebyly zadány.")

    if len(tickers) > 20:
        raise HTTPException(status_code=400, detail="Maximálně 20 tickerů najednou.")

    # Cache check
    redis = get_redis()
    today = date.today().isoformat()
    cache_key = f"ai_alert_suggestions:{'_'.join(sorted(tickers))}:{today}"

    cached = await redis.get(cache_key)
    if cached:
        suggestions = [AlertSuggestion(**s) for s in json.loads(cached)]
        return AlertSuggestionsResponse(suggestions=suggestions, cached=True)

    # Fetch technical data in parallel
    tech_tasks = [market_service.get_technical_indicators(ticker, "3mo") for ticker in tickers]
    tech_results = await asyncio.gather(*tech_tasks, return_exceptions=True)

    # Build prompt context
    from app.ai.prompts.alert_suggestions_prompt import SYSTEM_PROMPT, format_stock_context, build_user_prompt

    stock_contexts = []
    for ticker, tech_data in zip(tickers, tech_results):
        if isinstance(tech_data, Exception) or not tech_data:
            logger.warning(f"No tech data for {ticker}, skipping")
            continue
        ctx = format_stock_context(ticker, tech_data)
        stock_contexts.append(ctx)

    if not stock_contexts:
        raise HTTPException(status_code=404, detail="Nepodařilo se načíst technická data pro zadané tickery.")

    stocks_context = "\n\n".join(stock_contexts)
    user_prompt = build_user_prompt(stocks_context)

    try:
        from app.ai.providers.litellm_client import call_llm

        content, _ = await call_llm(SYSTEM_PROMPT, user_prompt)

        # Strip any markdown code blocks the model might add despite instructions
        content = content.strip()
        if content.startswith("```"):
            parts = content.split("```")
            # Take the content between the first pair of backticks
            content = parts[1] if len(parts) > 1 else content
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()

        result = json.loads(content)
        suggestions_raw = result.get("suggestions", [])

        suggestions = []
        for s in suggestions_raw:
            if not all(k in s for k in ("ticker", "condition_type", "price", "reason")):
                logger.warning(f"Skipping malformed suggestion: {s}")
                continue
            if s["condition_type"] not in ("price_above", "price_below"):
                logger.warning(f"Skipping unknown condition_type: {s['condition_type']}")
                continue
            suggestions.append(AlertSuggestion(
                ticker=str(s["ticker"]).upper(),
                condition_type=s["condition_type"],
                price=round(float(s["price"]), 2),
                reason=str(s["reason"])[:200],
            ))

        # Cache for 6 hours
        await redis.set(cache_key, json.dumps([s.model_dump() for s in suggestions]), ex=21600)

        return AlertSuggestionsResponse(suggestions=suggestions, cached=False)

    except ValueError as e:
        raise HTTPException(status_code=402, detail=str(e))
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error from LLM response: {e}")
        raise HTTPException(status_code=500, detail="Nepodařilo se zpracovat odpověď AI. Zkus to znovu.")
    except Exception as e:
        logger.error(f"Error generating alert suggestions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Neočekávaná chyba při generování návrhů.")
