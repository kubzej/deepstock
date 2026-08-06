"""
Earnings analyst data service.

Fetches structured earnings data from yfinance for the AI earnings report:
history (actual vs estimate + surprise), forward EPS/revenue estimates,
estimate trend, analyst revisions, and growth vs index. All accessors verified
to work without lxml.

Cached in Redis (24h) and fetched off the event loop via a worker thread.
"""
import asyncio
import json
import logging
import math
from typing import Optional

import pandas as pd
import yfinance as yf

from app.core.cache import CacheTTL

logger = logging.getLogger(__name__)

_EMPTY: dict = {
    "earningsHistory": [],
    "earningsEstimate": {},
    "revenueEstimate": {},
    "epsTrend": {},
    "epsRevisions": {},
    "growthEstimates": {},
}


def _clean(value):
    """Convert a pandas/numpy scalar to a JSON-safe Python value (NaN/inf -> None)."""
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    try:
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return value  # non-numeric (strings) pass through


def _period_dict(df: Optional[pd.DataFrame]) -> dict:
    """{period_label: {col: clean_value}} for estimate / trend / revision frames."""
    if df is None or getattr(df, "empty", True):
        return {}
    return {
        str(idx): {str(col): _clean(row[col]) for col in df.columns}
        for idx, row in df.iterrows()
    }


def _earnings_history_records(df: Optional[pd.DataFrame], limit: int = 4) -> list:
    """List of {quarter, epsActual, epsEstimate, epsDifference, surprisePercent}."""
    if df is None or getattr(df, "empty", True):
        return []
    records = []
    for idx, row in df.iterrows():
        try:
            quarter = pd.Timestamp(idx).date().isoformat()
        except Exception:
            quarter = str(idx)
        rec = {"quarter": quarter}
        rec.update({str(col): _clean(row[col]) for col in df.columns})
        records.append(rec)
    return records[-limit:]


def _fetch_earnings_data_sync(ticker: str) -> dict:
    """Blocking yfinance fetch. Each accessor guarded — some are absent for non-US tickers."""
    t = yf.Ticker(ticker)
    data = {k: (v.copy() if isinstance(v, list) else dict(v)) for k, v in _EMPTY.items()}

    accessors = {
        "earningsHistory": lambda: _earnings_history_records(t.earnings_history),
        "earningsEstimate": lambda: _period_dict(t.earnings_estimate),
        "revenueEstimate": lambda: _period_dict(t.revenue_estimate),
        "epsTrend": lambda: _period_dict(t.eps_trend),
        "epsRevisions": lambda: _period_dict(t.eps_revisions),
        "growthEstimates": lambda: _period_dict(t.growth_estimates),
    }
    for key, fn in accessors.items():
        try:
            data[key] = fn()
        except Exception as e:
            logger.debug("%s unavailable for %s: %s", key, ticker, e)
    return data


async def get_earnings_data(redis, ticker: str, force_refresh: bool = False) -> dict:
    """
    Return structured earnings data for a ticker (cached 24h).
    Always returns the full dict shape; missing blocks are empty (never raises).

    force_refresh: skip the cached read and fetch fresh from yfinance. Use this
    right after an earnings print — the 24h cache has no earnings-triggered
    invalidation, so a cache hit here can silently serve pre-earnings data.
    """
    ticker = ticker.upper()
    cache_key = f"earnings_data:{ticker}"

    if not force_refresh:
        try:
            cached = await redis.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception as e:
            logger.warning("Redis read failed for %s: %s", cache_key, e)

    try:
        data = await asyncio.to_thread(_fetch_earnings_data_sync, ticker)
    except Exception as e:
        logger.warning("Earnings data fetch failed for %s: %s", ticker, e)
        data = {k: (v.copy() if isinstance(v, list) else dict(v)) for k, v in _EMPTY.items()}

    try:
        await redis.set(cache_key, json.dumps(data), ex=CacheTTL.EARNINGS_DATA)
    except Exception as e:
        logger.warning("Failed to cache earnings data for %s: %s", ticker, e)

    return data
