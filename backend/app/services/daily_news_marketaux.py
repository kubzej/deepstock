from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.cache import CacheTTL
from app.core.config import get_settings
from app.core.redis import get_redis
from app.services.daily_news_scoring import SourceCandidate, bounded_raw_payload

logger = logging.getLogger(__name__)

MARKETAUX_URL = "https://api.marketaux.com/v1/news/all"


class MarketauxError(Exception):
    pass


class MarketauxMissingKeyError(MarketauxError):
    pass


class MarketauxRateLimitError(MarketauxError):
    pass


class MarketauxClient:
    def __init__(self):
        self.settings = get_settings()

    def _cache_key(self, params: dict[str, Any]) -> str:
        cache_params = {k: v for k, v in sorted(params.items()) if k != "api_token"}
        return "daily_news:marketaux:" + json.dumps(cache_params, sort_keys=True, default=str)

    async def _request(self, params: dict[str, Any]) -> dict:
        if not self.settings.marketaux_api_key:
            raise MarketauxMissingKeyError("MARKETAUX_API_KEY is not configured")

        request_params = {
            **params,
            "api_token": self.settings.marketaux_api_key,
            "language": "en",
            "limit": params.get("limit", 3),
        }
        cache_key = self._cache_key(request_params)
        redis = get_redis()
        cached = await redis.get(cache_key)
        if cached:
            return json.loads(cached)

        max_retries = max(0, self.settings.marketaux_max_retries)
        async with httpx.AsyncClient(timeout=20.0) as client:
            for attempt in range(max_retries + 1):
                if self.settings.marketaux_request_delay_seconds > 0:
                    await asyncio.sleep(self.settings.marketaux_request_delay_seconds)

                try:
                    response = await client.get(MARKETAUX_URL, params=request_params)
                except httpx.TimeoutException as exc:
                    raise MarketauxError("Marketaux timeout") from exc
                except httpx.RequestError as exc:
                    raise MarketauxError(f"Marketaux network error: {exc}") from exc

                if response.status_code == 429 and attempt < max_retries:
                    retry_after = _retry_after_seconds(response)
                    delay = retry_after or self.settings.marketaux_retry_backoff_seconds * (attempt + 1)
                    logger.warning(
                        "Marketaux rate limit hit; retrying in %.1fs (attempt %d/%d)",
                        delay,
                        attempt + 1,
                        max_retries,
                    )
                    await asyncio.sleep(delay)
                    continue

                if response.status_code == 429:
                    raise MarketauxRateLimitError("Marketaux rate limit reached")
                if response.status_code >= 400:
                    detail = _response_error_detail(response)
                    raise MarketauxError(
                        f"Marketaux upstream error: HTTP {response.status_code}"
                        + (f" ({detail})" if detail else "")
                    )
                break

        payload = response.json()
        await redis.setex(cache_key, CacheTTL.DAILY_NEWS_MARKETAUX, json.dumps(payload))
        return payload

    async def fetch_for_ticker(
        self,
        ticker: str,
        *,
        scope_type: str,
        priority: str,
        window_start: datetime,
        window_end: datetime,
    ) -> list[SourceCandidate]:
        params = {
            "symbols": ticker.upper(),
            "filter_entities": "true",
            "published_after": _format_marketaux_datetime(window_start),
            "published_before": _format_marketaux_datetime(window_end),
            "limit": 3,
        }
        payload = await self._request(params)
        return self._normalize(payload, ticker=ticker, scope_type=scope_type, priority=priority)

    async def fetch_for_tickers(
        self,
        entries: list[dict[str, str]],
        *,
        window_start: datetime,
        window_end: datetime,
    ) -> list[SourceCandidate]:
        ticker_meta: dict[str, dict[str, str]] = {}
        for entry in entries:
            ticker = entry["ticker"].upper()
            ticker_meta.setdefault(ticker, {
                "scope_type": entry["scope_type"],
                "priority": entry["priority"],
            })

        params = {
            "symbols": ",".join(ticker_meta.keys()),
            "filter_entities": "true",
            "must_have_entities": "true",
            "published_after": _format_marketaux_datetime(window_start),
            "published_before": _format_marketaux_datetime(window_end),
            "limit": self.settings.marketaux_articles_per_request,
        }
        payload = await self._request(params)
        return self._normalize(
            payload,
            ticker=None,
            scope_type="holding",
            priority="medium",
            ticker_meta=ticker_meta,
        )

    async def fetch_for_query(
        self,
        query: str,
        *,
        scope_type: str,
        window_start: datetime,
        window_end: datetime,
        limit: int = 3,
    ) -> list[SourceCandidate]:
        params = {
            "search": query,
            "published_after": _format_marketaux_datetime(window_start),
            "published_before": _format_marketaux_datetime(window_end),
            "limit": limit,
        }
        payload = await self._request(params)
        return self._normalize(payload, ticker=None, scope_type=scope_type, priority="low")

    def _normalize(
        self,
        payload: dict[str, Any],
        *,
        ticker: str | None,
        scope_type: str,
        priority: str,
        ticker_meta: dict[str, dict[str, str]] | None = None,
    ) -> list[SourceCandidate]:
        candidates = []
        for article in payload.get("data") or []:
            title = (article.get("title") or "").strip()
            if not title:
                continue
            entities = article.get("entities") or []
            article_ticker = ticker
            article_scope_type = scope_type
            article_priority = priority
            if entities:
                for entity in entities:
                    symbol = entity.get("symbol") or entity.get("ticker")
                    normalized_symbol = symbol.upper() if symbol else None
                    if not normalized_symbol:
                        continue
                    if ticker_meta and normalized_symbol in ticker_meta:
                        article_ticker = normalized_symbol
                        article_scope_type = ticker_meta[normalized_symbol]["scope_type"]
                        article_priority = ticker_meta[normalized_symbol]["priority"]
                        break
                    if not article_ticker:
                        article_ticker = normalized_symbol
            if ticker_meta and not article_ticker:
                continue
            candidates.append(
                SourceCandidate(
                    title=title,
                    snippet=article.get("description") or article.get("snippet"),
                    url=article.get("url"),
                    source_name=(article.get("source") or "").strip() or article.get("source_name"),
                    published_at=article.get("published_at"),
                    ticker=article_ticker.upper() if article_ticker else None,
                    scope_type=article_scope_type,  # type: ignore[arg-type]
                    scope_priority=article_priority,  # type: ignore[arg-type]
                    source_type="marketaux",
                    raw_payload=bounded_raw_payload({
                        "uuid": article.get("uuid"),
                        "source": article.get("source"),
                        "entities": entities,
                        "sentiment": article.get("sentiment"),
                        "match_score": article.get("match_score"),
                    }),
                )
            )
        return candidates


def _format_marketaux_datetime(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def _response_error_detail(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return response.text[:300].strip()

    if isinstance(payload, dict):
        for key in ("error", "message", "detail"):
            value = payload.get(key)
            if value:
                return str(value)[:300]
    return json.dumps(payload, ensure_ascii=False)[:300]


def _retry_after_seconds(response: httpx.Response) -> float | None:
    value = response.headers.get("Retry-After")
    if not value:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        return None


marketaux_client = MarketauxClient()
