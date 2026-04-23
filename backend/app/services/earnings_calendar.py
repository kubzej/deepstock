"""
Earnings calendar service.

Stores and refreshes next earnings dates outside the live page-render path so
the frontend does not trigger per-ticker Yahoo .info fan-out.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List

from app.core.redis import get_redis
from app.core.supabase import supabase
from app.services.market.quotes import get_quotes

logger = logging.getLogger(__name__)


class EarningsCalendarService:
    async def get_batch(self, tickers: List[str]) -> Dict[str, dict]:
        unique_tickers = list(dict.fromkeys(t.upper() for t in tickers if t))
        if not unique_tickers:
            return {}

        response = (
            supabase.table("stocks")
            .select(
                "ticker, earnings_calendar(earnings_date, source, last_checked_at, updated_at)"
            )
            .in_("ticker", unique_tickers)
            .execute()
        )

        result: Dict[str, dict] = {}
        for row in response.data or []:
            cache = row.get("earnings_calendar")
            if isinstance(cache, list):
                cache = cache[0] if cache else None
            result[row["ticker"]] = {
                "ticker": row["ticker"],
                "earningsDate": cache.get("earnings_date") if cache else None,
                "source": cache.get("source") if cache else None,
                "lastCheckedAt": cache.get("last_checked_at") if cache else None,
                "updatedAt": cache.get("updated_at") if cache else None,
            }

        for ticker in unique_tickers:
            result.setdefault(
                ticker,
                {
                    "ticker": ticker,
                    "earningsDate": None,
                    "source": None,
                    "lastCheckedAt": None,
                    "updatedAt": None,
                },
            )

        return result

    async def get_watchlist_tickers(self) -> List[str]:
        response = (
            supabase.table("watchlist_items")
            .select("stocks!inner(ticker)")
            .execute()
        )

        tickers = {
            row["stocks"]["ticker"]
            for row in (response.data or [])
            if row.get("stocks", {}).get("ticker")
        }
        return sorted(tickers)

    async def get_due_tickers(self) -> List[str]:
        all_watchlist_tickers = await self.get_watchlist_tickers()
        if not all_watchlist_tickers:
            return []

        cutoff = datetime.now(timezone.utc) - timedelta(days=1)
        response = (
            supabase.table("stocks")
            .select("ticker, earnings_calendar(last_checked_at)")
            .in_("ticker", all_watchlist_tickers)
            .execute()
        )

        due: List[str] = []
        for row in response.data or []:
            ticker = row["ticker"]
            cache = row.get("earnings_calendar")
            if isinstance(cache, list):
                cache = cache[0] if cache else None

            last_checked_raw = cache.get("last_checked_at") if cache else None
            if not last_checked_raw:
                due.append(ticker)
                continue

            try:
                last_checked = datetime.fromisoformat(
                    last_checked_raw.replace("Z", "+00:00")
                )
            except Exception:
                due.append(ticker)
                continue

            if last_checked < cutoff:
                due.append(ticker)

        return sorted(set(due))

    async def refresh_tickers(self, tickers: List[str]) -> Dict[str, int]:
        unique_tickers = list(dict.fromkeys(t.upper() for t in tickers if t))
        if not unique_tickers:
            return {"tickers_requested": 0, "tickers_refreshed": 0}

        redis = get_redis()
        quotes = await get_quotes(redis, unique_tickers, include_extended=True)

        stocks_response = (
            supabase.table("stocks")
            .select("id, ticker")
            .in_("ticker", unique_tickers)
            .execute()
        )
        stock_ids = {row["ticker"]: row["id"] for row in (stocks_response.data or [])}

        refreshed = 0
        checked_at = datetime.now(timezone.utc).isoformat()
        for ticker in unique_tickers:
            stock_id = stock_ids.get(ticker)
            if not stock_id:
                continue

            quote = quotes.get(ticker) or {}
            earnings_date = quote.get("earningsDate")
            payload = {
                "stock_id": stock_id,
                "earnings_date": earnings_date,
                "source": "yfinance_info",
                "source_payload": {"ticker": ticker},
                "last_checked_at": checked_at,
            }

            try:
                (
                    supabase.table("earnings_calendar")
                    .upsert(payload, on_conflict="stock_id")
                    .execute()
                )
                refreshed += 1
            except Exception as exc:
                logger.error("Failed to upsert earnings calendar for %s: %s", ticker, exc)

        return {
            "tickers_requested": len(unique_tickers),
            "tickers_refreshed": refreshed,
        }

    async def refresh_due_watchlist_tickers(self) -> Dict[str, int]:
        due = await self.get_due_tickers()
        result = await self.refresh_tickers(due)
        result["tickers_due"] = len(due)
        return result

    async def get_tickers_with_earnings_on(self, target_date: date) -> Dict[str, dict]:
        target = target_date.isoformat()
        response = (
            supabase.table("stocks")
            .select("ticker, name, earnings_calendar!inner(earnings_date)")
            .eq("earnings_calendar.earnings_date", target)
            .execute()
        )

        result: Dict[str, dict] = {}
        for row in response.data or []:
            result[row["ticker"]] = {
                "ticker": row["ticker"],
                "name": row.get("name") or row["ticker"],
                "earningsDate": target,
            }
        return result


earnings_calendar_service = EarningsCalendarService()
