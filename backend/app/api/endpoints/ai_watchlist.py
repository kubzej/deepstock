"""
AI Watchlist Targets endpoint.

POST /api/ai/watchlist-targets — suggest buy/sell price targets for a watchlist item
"""
import json
import logging
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import get_current_user_id
from app.core.redis import get_redis
from app.services.market import market_service

logger = logging.getLogger(__name__)

router = APIRouter()


class WatchlistTargetsRequest(BaseModel):
    ticker: str
    avg_cost: Optional[float] = None   # User's average purchase price (if holding)
    shares: Optional[float] = None     # Number of shares held


class WatchlistTargetsResponse(BaseModel):
    ticker: str
    buy_target: Optional[float] = None
    sell_target: Optional[float] = None
    comment: str
    cached: bool = False


@router.post("/watchlist-targets", response_model=WatchlistTargetsResponse)
async def generate_watchlist_targets(
    payload: WatchlistTargetsRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Generate AI-powered buy/sell target suggestions for a watchlist item.

    Uses technical indicators + fundamentals.
    If avg_cost is provided (user has a holding), enforces the -20% rule:
    buy_target must be <= avg_cost * 0.80.

    Results are cached per user + ticker + avg_cost for 6 hours.
    """
    ticker = payload.ticker.upper()

    # Cache key includes user_id (targets depend on personal avg_cost)
    avg_cost_key = f"{round(payload.avg_cost, 2)}" if payload.avg_cost else "none"
    cache_key = f"ai_watchlist_targets:{user_id}:{ticker}:{avg_cost_key}"

    redis = get_redis()
    cached = await redis.get(cache_key)
    if cached:
        data = json.loads(cached)
        return WatchlistTargetsResponse(**data, cached=True)

    # Fetch technical data and stock info in parallel
    import asyncio
    tech_data, stock_info = await asyncio.gather(
        market_service.get_technical_indicators(ticker, "3mo"),
        market_service.get_stock_info(ticker),
        return_exceptions=True,
    )

    if isinstance(tech_data, Exception) or not tech_data:
        raise HTTPException(
            status_code=404,
            detail=f"Nepodařilo se načíst technická data pro {ticker}.",
        )

    # stock_info failure is non-fatal — we proceed without fundamentals
    if isinstance(stock_info, Exception):
        logger.warning(f"Could not fetch stock_info for {ticker}: {stock_info}")
        stock_info = None

    from app.ai.prompts.watchlist_targets_prompt import (
        SYSTEM_PROMPT,
        build_user_prompt,
        format_stock_context,
    )

    stock_context = format_stock_context(
        ticker=ticker,
        tech_data=tech_data,
        stock_info=stock_info,
        avg_cost=payload.avg_cost,
        shares=payload.shares,
    )
    user_prompt = build_user_prompt(stock_context)

    try:
        from app.ai.providers.litellm_client import call_llm

        content, _ = await call_llm(SYSTEM_PROMPT, user_prompt)

        content = content.strip()
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
        if match:
            content = match.group(1)

        result = json.loads(content)

        buy_target = result.get("buy_target")
        sell_target = result.get("sell_target")
        comment = str(result.get("comment", ""))[:400]

        if buy_target is not None:
            buy_target = round(float(buy_target), 2)
        if sell_target is not None:
            sell_target = round(float(sell_target), 2)

        response_data = {
            "ticker": ticker,
            "buy_target": buy_target,
            "sell_target": sell_target,
            "comment": comment,
        }

        # Cache for 6 hours
        await redis.set(cache_key, json.dumps(response_data), ex=21600)

        return WatchlistTargetsResponse(**response_data, cached=False)

    except ValueError as e:
        raise HTTPException(status_code=402, detail=str(e))
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error from LLM response: {e}")
        raise HTTPException(
            status_code=500,
            detail="Nepodařilo se zpracovat odpověď AI. Zkus to znovu.",
        )
    except Exception as e:
        logger.error(f"Error generating watchlist targets: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Neočekávaná chyba při generování cílů.",
        )
