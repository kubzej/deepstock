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


def _sample(values: List[str], limit: int = 10) -> List[str]:
    return values[:limit]


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
        resolved = sorted(tickers)
        logger.info(
            "Resolved %d unique watchlist tickers for earnings refresh (sample=%s)",
            len(resolved),
            _sample(resolved),
        )
        return resolved

    async def get_watchlist_stock_ids(self) -> List[str]:
        response = (
            supabase.table("watchlist_items")
            .select("stock_id")
            .execute()
        )

        stock_ids = sorted(
            {
                row["stock_id"]
                for row in (response.data or [])
                if row.get("stock_id")
            }
        )
        logger.info(
            "Resolved %d unique watchlist stock_ids for earnings cleanup",
            len(stock_ids),
        )
        return stock_ids

    async def cleanup_orphaned_entries(self) -> Dict[str, int]:
        watchlist_stock_ids = set(await self.get_watchlist_stock_ids())
        response = supabase.table("earnings_calendar").select("stock_id").execute()

        earnings_stock_ids = sorted(
            {
                row["stock_id"]
                for row in (response.data or [])
                if row.get("stock_id")
            }
        )
        orphaned_stock_ids = [
            stock_id for stock_id in earnings_stock_ids if stock_id not in watchlist_stock_ids
        ]

        if not orphaned_stock_ids:
            logger.info(
                "No orphaned earnings_calendar rows found (tracked=%d active_watchlist_stocks=%d)",
                len(earnings_stock_ids),
                len(watchlist_stock_ids),
            )
            return {"orphaned_entries_found": 0, "orphaned_entries_deleted": 0}

        for start in range(0, len(orphaned_stock_ids), 500):
            batch = orphaned_stock_ids[start : start + 500]
            supabase.table("earnings_calendar").delete().in_("stock_id", batch).execute()

        logger.info(
            "Deleted %d orphaned earnings_calendar rows (sample=%s)",
            len(orphaned_stock_ids),
            _sample(orphaned_stock_ids),
        )
        return {
            "orphaned_entries_found": len(orphaned_stock_ids),
            "orphaned_entries_deleted": len(orphaned_stock_ids),
        }

    async def get_due_tickers(self) -> List[str]:
        all_watchlist_tickers = await self.get_watchlist_tickers()
        if not all_watchlist_tickers:
            logger.info("No watchlist tickers found for earnings due check")
            return []

        cutoff = datetime.now(timezone.utc) - timedelta(days=1)
        response = (
            supabase.table("stocks")
            .select("ticker, earnings_calendar(earnings_date, last_checked_at)")
            .in_("ticker", all_watchlist_tickers)
            .execute()
        )

        due: List[str] = []
        missing_cache: List[str] = []
        missing_earnings_date: List[str] = []
        invalid_last_checked: List[str] = []
        stale_last_checked: List[str] = []
        for row in response.data or []:
            ticker = row["ticker"]
            cache = row.get("earnings_calendar")
            if isinstance(cache, list):
                cache = cache[0] if cache else None

            earnings_date = cache.get("earnings_date") if cache else None
            last_checked_raw = cache.get("last_checked_at") if cache else None
            if not cache:
                due.append(ticker)
                missing_cache.append(ticker)
                continue

            if not earnings_date:
                due.append(ticker)
                missing_earnings_date.append(ticker)
                continue

            if not last_checked_raw:
                due.append(ticker)
                invalid_last_checked.append(ticker)
                continue

            try:
                last_checked = datetime.fromisoformat(
                    last_checked_raw.replace("Z", "+00:00")
                )
            except Exception:
                due.append(ticker)
                invalid_last_checked.append(ticker)
                continue

            if last_checked < cutoff:
                due.append(ticker)
                stale_last_checked.append(ticker)

        resolved_due = sorted(set(due))
        logger.info(
            (
                "Earnings due check finished: watchlist_tickers=%d due=%d "
                "missing_cache=%d missing_earnings_date=%d invalid_last_checked=%d stale_last_checked=%d "
                "due_sample=%s"
            ),
            len(all_watchlist_tickers),
            len(resolved_due),
            len(missing_cache),
            len(missing_earnings_date),
            len(invalid_last_checked),
            len(stale_last_checked),
            _sample(resolved_due),
        )
        return resolved_due

    async def refresh_tickers(self, tickers: List[str]) -> Dict[str, int]:
        unique_tickers = list(dict.fromkeys(t.upper() for t in tickers if t))
        if not unique_tickers:
            logger.info("Earnings refresh requested with no tickers")
            return {"tickers_requested": 0, "tickers_refreshed": 0}

        logger.info(
            "Refreshing earnings for %d tickers (sample=%s)",
            len(unique_tickers),
            _sample(unique_tickers),
        )
        redis = get_redis()
        # Earnings refresh must reflect the provider's CURRENT data, not whatever
        # the render-path quote_ext cache happens to hold (which may be up to 1h
        # stale, or — during a field-change deploy — populated with the old
        # field). Drop the extended cache for these tickers so extended_sync does
        # a genuinely fresh .info fetch. This runs once daily off the render path.
        await redis.delete(*(f"quote_ext:{t}" for t in unique_tickers))
        quotes = await get_quotes(
            redis, unique_tickers, include_extended=True, extended_sync=True
        )
        logger.info(
            "Fetched quote payloads for %d/%d earnings refresh tickers",
            len(quotes),
            len(unique_tickers),
        )

        stocks_response = (
            supabase.table("stocks")
            .select("id, ticker, earnings_calendar(earnings_date)")
            .in_("ticker", unique_tickers)
            .execute()
        )
        stock_ids = {row["ticker"]: row["id"] for row in (stocks_response.data or [])}
        existing_cache_by_ticker: Dict[str, dict | None] = {}
        for row in stocks_response.data or []:
            cache = row.get("earnings_calendar")
            if isinstance(cache, list):
                cache = cache[0] if cache else None
            existing_cache_by_ticker[row["ticker"]] = cache

        refreshed = 0
        missing_stock_ids: List[str] = []
        provider_dates_found: List[str] = []
        preserved_existing_dates: List[str] = []
        still_missing_dates: List[str] = []
        checked_at = datetime.now(timezone.utc).isoformat()
        for ticker in unique_tickers:
            stock_id = stock_ids.get(ticker)
            if not stock_id:
                missing_stock_ids.append(ticker)
                logger.warning("Skipping earnings refresh for %s because stock row was not found", ticker)
                continue

            quote = quotes.get(ticker) or {}
            existing_cache = existing_cache_by_ticker.get(ticker) or {}
            provider_earnings_date = quote.get("earningsDate")

            if not provider_earnings_date:
                # Provider gave us no date. Leave the row untouched — keep any
                # existing date for display but DO NOT bump last_checked_at, so
                # the ticker stays "due" and is retried next run instead of
                # silently masking the failed fetch as a successful refresh.
                if existing_cache.get("earnings_date"):
                    preserved_existing_dates.append(ticker)
                else:
                    still_missing_dates.append(ticker)
                logger.warning(
                    "Provider returned no earnings date for %s; leaving row untouched (stays due)",
                    ticker,
                )
                continue

            provider_dates_found.append(ticker)
            payload = {
                "stock_id": stock_id,
                "earnings_date": provider_earnings_date,
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

        logger.info(
            (
                "Earnings refresh finished: requested=%d refreshed=%d missing_stock_ids=%d "
                "provider_dates_found=%d preserved_existing_dates=%d still_missing_dates=%d "
                "missing_date_sample=%s"
            ),
            len(unique_tickers),
            refreshed,
            len(missing_stock_ids),
            len(provider_dates_found),
            len(preserved_existing_dates),
            len(still_missing_dates),
            _sample(still_missing_dates),
        )
        return {
            "tickers_requested": len(unique_tickers),
            "tickers_refreshed": refreshed,
        }

    async def refresh_due_watchlist_tickers(self) -> Dict[str, int]:
        cleanup_result = await self.cleanup_orphaned_entries()
        due = await self.get_due_tickers()
        logger.info(
            "Refreshing due watchlist earnings tickers: due=%d sample=%s",
            len(due),
            _sample(due),
        )
        result = await self.refresh_tickers(due)
        result.update(cleanup_result)
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
