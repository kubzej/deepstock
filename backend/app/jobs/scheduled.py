"""Canonical scheduled job orchestration.

These functions are intentionally thin: Railway cron and manual maintenance
commands call here, while business logic stays in the existing services.
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from app.core.redis import get_redis
from app.core.supabase import supabase
from app.services.earnings_alerts import earnings_alert_service
from app.services.earnings_calendar import earnings_calendar_service
from app.services.price_alerts import price_alert_service
from app.services.options import options_service
from app.services.timeline import timeline_service

logger = logging.getLogger(__name__)
PRAGUE_TZ = ZoneInfo("Europe/Prague")
OPTION_EXPIRY_MILESTONES = (365, 180, 90, 30, 14, 7, 1)


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


async def run_option_expiry_events() -> dict[str, Any]:
    """Create idempotent Timeline reminders for open option positions."""
    today = datetime.now(PRAGUE_TZ).date()
    users_response = supabase.table("profiles").select("id").execute()
    created = 0
    checked = 0

    for user in users_response.data or []:
        user_id = user["id"]
        holdings = await options_service.get_all_holdings_for_user(user_id)
        checked += len(holdings)
        for holding in holdings:
            expiration_raw = holding.get("expiration_date")
            if not expiration_raw:
                continue
            expiration = date.fromisoformat(str(expiration_raw)[:10])
            dte = (expiration - today).days
            if dte not in OPTION_EXPIRY_MILESTONES:
                continue

            option_symbol = holding.get("option_symbol") or ""
            portfolio_id = holding.get("portfolio_id") or ""
            ticker = str(holding.get("symbol") or "").upper()
            option_type = str(holding.get("option_type") or "").upper()
            strike_price = holding.get("strike_price")
            position = holding.get("position")
            contracts = holding.get("contracts")
            currency = holding.get("currency") or "USD"
            event = await timeline_service.create_event(
                user_id=user_id,
                event_type="option_expiry",
                event_date=today,
                source_key=f"{portfolio_id}:{option_symbol}:{dte}",
                title=f"{ticker} {option_type} {strike_price}".strip(),
                subtitle=f"Expirace za {dte} dní",
                metadata={
                    "ticker": ticker,
                    "option_symbol": option_symbol,
                    "option_type": holding.get("option_type"),
                    "strike_price": strike_price,
                    "expiration_date": expiration.isoformat(),
                    "dte": dte,
                    "position": position,
                    "contracts": contracts,
                    "currency": currency,
                    "portfolio_id": portfolio_id,
                },
            )
            if event:
                created += 1

    logger.info(
        "Option expiry Timeline job finished: holdings_checked=%d events_created=%d",
        checked,
        created,
    )
    return {"success": True, "holdings_checked": checked, "timeline_events_created": created}


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


async def _run_daily_news_enabled_users() -> dict[str, Any]:
    from app.services.daily_news import daily_news_service

    return await daily_news_service.run_enabled_users()


async def run_daily_news_briefing() -> dict[str, Any]:
    """Generate daily news briefings for enabled users."""
    logger.info("Job daily-news-briefing started")
    result = await _run_daily_news_enabled_users()
    logger.info(
        (
            "Job daily-news-briefing finished: users_checked=%d reports_generated=%d "
            "succeeded=%d degraded=%d failed=%d notifications_sent=%d"
        ),
        result["users_checked"],
        result["reports_generated"],
        result["succeeded"],
        result["degraded"],
        result["failed"],
        result["notifications_sent"],
    )
    return {"success": True, **result}
