"""Canonical scheduled job orchestration.

These functions are intentionally thin: Railway cron and manual maintenance
commands call here, while business logic stays in the existing services.
"""

from __future__ import annotations

import logging
from typing import Any

from app.core.redis import get_redis
from app.services.earnings_alerts import earnings_alert_service
from app.services.earnings_calendar import earnings_calendar_service
from app.services.price_alerts import price_alert_service

logger = logging.getLogger(__name__)


async def run_price_target_alerts() -> dict[str, Any]:
    """Check watchlist price targets and send push notifications."""
    redis = get_redis()
    logger.info("Job price-target-alerts started")
    result = await price_alert_service.check_all_users(redis)
    logger.info(
        "Job price-target-alerts finished: users_checked=%d alerts_sent=%d",
        result["users_checked"],
        result["alerts_sent"],
    )
    return {"success": True, **result}


async def run_custom_price_alerts() -> dict[str, Any]:
    """Check custom price alerts and send push notifications."""
    redis = get_redis()
    logger.info("Job custom-price-alerts started")
    result = await price_alert_service.check_custom_alerts(redis)
    logger.info(
        "Job custom-price-alerts finished: alerts_checked=%d alerts_triggered=%d",
        result["alerts_checked"],
        result["alerts_triggered"],
    )
    return {"success": True, **result}


async def run_earnings_alerts() -> dict[str, Any]:
    """Refresh due earnings dates, then notify users about today's earnings."""
    redis = get_redis()
    logger.info("Job earnings-alerts started")
    refresh_result = await earnings_calendar_service.refresh_due_watchlist_tickers()
    alert_result = await earnings_alert_service.check_all_users(redis)
    logger.info(
        (
            "Job earnings-alerts finished: tickers_due=%d tickers_refreshed=%d "
            "orphaned_entries_deleted=%d users_checked=%d alerts_sent=%d"
        ),
        refresh_result["tickers_due"],
        refresh_result["tickers_refreshed"],
        refresh_result["orphaned_entries_deleted"],
        alert_result["users_checked"],
        alert_result["alerts_sent"],
    )
    return {
        "success": True,
        "tickers_due": refresh_result["tickers_due"],
        "tickers_refreshed": refresh_result["tickers_refreshed"],
        "orphaned_entries_deleted": refresh_result["orphaned_entries_deleted"],
        "users_checked": alert_result["users_checked"],
        "alerts_sent": alert_result["alerts_sent"],
    }


async def run_refresh_earnings_calendar() -> dict[str, Any]:
    """Refresh due cached earnings dates for watchlist tickers."""
    logger.info("Job refresh-earnings-calendar started")
    result = await earnings_calendar_service.refresh_due_watchlist_tickers()
    logger.info(
        "Job refresh-earnings-calendar finished: tickers_due=%d tickers_refreshed=%d orphaned_entries_deleted=%d",
        result["tickers_due"],
        result["tickers_refreshed"],
        result["orphaned_entries_deleted"],
    )
    return {"success": True, **result}


async def run_refresh_earnings_calendar_force() -> dict[str, Any]:
    """Force-refresh earnings dates for all watchlist tickers."""
    logger.info("Job refresh-earnings-calendar-force started")
    cleanup_result = await earnings_calendar_service.cleanup_orphaned_entries()
    tickers = await earnings_calendar_service.get_watchlist_tickers()
    result = await earnings_calendar_service.refresh_tickers(tickers)
    result.update(cleanup_result)
    logger.info(
        "Job refresh-earnings-calendar-force finished: tickers_requested=%d tickers_refreshed=%d",
        result["tickers_requested"],
        result["tickers_refreshed"],
    )
    return {"success": True, **result}


async def run_cleanup_earnings_calendar() -> dict[str, Any]:
    """Remove earnings cache rows for stocks no longer in any watchlist."""
    logger.info("Job cleanup-earnings-calendar started")
    result = await earnings_calendar_service.cleanup_orphaned_entries()
    logger.info(
        "Job cleanup-earnings-calendar finished: orphaned_entries_found=%d orphaned_entries_deleted=%d",
        result["orphaned_entries_found"],
        result["orphaned_entries_deleted"],
    )
    return {"success": True, **result}

